// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKey,
  type CreatedApiKey,
} from "../api/client.js";
import { FeedbackProvider } from "../components/Feedback.js";
import { SettingsProvider } from "../settings.js";
import { ApiKeysPage } from "./ApiKeysPage.js";

vi.mock("../api/client.js", () => ({
  createApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
}));

const existingKey: ApiKey = {
  id: "key-1",
  name: "CI uploader",
  prefix: "pvk_12345678",
  createdAt: "2026-07-18T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
};

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

function renderPage() {
  return render(
    <SettingsProvider>
      <FeedbackProvider>
        <ApiKeysPage />
      </FeedbackProvider>
    </SettingsProvider>,
  );
}

describe("ApiKeysPage", () => {
  beforeEach(() => {
    installMatchMedia();
    window.localStorage.clear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("copies instance-specific instructions without copying an issued token", async () => {
    vi.mocked(listApiKeys).mockResolvedValue([existingKey]);
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("CI uploader");
    const summary = screen.getByText("Usage guide").closest("summary")!;
    expect(summary.parentElement?.hasAttribute("open")).toBe(false);
    await user.click(summary);
    expect(summary.parentElement?.hasAttribute("open")).toBe(true);
    const example = screen.getByLabelText("cURL upload example").textContent;
    expect(example).toContain(window.location.origin);
    expect(example).toContain("$PAGEVAULT_API_KEY");
    expect(example).toContain("Idempotency-Key: $UPLOAD_ID");
    await user.click(screen.getByRole("button", { name: "Copy cURL example" }));
    expect(await navigator.clipboard.readText()).toBe(example);
    expect(screen.getByRole("button", { name: "Example copied" })).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Copy AI integration guide" }),
    );
    const guide = await navigator.clipboard.readText();
    expect(
      screen.getByRole("button", { name: "AI guide copied" }),
    ).toBeTruthy();
    expect(guide).toContain(`Admin base URL: \`${window.location.origin}\``);
    expect(guide).toContain(example);
    expect(guide).toContain("idempotency_conflict");
    expect(guide).not.toContain("YOUR_ADMIN_HOST");
    expect(guide).not.toContain(existingKey.prefix);
    expect(
      screen.getByRole("link", { name: "Open llms.txt" }).getAttribute("href"),
    ).toBe("/llms.txt");
  });

  it("shows the guide in Chinese and reports clipboard failure", async () => {
    window.localStorage.setItem("pagevault.admin.language", "zh-CN");
    vi.mocked(listApiKeys).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("暂无 API 密钥");
    await user.click(screen.getByText("使用说明"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    await user.click(screen.getByRole("button", { name: "复制 AI 接入说明" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "无法复制",
    );
    expect(screen.getByLabelText("cURL 上传示例")).toBeTruthy();
  });

  it("creates a key and reveals its token once", async () => {
    vi.mocked(listApiKeys).mockResolvedValue([]);
    vi.mocked(createApiKey).mockResolvedValue({
      apiKey: existingKey,
      token: `pvk_${"a".repeat(64)}`,
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("No API keys");
    await user.click(screen.getAllByRole("button", { name: "New key" })[0]!);
    await user.type(
      screen.getByPlaceholderText("Automation or device name"),
      "CI uploader",
    );
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByText("API key created")).toBeTruthy();
    expect(screen.getByText(`pvk_${"a".repeat(64)}`)).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Copy key" }),
    );
    expect(vi.mocked(createApiKey)).toHaveBeenCalledWith("CI uploader");
  });

  it("revokes an active key after confirmation", async () => {
    vi.mocked(listApiKeys).mockResolvedValue([existingKey]);
    vi.mocked(revokeApiKey).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("CI uploader");
    await user.click(
      screen.getByRole("button", { name: "Revoke CI uploader" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(vi.mocked(revokeApiKey)).toHaveBeenCalledWith("key-1");
      expect(screen.getAllByText("Revoked")).toHaveLength(2);
    });
  });

  it("keeps pending creation in the dialog and reveals the token on completion", async () => {
    vi.mocked(listApiKeys).mockResolvedValue([]);
    let finish!: (value: CreatedApiKey) => void;
    const pending = new Promise<CreatedApiKey>((resolve) => {
      finish = resolve;
    });
    vi.mocked(createApiKey).mockReturnValue(pending);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("No API keys");
    await user.click(screen.getAllByRole("button", { name: "New key" })[0]!);
    await user.type(
      screen.getByPlaceholderText("Automation or device name"),
      "CI uploader",
    );
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await user.keyboard("{Enter}{Enter}");

    expect(createApiKey).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog");
    await user.tab();
    expect(document.activeElement).toBe(dialog);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(dialog);
    await act(async () => {
      finish({ apiKey: existingKey, token: `pvk_${"a".repeat(64)}` });
      await pending;
    });
    expect(await screen.findByRole("button", { name: "Copy key" })).toBe(
      document.activeElement,
    );
  });

  it("cycles keyboard focus inside the create dialog and returns to its trigger", async () => {
    vi.mocked(listApiKeys).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No API keys");
    const trigger = screen.getAllByRole("button", { name: "New key" })[0]!;
    await user.click(trigger);
    const input = screen.getByPlaceholderText("Automation or device name");
    expect(document.activeElement).toBe(input);
    await user.type(input, "CI uploader");
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Create key" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("reports unavailable clipboard access and lets the complete token be copied on retry", async () => {
    vi.mocked(listApiKeys).mockResolvedValue([]);
    const token = `pvk_${"a".repeat(64)}`;
    vi.mocked(createApiKey).mockResolvedValue({ apiKey: existingKey, token });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No API keys");
    const trigger = screen.getAllByRole("button", { name: "New key" })[0]!;
    await user.click(trigger);
    await user.type(
      screen.getByPlaceholderText("Automation or device name"),
      "CI uploader",
    );
    await user.click(screen.getByRole("button", { name: "Create key" }));
    const copy = await screen.findByRole("button", { name: "Copy key" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    await user.click(copy);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Could not copy the API key",
    );
    expect(screen.getByText(token)).toBeTruthy();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await user.click(copy);
    expect(await screen.findByText("API key copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(token);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Saved, close" }));
    expect(screen.queryByText(token)).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
