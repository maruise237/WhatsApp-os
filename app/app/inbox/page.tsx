import { redirect } from "next/navigation";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { InboxLayout } from "@/components/inbox/InboxLayout";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await loadAuthUser();
  if (!user) redirect("/login");
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Vous n’avez aucune organisation active. Acceptez une invitation ou contactez l’administrateur.
      </div>
    );
  }
  const { id } = await searchParams;
  return <InboxLayout initialSelectedId={id ?? null} />;
}
