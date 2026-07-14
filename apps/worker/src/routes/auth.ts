import {
  AppError,
  createSession,
  isPasswordHash,
  parseCookie,
  sessionClearCookie,
  sessionSetCookie,
  SESSION_COOKIE_NAME,
  verifyCsrfToken,
  verifyPassword,
  verifySession,
} from "@pagevault/core";
import type { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { HonoRuntime } from "../bindings.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

function requireAuthConfig(c: Context<HonoRuntime>): void {
  if (
    !c.env.ADMIN_EMAIL?.trim() ||
    !c.env.ADMIN_PASSWORD_HASH?.trim() ||
    !c.env.SESSION_SECRET?.trim()
  ) {
    throw new AppError(
      "Authentication is not configured",
      500,
      "auth_config_missing",
    );
  }
  if (!isPasswordHash(c.env.ADMIN_PASSWORD_HASH)) {
    throw new AppError(
      "Authentication password hash is invalid",
      500,
      "auth_config_invalid",
    );
  }
}

async function readJson(c: Context<HonoRuntime>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function registerAuthRoutes(app: Hono<HonoRuntime>): void {
  app.post("/api/auth/login", async (c) => {
    const parsed = loginSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: "Invalid credentials" }, 400);
    }

    requireAuthConfig(c);
    const validEmail = parsed.data.email === c.env.ADMIN_EMAIL;
    const validPassword = await verifyPassword(
      parsed.data.password,
      c.env.ADMIN_PASSWORD_HASH,
    );
    if (!validEmail || !validPassword) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const { value } = await createSession(
      parsed.data.email,
      c.env.SESSION_SECRET,
    );
    c.header("Set-Cookie", sessionSetCookie(value));
    return c.json({ ok: true });
  });

  app.post("/api/auth/logout", async (c) => {
    const cookie = parseCookie(
      c.req.header("Cookie") ?? null,
      SESSION_COOKIE_NAME,
    );
    const session = await verifySession(cookie, c.env.SESSION_SECRET);
    if (
      session &&
      !(await verifyCsrfToken(session, c.req.header("X-CSRF-Token") ?? null))
    ) {
      return c.json({ error: "CSRF token required" }, 403);
    }
    c.header("Set-Cookie", sessionClearCookie());
    return c.json({ ok: true });
  });

  app.get("/api/auth/me", async (c) => {
    const cookie = parseCookie(
      c.req.header("Cookie") ?? null,
      SESSION_COOKIE_NAME,
    );
    const session = await verifySession(cookie, c.env.SESSION_SECRET);
    if (!session) {
      return c.json({ authenticated: false });
    }
    return c.json({
      authenticated: true,
      email: session.email,
      csrfToken: session.csrfToken,
    });
  });
}
