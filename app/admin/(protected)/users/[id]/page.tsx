import { UserDetailClient } from "./_client";

export const metadata = { title: "Détail de l’utilisateur — Admin plateforme" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserDetailClient id={id} />;
}
