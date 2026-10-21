"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/db/server";
import { audit } from "@/lib/audit";
import { headers } from "next/headers";

export async function signOutEverywhere(): Promise<void> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");

  await db.auth.signOut({ scope: "global" });

  if (user) {
    await audit({
      action: "auth.logout",
      actorUserId: user.id,
      requestId,
      metadata: { scope: "global" },
    });
  }
  redirect("/login");
}
