// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  batchItems,
  deleteItem,
  listItems,
  updateItem,
  type HtmlItem,
} from "../api/client.js";
import { FeedbackProvider } from "../components/Feedback.js";
import { SettingsProvider } from "../settings.js";
import { ItemListPage } from "./ItemListPage.js";

vi.mock("../api/client.js", () => ({
  batchItems: vi.fn(),
  deleteItem: vi.fn(),
  listItems: vi.fn(),
  updateItem: vi.fn(),
}));

const item: HtmlItem = {
  id: "item-1",
  title: "Test file",
  originalFilename: "test.html",
  slug: "test-ab12",
  objectKey: "objects/test/index.html",
  contentType: "text/html",
  sizeBytes: 1024,
  sha256: "abc123",
  visibility: "public",
  status: "active",
  derivedStatus: "active",
  publicUrl: "https://html.example/p/test-ab12",
  rawUrl: "https://html.example/raw/test-ab12",
  urlExpiresAt: "2026-08-01T00:00:00.000Z",
  fileExpiresAt: "2027-01-01T00:00:00.000Z",
  accessCount: 12,
  lastAccessedAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  deletedAt: null,
};

function installBrowserStubs(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
}

describe("ItemListPage request behavior", () => {
  beforeEach(() => {
    installBrowserStubs();
    window.localStorage.clear();
    vi.mocked(listItems).mockResolvedValue({
      items: [item],
      page: 1,
      pageSize: 20,
      total: null,
      hasNextPage: false,
    });
    vi.mocked(updateItem).mockResolvedValue({
      ...item,
      visibility: "private",
      derivedStatus: "private",
    });
    vi.mocked(deleteItem).mockResolvedValue({ ok: true });
    vi.mocked(batchItems).mockResolvedValue({ ok: 1, failed: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("applies a row PATCH locally and confirms deletion without list reloads", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <SettingsProvider>
        <FeedbackProvider>
          <ItemListPage onEdit={onEdit} onUpload={vi.fn()} />
        </FeedbackProvider>
      </SettingsProvider>,
    );

    await waitFor(() => expect(vi.mocked(listItems)).toHaveBeenCalledTimes(1));
    const titleLinks = screen.getAllByRole("button", { name: "Test file" });
    expect(titleLinks).toHaveLength(2);
    expect(screen.getAllByText(/test\.html/).length).toBeGreaterThan(0);
    await user.click(titleLinks[0]!);
    expect(onEdit).toHaveBeenCalledWith("item-1");

    await user.click(
      screen.getAllByRole("button", { name: "More actions" })[0]!,
    );
    await user.click(screen.getByRole("menuitem", { name: "Set private" }));
    await waitFor(() => expect(vi.mocked(updateItem)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(listItems)).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getAllByRole("button", { name: "More actions" })[0]!,
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(vi.mocked(deleteItem)).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(vi.mocked(deleteItem)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(listItems)).toHaveBeenCalledTimes(1);
  });

  async function openMenu() {
    const user = userEvent.setup();
    render(
      <SettingsProvider>
        <FeedbackProvider>
          <ItemListPage onEdit={vi.fn()} onUpload={vi.fn()} />
        </FeedbackProvider>
      </SettingsProvider>,
    );
    const triggers = await screen.findAllByRole("button", {
      name: "More actions",
    });
    const trigger = triggers[0]!;
    await user.click(trigger);
    return { user, trigger, menu: screen.getByRole("menu") };
  }

  it.each([false, true])(
    "keeps arrow navigation and lets Tab close the action menu (shift: %s)",
    async (shift) => {
      const { user, trigger, menu } = await openMenu();
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "Edit" }),
      );
      await user.keyboard("{End}");
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "Delete" }),
      );
      await user.keyboard("{Home}{ArrowUp}");
      expect(document.activeElement).toBe(
        screen.getByRole("menuitem", { name: "Delete" }),
      );
      await user.tab({ shift });
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("menu")).toBeNull();
      expect(menu.contains(document.activeElement)).toBe(false);
    },
  );

  it.each(["Escape", "resize", "scroll"])(
    "restores focus and disables the closing menu after %s",
    async (reason) => {
      const { trigger, menu } = await openMenu();
      if (reason === "Escape") fireEvent.keyDown(menu, { key: "Escape" });
      else if (reason === "resize") fireEvent.resize(window);
      else fireEvent.scroll(window);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger);
      expect(menu.getAttribute("aria-hidden")).toBe("true");
      expect(menu.hasAttribute("inert")).toBe(true);
    },
  );
});
