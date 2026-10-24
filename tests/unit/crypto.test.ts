import { describe, expect, it } from "vitest";
import { decodeAes256Key, decryptSecret, encryptSecret, randomToken, safeEqual, sha256Hex } from "@/lib/crypto";
import { decryptMfaSecret, encryptMfaSecret, generateRecoveryCodes, hashRecoveryCode } from "@/lib/mfa";

describe("configuration secret encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("instance-settings", "smtp-password");
    const b = encryptSecret("instance-settings", "smtp-password");
    expect(a).not.toEqual(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptSecret("instance-settings", a)).toBe("smtp-password");
  });

  it("keeps purposes apart", () => {
    const token = encryptSecret("webhook-secrets", "whsec_value");
    expect(() => decryptSecret("instance-settings", token)).toThrow();
    expect(decryptSecret("webhook-secrets", token)).toBe("whsec_value");
  });

  it("detects tampering", () => {
    const value = encryptSecret("instance-settings", "secret");
    const parts = value.split(".");
    const flipped = Buffer.from(parts[3]!, "base64url");
    flipped[0] ^= 0xff;
    parts[3] = flipped.toString("base64url");
    expect(() => decryptSecret("instance-settings", parts.join("."))).toThrow();
    expect(() => decryptSecret("instance-settings", "v2.a.b.c")).toThrow();
  });

  it("encrypts MFA seeds with the MFA key", () => {
    const sealed = encryptMfaSecret("JBSWY3DPEHPK3PXP");
    expect(decryptMfaSecret(sealed)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("validates 32-byte base64 keys", () => {
    expect(decodeAes256Key(Buffer.alloc(32, 1).toString("base64"), "K").length).toBe(32);
    expect(() => decodeAes256Key(Buffer.alloc(16, 1).toString("base64"), "K")).toThrow(/32-byte/);
    expect(() => decodeAes256Key(undefined, "K")).toThrow();
  });
});

describe("token helpers", () => {
  it("generates url-safe random tokens", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toEqual(token);
  });

  it("hashes deterministically and compares in constant time", () => {
    expect(sha256Hex("a")).toBe(sha256Hex("a"));
    expect(sha256Hex("a")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("normalises recovery codes before hashing", () => {
    const [code] = generateRecoveryCodes(1);
    expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(hashRecoveryCode(code!)).toBe(hashRecoveryCode(code!.replace(/-/g, "").toLowerCase()));
  });
});

describe("secret purposes", () => {
  it("keeps every purpose apart from the others", () => {
    const purposes = ["instance-settings", "webhook-secrets", "payment-secrets"] as const;
    for (const purpose of purposes) {
      const sealed = encryptSecret(purpose, `secret-for-${purpose}`);
      expect(decryptSecret(purpose, sealed)).toBe(`secret-for-${purpose}`);
      for (const other of purposes) if (other !== purpose) expect(() => decryptSecret(other, sealed)).toThrow();
    }
  });
});
