import { describe, it, expect } from "vitest";
import { decodeJwtPayload } from "../src/auth.js";

function makeToken(payload) {
  const b64 = (obj) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "none" })}.${b64(payload)}.`;
}

describe("decodeJwtPayload", () => {
  it("decodes an ASCII payload", () => {
    const token = makeToken({ email: "a@example.com", sub: "123" });
    expect(decodeJwtPayload(token)).toEqual({ email: "a@example.com", sub: "123" });
  });

  it("decodes a payload with Japanese text", () => {
    const token = makeToken({ email: "a@example.com", name: "藤原史和" });
    expect(decodeJwtPayload(token).name).toBe("藤原史和");
  });
});

