import { describe, expect, it } from "bun:test";
import {
  cookiesFromResponse,
  createTestAuth,
  makeKeypair,
  performLogin,
  signAddPubkeyToken,
  signLoginToken,
} from "./helpers";

describe("POST /nostr/nonce", () => {
  it("issues a nonce for a valid hex pubkey", async () => {
    const auth = createTestAuth();
    const keypair = makeKeypair();

    const { nonce } = await auth.api.getNostrNonce({
      body: { publicKey: keypair.publicKey },
    });

    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThanOrEqual(16);
  });

  it("rejects a malformed pubkey", async () => {
    const auth = createTestAuth();
    await expect(
      auth.api.getNostrNonce({ body: { publicKey: "not-hex" } }),
    ).rejects.toThrow();
  });

  it("honors a custom getNonce()", async () => {
    const auth = createTestAuth({ getNonce: async () => "fixed-nonce-123" });
    const keypair = makeKeypair();

    const { nonce } = await auth.api.getNostrNonce({
      body: { publicKey: keypair.publicKey },
    });

    expect(nonce).toBe("fixed-nonce-123");
  });
});

describe("POST /nostr/login", () => {
  it("creates a user + session on first login", async () => {
    const auth = createTestAuth();
    const keypair = makeKeypair();

    const res = await performLogin(auth, keypair);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { id: string; userId: string };
      user: { id: string; name: string };
    };
    expect(body.session.userId).toBe(body.user.id);
    expect(body.user.name.startsWith("npub")).toBe(true);

    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it("reuses the same user on a second login from the same pubkey", async () => {
    const auth = createTestAuth();
    const keypair = makeKeypair();

    const first = await performLogin(auth, keypair);
    const second = await performLogin(auth, keypair);

    const firstBody = (await first.json()) as { user: { id: string } };
    const secondBody = (await second.json()) as { user: { id: string } };

    expect(secondBody.user.id).toBe(firstBody.user.id);
  });

  it("rejects a replayed nonce (single-use)", async () => {
    const auth = createTestAuth();
    const keypair = makeKeypair();

    const { nonce } = await auth.api.getNostrNonce({
      body: { publicKey: keypair.publicKey },
    });
    const token = await signLoginToken(keypair, nonce);

    await auth.api.loginNostr({
      body: { nonce },
      headers: new Headers({ authorization: token }),
    });

    await expect(
      auth.api.loginNostr({
        body: { nonce },
        headers: new Headers({ authorization: token }),
      }),
    ).rejects.toThrow();
  });

  it("rejects when the signed nonce and body nonce diverge", async () => {
    const auth = createTestAuth();
    const keypair = makeKeypair();

    const { nonce } = await auth.api.getNostrNonce({
      body: { publicKey: keypair.publicKey },
    });
    const token = await signLoginToken(keypair, "bogus-nonce");

    await expect(
      auth.api.loginNostr({
        body: { nonce },
        headers: new Headers({ authorization: token }),
      }),
    ).rejects.toThrow();
  });

  it("rejects an unknown pubkey when disableImplicitSignUp is set", async () => {
    const auth = createTestAuth({ disableImplicitSignUp: true });
    const keypair = makeKeypair();

    const { nonce } = await auth.api.getNostrNonce({
      body: { publicKey: keypair.publicKey },
    });
    const token = await signLoginToken(keypair, nonce);

    await expect(
      auth.api.loginNostr({
        body: { nonce },
        headers: new Headers({ authorization: token }),
      }),
    ).rejects.toThrow(/not registered/);
  });

  it("rejects a request with no Authorization header", async () => {
    const auth = createTestAuth();
    const keypair = makeKeypair();
    const { nonce } = await auth.api.getNostrNonce({
      body: { publicKey: keypair.publicKey },
    });

    await expect(
      auth.api.loginNostr({ body: { nonce }, headers: new Headers() }),
    ).rejects.toThrow();
  });
});

describe("POST /nostr/add-pubkey", () => {
  it("links a second pubkey to an authenticated user", async () => {
    const auth = createTestAuth();
    const primary = makeKeypair();
    const secondary = makeKeypair();

    const loginRes = await performLogin(auth, primary);
    const sessionHeaders = cookiesFromResponse(loginRes);
    const addToken = await signAddPubkeyToken(secondary);

    sessionHeaders.set("authorization", addToken);

    const result = await auth.api.addPubkey({
      body: { name: "Backup key" },
      headers: sessionHeaders,
    });

    expect(result.pubkey.publicKey).toBe(secondary.publicKey);
    expect(result.pubkey.name).toBe("Backup key");
  });

  it("rejects when not signed in", async () => {
    const auth = createTestAuth();
    const keypair = makeKeypair();
    const token = await signAddPubkeyToken(keypair);

    await expect(
      auth.api.addPubkey({
        body: {},
        headers: new Headers({ authorization: token }),
      }),
    ).rejects.toThrow();
  });

  it("returns 409 when the pubkey already belongs to a different user", async () => {
    const auth = createTestAuth();

    const userA = makeKeypair();
    await performLogin(auth, userA);

    const userB = makeKeypair();
    const loginB = await performLogin(auth, userB);
    const sessionHeaders = cookiesFromResponse(loginB);
    const stolenToken = await signAddPubkeyToken(userA);
    sessionHeaders.set("authorization", stolenToken);

    await expect(
      auth.api.addPubkey({ body: {}, headers: sessionHeaders }),
    ).rejects.toThrow(/already linked/);
  });

  it("is idempotent for a pubkey the same user already owns", async () => {
    const auth = createTestAuth();
    const keypair = makeKeypair();

    const loginRes = await performLogin(auth, keypair);
    const sessionHeaders = cookiesFromResponse(loginRes);
    const token = await signAddPubkeyToken(keypair);
    sessionHeaders.set("authorization", token);

    const result = await auth.api.addPubkey({
      body: {},
      headers: sessionHeaders,
    });
    expect(result.pubkey.publicKey).toBe(keypair.publicKey);
  });
});
