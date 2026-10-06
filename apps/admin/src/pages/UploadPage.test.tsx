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

  it("exposes the upload flow as distinct, accessible settings groups", async () => {
    const user = userEvent.setup();
    renderUpload();

    expect(screen.getByRole("region", { name: "File" })).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Publishing settings" }),
    ).toBeTruthy();

    const visibility = screen.getByRole("group", { name: "Visibility" });
    const publicOption = within(visibility).getByRole("radio", {
      name: /Public/,
    });
    const privateOption = within(visibility).getByRole("radio", {
      name: /Only you/,
    });
    expect((publicOption as HTMLInputElement).checked).toBe(true);

    await user.click(privateOption);
    expect((privateOption as HTMLInputElement).checked).toBe(true);
    expect((publicOption as HTMLInputElement).checked).toBe(false);

    const expiry = screen.getByRole("group", {
      name: "Expiry and retention",
    });
    expect(within(expiry).getAllByRole("combobox")).toHaveLength(2);
    await user.selectOptions(
      within(expiry).getAllByRole("combobox")[0]!,
      "custom",
    );
    const custom = within(expiry).getByRole("spinbutton");
    await user.clear(custom);
    await user.type(custom, "21");
    expect((custom as HTMLInputElement).value).toBe("21");
  });

  it("uploads once with the existing defaults and keeps the user on a success panel", async () => {
    const user = userEvent.setup();
    const onViewItem = vi.fn();
    vi.mocked(uploadHtml).mockResolvedValue({
      id: "item-1",
      title: "page",
      slug: "page-ab12",
      publicUrl: "https://html.example/中文-page-ab12",
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
      urlExpireDays: 15,
      fileExpireDays: 30,
      visibility: "public",
    });

    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: "Copy encoded URL" }));
    expect(writeText).toHaveBeenCalledWith(
      "https://html.example/%E4%B8%AD%E6%96%87-page-ab12",
    );

    await user.click(screen.getByRole("button", { name: /View details/ }));
    expect(onViewItem).toHaveBeenCalledWith("item-1");
  });

  it("accepts SVG files for local preview and upload", async () => {
    const user = userEvent.setup();
    const { container } = renderUpload();
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8"/></svg>'],
      "diagram.svg",
      { type: "image/svg+xml" },
    );
    await user.upload(input as HTMLInputElement, file);

    expect(screen.getByText("diagram.svg")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Upload and publish",
      }).disabled,
    ).toBe(false);
    expect(screen.queryByText(/Choose a supported HTML/)).toBeNull();
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

  it("shows retained custom expiry values when continuing with another upload", async () => {
    vi.mocked(uploadHtml).mockResolvedValue({
      id: "item-1",
      title: "page",
      slug: "page-ab12",
      publicUrl: "https://html.example/page-ab12",
      urlExpiresAt: "2026-11-01T00:00:00.000Z",
      fileExpiresAt: "2027-01-01T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderUpload();
    const urlSelect = screen.getByRole("combobox", { name: "URL days" });
    await user.selectOptions(urlSelect, "custom");
    const days = screen.getByRole("spinbutton");
    await user.clear(days);
    await user.type(days, "45");
    const file = new File(["Hello"], "page.md", { type: "text/markdown" });
    await user.upload(screen.getByLabelText("Choose file"), file);
    await user.click(
      screen.getByRole("button", { name: "Upload and publish" }),
    );
    await screen.findByText("Your file is live");
    await user.click(screen.getByRole("button", { name: "Upload another" }));
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("45");
    expect(
      screen.getByRole<HTMLSelectElement>("combobox", { name: "URL days" })
        .value,
    ).toBe("custom");
    await user.click(
      screen.getByRole("button", { name: /Drop your file here/ }),
    );
    await user.upload(screen.getByLabelText("Choose file"), file);
    await user.click(
      screen.getByRole("button", { name: "Upload and publish" }),
    );
    await waitFor(() => expect(uploadHtml).toHaveBeenCalledTimes(2));
    expect(uploadHtml).toHaveBeenLastCalledWith({
      file,
      urlExpireDays: 45,
      fileExpireDays: 30,
      visibility: "public",
    });
  });
});
