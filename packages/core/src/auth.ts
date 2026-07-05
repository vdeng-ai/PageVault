import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./constants.js";
import { randomHex, sha256Hex, fixedTimeEqual } from "./hash.js";
import type { AdminSession } from "./types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return decoder.decode(bytes);
}

async function hmacSha256(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(signature);
}

export function parseCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return rawValue.join("=");
    }
  }
  return null;
}

export async function createSession(
  email: string,
  sessionSecret: string,
  now = new Date()
): Promise<{ value: string; session: AdminSession }> {
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const session: AdminSession = {
    email,
    csrfToken: randomHex(32),
    expiresAt
  };
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = await hmacSha256(payload, sessionSecret);
  return { value: `${payload}.${signature}`, session };
}

export async function verifySession(
  cookieValue: string | null,
  sessionSecret: string,
  now = new Date()
): Promise<AdminSession | null> {
  if (!cookieValue) {
    return null;
  }
  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expectedSignature = await hmacSha256(payload, sessionSecret);
  if (!(await fixedTimeEqual(signature, expectedSignature))) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<AdminSession>;
    if (!parsed.email || !parsed.csrfToken || !parsed.expiresAt) {
      return null;
    }
    if (now.getTime() >= Date.parse(parsed.expiresAt)) {
      return null;
    }
    return {
      email: parsed.email,
      csrfToken: parsed.csrfToken,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}

export async function verifyCsrfToken(session: AdminSession, token: string | null): Promise<boolean> {
  if (!token) {
    return false;
  }
  return fixedTimeEqual(token, session.csrfToken);
}

export function sessionSetCookie(value: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ].join("; ");
}

export function sessionClearCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0"
  ].join("; ");
}

export async function sessionFingerprint(value: string): Promise<string> {
  return sha256Hex(value);
}
