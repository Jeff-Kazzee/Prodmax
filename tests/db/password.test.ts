// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing (§2.1 scrypt)", () => {
  it("hashes and verifies a roundtrip", () => {
    const stored = hashPassword("prodmax-demo");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(verifyPassword("prodmax-demo", stored)).toBe(true);
  });

  it("rejects wrong passwords and malformed stored strings", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong", stored)).toBe(false);
    expect(verifyPassword("prodmax-demo", "")).toBe(false);
    expect(verifyPassword("prodmax-demo", "plaintext")).toBe(false);
    expect(verifyPassword("prodmax-demo", "bcrypt$1$2$3$4$5")).toBe(false);
    expect(verifyPassword("prodmax-demo", "scrypt$1$2$3$$")).toBe(false);
  });

  it("uses a fresh random salt per hash", () => {
    const a = hashPassword("same password");
    const b = hashPassword("same password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same password", a)).toBe(true);
    expect(verifyPassword("same password", b)).toBe(true);
  });
});
