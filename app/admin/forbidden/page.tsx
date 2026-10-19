import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Acesso negado — Admin Plataforma" };

export default function AdminForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-lg p-8 text-center">
        <h1 className="text-2xl font-semibold">Acesso negado</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Cette section est réservée aux administrateurs de la plateforme avec MFA activé. Si vous pensez qu’il s’agit d’une erreur, contactez l’équipe des opérations.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/">Accueil</Link>
          </Button>
          <Button asChild>
            <Link href="/app">Retour vers /app</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
