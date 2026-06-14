export interface NostrOptions {
  disableSignUp?: boolean;
  disableImplicitSignUp?: boolean;
  modelName?: string;
  nonceTtlMs?: number;
  getNonce?: () => Promise<string>;
  generateEmail?: (npub: string, pubkey: string) => string | Promise<string>;
  fields?: {
    name?: string;
    publicKey?: string;
    userId?: string;
    createdAt?: string;
  };
}

export interface Nostr {
  id: string;
  publicKey: string;
  userId: string;
  name?: string | undefined;
  createdAt: Date;
}

export type NostrPubkey = {
  id?: string;
  name?: string | undefined;
  publicKey: string;
  userId: string;
  createdAt: Date;
};
