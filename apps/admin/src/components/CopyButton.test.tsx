// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsProvider } from "../settings.js";
import { FeedbackProvider } from "./Feedback.js";
import { CopyButton } from "./CopyButton.js";

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
afterEach(cleanup);

it("shows local success only after the clipboard write succeeds and reports failure", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(
    <SettingsProvider>
      <FeedbackProvider>
        <CopyButton value="https://example.test/p/file" label="Copy link" />
      </FeedbackProvider>
    </SettingsProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(writeText).toHaveBeenCalledWith("https://example.test/p/file");
  const copied = screen.getByRole("button", { name: "Link copied" });
  expect(copied.getAttribute("data-copied")).toBe("true");
  writeText.mockRejectedValueOnce(new Error("clipboard denied"));
  await user.click(copied);
  expect(
    screen
      .getByRole("button", { name: "Copy link" })
      .getAttribute("data-copied"),
  ).toBe("false");
  expect(
    screen.getByText("Could not copy the link"),
  ).toBeTruthy();
});
