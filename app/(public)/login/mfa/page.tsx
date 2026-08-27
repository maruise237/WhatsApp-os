import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { MfaForm } from "@/components/auth/MfaForm";

export const metadata = { title: "Validation en deux étapes" };

export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const hasVerified = !!factorsData?.totp?.some((f) => f.status === "verified");
  if (!hasVerified) redirect("/app/inbox");

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Validation en deux étapes</h1>
        <p className="text-sm text-muted-foreground">
          Saisissez le code à 6 chiffres de votre application d’authentification.
        </p>
      </div>
      <MfaForm next={next} />
    </div>
  );
}
