// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "../settings.js";
import { ContentPreview, previewDocument } from "./ContentPreview.js";

describe("content previews", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:pdf-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterEach(cleanup);

  it("isolates executable HTML while preserving its original styles in the preview", async () => {
    const source =
      '<style>body{background:red}</style><h1>Original</h1><script>parent.document.body.innerHTML="attack"</script>';
    render(
      <SettingsProvider>
        <ContentPreview
          file={new File([source], "original.html", { type: "text/html" })}
        />
      </SettingsProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByTitle("Content preview").getAttribute("srcdoc"),
      ).toContain("Original"),
    );
    const preview = screen.getByTitle("Content preview");
    expect(preview.getAttribute("sandbox")).toBe("");
    expect(preview.getAttribute("srcdoc")).toContain("body{background:red}");
    expect(preview.getAttribute("srcdoc")).toContain("default-src 'none'");
  });

  it("uses the browser PDF viewer for local PDF previews", async () => {
    const file = new File(["%PDF-1.7"], "report.pdf", {
      type: "application/pdf",
    });
    render(
      <SettingsProvider>
        <ContentPreview file={file} />
      </SettingsProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTitle("Content preview").getAttribute("src")).toBe(
        "blob:pdf-preview",
      ),
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(screen.getByText("PDF")).toBeTruthy();
  });

  it("renders Markdown with the same safe anchors used on the public document", () => {
    const html = previewDocument(
      '<a id="intro"></a>\n\n## Hello\n\n<script>attack()</script>',
      "Markdown",
    );
    expect(html).toContain('<h2 id="intro">Hello</h2>');
    expect(html).not.toContain("<script>");
  });
});
