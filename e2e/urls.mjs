import process from "node:process";

export const E2E_PORT = Number(process.env.PAGEVAULT_E2E_PORT ?? "3100");
if (!Number.isInteger(E2E_PORT) || E2E_PORT < 1024 || E2E_PORT > 65535) {
  throw new Error(
    "PAGEVAULT_E2E_PORT must be an integer between 1024 and 65535",
  );
}
export const ADMIN_URL = `http://localhost:${E2E_PORT}`;
export const PUBLIC_URL = `http://127.0.0.1:${E2E_PORT}`;
