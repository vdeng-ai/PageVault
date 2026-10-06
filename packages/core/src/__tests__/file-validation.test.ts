import { describe, expect, it } from "vitest";
import { fileCapabilityForFilename } from "../file-types.js";
import { validateFileContent } from "../file-validation.js";

function capability(filename: string) {
  const result = fileCapabilityForFilename(filename);
  if (!result) throw new Error(`missing capability for ${filename}`);
  return result;
}

function text(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

describe("file content validation", () => {
  it("accepts supported binary signatures", () => {
    expect(
      validateFileContent(
        capability("photo.jpg"),
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
      ).valid,
    ).toBe(true);
    expect(
      validateFileContent(capability("report.pdf"), text("%PDF-1.7\n")).valid,
    ).toBe(true);
    expect(
      validateFileContent(
        capability("image.png"),
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]).buffer,
      ).valid,
    ).toBe(true);
    expect(
      validateFileContent(
        capability("image.webp"),
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
          0x57, 0x45, 0x42, 0x50,
        ]).buffer,
      ).valid,
    ).toBe(true);
  });

  it("rejects binary files whose content does not match the extension", () => {
    for (const filename of ["photo.jpg", "report.pdf", "image.png", "image.webp"]) {
      expect(validateFileContent(capability(filename), text("not that file"))).toMatchObject({
        valid: false,
      });
    }
  });

  it("accepts UTF-8 HTML and Markdown but rejects binary control data", () => {
    expect(
      validateFileContent(capability("page.html"), text("<h1>Hello</h1>")),
    ).toEqual({ valid: true });
    expect(
      validateFileContent(capability("notes.md"), text("# Notes\n\nHello")),
    ).toEqual({ valid: true });
    expect(
      validateFileContent(
        capability("page.html"),
        new Uint8Array([0x00, 0x01, 0x02]).buffer,
      ).valid,
    ).toBe(false);
    expect(
      validateFileContent(
        capability("notes.md"),
        new Uint8Array([0xc3, 0x28]).buffer,
      ).valid,
    ).toBe(false);
  });

  it("accepts SVG with common preambles and requires an svg root element", () => {
    expect(
      validateFileContent(
        capability("diagram.svg"),
        text(
          '\uFEFF<?xml version="1.0"?>\n<!-- generated -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        ),
      ),
    ).toEqual({ valid: true });
    expect(
      validateFileContent(
        capability("diagram.svg"),
        text("<html><body>not svg</body></html>"),
      ),
    ).toMatchObject({
      valid: false,
      reason: "missing SVG root element",
    });
  });
});
