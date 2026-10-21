import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { ContactDetailClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createClient();
  const { data: contact } = await db
    .from("contacts")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!contact) notFound();
  return <ContactDetailClient contactId={id} />;
}
