import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ServiceUnavailablePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-semibold">503 — En maintenance</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nous revenons dans quelques minutes.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link href="/">Retour</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
