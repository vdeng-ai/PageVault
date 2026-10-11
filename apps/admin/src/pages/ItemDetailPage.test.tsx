// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getItem, type HtmlItem } from "../api/client.js";
import { FeedbackProvider } from "../components/Feedback.js";
import { SettingsProvider } from "../settings.js";
import { ItemDetailPage } from "./ItemDetailPage.js";

vi.mock("../api/client.js", () => ({
  getItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
}));

const item: HtmlItem = {
  id: "second",
  title: "Second file",
  originalFilename: "second.html",
  slug: "second-ab12",
  objectKey: "objects/second/index.html",
  contentType: "text/html",
  sizeBytes: 1024,
  sha256: "abc123",
  visibility: "public",
  status: "active",
  derivedStatus: "active",
  publicUrl: "https://html.example/p/second-ab12",
  rawUrl: "https://html.example/raw/second-ab12",
  urlExpiresAt: "2026-11-01T00:00:00.000Z",
  fileExpiresAt: "2027-01-01T00:00:00.000Z",
  accessCount: 12,
  lastAccessedAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  deletedAt: null,
};

function detail(id: string) {
  return (
    <SettingsProvider>
      <FeedbackProvider>
        <ItemDetailPage id={id} onBack={vi.fn()} />
      </FeedbackProvider>
    </SettingsProvider>
  );
}

describe("ItemDetailPage request ordering", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it.each(["success", "failure"])(
    "ignores an older request's %s after switching files",
    async (outcome) => {
      let resolveFirst!: (value: HtmlItem) => void;
      let rejectFirst!: (reason: Error) => void;
      vi.mocked(getItem).mockImplementation((id) =>
        id === "first"
          ? new Promise<HtmlItem>((resolve, reject) => {
              resolveFirst = resolve;
              rejectFirst = reject;
            })
          : Promise.resolve(item),
      );
      const view = render(detail("first"));
      view.rerender(detail("second"));
      await screen.findByRole("heading", { name: "Second file" });
      await act(async () => {
        if (outcome === "success")
          resolveFirst({
            ...item,
            id: "first",
            originalFilename: "first.html",
            title: "First file",
          });
        else rejectFirst(new Error("Old request failed"));
      });
      expect(screen.getByRole("heading", { name: "Second file" })).toBeTruthy();
      expect(
        screen.getByRole<HTMLInputElement>("textbox", { name: "Title" }).value,
      ).toBe("Second file");
      expect(screen.queryByText("Old request failed")).toBeNull();
    },
  );

  it("leads with the content title and keeps technical metadata collapsed", async () => {
    vi.mocked(getItem).mockResolvedValue(item);
    render(detail("second"));
    await screen.findByRole("heading", { name: "Second file", level: 1 });
    expect(screen.getByText("second.html")).toBeTruthy();
    const metadata = screen.getByText("Storage metadata").closest("details");
    expect(metadata?.open).toBe(false);
    expect(metadata?.textContent).toContain(item.slug);
    expect(metadata?.textContent).toContain(item.sha256);
  });

  it.each([
    ["Copy URL", "p"],
    ["Copy encoded URL", "p"],
    ["Copy raw URL", "raw"],
  ])("percent-encodes Chinese URLs through %s", async (label, path) => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    vi.mocked(getItem).mockResolvedValue({
      ...item,
      publicUrl: "https://html.example/p/产品介绍-ab12",
      rawUrl: "https://html.example/raw/产品介绍-ab12",
    });
    render(detail("second"));
    await screen.findByRole("heading", { name: "Second file" });
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Share link" })
        .value,
    ).toBe("https://html.example/p/产品介绍-ab12");
    await user.click(screen.getByRole("button", { name: label }));
    expect(writeText).toHaveBeenCalledWith(
      `https://html.example/${path}/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D-ab12`,
    );
  });
});
