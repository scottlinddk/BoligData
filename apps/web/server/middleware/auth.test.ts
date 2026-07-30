import { describe, expect, it } from "vitest";
import type { VercelRequest } from "@vercel/node";
import { extractJwt } from "./auth.js";

const JWT = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

function reqWith(authorization?: string): VercelRequest {
  return { headers: { authorization } } as unknown as VercelRequest;
}

describe("extractJwt", () => {
  it("extracts the token from a canonical header", () => {
    expect(extractJwt(reqWith(`Bearer ${JWT}`))).toBe(JWT);
  });

  it("accepts the scheme in any case, per RFC 7235", () => {
    expect(extractJwt(reqWith(`bearer ${JWT}`))).toBe(JWT);
    expect(extractJwt(reqWith(`BEARER ${JWT}`))).toBe(JWT);
  });

  it("tolerates extra whitespace around the scheme and the token", () => {
    expect(extractJwt(reqWith(`Bearer   ${JWT}`))).toBe(JWT);
    expect(extractJwt(reqWith(`Bearer\t${JWT}`))).toBe(JWT);
    expect(extractJwt(reqWith(`  Bearer ${JWT}  `))).toBe(JWT);
  });

  it("strips the trailing newline a shell leaves behind on $(cat token.txt)", () => {
    expect(extractJwt(reqWith(`Bearer ${JWT}\n`))).toBe(JWT);
  });

  it("returns undefined when the header is absent", () => {
    expect(extractJwt(reqWith(undefined))).toBeUndefined();
  });

  it("returns undefined for a non-bearer scheme", () => {
    expect(extractJwt(reqWith(`Basic ${JWT}`))).toBeUndefined();
    // "Bearerish" must not match — the scheme has to be followed by whitespace.
    expect(extractJwt(reqWith(`Bearerish ${JWT}`))).toBeUndefined();
  });

  it("treats a scheme with no credentials as missing rather than as an empty token", () => {
    expect(extractJwt(reqWith("Bearer"))).toBeUndefined();
    expect(extractJwt(reqWith("Bearer "))).toBeUndefined();
    expect(extractJwt(reqWith("Bearer   "))).toBeUndefined();
  });
});
