import { describe, expect, it } from "vitest";
import { PBKDF2_ITERATIONS } from "../constants.js";
import { isPasswordHash, pbkdf2Sha256, verifyPassword } from "../hash.js";

describe("password hashing", () => {
  it("generates hashes with the Workers-supported iteration count", async () => {
    const hash = await pbkdf2Sha256(
      "secret",
      undefined,
      "00112233445566778899aabbccddeeff",
    );

    expect(PBKDF2_ITERATIONS).toBe(100000);
    expect(hash).toMatch(/^pbkdf2_sha256\$100000\$/);
    expect(isPasswordHash(hash)).toBe(true);
    await expect(verifyPassword("secret", hash)).resolves.toBe(true);
  });

  it("rejects hashes above the Workers PBKDF2 iteration limit", async () => {
    const hash = await pbkdf2Sha256(
      "secret",
      100000,
      "00112233445566778899aabbccddeeff",
    );
    const unsupportedHash = hash.replace(
      "pbkdf2_sha256$100000$",
      "pbkdf2_sha256$310000$",
    );

    expect(isPasswordHash(unsupportedHash)).toBe(false);
    await expect(verifyPassword("secret", unsupportedHash)).resolves.toBe(
      false,
    );
  });
});
