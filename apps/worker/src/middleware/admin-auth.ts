import {
  parseCookie,
  SESSION_COOKIE_NAME,
  verifyCsrfToken,
  verifySession
} from "@pagevault/core";
import type { Context, MiddlewareHandler } from "hono";
import type { HonoRuntime } from "../bindings.js";

async function readSession(c: Context<HonoRuntime>) {
  const cookie = parseCookie(c.req.header("Cookie") ?? null, SESSION_COOKIE_NAME);
  return verifySession(cookie, c.env.SESSION_SECRET);
}

export const requireAdmin: MiddlewareHandler<HonoRuntime> = async (c, next) => {
  const session = await readSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("session", session);
  return next();
};

export const requireAdminWrite: MiddlewareHandler<HonoRuntime> = async (c, next) => {
  const session = await readSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!(await verifyCsrfToken(session, c.req.header("X-CSRF-Token") ?? null))) {
    return c.json({ error: "CSRF token required" }, 403);
  }
  c.set("session", session);
  return next();
};
