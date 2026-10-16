import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Info, MessageSquare, Moon, Phone, Star, Sun } from "lucide-react";
import { MusicControls } from "@/components/nuhome2/music/MusicControls";
import { PortalMenuButton } from "@/components/PortalMenuButton";
import { ContactBackdrop } from "@/components/nuhome2/ContactBackdrop";
import { PackagesPopup } from "@/components/nuhome2/PackagesPopup";
import { MessagePopup } from "@/components/nuhome2/MessagePopup";
import { HeaderPanel } from "@/components/nuhome2/HeaderPanel";
import { ExitSign } from "@/components/nuhome2/ExitSign";
import { SteeringLive, SteeringCaption } from "@/components/nuhome2/SteeringLive";
import { WeatherAdmin } from "@/components/nuhome2/WeatherAdmin";
import { RecenterButton } from "@/components/nuhome2/RecenterButton";
import { ParkingSign } from "@/components/nuhome2/ParkingSign";
import { PortalSign } from "@/components/nuhome2/PortalSign";
import wheelUrl from "@/assets/dk-steering-wheel.webp";
import { Journey } from "@/components/nuhome2/journey/Journey";
import { useAnalytics } from "@/hooks/useAnalytics";
import { ReviewsModal } from "@/components/ReviewsModal";
import { AboutModal } from "@/components/AboutModal";
import { ContactSection } from "@/components/ContactSection";
import { useTheme } from "@/components/ThemeProvider";
import { getPackagesSortedByPosition } from "@/data/packages";
import { BRAND } from "@/components/nuhome2/content";
import { STAGES } from "@/components/nuhome2/world/views";
import "@/components/nuhome2/nuhome2.css";
import "@/components/nuhome2/header.css";

// The 3D world loads on its own so the page shell, copy and packages paint first.
const Scene = lazy(() => import("@/components/nuhome2/world/Scene"));

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700&family=Italianno&family=Poppins:wght@400;500;600;700;800&display=swap";

/** Open 9am to 6pm, every day, by the clock in Georgia (US Eastern). Add ?open=1 or ?open=0 to preview either sign. */
export function georgiaOpen(now: Date = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
  return h >= 9 && h < 18;
}
/** The default theme: day from 7am to 6pm Georgia time, night otherwise. A visitor's own choice, once made, wins. */
function georgiaDay(now: Date = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
  return h >= 7 && h < 18;
}
function openOverride(): boolean | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("open");
  return q === "1" ? true : q === "0" ? false : null;
}

function Stars({ small = false }: { small?: boolean }) {
  return (
    <div className={`n2-stars ${small ? "n2-stars--sm" : ""}`} role="img" aria-label="5 stars">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true" style={{ animationDelay: `${i * 0.28}s` }}>
          <defs>
            <linearGradient id={`n2s${small ? "s" : "l"}${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff3c4" /><stop offset="0.45" stopColor="#f2c14e" /><stop offset="1" stopColor="#b98714" />
            </linearGradient>
          </defs>
          <path fill={`url(#n2s${small ? "s" : "l"}${i})`} d="M12 2.4l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.4l-5.9 3.3 1.2-6.6L2.4 9.4l6.7-.9z" />
        </svg>
      ))}
    </div>
  );
}

/** Keeps the page alive if the 3D world ever throws. Copy, packages, menu and the message form keep working. */
class SceneBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

/**
 * /nuhome2: the DrivingKlass estate. A 3D world with a transparent header, four views behind NEXT VIEW, the Reviews / About Us / Call
 * buttons over the line, and the same message form as the homepage underneath. This is the DrivingKlass home page.
 */
