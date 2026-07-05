import type { HtmlBedService } from "@htmlbed/core";
import { HTML_CONTENT_TYPE, normalizePublicSlug } from "@htmlbed/core";
import type { AppBindings } from "../bindings.js";
import { publicErrorPage, publicSecurityHeaders } from "../middleware/security-headers.js";

function publicSlugFromPath(pathname: string): string | null {
  const match = /^\/p\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) {
    return null;
  }
  const slug = normalizePublicSlug(match[1]);
  return slug && slug.length > 0 ? slug : null;
}

function logAccessFailure(error: unknown, slug: string): void {
  console.error(
    JSON.stringify({
      message: "access counter failed",
      slug,
      error: error instanceof Error ? error.message : String(error)
    })
  );
}

export async function handlePublicRequest(
  request: Request,
  _env: AppBindings,
  ctx: ExecutionContext | undefined,
  service: HtmlBedService
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return publicErrorPage(404);
  }

  const url = new URL(request.url);
  const slug = publicSlugFromPath(url.pathname);
  if (!slug) {
    return publicErrorPage(404);
  }

  const result = await service.getPublicHtml(slug);
  if (result.kind === "not_found") {
    return publicErrorPage(404);
  }
  if (result.kind === "disabled") {
    return publicErrorPage(403);
  }
  if (result.kind === "gone") {
    return publicErrorPage(410);
  }

  const accessPromise = service.recordAccess(result.item.id).catch((error: unknown) => {
    logAccessFailure(error, slug);
  });
  if (ctx) {
    ctx.waitUntil(accessPromise);
  } else {
    void accessPromise;
  }

  return new Response(request.method === "HEAD" ? null : result.object.body, {
    status: 200,
    headers: {
      ...publicSecurityHeaders,
      "Content-Type": result.object.contentType ?? HTML_CONTENT_TYPE
    }
  });
}
