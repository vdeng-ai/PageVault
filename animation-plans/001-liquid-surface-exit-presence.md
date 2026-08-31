# Liquid surface exit presence

Status: complete
Priority: high
Scope: admin dialogs, popovers, and toasts

## Problem

The Liquid Glass surfaces enter through `@starting-style`, but React removes them immediately on close. The result is an abrupt disappearance that is not reversible when a control is toggled quickly.

## Implementation

1. Add a small client-only `useExitPresence(open, duration)` hook with no animation dependency.
2. Keep dialogs and popovers mounted during a short `closing` phase.
3. Drive opacity and transform through `data-state`; disable pointer events while closing.
4. Let a reopen cancel pending removal so the transition retargets from its current state.
5. Add the same explicit closing state to toasts before removal.

## Acceptance

- Dialog: 220ms opacity/transform exit.
- Popover: 160ms opacity/transform exit.
- Toast: 200ms opacity/transform exit.
- Reduced motion removes spatial movement and keeps only a short fade.
- Rapid reopen does not flash or duplicate the surface.

## Verification

- Browser: open/close API Key dialog with Escape.
- Browser: open/close item action menu with Escape and keyboard focus.
- Unit tests: existing feedback and API key suites continue to pass.
