// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => expect(vi.mocked(deleteItem)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(listItems)).toHaveBeenCalledTimes(1);
  });

  it.each([
    "expiry=url-expired",
    "expiry=file-7",
    "status=deleted",
    "status=unknown&expiry=unknown",
  ])(
    "loads dashboard filter %s through the existing paginated API",
    async (filters) => {
      render(
        <SettingsProvider>
          <FeedbackProvider>
            <ItemListPage
              initialFilters={filters}
              onEdit={vi.fn()}
              onUpload={vi.fn()}
            />
          </FeedbackProvider>
        </SettingsProvider>,
      );
      await waitFor(() => expect(listItems).toHaveBeenCalledTimes(1));
      const params = vi.mocked(listItems).mock.calls[0]![0];
      expect(params).toMatchObject({ page: 1, pageSize: 20 });
      if (filters === "expiry=url-expired") {
        expect(params.urlExpiresAfter).toBeUndefined();
        expect(params.status).toBe("");
        expect(Date.parse(params.urlExpiresBefore!)).not.toBeNaN();
      }
      if (filters === "expiry=file-7") {
        expect(
          Date.parse(params.fileExpiresBefore!) -
            Date.parse(params.fileExpiresAfter!),
        ).toBe(7 * 24 * 60 * 60 * 1000);
      }
      if (filters === "status=deleted") {
        expect(params.status).toBe("deleted");
      }
      if (filters.includes("unknown")) {
        expect(params.status).toBe("");
        expect(params.urlExpiresBefore).toBeUndefined();
        expect(params.fileExpiresBefore).toBeUndefined();
      }
    },
  );

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

  it("exposes separate share and raw actions in the item menu", async () => {
    const { menu } = await openMenu();
    expect(
      within(menu).getByRole("menuitem", { name: "Copy share URL" }),
    ).toBeTruthy();
    expect(
      within(menu).getByRole("menuitem", { name: "Copy raw URL" }),
    ).toBeTruthy();
    expect(
      within(menu)
        .getByRole("menuitem", { name: "Open raw file" })
        .getAttribute("href"),
    ).toBe(item.rawUrl);
  });

  it.each([
    ["Copy share URL", "p"],
    ["Copy raw URL", "raw"],
    ["Copy encoded URL", "p"],
  ])(
    "percent-encodes Chinese URLs through the %s menu",
    async (label, path) => {
      vi.mocked(listItems).mockResolvedValue({
        items: [
          {
            ...item,
            publicUrl: "https://html.example/p/产品介绍-ab12",
            rawUrl: "https://html.example/raw/产品介绍-ab12",
          },
        ],
        page: 1,
        pageSize: 20,
        total: null,
        hasNextPage: false,
      });
      const { user, menu } = await openMenu();
      const writeText = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue(undefined);
      await user.click(within(menu).getByRole("menuitem", { name: label }));
      expect(writeText).toHaveBeenCalledWith(
        `https://html.example/${path}/%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D-ab12`,
      );
    },
  );

  it.each([0, 1])("clears every filter from reset entry %s", async (entry) => {
    vi.mocked(listItems).mockImplementation(async (params) => ({
      items: params.fileKind ? [] : [item],
      page: 1,
      pageSize: 20,
      total: null,
      hasNextPage: false,
    }));
    const user = userEvent.setup();
    render(
      <SettingsProvider>
        <FeedbackProvider>
          <ItemListPage onEdit={vi.fn()} onUpload={vi.fn()} />
        </FeedbackProvider>
      </SettingsProvider>,
    );
    await screen.findAllByRole("button", { name: "Test file" });
    await user.click(screen.getByRole("button", { name: "More filters" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
      target: { value: "query" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "All status" }), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "All types" }), {
      target: { value: "pdf" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "All visibility" }), {
      target: { value: "public" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Created" }), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Expiry" }), {
      target: { value: "url-7" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "File size" }), {
      target: { value: "large" },
    });
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Clear filters" }),
      ).toHaveLength(2),
    );
    await user.click(
      screen.getAllByRole("button", { name: "Clear filters" })[entry]!,
    );
    await waitFor(() =>
      expect(listItems).toHaveBeenLastCalledWith(
        {
          page: 1,
          pageSize: 20,
          q: "",
          status: "",
          visibility: "",
          fileKind: "",
        },
        expect.anything(),
      ),
    );
    expect(
      screen
        .getAllByRole<HTMLSelectElement>("combobox")
        .every((select) => select.value === ""),
    ).toBe(true);
  });

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
