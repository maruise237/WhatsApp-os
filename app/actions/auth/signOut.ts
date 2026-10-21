"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { audit } from "@/lib/audit";

export async function signOut(): Promise<void> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  const hdrs = await headers();
  await db.auth.signOut();

  // Clear active_org cookie too.
  const store = await cookies();
  store.delete("active_org");

  if (user) {
    await audit({
      action: "auth.logout",
      actorUserId: user.id,
      requestId: hdrs.get("x-request-id"),
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    });
  }

  redirect("/login");
}
