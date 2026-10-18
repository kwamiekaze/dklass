/**
 * The DrivingKlass site header, worn by the driving game so it feels like the same site as the home page.
 * Same panel, wheel emblem, wordmark, tagline and stars, same Packages, Contact and Book a Klass, same hamburger menu.
 * `bar` is the slim one-row version (the one the student portal wears) used while a lesson is running, with the
 * lesson's own buttons passed in as `actions`.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { HeaderPanel } from '@/components/nuhome2/HeaderPanel';
import { PackagesPopup } from '@/components/nuhome2/PackagesPopup';
import { MessagePopup } from '@/components/nuhome2/MessagePopup';
import { PortalMenuButton } from '@/components/PortalMenuButton';
import { PortalAuthProvider } from '@/hooks/usePortalAuth';
import { useTheme } from '@/components/ThemeProvider';
import { useAnalytics } from '@/hooks/useAnalytics';
import { getPackagesSortedByPosition } from '@/data/packages';
import wheelUrl from '@/assets/dk-steering-wheel.webp';
import '@/components/nuhome2/nuhome2.css';
import '@/components/nuhome2/header.css';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700&family=Italianno&family=Poppins:wght@400;500;600;700;800&display=swap';

export function SiteHeader({ bar = false, actions, onBrand }: { bar?: boolean; actions?: ReactNode; onBrand?: () => void }) {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const { trackClick } = useAnalytics();
  const night = resolvedTheme === 'dark';
  const [sheet, setSheet] = useState(false);
  const [msg, setMsg] = useState(false);
  const packages = useMemo(() => getPackagesSortedByPosition(), []);

  useEffect(() => {
    if (document.querySelector('link[data-nuhome2-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = FONT_HREF; link.dataset.nuhome2Fonts = 'true';
    document.head.appendChild(link);
  }, []);

  const home = () => { if (onBrand) onBrand(); else navigate('/'); };

  return (
    <div className="n2-page rt-site-header" data-theme="night" data-bar={bar ? 'true' : 'false'}>
      <header className={`n2-header n2-hdr n2-hdr--flow${bar ? ' n2-hdr--bar' : ''}`}>
        <HeaderPanel />
        <div className="n2-hdr-row">
          <button type="button" className="n2-brand" onClick={home} aria-label={onBrand ? 'Leave the lesson' : 'DrivingKlass home'}>
            <span className="n2-hdr-wheelwrap" style={{ '--wheel': `url(${wheelUrl})` } as CSSProperties}>
              <img className="n2-hdr-wheel" src={wheelUrl} alt="" width={480} height={480} decoding="async" />
            </span>
            <span className="n2-hdr-sep" aria-hidden="true" />
            <span className="n2-hdr-word">DrivingKlass</span>
          </button>
          {!bar && (
            <nav className="n2-nav" aria-label="Main navigation">
              <button type="button" onClick={() => { trackClick('game_header_packages'); setSheet(true); }}>Packages</button>
              <button type="button" onClick={() => { trackClick('game_header_contact'); setMsg(true); }}>Contact</button>
            </nav>
          )}
          <div className="n2-header-actions">
            {actions}
            {!bar && (
              <>
                <button type="button" className="n2-hdr-btn" onClick={() => { trackClick('theme_toggle', { theme: night ? 'light' : 'dark' }); setTheme(night ? 'light' : 'dark'); }} aria-label={night ? 'Switch to day' : 'Switch to night'}>
                  {night ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
                </button>
                <button type="button" className="n2-book" onClick={() => { trackClick('game_header_book'); setSheet(true); }}>Book a Klass</button>
                <PortalAuthProvider><PortalMenuButton variant="hamburger" triggerClassName="n2-hdr-btn" /></PortalAuthProvider>
              </>
            )}
          </div>
        </div>
        {!bar && (
          <>
            <p className="n2-hdr-tag"><span>Where 5 Star Drivers Are Made</span></p>
            <div className="n2-hdr-stars" role="img" aria-label="5 stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <svg key={i} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.6l3.1 6.9 7.5.8-5.6 5 1.6 7.4L12 17.8l-6.6 3.9 1.6-7.4-5.6-5 7.5-.8z" fill="url(#n2h-star)" stroke="#8a5f12" strokeWidth=".6" strokeLinejoin="round" /></svg>
              ))}
              <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}><defs><linearGradient id="n2h-star" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe9a6" /><stop offset=".5" stopColor="#e5b84a" /><stop offset="1" stopColor="#b8841f" /></linearGradient></defs></svg>
            </div>
          </>
        )}
      </header>
      {sheet && <PackagesPopup packages={packages} onClose={() => setSheet(false)} />}
      {msg && <MessagePopup onClose={() => setMsg(false)} />}
    </div>
  );
}
