import { useEffect, useRef, useState } from "react";
import { useBlinkSync } from "./blink";
import { useNavigate } from "react-router-dom";
import { usePortalAuth } from "@/hooks/usePortalAuth";

/**
 * The portal sign: the twin of the PARKING sign (ParkingSign.tsx), same navy-and-gold glass, same blink, same size, on the right just below it.
 * It is there only for someone who is already signed in, and it opens their own dashboard (admin, instructor or student), by the same rule as the Portal item of the menu.
 * The PARKING sign comes and goes with the school car, so this one is placed from the header's bottom edge with the parking sign's height reserved, and takes the parking sign's width when that is on screen.
 */
const PARK_H = 54, GAP = 10;

export function PortalSign() {
  const { user, role, isApproved, isLoading } = usePortalAuth();
  const navigate = useNavigate();
  const [top, setTop] = useState(150 + PARK_H + GAP), [minW, setMinW] = useState(0);
  const signedIn = !!user && !isLoading;
  useEffect(() => {
    if (!signedIn) return;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      if (now - last > 120) {
        last = now;
        const h = document.querySelector(".n2-hdr");
        const p = document.querySelector<HTMLElement>(".n2-park");
        if (h) {
          const b = Math.round(h.getBoundingClientRect().bottom) + GAP + (p ? Math.round(p.offsetHeight) : PARK_H) + GAP;
          setTop(v => (Math.abs(v - b) < 1 ? v : b));
        }
        if (p) { const w = p.getBoundingClientRect().width; setMinW(v => (Math.abs(v - w) < .05 ? v : w)); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [signedIn]);
  const btn = useRef<HTMLButtonElement>(null);
  useBlinkSync(btn, [signedIn]);
  if (!signedIn) return null;
  const go = () => {
    if (!isApproved && role !== "admin" && role !== "instructor") return navigate("/pending-approval");
    navigate(role === "admin" ? "/admin" : role === "instructor" ? "/instructor" : "/student");
  };
  return (
    <button ref={btn} type="button" className="n2-exit n2-portal" style={{ top, minWidth: minW || undefined }} aria-label="Open your portal" onClick={go}>
      <svg viewBox="0 0 512 512" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round">
        <path d="M84 452V236a172 172 0 0 1 344 0v216" />
        <path d="M172 452V250a84 84 0 0 1 168 0v202" />
        <path d="M48 452h416" />
        <path d="M256 214l15 31 34 4-25 23 6 34-30-17-30 17 6-34-25-23 34-4z" fill="currentColor" strokeWidth="14" />
      </svg>
      <span>PORTAL</span>
    </button>
  );
}
