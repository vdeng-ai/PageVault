// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dashboard } from "../api/client.js";
import { SettingsProvider } from "../settings.js";
import { DashboardPage } from "./DashboardPage.js";

vi.mock("../api/client.js", () => ({ dashboard: vi.fn() }));

describe("DashboardPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    window.localStorage.clear();
    vi.mocked(dashboard).mockResolvedValue({
      total: 4,
      totalSizeBytes: 3 * 1024 ** 2,
      publicCount: 3,
      urlExpired: 0,
      fileDeletingSoon: 1,
      deleted: 2,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders total file size without a percentage badge", async () => {
    render(
      <SettingsProvider>
        <DashboardPage onUpload={vi.fn()} />
      </SettingsProvider>,
    );

    await waitFor(() => expect(vi.mocked(dashboard)).toHaveBeenCalledTimes(1));

    const sizeLabel = screen.getByText("Total file size");
    const sizeCard = sizeLabel.closest(".dashboard-metric-card");
    expect(sizeLabel).toBeTruthy();
    expect(screen.getByText("3 MB")).toBeTruthy();
    expect(sizeCard?.querySelector(".chip")).toBeNull();
    expect(document.querySelectorAll(".dashboard-metric-card")).toHaveLength(6);
  });
});
