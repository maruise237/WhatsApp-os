import { createClient as createNeonDataClient } from "@neondatabase/neon-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { createNeonAuthForNextRequest } from "@/lib/neon/server-client";
import { createSeaweedStorage } from "@/lib/neon/storage-adapter";

type NeonDataClient = ReturnType<typeof createNeonDataClient>;
type NeonAuth = ReturnType<typeof createNeonAuthForNextRequest>;
type NeonAdminClientShape = NeonDataClient & {
  auth: ReturnType<typeof authAdminSurface>;
  storage: ReturnType<typeof createSeaweedStorage>;
};

let adminClient: NeonAdminClientShape | null = null;

function unsupported(operation: string): never {
  throw new Error(`neon_admin_operation_unavailable: ${operation}`);
}

function authAdminSurface() {
  const auth = createNeonAuthForNextRequest() as NeonAuth;
  const authRecord = auth as unknown as Record<string, unknown>;
  const admin = authRecord.admin as Record<string, unknown> | undefined;
  const invoke = async (operation: string, candidates: string[], input?: unknown) => {
    for (const candidate of candidates) {
      const fn = admin?.[candidate] ?? authRecord[candidate];
      if (typeof fn === "function") {
        return fn.call(admin?.[candidate] ? admin : auth, input);
      }
    }
    unsupported(operation);
  };

  return {
    admin: {
      getUserById: (userId: string) => invoke("getUserById", ["getUserById", "getUser"], { userId }),
      listUsers: (input?: unknown) => invoke("listUsers", ["listUsers"], input),
      createUser: (input?: unknown) => invoke("createUser", ["createUser"], input),
      updateUserById: (input?: unknown) => invoke("updateUserById", ["updateUser", "updateUserById"], input),
      deleteUser: (userId: string) => invoke("deleteUser", ["removeUser", "deleteUser"], { userId }),
    },
  };
}

export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const neon = createNeonDataClient({
    dataApi: {
      url: env.NEON_DATA_API_URL,
      getToken: async () => {
        if (!env.NEON_SERVICE_ROLE_JWT) {
          throw new Error("neon_service_role_jwt_missing: configure a short-lived Neon JWT with the service_role database role");
        }
        return env.NEON_SERVICE_ROLE_JWT;
      },
    },
  });
  adminClient = Object.assign(neon, {
    auth: authAdminSurface(),
    storage: createSeaweedStorage(),
  });
  return adminClient as unknown as SupabaseClient;
}

export type NeonAdminClient = SupabaseClient;
