// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ConfirmDialog } from "./Feedback.js";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Delete file</button>
      <button>Background action</button>
      <ConfirmDialog
        open={open}
        busy={busy}
        title="Confirm deletion"
        description="Delete this file?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => setBusy(true)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

afterEach(cleanup);

describe("ConfirmDialog keyboard interaction", () => {
  it("keeps focus inside the dialog while all actions are disabled", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "Delete file" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    await user.tab();
    expect(document.activeElement).toBe(dialog);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(dialog);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("cycles focus and restores the trigger after Escape", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Delete file" });
    await user.click(trigger);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Delete" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
