# Motion cohesion and paint performance

Status: complete
Priority: medium
Scope: admin control feedback, cards, reduced motion

## Problem

Some press and hover transforms inherited from the former visual layer do not share a transform transition. Item cards also use a decorative lift and shadow interpolation that adds paint work beside backdrop-filter surfaces.

## Implementation

1. Give pressable controls one transform token: 120ms with the project ease-out curve.
2. Remove decorative item-card lift; keep border/color feedback on precise hover devices.
3. Remove high-frequency box-shadow interpolation from buttons and cards.
4. Preserve the intentional reduced-motion policy: no spatial motion, short opacity/color feedback only.

## Acceptance

- No `transition: all`.
- No width/height/top/left animation.
- Press feedback is immediate and consistent.
- Hover effects are gated by `(hover: hover) and (pointer: fine)`.
- Loading spinners remain the only continuous animation.

## Verification

- Static motion search.
- Reduced-motion browser context smoke test.
- Production build and visual QA.
