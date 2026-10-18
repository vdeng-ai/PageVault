import {
  HTML_CONTENT_TYPE,
  MARKDOWN_CONTENT_TYPE,
  PNG_CONTENT_TYPE,
  PDF_CONTENT_TYPE,
  SVG_CONTENT_TYPE,
  type VaultItem,
} from "@pagevault/core";
import { describe, expect, it } from "vitest";
import { renderPublicShareViewer } from "../public-share-viewer.js";

function item(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: "item-1",
    title: "Shared page",
    originalFilename: "shared.html",
    slug: "shared-a1b2c3d4",
    objectKey: "objects/item-1/index.html",
    contentType: HTML_CONTENT_TYPE,
    sizeBytes: 2048,
    sha256: "hash",
    visibility: "public",
    status: "active",
    urlExpiresAt: "2026-11-01T00:00:00.000Z",
    fileExpiresAt: "2026-12-01T00:00:00.000Z",
    accessCount: 0,
    lastAccessedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

const urls = {
  publicUrl: "https://public.test/p/shared-a1b2c3d4",
  rawUrl: "https://public.test/raw/shared-a1b2c3d4",
  fallbackImageUrl: "https://public.test/share-card.png",
};

describe("public share viewer", () => {
  it("uses and escapes the stored automatic description in all social metadata", async () => {
    const html = await renderPublicShareViewer({
      item: item({ shareDescription: '摘要 "引号" & <内容>' }),
      ...urls,
    });
    for (const attribute of [
      'name="description"',
      'property="og:description"',
      'name="twitter:description"',
    ]) {
      expect(html).toContain(
        `<meta ${attribute} content="摘要 &quot;引号&quot; &amp; &lt;内容&gt;">`,
      );
    }
    expect(html).not.toContain("HTML · 2.0 KB · 由 PageVault 分享");
  });

  it.each([undefined, null, "", "  "])(
    "keeps the description fallback for old/empty items (%s)",
    async (description) => {
      const html = await renderPublicShareViewer({
        item: item(
          description === undefined ? {} : { shareDescription: description },
        ),
        ...urls,
      });
      expect(html).toContain(
        '<meta property="og:description" content="HTML · 2.0 KB · 由 PageVault 分享">',
      );
    },
  );

  it("uses fallback raster metadata and lightweight controls for HTML", async () => {
    const html = await renderPublicShareViewer({
      item: item(),
      ...urls,
    });

    expect(html).toContain(
      '<meta property="og:image" content="https://public.test/share-card.png">',
    );
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain("data-copy-share");
    expect(html).toContain("data-fullscreen-toggle");
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
  });

  it("gives HTML a collapsed native toolbar inside its fullscreen target", async () => {
    const html = await renderPublicShareViewer({
      item: item({ title: 'Document <title> & "quotes"' }),
      ...urls,
    });
    const body = html.split("<body>")[1] ?? "";

    expect(html).toContain('data-layout="immersive-html"');
    expect(body).toContain(
      '<main class="share-immersive" data-fullscreen-target>',
    );
    expect(body.match(/data-fullscreen-target/g)).toHaveLength(1);
    expect(body).toContain('<details class="share-tools" data-share-tools>');
    expect(body).not.toContain(" open");
    expect(body).toContain("页面工具</span></summary>");
    expect(body).toContain("Document &lt;title&gt; &amp; &quot;quotes&quot;");
    expect(body).toContain("data-fullscreen-toggle hidden");
    expect(body).toContain(
      'data-copy-value="https://public.test/p/shared-a1b2c3d4" hidden',
    );
    expect(body).toContain('aria-live="polite"');
    expect(body).not.toContain('class="public-header"');
    expect(body).not.toContain('class="share-viewer-meta"');
    expect(body).not.toContain("<footer");
  });

  it("keeps PDF in its existing framed layout", async () => {
    const html = await renderPublicShareViewer({
      item: item({
        contentType: PDF_CONTENT_TYPE,
        originalFilename: "report.pdf",
      }),
      ...urls,
    });
    const body = html.split("<body>")[1] ?? "";
    expect(html).not.toContain('data-layout="immersive-html"');
    expect(body).toContain('class="public-header"');
    expect(body).toContain('class="share-viewer-shell"');
    expect(body).toContain('class="share-viewer-title"');
    expect(body).toContain('class="share-viewer-footer"');
    expect(body).not.toContain("<details");
    expect(body).not.toContain("sandbox=");
  });

  it("uses raster images themselves for social previews without fake dimensions", async () => {
    const html = await renderPublicShareViewer({
      item: item({
        originalFilename: "image.png",
        contentType: PNG_CONTENT_TYPE,
        objectKey: "objects/item-1/image.png",
      }),
      ...urls,
    });

    expect(html).toContain(
      '<meta property="og:image" content="https://public.test/raw/shared-a1b2c3d4">',
    );
    expect(html).not.toContain('property="og:image:width"');
    expect(html).toContain("data-image-fit");
    expect(html).toContain("data-image-background-toggle");
  });

  it("uses fallback art for SVG instead of relying on social SVG support", async () => {
    const html = await renderPublicShareViewer({
      item: item({
        originalFilename: "diagram.svg",
        contentType: SVG_CONTENT_TYPE,
        objectKey: "objects/item-1/diagram.svg",
      }),
      ...urls,
    });

    expect(html).toContain(
      '<meta property="og:image" content="https://public.test/share-card.png">',
    );
    expect(html).not.toContain(
      '<meta property="og:image" content="https://public.test/raw/shared-a1b2c3d4">',
    );
  });

  it("keeps Markdown server-rendered and includes share controls", async () => {
    const source = new TextEncoder().encode(
      "# Notes\n\n## Section\n\nHello **PageVault**",
    );
    const html = await renderPublicShareViewer({
      item: item({
        originalFilename: "notes.md",
        contentType: MARKDOWN_CONTENT_TYPE,
        objectKey: "objects/item-1/notes.md",
      }),
      ...urls,
      markdownObject: {
        body: source.buffer,
        contentType: MARKDOWN_CONTENT_TYPE,
        size: source.byteLength,
      },
    });

    expect(html).toContain('<h1 id="notes">Notes</h1>');
    expect(html).toContain("reader-toc");
    expect(html).toContain("data-copy-share");
    expect(html.match(/data-fullscreen-toggle/g)).toHaveLength(1);
  });
});
