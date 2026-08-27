import Link from "next/link";

import { RecoveryForm } from "@/components/auth/RecoveryForm";

export const metadata = { title: "Récupérer l’accès" };

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Récupérer l’accès</h1>
        <p className="text-sm text-muted-foreground">
          Utilisez un code de récupération pour reconfigurer votre validation en deux étapes.
        </p>
      </div>
      <RecoveryForm next={next} />
      <div className="text-center text-sm">
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
