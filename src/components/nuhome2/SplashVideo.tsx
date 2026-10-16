import { useCallback, useEffect, useRef, useState } from "react";

const BASE = import.meta.env.BASE_URL;
export const SPLASH_VIDEO = `${BASE}videos/dk-splash.mp4`;
export const SPLASH_POSTER = `${BASE}videos/dk-splash-poster.jpg`;

const FADE_MS = 700;
const WAIT_AFTER_END = 7000;     // the video has finished and the world is still loading: hold on the last frame, but never longer than this
const WAIT_AFTER_TAP = 2600;     // the visitor tapped to skip: the world gets this long to be ready, then the page opens regardless
const FAILSAFE_MS = 20000;       // whatever happens, the page opens

/**
 * The opening film. It plays full screen while the 3D world loads and warms up behind it (the canvas is mounted and drawing the whole time).
 * When the film ends, or the visitor taps anywhere, it fades away as soon as the world is ready, so the page opens on a finished scene.
 * There is no on-screen text: a tap is all it takes, anywhere.
 */
export function SplashVideo({ ready, onFadeStart, onDone }: { ready: boolean; onFadeStart: () => void; onDone: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [over, setOver] = useState<null | "ended" | "tap" | "failed">(null);
  const [fading, setFading] = useState(false);
  const [shown, setShown] = useState(false);          // the first frame is on screen
  const overAt = useRef(0);
  const cb = useRef({ onFadeStart, onDone });
  useEffect(() => { cb.current = { onFadeStart, onDone }; }, [onFadeStart, onDone]);

  // a visitor who has asked for less motion or less data gets the still frame, briefly, instead of the film
  const still = useRef(
    typeof window !== "undefined" && (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      !!(navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData
    ),
  );

  const finish = useCallback((why: "ended" | "tap" | "failed") => {
    setOver((o) => { if (o) return o; overAt.current = performance.now(); return why; });
  }, []);

  // start the film. Some phones (low power mode, some in-app browsers) refuse to autoplay: then the still frame stands in for a moment and the page opens.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (still.current) { const t = setTimeout(() => finish("failed"), 1400); return () => clearTimeout(t); }
    const go = () => { v.play().catch(() => { /* handled by the watchdog below */ }); };
    go();
    const retry = setTimeout(go, 300);
    const watchdog = setTimeout(() => { if (v.paused || v.currentTime < 0.05) finish("failed"); }, 3500);
    return () => { clearTimeout(retry); clearTimeout(watchdog); };
  }, [finish]);

  useEffect(() => { const t = setTimeout(() => finish("failed"), FAILSAFE_MS); return () => clearTimeout(t); }, [finish]);

  // leave once the film is over AND the world is ready (or has had its time)
  useEffect(() => {
    if (!over || fading) return;
    const waited = () => performance.now() - overAt.current;
    const cap = over === "tap" ? WAIT_AFTER_TAP : WAIT_AFTER_END;
    const leave = () => { setFading(true); cb.current.onFadeStart(); };
    if (ready || waited() >= cap) { leave(); return; }
    const t = setTimeout(leave, Math.max(0, cap - waited()));
    return () => clearTimeout(t);
  }, [over, ready, fading]);

  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => cb.current.onDone(), FADE_MS + 60);
    return () => clearTimeout(t);
  }, [fading]);

  const tap = () => finish("tap");

  return (
    <div
      className="n2-splash"
      data-fading={fading}
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      onPointerDown={tap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); tap(); } }}
      style={{ ["--fade" as string]: `${FADE_MS}ms` }}
    >
      <video
        ref={ref}
        className="n2-splash-video"
        data-shown={shown}
        src={still.current ? undefined : SPLASH_VIDEO}
        poster={SPLASH_POSTER}
        muted
        playsInline
        autoPlay
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        onPlaying={() => setShown(true)}
        onEnded={() => finish("ended")}
        onError={() => finish("failed")}
        aria-hidden="true"
      />
    </div>
  );
}
