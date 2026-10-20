import { beforeEach, describe, expect, it, vi } from "vitest";

// Redis configuré mais injoignable : le cas de la stack allégée où le .env
// garde UPSTASH_REDIS_REST_URL alors que le profil `redis` est éteint.
vi.mock("@/lib/env", () => ({
  env: { UPSTASH_REDIS_REST_URL: "http://srh:80", UPSTASH_REDIS_REST_TOKEN: "t" },
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    set = vi.fn().mockRejectedValue(new Error("fetch failed"));
    del = vi.fn().mockRejectedValue(new Error("fetch failed"));
  },
}));

describe("acquireDebounce — Redis injoignable", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("retombe sur le debounce en mémoire au lieu de lancer", async () => {
    const { acquireDebounce, releaseDebounce } = await import("./debounce");
    await expect(acquireDebounce("k1", 30)).resolves.toBe(true);
    // Le verrou en mémoire tient : un second appel est bien dédoublonné.
    await expect(acquireDebounce("k1", 30)).resolves.toBe(false);
    await expect(releaseDebounce("k1")).resolves.toBeUndefined();
    await expect(acquireDebounce("k1", 30)).resolves.toBe(true);
  });
});
