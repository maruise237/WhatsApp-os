import { ConnectNuvemshopClient } from "./_client";

export const dynamic = "force-dynamic";

export default function ConnectNuvemshopPage() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Connecter Nuvemshop</h2>
        <p className="text-sm text-muted-foreground">
          Importez les commandes, clients et produits de votre boutique Nuvemshop.
        </p>
      </header>
      <ConnectNuvemshopClient />
    </div>
  );
}
