import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { loadAuthUser } from "@/lib/auth/server";

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn() }));

const req = () => new NextRequest("http://localhost/api/v1/system/version");

describe("GET /api/v1/system/version", () => {
  beforeEach(() => {
    vi.mocked(loadAuthUser).mockReset();
    delete process.env.APP_VERSION;
  });

  it("refuse sans session", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue(null as never);
    const { GET } = await import("./route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("renvoie la version gravée dans l'image", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue({ id: "u1" } as never);
    process.env.APP_VERSION = "v1.4.2";
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.data).toEqual({ current_version: "v1.4.2" });
  });

  it("vaut « dev » hors image publiée", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue({ id: "u1" } as never);
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.data.current_version).toBe("dev");
  });
});
