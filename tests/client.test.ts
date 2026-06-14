import { describe, expect, it } from "bun:test";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { bytesToHex } from "nostr-tools/utils";
import { parseSecretKey } from "../src/client";

describe("parseSecretKey", () => {
  it("decodes a bech32 nsec", () => {
    const sk = generateSecretKey();
    const decoded = parseSecretKey(nip19.nsecEncode(sk));
    expect(bytesToHex(decoded)).toBe(bytesToHex(sk));
  });

  it("decodes a 64-char hex string", () => {
    const sk = generateSecretKey();
    const hex = bytesToHex(sk);
    expect(bytesToHex(parseSecretKey(hex))).toBe(hex);
  });

  it("accepts uppercase hex", () => {
    const sk = generateSecretKey();
    const hex = bytesToHex(sk).toUpperCase();
    expect(bytesToHex(parseSecretKey(hex))).toBe(hex.toLowerCase());
  });

  it("trims surrounding whitespace around an nsec", () => {
    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    expect(bytesToHex(parseSecretKey(`  ${nsec}  \n`))).toBe(bytesToHex(sk));
  });

  it("throws on empty input", () => {
    expect(() => parseSecretKey("")).toThrow("Missing NSEC");
    expect(() => parseSecretKey("   ")).toThrow("Missing NSEC");
  });

  it("throws on garbage input", () => {
    expect(() => parseSecretKey("not-an-nsec")).toThrow("Invalid NSEC");
    expect(() => parseSecretKey("deadbeef")).toThrow("Invalid NSEC");
  });

  it("the parsed key derives the expected pubkey", () => {
    const sk = generateSecretKey();
    const expected = getPublicKey(sk);
    expect(getPublicKey(parseSecretKey(nip19.nsecEncode(sk)))).toBe(expected);
  });
});
