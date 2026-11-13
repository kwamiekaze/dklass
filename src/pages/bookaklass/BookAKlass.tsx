import { useEffect, useMemo } from "react";
import { ExternalLink, Phone } from "lucide-react";
import { getPackagesSortedByPosition, type Package } from "@/data/packages";
import "./bookaklass.css";

/**
 * drivingklass.com/bookaklass: the packages on a plain, fast page, with no 3D at all, for sharing by text or email and for
 * any phone that struggles with the homepage. Prices, descriptions and Square links come from `@/data/packages`, the same
 * source as the homepage popup, so the two never drift apart.
 */
/** The same book_click event the homepage logs, sent without the app's analytics provider (the database client loads only on a tap). */
function track(p: Package) {
  let session = "";
  try { session = localStorage.getItem("dk_analytics_session") || ""; if (!session) { session = crypto.randomUUID(); localStorage.setItem("dk_analytics_session", session); } } catch { session = "anon"; }
  const q = new URLSearchParams(location.search);
  void import("@/integrations/supabase/client").then(({ supabase }) => supabase.from("analytics_events").insert({
    event_type: "click", event_name: "book_click", path: location.pathname, page_title: document.title, session_id: session,
    device_type: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop", user_agent: navigator.userAgent, referrer: document.referrer || null,
    metadata: { package_id: p.id, square_url: p.squareUrl, source: "bookaklass" },
    utm_source: q.get("utm_source"), utm_medium: q.get("utm_medium"), utm_campaign: q.get("utm_campaign"),
  })).catch(() => {});
}

export default function BookAKlass() {
  const packages = useMemo(() => getPackagesSortedByPosition(), []);

  useEffect(() => {
    const prev = document.title;
    document.title = "Book a Klass | DrivingKlass";
    // the brand fonts, loaded on the side: if they are slow or blocked the page shows at once in Georgia and swaps when they land
    if (!document.getElementById("bk-fonts")) { const l = document.createElement("link"); l.id = "bk-fonts"; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,600&display=swap"; document.head.appendChild(l); }
    return () => { document.title = prev; };
  }, []);

  function book(p: Package) {
    track(p);
    window.location.href = p.squareUrl;
  }

  return (
    <main className="bk-page">
      <header className="bk-head">
        <img className="bk-logo" src="/icons/drivingklass-192.png" alt="" width={64} height={64} />
        <p className="bk-word">DrivingKlass</p>
        <p className="bk-tag">Where 5 Star Drivers Are Made</p>
        <p className="bk-stars" aria-hidden="true">★ ★ ★ ★ ★</p>
        <h1 className="bk-title">Choose your package</h1>
        <p className="bk-sub">Private, one on one lessons with pick up and drop off from your home, workplace or school.</p>
      </header>

      <ul className="bk-grid">
        {packages.map((p) => {
          const name = p.label.replace("\n", " ");
          return (
            <li key={p.id} className="bk-card">
              <div className="bk-card-top">
                <h2 className="bk-name">{name}</h2>
                <span className="bk-price">{p.price}</span>
              </div>
              <p className="bk-desc">{p.description}</p>
              <button type="button" className="bk-book" onClick={() => book(p)} aria-label={`Book ${name} for ${p.price}`}>
                Book now <ExternalLink size={15} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="bk-foot">
        <a className="bk-call" href="tel:+14044045820"><Phone size={16} aria-hidden="true" /> Questions? Call 404-404-5820</a>
        <a className="bk-home" href="/">Visit drivingklass.com</a>
      </footer>
    </main>
  );
}
