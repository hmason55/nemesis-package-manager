import { afterEach, describe, it, expect, vi } from "vitest";
import { appToken, checkRepository } from "../src/github";
import { Env } from "../src/types";
let privateKey = "";
async function bindings() {
  if (!privateKey) {
    const keys = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ["sign", "verify"],
    );
    const bytes = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
    privateKey =
      "-----BEGIN PRIVATE KEY-----\n" +
      btoa(String.fromCharCode(...new Uint8Array(bytes))) +
      "\n-----END PRIVATE KEY-----";
  }
  return { GITHUB_APP_ID: "123", GITHUB_PRIVATE_KEY: privateKey } as Env;
}
afterEach(() => vi.restoreAllMocks());
describe("GitHub publishing authorization", () => {
  it("uses short-lived app JWT credentials", async () => {
    const jwt = await appToken(await bindings());
    const payload = JSON.parse(
      atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    expect(payload.iss).toBe("123");
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
  });
  it("requires a public repository, publishing permission, and a matching app installation", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const path = String(input);
        return Response.json(
          path.endsWith("/permission")
            ? { permission: "write" }
            : path.endsWith("/installation")
              ? { id: 20 }
              : {
                  id: 10,
                  private: false,
                  archived: false,
                  disabled: false,
                  owner: { id: 1 },
                },
        );
      });
    const checked = await checkRepository(
      await bindings(),
      "user-token",
      "publisher",
      "owner/repo",
    );
    expect(checked.repo.id).toBe(10);
    expect(checked.installation.id).toBe(20);
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it("rejects read-only users before checking installation", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        Response.json(
          String(input).endsWith("/permission")
            ? { permission: "read" }
            : { id: 10, private: false },
        ),
      );
    await expect(
      checkRepository(await bindings(), "user-token", "reader", "owner/repo"),
    ).rejects.toThrow("publishing permission");
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("rejects private repositories and missing installations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ private: true }),
    );
    await expect(
      checkRepository(
        await bindings(),
        "user-token",
        "publisher",
        "owner/repo",
      ),
    ).rejects.toThrow("public repository");
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/installation")
        ? new Response("", { status: 404 })
        : Response.json(
            String(input).endsWith("/permission")
              ? { permission: "admin" }
              : { id: 10, private: false },
          ),
    );
    await expect(
      checkRepository(
        await bindings(),
        "user-token",
        "publisher",
        "owner/repo",
      ),
    ).rejects.toThrow("GitHub request failed");
  });
});
