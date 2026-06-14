<h2 align="center">🪪 Better Auth Nostr</h2>

<p align="center">
  <strong>A Better Auth plugin for Nostr-based login and pubkey management.</strong>
</p>

<p align="center">
  A thin, standards-aware bridge that lets <a href="https://www.better-auth.com/">Better Auth</a> authenticate with Nostr (<a href="https://github.com/nostr-protocol/nips/blob/master/98.md">NIP-98</a>) and keeps pubkeys synced with your users.
</p>

<p align="center">
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
<a href="https://www.npmjs.com/package/better-auth-nostr"><img src="https://img.shields.io/npm/v/better-auth-nostr.svg" alt="npm version"></a>
</p>

## 🧭 Overview

This plugin exposes both a server-side `nostr` plugin and a client helper so Better Auth installations can:

- validate incoming NIP-98 tokens and create a session cookie without touching passwords or private keys,
- persist each Nostr public key in a configurable `nostrPubkey` model so users retain a linked identity,
- link additional pubkeys to an existing account through an authenticated endpoint.

It is designed to be as simple as possible, dropping decentralized login flows into traditional apps with minimal wiring.

## Example

```ts
import { betterAuth } from "better-auth";
import { nostr } from "better-auth-nostr";

export const auth = betterAuth({
  plugins: [nostr()],
});
```

On the client:

```ts
import { createAuthClient } from "better-auth/client";
import { nostrClient } from "better-auth-nostr/client";

export const authClient = createAuthClient({
  plugins: [nostrClient()],
});

await authClient.signIn.nostr({ nsec });

await authClient.nostr.addPubkey({ nsec, name: "Backup key" });
```

`signIn.nostr` will create and sign the NIP-98 event using:

- a passed-in `nsec` string (bech32 or 64-char hex), or
- a browser extension that exposes `window.nostr.signEvent` (NIP-07).

The action sends the resulting token in the `Authorization` header to `/nostr/login`. The endpoint then:

1. unpacks the event via `nostr-tools/nip98`,
2. verifies the signature against the canonical login URL,
3. atomically consumes the issued nonce so it cannot be replayed,
4. finds or creates a `nostrPubkey` row tied to a Better Auth user,
5. issues a session and sets the cookie.

Each login request carries a nonce in both the signed NIP-98 payload and the JSON body, so tampering with either side fails validation. The nonce is single-use — consumed atomically on the server.

## Configuration Options

| Option                  | Description                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `disableSignUp`         | Reserved for future request-gated signup flows. Currently a no-op.                              |
| `disableImplicitSignUp` | Reject logins from unseen pubkeys instead of auto-creating a Better Auth user.                  |
| `modelName`             | Override the `nostrPubkey` model name registered in the schema.                                 |
| `fields`                | Customize field names for `name`, `publicKey`, `userId`, and `createdAt`.                       |
| `nonceTtlMs`            | Nonce time-to-live in milliseconds. Defaults to 5 minutes.                                      |
| `getNonce`              | Custom nonce generator. Must return `Promise<string>`.                                          |
| `generateEmail`         | Customize the email used when implicitly creating a user. Receives the npub and the hex pubkey. |

The plugin exports its schema so the underlying adapter sets up indexes and the foreign key to `user` automatically.

## Development

The project is built and tested with [Bun](https://bun.com).

```bash
bun install
bun run build       # bundle with Bun, emit types with tsc
bun run dev         # rebuild on change
bun run typecheck
bun test
bun run coverage
```

See `src/routes.ts` and `src/client.ts` for the endpoint and action wiring, and `tests/` for end-to-end examples that boot Better Auth against the in-memory adapter.

## Why It Matters

Most Nostr logins today live in bespoke, one-off integrations. Packaging it as a Better Auth plugin lets teams:

- add decentralized authentication next to their existing auth flows with a single import,
- run Nostr-first apps on Better Auth without rebuilding session, cookie, and schema plumbing.

## Project Status

- Stage: early but stable for login and basic pubkey management.
- Contributions that extend the feature set (e.g. pubkey revocation, multi-key UX, profile sync from relays) or polish the docs are welcome.

## Get Involved

- Try the plugin in your Better Auth app and report bugs at [github.com/leon-wbr/better-auth-nostr/issues](https://github.com/leon-wbr/better-auth-nostr/issues).
- Open a pull request to add client actions, extend the schema, or improve docs.
- Share ideas for future Nostr flows on the issue tracker.

## License

MIT
