import {
  PBKDF2_ITERATIONS,
  PBKDF2_MAX_ITERATIONS,
  PBKDF2_MIN_ITERATIONS,
} from "./constants.js";
import { AppError } from "./errors.js";

const encoder = new TextEncoder();

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new AppError("WebCrypto is not available", 500, "crypto_unavailable");
  }
  return globalThis.crypto;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new AppError("Invalid hex input", 400, "invalid_hex");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  getCrypto().getRandomValues(bytes);
  return bytesToHex(bytes);
}

function toArrayBuffer(body: ArrayBuffer | Uint8Array | string): ArrayBuffer {
  if (typeof body === "string") {
    return toArrayBuffer(encoder.encode(body));
  }
  if (body instanceof ArrayBuffer) {
    return body;
  }
  return body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;
}

export async function sha256Hex(
  body: ArrayBuffer | Uint8Array | string,
): Promise<string> {
  const digest = await getCrypto().subtle.digest(
    "SHA-256",
    toArrayBuffer(body),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function fixedTimeEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    sha256Hex(left),
    sha256Hex(right),
  ]);
  const leftBytes = hexToBytes(leftHash);
  const rightBytes = hexToBytes(rightHash);
  let diff = leftBytes.length ^ rightBytes.length;
  for (
    let index = 0;
    index < Math.max(leftBytes.length, rightBytes.length);
    index += 1
  ) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
}

function isSupportedPbkdf2Iterations(iterations: number): boolean {
  return (
    Number.isSafeInteger(iterations) &&
    iterations >= PBKDF2_MIN_ITERATIONS &&
    iterations <= PBKDF2_MAX_ITERATIONS
  );
}

export async function pbkdf2Sha256(
  password: string,
  iterations = PBKDF2_ITERATIONS,
  saltHex = randomHex(16),
): Promise<string> {
  if (!isSupportedPbkdf2Iterations(iterations)) {
    throw new AppError(
      `PBKDF2 iterations must be between ${PBKDF2_MIN_ITERATIONS} and ${PBKDF2_MAX_ITERATIONS}`,
      400,
      "invalid_pbkdf2_iterations",
    );
  }
  const crypto = getCrypto();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(hexToBytes(saltHex)),
      iterations,
    },
    key,
    256,
  );
  return `pbkdf2_sha256$${iterations}$${saltHex}$${bytesToHex(new Uint8Array(bits))}`;
}

function isHex(value: string): boolean {
  return (
    value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value)
  );
}

export function isPasswordHash(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const [scheme, iterationsValue, saltHex, expectedHex, extra] =
    value.split("$");
  if (extra !== undefined || scheme !== "pbkdf2_sha256") {
    return false;
  }
  if (!iterationsValue || !/^[1-9]\d*$/.test(iterationsValue)) {
    return false;
  }
  if (!saltHex || !expectedHex) {
    return false;
  }
  const iterations = Number.parseInt(iterationsValue, 10);
  if (!isSupportedPbkdf2Iterations(iterations)) {
    return false;
  }
  return isHex(saltHex) && expectedHex.length === 64 && isHex(expectedHex);
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (!isPasswordHash(encodedHash)) {
    return false;
  }
  const [scheme, iterationsValue, saltHex, expectedHex] =
    encodedHash.split("$");
  if (
    scheme !== "pbkdf2_sha256" ||
    !iterationsValue ||
    !saltHex ||
    !expectedHex
  ) {
    return false;
  }
  const iterations = Number.parseInt(iterationsValue, 10);
  if (!isSupportedPbkdf2Iterations(iterations)) {
    return false;
  }
  const candidate = await pbkdf2Sha256(password, iterations, saltHex);
  return fixedTimeEqual(candidate, encodedHash);
}