/** True once the home page has shown in this page load: a refresh resets it, moving around the app does not. */
const INTRO_SEEN = { v: false };
export default function NuHome2() {
  const { theme: pref, resolvedTheme, setTheme } = useTheme();
  const [clockDay, setClockDay] = useState(() => georgiaDay());
  const { trackClick } = useAnalytics();
  const auto = pref === "time-based";   // "system" follows the device, exactly as on the homepage
  const night = auto ? !clockDay : resolvedTheme === "dark";
  const q = useMemo(() => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)), []);
  const [stage, setStage] = useState(() => Math.max(0, Math.min(STAGES.length - 1, Number(q.get("stage")) || 0)));
  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [lost, setLost] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [open, setOpen] = useState(() => openOverride() ?? georgiaOpen());
  const [touched, setTouched] = useState(false);
  const gl = useMemo(() => (typeof document === "undefined" ? true : hasWebGL()), []);
  const skipIntro = useMemo(() => {
    if (q.get("intro") === "0" || q.get("stage") !== null) return true;
    return INTRO_SEEN.v;                              // coming back to the page inside the app skips it; a refresh (a new page load) plays it
  }, [q]);
  useEffect(() => { INTRO_SEEN.v = true; }, []);
  const packages = useMemo(() => getPackagesSortedByPosition(), []);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "DrivingKlass | Where 5 Star Drivers Are Made";
    let link = document.querySelector<HTMLLinkElement>("link[data-nuhome2-fonts]");
    if (!link) { link = document.createElement("link"); link.rel = "stylesheet"; link.href = FONT_HREF; link.dataset.nuhome2Fonts = "true"; document.head.appendChild(link); }
    return () => { document.title = prevTitle; };
  }, []);

  useEffect(() => {
    try { const saved = localStorage.getItem("theme"); if (!saved || saved === "system") setTheme("time-based"); } catch { /* private mode */ }
    const id = window.setInterval(() => setClockDay(georgiaDay()), 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update(); mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // The door sign follows the clock in Georgia, never the day/night toggle.
  useEffect(() => {
    if (openOverride() !== null) return;
    const id = window.setInterval(() => setOpen(georgiaOpen()), 20000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ready && gl) return;
    const t = setTimeout(() => setSplashDone(true), 700);
    return () => clearTimeout(t);
  }, [ready, gl]);
  useEffect(() => { const t = setTimeout(() => setSplashDone(true), 9000); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(false);
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") setStage((s) => (s + 1) % STAGES.length);
      if (e.key === "ArrowLeft") setStage((s) => (s - 1 + STAGES.length) % STAGES.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const goHome = useCallback(() => { window.location.assign("/"); }, []);   // the wheel refreshes the home page, opening shot included
  const onIntroDone = useCallback(() => { /* nothing to remember: the next page load plays it again */ }, []);
  const scrollDown = useCallback(() => window.scrollTo({ top: window.innerHeight * 0.92, behavior: "smooth" }), []);
  const toContact = useCallback(() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }), []);

  return (
    <div className="n2-page" data-theme={night ? "night" : "day"}>
      <main className="n2-experience" data-pop={sheet || msgOpen ? "true" : "false"}>
        <div className="n2-poster" aria-hidden="true" />
        {gl && !lost && (
          <div className="n2-scene" aria-hidden="true" onPointerDown={() => setTouched(true)}>
            <SceneBoundary onFail={() => setLost(true)}>
              <Suspense fallback={null}>
                <Scene stage={stage} theme={night ? "night" : "day"} open={open} reducedMotion={reducedMotion} skipIntro={skipIntro}
                  onReady={() => setReady(true)} onIntroDone={onIntroDone} onLost={() => setLost(true)} />
              </Suspense>
            </SceneBoundary>
          </div>
        )}
        <div className="n2-tint" aria-hidden="true" />

        <header className="n2-header n2-hdr">
          {/* the panel: two curved end caps and a stretched middle, all CSS/SVG so the gold edge stays razor sharp at any width */}
          <HeaderPanel />

          <div className="n2-hdr-row">
            <button type="button" className="n2-brand" onClick={goHome} aria-label="DrivingKlass home">
              <span className="n2-hdr-wheelwrap" style={{ "--wheel": `url(${wheelUrl})` } as React.CSSProperties}><img className="n2-hdr-wheel" src={wheelUrl} alt="" width={480} height={480} decoding="async" /><SteeringLive /></span>
              <span className="n2-hdr-sep" aria-hidden="true" />
              <span className="n2-hdr-word">DrivingKlass</span>
            </button>
            <nav className="n2-nav" aria-label="Main navigation">
              <button type="button" onClick={() => setSheet(true)}>Packages</button>
              <button type="button" onClick={toContact}>Contact</button>
            </nav>
            <div className="n2-header-actions">
              <button type="button" className="n2-hdr-btn" onClick={() => { trackClick("theme_toggle", { theme: night ? "light" : "dark" }); setTheme(night ? "light" : "dark"); }} aria-label={night ? "Switch to day" : "Switch to night"}>
                {night ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
              </button>
              <button type="button" className="n2-book" onClick={() => setSheet(true)}>Book a Klass</button>
              <PortalMenuButton variant="hamburger" triggerClassName="n2-hdr-btn" />
            </div>
          </div>
          <p className="n2-hdr-tag"><span>Where 5 Star Drivers Are Made</span></p>
          <div className="n2-hdr-stars" role="img" aria-label="5 stars">
            {[0, 1, 2, 3, 4].map((i) => (
              <svg key={i} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.6l3.1 6.9 7.5.8-5.6 5 1.6 7.4L12 17.8l-6.6 3.9 1.6-7.4-5.6-5 7.5-.8z" fill="url(#n2h-star)" stroke="#8a5f12" strokeWidth=".6" strokeLinejoin="round" /></svg>
            ))}
            <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}><defs><linearGradient id="n2h-star" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe9a6" /><stop offset=".5" stopColor="#e5b84a" /><stop offset="1" stopColor="#b8841f" /></linearGradient></defs></svg>
          </div>
        </header>
        <ExitSign />
        <SteeringCaption />
        <ParkingSign />
        <PortalSign />
        <WeatherAdmin />
        <RecenterButton />

        <div className="n2-hero" data-hidden={stage !== 0}>
          <div className="n2-eyebrow"><span className="n2-eline" /> {BRAND.eyebrow} <span className="n2-eline" /></div>
          <h1 className="n2-wordmark n2-gold" aria-label={BRAND.wordmark}>{BRAND.wordmark}</h1>
          <p className="n2-script n2-gold">{BRAND.slogan}</p>
          <Stars />
          <p className="n2-desc">{BRAND.description}</p>
        </div>

        <div className="n2-navbtns" role="group" aria-label="Reviews, About Us and Call">
          <button type="button" className="n2-nbtn" onClick={() => setReviewsOpen(true)}><Star size={15} aria-hidden="true" /><span>Reviews</span></button>
          <button type="button" className="n2-nbtn" onClick={() => setAboutOpen(true)}><Info size={15} aria-hidden="true" /><span>About Us</span></button>
          <button type="button" className="n2-nbtn" aria-label="Call Driving Klass" onClick={() => { trackClick("call_click"); window.location.href = "tel:+14044045820"; }}><Phone size={15} aria-hidden="true" /><span>Call</span></button>
        </div>

        <div className="n2-rail">
          <div className="n2-rail-actions">
            <button type="button" className="n2-btn n2-btn--gold n2-rail-book" onClick={() => setSheet(true)}>Book a Klass</button>
            <button type="button" className="n2-btn n2-btn--glass n2-rail-msg" onClick={() => setMsgOpen(true)} aria-label="Send us a message"><MessageSquare size={15} aria-hidden="true" /><span>Message</span></button>
          </div>
          <MusicControls />
          <div className="n2-swipe" role="button" tabIndex={0} aria-label="Scroll down to send us a message" onClick={scrollDown}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") scrollDown(); }}>
            <span className="n2-lbl-touch">SWIPE</span><span className="n2-lbl-mouse">SCROLL</span>
            <ChevronUp size={12} strokeWidth={2.5} aria-hidden="true" /><ChevronDown size={12} strokeWidth={2.5} aria-hidden="true" />
          </div>
        </div>
        <div className="n2-drag" data-show={splashDone && !touched}>DRAG TO ORBIT · SCROLL TO ZOOM</div>

        {sheet && <PackagesPopup packages={packages} onClose={() => setSheet(false)} />}
        {msgOpen && <MessagePopup onClose={() => setMsgOpen(false)} />}

        {lost && gl && (
          <div className="n2-lost" role="alert"><p>The 3D world paused to save your battery.</p>
            <button type="button" className="n2-btn n2-btn--gold" onClick={() => window.location.reload()}>Reload</button></div>
        )}

        <div className="n2-splash" data-done={splashDone} aria-hidden={splashDone}>
          <div className="n2-splash-inner">
            <b className="n2-gold">{BRAND.wordmark}</b><em>{BRAND.slogan}</em><Stars /><span className="n2-bar"><i /></span>
          </div>
        </div>
      </main>

      <Journey theme={night ? "night" : "day"} onBook={() => setSheet(true)} onTheme={() => setTheme(night ? "light" : "dark")} />

      <section className="n2-below text-foreground">
        <ContactBackdrop night={night} />
        <ContactSection />
      </section>

      <ReviewsModal isOpen={reviewsOpen} onClose={() => setReviewsOpen(false)} />
      <AboutModal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
