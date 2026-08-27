import { createClient } from "@/lib/neon/script-client";
import * as fs from "fs";
import { carregarEnvLocal } from "../scripts/lib/env-de-teste";
const envEfetivo = carregarEnvLocal();
const url = envEfetivo.NEON_DATA_API_URL!.trim();
const key = envEfetivo.NEON_SERVICE_ROLE_JWT!.trim();
const sb = createClient(url, key, { auth: { persistSession: false } });
const creds = JSON.parse(fs.readFileSync(".e2e-creds.json", "utf8"));
(async () => {
  for (const u of Object.values(creds.users) as Array<{ id: string; email: string }>) {
    const { data } = await sb
      .from("user_organizations")
      .select("user_id, organization_id, role")
      .eq("user_id", u.id);
    console.log(u.email, "→", JSON.stringify(data));
  }
})();
