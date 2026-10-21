/**
 * Type commun aux clients de base de données de l'application.
 *
 * - Client de session (`lib/db/server.ts`) : Data API Neon, RLS avec le JWT
 *   de l'utilisateur, plus l'auth Neon (`auth`).
 * - Client admin (`lib/db/admin.ts`) : connexion Postgres directe, sans RLS —
 *   l'appelant DOIT filtrer `organization_id` lui-même.
 *
 * Les deux exposent `from()` / `rpc()` au format PostgREST ; `auth` et
 * `storage` sont typés d'après leur implémentation réelle.
 */
import type { NeonPostgrestClient } from "@neondatabase/neon-js";

import type { AuthAdmin } from "@/lib/neon/admin-client";
import type { AuthSession } from "@/lib/neon/server-client";
import type { StockageObjets } from "@/lib/neon/storage-adapter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- le schéma n'est pas typé de bout en bout
type Requetes = Pick<NeonPostgrestClient<any, any>, "from" | "rpc" | "schema">;

export type DbClient = Requetes & {
  auth: AuthSession & { admin: AuthAdmin };
  storage: StockageObjets;
};
