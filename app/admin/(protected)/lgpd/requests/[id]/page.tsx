import { LgpdRequestAdminDetail } from "./_client";

export const metadata = {
  title: "Demande RGPD — Admin",
};

export default async function AdminLgpdRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LgpdRequestAdminDetail id={id} />;
}
