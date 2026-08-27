import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { metaPodeReceber } from "@/lib/channels/meta/webhook";
import { getWahaClient } from "@/lib/waha/client";
import { ConnectWhatsappClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function ConnectWhatsappPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");

  const wahaConfigured = getWahaClient() !== null;

  // Receber pelo canal oficial exige DOIS segredos, não um — a regra e o porquê
  // moram em `lib/channels/meta/webhook.ts`, ao lado de quem os consome.
  const oficialPodeReceber = metaPodeReceber();
  // We don't try to start the session at SSR — client kicks off the call
  // (and shows graceful banner if WAHA is not reachable).

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Donnez-lui un numéro de téléphone</h2>
        <p className="text-sm text-muted-foreground">
          C’est par ce numéro qu’il répondra à vos clients. Si vous le connectez depuis un
          téléphone, gardez-le à portée de main.
        </p>
      </header>
      <ConnectWhatsappClient
        wahaConfigured={wahaConfigured}
        sessionName={`org_${activeOrg.orgId.slice(0, 8)}`}
        oficialPodeReceber={oficialPodeReceber}
      />
    </div>
  );
}
