import { IncidentDetailClient } from "./_client";

export const metadata = { title: "Détail de l’incident — Admin plateforme" };

export default async function AdminIncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IncidentDetailClient id={id} />;
}
