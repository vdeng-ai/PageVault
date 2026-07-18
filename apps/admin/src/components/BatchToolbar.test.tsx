// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "../settings.js";
import { BatchToolbar } from "./BatchToolbar.js";

describe("BatchToolbar", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("offers the 15/30 day URL and 30 day file shortcuts", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <SettingsProvider>
        <BatchToolbar selectedCount={2} busy={false} onAction={onAction} />
      </SettingsProvider>,
    );

    await user.click(screen.getByRole("button", { name: "URL +15d" }));
    await user.click(screen.getByRole("button", { name: "URL +30d" }));
    await user.click(screen.getByRole("button", { name: "File +30d" }));

    expect(onAction).toHaveBeenNthCalledWith(1, "extend_url", 15);
    expect(onAction).toHaveBeenNthCalledWith(2, "extend_url", 30);
    expect(onAction).toHaveBeenNthCalledWith(3, "extend_file", 30);
  });
});
