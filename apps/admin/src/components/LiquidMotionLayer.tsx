import { useEffect } from "react";

const selector =
  "[data-liquid],.btn-primary,.btn-secondary,.icon-button,.visibility-option-active,.back-link";

function paint(event: PointerEvent) {
  if (!(event.target instanceof Element)) return;
  const surface = event.target.closest<HTMLElement>(selector);
  if (!surface) return;
  const bounds = surface.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const x = ((event.clientX - bounds.left) / bounds.width) * 100;
  const y = ((event.clientY - bounds.top) / bounds.height) * 100;
  surface.style.setProperty("--liquid-x", `${x.toFixed(2)}%`);
  surface.style.setProperty("--liquid-y", `${y.toFixed(2)}%`);
}

export function LiquidMotionLayer() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let latest: PointerEvent | null = null;
    const move = (event: PointerEvent) => {
      latest = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (latest) paint(latest);
      });
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
