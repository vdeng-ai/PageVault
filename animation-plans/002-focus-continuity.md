# Focus continuity for transient surfaces

Status: complete
Priority: high
Scope: API Key dialog, confirm dialog, item action menu

## Problem

Delayed focus via zero-delay timers and animation frames leaves a one-frame gap. A rapid key press can target the underlying trigger, and API Key creation replaces the focused input without selecting a new focus target.

## Implementation

1. Use `useLayoutEffect` for immediate focus placement in dialogs and menus.
2. Focus the API Key Copy action after creation replaces the input.
3. Restore the menu trigger before executing a menu action so subsequent dialogs record a valid return target.
4. Match upward-opening menus with a bottom-right transform origin.

## Acceptance

- Escape works immediately after opening.
- Arrow keys work immediately after opening an item menu.
- Closing restores the initiating control.
- API Key creation keeps focus inside the dialog.

## Verification

- Playwright/Chrome CDP interaction assertions.
- Keyboard-only smoke path for menu and dialog.
