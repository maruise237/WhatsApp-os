import { NextResponse, type NextRequest } from "next/server";
import { getNeonAuthMiddleware } from "@/lib/neon/server-client";
import { isPublicPath } from "@/lib/auth/public-paths";
import {
  verifyImpersonateCookieEdge,
  IMPERSONATE_COOKIE_NAME_EDGE,
} from "@/lib/impersonate/cookie-edge";

const neonAuthMiddleware = getNeonAuthMiddleware();

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  response.headers.set("x-request-id", requestId);

  const { pathname, search } = request.nextUrl;
  response.headers.set("x-pathname", pathname);
  request.headers.set("x-pathname", pathname);

  if (isPublicPath(pathname)) return response;

  const guarded = await neonAuthMiddleware(request);
  guarded.headers.set("x-request-id", requestId);
  guarded.headers.set("x-pathname", pathname);

  // Preserve the API contract: unauthenticated API calls receive JSON rather
  // than the HTML redirect intended for browser pages.
  if (pathname.startsWith("/api/") && guarded.status >= 300 && guarded.status < 400) {
    return new NextResponse(
      JSON.stringify({
        error: { code: "unauthenticated", message: "Authentication required" },
      }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
      },
    );
  }

  if (guarded.status >= 300 && guarded.status < 400 && !pathname.startsWith("/api/")) {
    const location = guarded.headers.get("location");
    if (location) {
      const loginUrl = new URL(location, request.url);
      if (!loginUrl.searchParams.has("next")) loginUrl.searchParams.set("next", pathname + search);
      guarded.headers.set("location", loginUrl.toString());
    }
  }

  if (pathname.startsWith("/app")) {
    const impCookie = request.cookies.get(IMPERSONATE_COOKIE_NAME_EDGE)?.value;
    if (impCookie) {
      const result = await verifyImpersonateCookieEdge(
        impCookie,
        process.env.IMPERSONATE_COOKIE_SECRET ?? "",
      );
      if (!result.valid) {
        console.warn(`[proxy] impersonate cookie invalid (${result.reason ?? "unknown"}) — clearing`);
        guarded.cookies.delete(IMPERSONATE_COOKIE_NAME_EDGE);
      }
    }
  }

  return guarded;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
