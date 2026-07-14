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
import { uploadHtml } from "../api/client.js";
import { FeedbackProvider } from "../components/Feedback.js";
import { SettingsProvider } from "../settings.js";
import { UploadPage } from "./UploadPage.js";

vi.mock("../api/client.js", () => ({ uploadHtml: vi.fn() }));

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

function renderUpload(onViewItem = vi.fn()) {
  return render(
    <SettingsProvider>
      <FeedbackProvider>
        <UploadPage onViewItem={onViewItem} />
      </FeedbackProvider>
    </SettingsProvider>,
  );
}

describe("UploadPage", () => {
  beforeEach(() => {
    installBrowserStubs();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uploads once with the existing defaults and keeps the user on a success panel", async () => {
    const user = userEvent.setup();
    const onViewItem = vi.fn();
    vi.mocked(uploadHtml).mockResolvedValue({
      id: "item-1",
      title: "page",
      slug: "page-ab12",
      publicUrl: "https://html.example/page-ab12",
      urlExpiresAt: "2026-08-01T00:00:00.000Z",
      fileExpiresAt: "2027-01-01T00:00:00.000Z",
    });
    const { container } = renderUpload(onViewItem);
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(["<h1>Hello</h1>"], "page.html", {
      type: "text/html",
    });
    await user.upload(input as HTMLInputElement, file);
    await user.click(
      screen.getByRole("button", { name: "Upload and publish" }),
    );

    await screen.findByText("Your file is live");
    expect(vi.mocked(uploadHtml)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadHtml)).toHaveBeenCalledWith({
      file,
      urlExpireDays: 7,
      fileExpireDays: 180,
      visibility: "public",
    });

    await user.click(screen.getByRole("button", { name: /View details/ }));
    expect(onViewItem).toHaveBeenCalledWith("item-1");
  });

  it("rejects unsupported files before making a request", async () => {
    const { container } = renderUpload();
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["not supported"], "notes.txt", {
      type: "text/plain",
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: { 0: file, length: 1, item: () => file },
    });
    fireEvent.change(input as HTMLInputElement);

    await waitFor(() => {
      expect(screen.getByText(/Choose a supported HTML/)).toBeTruthy();
    });
    expect(vi.mocked(uploadHtml)).not.toHaveBeenCalled();
  });
});
