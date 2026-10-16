import { useEffect, type RefObject } from "react";

/**
 * The corner signs (EXIT, PARKING, PORTAL) all blink with the same 1.3 s CSS animation, but each starts when it appears, so two on screen drifted out of step.
 * This puts every sign's blink on the page's one clock (start time 0), so they glow and fade together whenever they appear.
 */
export function useBlinkSync(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getAnimations !== "function") return;
    for (const a of el.getAnimations()) { try { a.startTime = 0; } catch { /* an older browser keeps its own start */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
