import { describe, expect, it } from "vitest";
import {
  FILE_CAPABILITIES,
  SUPPORTED_UPLOAD_ACCEPT,
  SUPPORTED_UPLOAD_EXTENSIONS,
  fileCapabilityForContentType,
  fileCapabilityForFilename,
} from "../file-types.js";

describe("file capability registry", () => {
  it("resolves every registered extension through the same registry", () => {
    for (const capability of FILE_CAPABILITIES) {
      for (const extension of capability.extensions) {
        expect(fileCapabilityForFilename(`example${extension}`)).toBe(
          capability,
        );
      }
    }
  });

  it("resolves normalized content types including charset parameters", () => {
    expect(fileCapabilityForContentType("application/pdf")?.kind).toBe("pdf");
    expect(
      fileCapabilityForContentType("text/html; charset=utf-8")?.kind,
    ).toBe("html");
    expect(
      fileCapabilityForContentType("TEXT/MARKDOWN; CHARSET=UTF-8")?.kind,
    ).toBe("markdown");
  });

  it("derives upload extensions and picker accept values from capabilities", () => {
    expect(SUPPORTED_UPLOAD_EXTENSIONS).toContain(".svg");
    expect(SUPPORTED_UPLOAD_EXTENSIONS).toContain(".pdf");
    expect(SUPPORTED_UPLOAD_ACCEPT).toContain(".pdf");
    expect(SUPPORTED_UPLOAD_ACCEPT).toContain("application/pdf");
    expect(SUPPORTED_UPLOAD_ACCEPT).toContain("image/svg+xml");
  });

  it("exposes preview, delivery, security, validation, and share behavior", () => {
    const pdf = fileCapabilityForFilename("report.pdf");
    expect(pdf).toMatchObject({
      preview: "pdf-native",
      delivery: "inline",
      securityProfile: "binary",
      validation: "magic-bytes",
      sharePreview: "generic",
    });

    const svg = fileCapabilityForFilename("diagram.svg");
    expect(svg).toMatchObject({
      preview: "image",
      delivery: "inline",
      securityProfile: "svg",
      validation: "svg",
      sharePreview: "image",
    });
  });
});
