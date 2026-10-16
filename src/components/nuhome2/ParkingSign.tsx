import { useEffect, useRef, useState } from "react";
import { useBlinkSync } from "./blink";
import { canStartPark, requestEnter } from "./world/park";

/**
 * The parking-lot sign: the twin of the exit sign (ExitSign.tsx), in the same place (top right of the screen, just under the header) and the same navy-and-gold glass.
 * It is on offer while the school car is in the front lot (on its way to its stall, or parked in it). Pressing it sends the car to the back lot: if it is still driving
 * it carries on down its own path and diverts (park.ts, requestEnter), and the "!" markers of the back lot are waiting when it gets there.
 * The state lives in park.ts (not React), so it is read a few times a second.
 */
export function ParkingSign() {
  const [show, setShow] = useState(false), [top, setTop] = useState(150);
  useEffect(() => {
    let raf = 0, last = 0;
    const tick = (now: number) => {
      if (now - last > 120) {
        last = now;
        const s = canStartPark("enter");
        setShow(p => (p === s ? p : s));
        const h = document.querySelector(".n2-hdr");
        if (h) { const b = Math.round(h.getBoundingClientRect().bottom) + 10; setTop(p => (Math.abs(p - b) < 1 ? p : b)); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const btn = useRef<HTMLButtonElement>(null);
  useBlinkSync(btn, [show]);
  if (!show) return null;
  return (
    <button ref={btn} type="button" className="n2-exit n2-park" style={{ top }} aria-label="Go to the back parking lot" onClick={() => requestEnter()}>
      <svg viewBox="0 0 512 512" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round">
        <rect x="62" y="62" width="388" height="388" rx="62" />
        <path d="M188 356V158h86a56 56 0 0 1 0 112h-86" />
        <path d="M300 396h92M360 366l32 30-32 30" />
      </svg>
      <span>PARKING</span>
    </button>
  );
}
