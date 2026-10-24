// The colour-mode switch (components/providers.tsx), ported from Space Works
// Events: the new mode grows as a circle from the control that was pressed.
// Pure maths and choices only, so they are unit-tested.

export type RevealPoint = { x: number; y: number };
export type Viewport = { width: number; height: number };
/** instant: reduced motion; fade: no View Transitions; reveal: clip-path circle; reveal-soft: feathered mask. */
export type RevealPlan = "instant" | "fade" | "reveal" | "reveal-soft";

/** Width of the soft edge of the feathered circle, in px. */
export const REVEAL_FEATHER = 160;
export const REVEAL_DURATION_MS = 720;
export const REVEAL_EASING = "cubic-bezier(0.45, 0, 0.2, 1)";
/** The colour cross-fade used without View Transitions (matches `.sw-theme-fade`). */
export const FADE_MS = 420;

export function revealPlan(support: { reducedMotion: boolean; viewTransitions: boolean; featheredMask: boolean }): RevealPlan {
  if (support.reducedMotion) return "instant";
  if (!support.viewTransitions) return "fade";
  return support.featheredMask ? "reveal-soft" : "reveal";
}

/** Where the circle starts: the pressed control, else the top-right corner, always inside the window. */
export function revealOrigin(origin: RevealPoint | undefined, viewport: Viewport): RevealPoint {
  const x = origin?.x ?? viewport.width - 40;
  const y = origin?.y ?? 32;
  return { x: Math.min(Math.max(0, x), viewport.width), y: Math.min(Math.max(0, y), viewport.height) };
}

/** A radius that covers the farthest corner from the origin, plus the feathered edge. */
export function revealRadius(origin: RevealPoint, viewport: Viewport, feather = REVEAL_FEATHER): number {
  return Math.hypot(Math.max(origin.x, viewport.width - origin.x), Math.max(origin.y, viewport.height - origin.y)) + feather;
}

/** The centre of a control, for keyboard presses that have no pointer position. */
export function centreOf(rect: { left: number; top: number; width: number; height: number }): RevealPoint {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
