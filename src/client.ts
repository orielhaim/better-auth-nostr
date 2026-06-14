import type { BetterAuthClientPlugin } from "better-auth";
import type { BetterFetchOption } from "@better-fetch/fetch";
import {
  finalizeEvent,
  getPublicKey as derivePublicKey,
  nip19,
  type Event as NostrEvent,
  type EventTemplate,
} from "nostr-tools";
import { getToken } from "nostr-tools/nip98";
import { hexToBytes } from "nostr-tools/utils";
import type { nostr } from "./index";
import type { Nostr } from "./types";

type SignInOptions = {
  /** Bech32 nsec or 64-char hex secret. Omit to use a NIP-07 extension. */
  nsec?: string;
};

type AddPubkeyOptions = SignInOptions & {
  /** Optional display label stored alongside the pubkey row. */
  name?: string;
};

type WindowNostr = {
  getPublicKey: () => Promise<string> | string;
  signEvent: (event: EventTemplate) => Promise<NostrEvent> | NostrEvent;
};

export const parseSecretKey = (input: string): Uint8Array => {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Missing NSEC private key");

  const lower = trimmed.toLowerCase();
  if (nip19.NostrTypeGuard.isNSec(lower)) {
    const decoded = nip19.decode(lower);
    if (decoded.type !== "nsec") {
      throw new Error("Invalid NSEC private key");
    }
    return decoded.data;
  }

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return hexToBytes(trimmed);
  }

  throw new Error("Invalid NSEC private key");
};

const getExtension = (): WindowNostr | null => {
  if (typeof window === "undefined") return null;
  const ext = (window as unknown as { nostr?: WindowNostr }).nostr;
  return ext && typeof ext.signEvent === "function" ? ext : null;
};

const resolvePublicKey = async (nsec?: string): Promise<string> => {
  if (nsec) return derivePublicKey(parseSecretKey(nsec));
  const ext = getExtension();
  if (!ext) throw new Error("No NIP-07 extension and no NSEC provided");
  return await ext.getPublicKey();
};

export const nostrClient = () => {
  type Server = ReturnType<typeof nostr>;

  return {
    id: "nostr",
    $InferServerPlugin: {} as Server,

    pathMethods: {
      "/nostr/nonce": "POST",
      "/nostr/login": "POST",
      "/nostr/add-pubkey": "POST",
    },

    getActions: ($fetch) => {
      const absoluteUrl = (path: string): string => {
        const fetchBase = ($fetch as unknown as { baseURL?: string }).baseURL;
        const origin =
          fetchBase ??
          (typeof window !== "undefined" ? window.location.origin : "");
        if (!origin) {
          throw new Error(
            "nostrClient: cannot determine absolute URL — no baseURL configured",
          );
        }
        const trimmed = origin.endsWith("/") ? origin.slice(0, -1) : origin;
        return `${trimmed}${path.startsWith("/") ? path : `/${path}`}`;
      };

      const fetchNonce = async (publicKey: string): Promise<string> => {
        const { data, error } = await $fetch<{ nonce: string }>(
          "/nostr/nonce",
          { method: "POST", body: { publicKey } },
        );
        if (error || !data?.nonce) {
          throw new Error(error?.message ?? "Failed to fetch nonce");
        }
        return data.nonce;
      };

      const mintToken = async (
        url: string,
        nsec: string | undefined,
        payload: Record<string, unknown>,
      ): Promise<string> => {
        if (nsec) {
          const secretKey = parseSecretKey(nsec);
          return getToken(
            url,
            "post",
            (event) => finalizeEvent(event, secretKey),
            true,
            payload,
          );
        }
        const ext = getExtension();
        if (!ext) throw new Error("Nostr NIP-07 extension not found");
        return getToken(
          url,
          "post",
          (event) => Promise.resolve(ext.signEvent(event)),
          true,
          payload,
        );
      };

      const signInNostr = async (
        options?: SignInOptions,
        fetchOptions?: BetterFetchOption,
      ) => {
        try {
          const publicKey = await resolvePublicKey(options?.nsec);
          const nonce = await fetchNonce(publicKey);
          const url = absoluteUrl("/nostr/login");
          const token = await mintToken(url, options?.nsec, { nonce });

          return await $fetch<{
            session: { id: string; userId: string; expiresAt: Date };
            user: { id: string; email: string; name: string };
          }>("/nostr/login", {
            method: "POST",
            headers: { authorization: token },
            body: { nonce },
            ...fetchOptions,
          });
        } catch (err) {
          return {
            data: null,
            error: {
              code: "NOSTR_SIGN_IN_FAILED",
              message:
                err instanceof Error ? err.message : "Nostr sign-in failed",
              status: 400,
              statusText: "BAD_REQUEST",
            },
          };
        }
      };

      const addPubkey = async (
        options?: AddPubkeyOptions,
        fetchOptions?: BetterFetchOption,
      ) => {
        try {
          const url = absoluteUrl("/nostr/add-pubkey");
          const token = await mintToken(url, options?.nsec, {});

          return await $fetch<{ pubkey: Nostr }>("/nostr/add-pubkey", {
            method: "POST",
            headers: { authorization: token },
            body: { name: options?.name },
            ...fetchOptions,
          });
        } catch (err) {
          return {
            data: null,
            error: {
              code: "NOSTR_ADD_PUBKEY_FAILED",
              message:
                err instanceof Error ? err.message : "Failed to add pubkey",
              status: 400,
              statusText: "BAD_REQUEST",
            },
          };
        }
      };

      return {
        signIn: { nostr: signInNostr },
        nostr: { addPubkey },
        $Infer: {} as { Nostr: Nostr },
      };
    },
  } satisfies BetterAuthClientPlugin;
};

export type * from "./types";
