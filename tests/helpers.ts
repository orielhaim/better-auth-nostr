import { betterAuth } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import { getToken } from "nostr-tools/nip98";
import { nostr } from "../src/index";
import type { NostrOptions } from "../src/types";

const TEST_BASE = "http://localhost:3000";
const TEST_BASE_URL = `${TEST_BASE}/api/auth`;

const createMemoryDb = (modelName: string): MemoryDB => ({
  [modelName]: [],
});

export const createTestAuth = (options?: NostrOptions) => {
  const modelName = options?.modelName ?? "nostrPubkey";
  return betterAuth({
    baseURL: TEST_BASE,
    secret: "test-secret-do-not-use-in-production",
    database: memoryAdapter(createMemoryDb(modelName)),
    emailAndPassword: { enabled: false },
    plugins: [nostr(options)],
    advanced: { disableCSRFCheck: true },
  });
};

export type TestAuth = ReturnType<typeof createTestAuth>;

export type Keypair = {
  secretKey: Uint8Array;
  publicKey: string;
};

export const makeKeypair = (): Keypair => {
  const secretKey = generateSecretKey();
  return { secretKey, publicKey: getPublicKey(secretKey) };
};

export const signLoginToken = async (
  keypair: Keypair,
  nonce: string,
  path = "/nostr/login",
) =>
  getToken(
    `${TEST_BASE_URL}${path}`,
    "post",
    (event) => finalizeEvent(event, keypair.secretKey),
    true,
    { nonce },
  );

export const signAddPubkeyToken = async (keypair: Keypair) =>
  getToken(
    `${TEST_BASE_URL}/nostr/add-pubkey`,
    "post",
    (event) => finalizeEvent(event, keypair.secretKey),
    true,
  );

export const performLogin = async (
  auth: TestAuth,
  keypair: Keypair,
): Promise<Response> => {
  const nonceRes = await auth.api.getNostrNonce({
    body: { publicKey: keypair.publicKey },
    asResponse: true,
  });
  if (!nonceRes.ok) {
    throw new Error(`getNostrNonce failed: ${nonceRes.status}`);
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const token = await signLoginToken(keypair, nonce);

  return auth.api.loginNostr({
    body: { nonce },
    headers: new Headers({ authorization: token }),
    asResponse: true,
  });
};

export const cookiesFromResponse = (res: Response): Headers => {
  const headers = new Headers();
  const setCookie = res.headers.getSetCookie();
  if (setCookie.length === 0) return headers;
  const cookieHeader = setCookie
    .map((c) => c.split(";", 1)[0]!.trim())
    .join("; ");
  headers.set("cookie", cookieHeader);
  return headers;
};
