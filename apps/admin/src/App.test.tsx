// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, parseRouteHash } from "./App.js";
import { dashboard, getItem, me } from "./api/client.js";
import { FeedbackProvider } from "./components/Feedback.js";
import { SettingsProvider } from "./settings.js";

vi.mock("./api/client.js", () => ({
  batchItems: vi.fn(),
  createApiKey: vi.fn(),
  dashboard: vi.fn(),
  deleteItem: vi.fn(),
  getItem: vi.fn(),
  listItems: vi.fn(),
  listApiKeys: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  revokeApiKey: vi.fn(),
  updateItem: vi.fn(),
  uploadHtml: vi.fn(),
}));

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("admin routing", () => {
  it("uses upload as the root and unknown-route fallback", () => {
    expect(parseRouteHash("")).toEqual({ name: "upload" });
    expect(parseRouteHash("#/upload")).toEqual({ name: "upload" });
    expect(parseRouteHash("#/dashboard")).toEqual({ name: "dashboard" });
    expect(parseRouteHash("#/api-keys")).toEqual({ name: "apiKeys" });
    expect(parseRouteHash("#/items/item-1")).toEqual({
      name: "detail",
      id: "item-1",
    });
    expect(parseRouteHash("#/missing")).toEqual({ name: "upload" });
  });
});

describe("App navigation", () => {
  beforeEach(() => {
    installMatchMedia();
    window.localStorage.clear();
    window.location.hash = "#/";
    vi.mocked(me).mockResolvedValue({
      authenticated: true,
      email: "admin@example.com",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("orders upload first and does not preload dashboard statistics", async () => {
    const { container } = render(
      <SettingsProvider>
        <FeedbackProvider>
          <App />
        </FeedbackProvider>
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll(".desktop-top-nav [data-route]"),
      ).toHaveLength(4);
    });

    expect(container.querySelector("aside")).toBeNull();
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".desktop-top-nav [data-route]",
        ),
      ).map((element) => element.dataset.route),
    ).toEqual(["upload", "items", "dashboard", "apiKeys"]);
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          ".mobile-bottom-nav [data-route]",
        ),
      ).map((element) => element.dataset.route),
    ).toEqual(["upload", "items", "dashboard", "apiKeys"]);
    expect(vi.mocked(dashboard)).not.toHaveBeenCalled();
  });

  it("marks files active in both navigation variants for detail routes", async () => {
    window.location.hash = "#/items/item-1";
    vi.mocked(getItem).mockReturnValue(new Promise<never>(() => undefined));

    const { container } = render(
      <SettingsProvider>
        <FeedbackProvider>
          <App />
        </FeedbackProvider>
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelector('.desktop-top-nav [data-route="items"]'),
      ).not.toBeNull();
    });

    expect(
      container
        .querySelector('.desktop-top-nav [data-route="items"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
    expect(
      container
        .querySelector('.mobile-bottom-nav [data-route="items"]')
        ?.getAttribute("aria-current"),
    ).toBe("page");
  });
});
