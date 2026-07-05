import type { Context } from "hono";
import type { HonoRuntime } from "../bindings.js";

export function csrfToken(c: Context<HonoRuntime>): string {
  return c.get("session").csrfToken;
}
