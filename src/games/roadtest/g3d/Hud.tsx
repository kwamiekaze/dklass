import { useEffect, useRef } from 'react';
import type { SceneHandle } from './GameScene';

/**
 * The on-screen display, in the homepage's black glass and gold. It reads the scene's HUD object on its own animation loop and
 * writes numbers and bars straight into the DOM, so React does not re-render at 60 frames a second.
 */
const ARC = 2 * Math.PI * 46 * (270 / 360);

export function Hud({ handle }: { handle: SceneHandle }) {
  const root = useRef<HTMLDivElement>(null);
  const el = useRef<Record<string, HTMLElement | SVGElement | null>>({});
  const set = (k: string) => (n: HTMLElement | SVGElement | null) => { el.current[k] = n; };

  useEffect(() => {
    const hud = handle.hud;
    let raf = 0, lastCount = -2, lastCombo = 0, lastStars = -1, lastShield = false, lastScore = -1, lastMph = -1, lastOver: boolean | null = null, lastStrikes = -1, lastMagnet = -1, lastKm = -1;
    const E = (k: string) => el.current[k] as HTMLElement | null;
    const spawn = (parent: HTMLElement | null, cls: string, html: string, ms: number, style?: Partial<CSSStyleDeclaration>) => {
      if (!parent) return;
      const d = document.createElement('div'); d.className = cls; d.innerHTML = html; if (style) Object.assign(d.style, style);
      parent.appendChild(d); window.setTimeout(() => d.remove(), ms);
      return d;
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const r = root.current; if (!r) return;
      const max = Math.max(1, handle.sim.maxMph);
      // score
      const sc = Math.round(hud.display);
      if (sc !== lastScore) { lastScore = sc; const s = E('score'); if (s) { s.textContent = sc.toLocaleString(); s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); } }
      // speed
      const mph = Math.round(hud.mph);
      if (mph !== lastMph) { lastMph = mph; const s = E('mph'); if (s) s.textContent = String(mph); const a = E('arc'); if (a) a.setAttribute('stroke-dasharray', `${(ARC * Math.min(1, hud.mph / max)).toFixed(1)} 999`); }
      if (hud.over !== lastOver) { lastOver = hud.over; E('speedo')?.classList.toggle('over', hud.over); E('limit')?.classList.toggle('over', hud.over); }
      const warn = performance.now() - hud.speedWarn < 1100; E('limit')?.classList.toggle('warn', warn);
      // combo
      if (hud.combo !== lastCombo) {
        lastCombo = hud.combo;
        const c = E('combo'); if (c) { c.textContent = `×${hud.combo}`; c.dataset.lvl = String(hud.combo); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
        E('pips')?.querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < hud.combo));
        E('tl')?.setAttribute('data-combo', String(hud.combo));
      }
      if (hud.stars !== lastStars) { lastStars = hud.stars; const s = E('stars'); if (s) { s.textContent = `★ ${hud.stars}`; s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); } }
      // progress / strikes
      if (hud.endless) {
        const km = Math.floor(hud.distance * 0.1);
        if (km !== lastKm) { lastKm = km; const d = E('dist'); if (d) d.textContent = `${km.toLocaleString()} m`; }
        if (hud.strikes !== lastStrikes) { lastStrikes = hud.strikes; E('strikes')?.querySelectorAll('i').forEach((p, i) => p.classList.toggle('gone', i >= 3 - hud.strikes)); }
        const bar = E('best'); if (bar && hud.best > 0) bar.style.width = `${Math.min(100, (hud.distance / hud.best) * 100).toFixed(1)}%`;
      } else {
        const f = E('fill'); if (f) f.style.width = `${(hud.progress * 100).toFixed(2)}%`;
        const m = E('marker'); if (m) m.style.left = `${(hud.progress * 100).toFixed(2)}%`;
      }
      // pickups
      const mag = Math.ceil(hud.magnet);
      if (mag !== lastMagnet) { lastMagnet = mag; const m = E('magnet'); if (m) { m.style.display = mag > 0 ? '' : 'none'; const t = E('magnetT'); if (t) t.textContent = `${mag}s`; } }
      if (hud.shield !== lastShield) { lastShield = hud.shield; const s = E('shield'); if (s) s.style.display = hud.shield ? '' : 'none'; }
      const mf = E('magnetFill'); if (mf) mf.style.transform = `scaleX(${Math.min(1, hud.magnet / 10).toFixed(3)})`;
      // countdown
      if (hud.countdown !== lastCount) {
        lastCount = hud.countdown;
        const c = E('count'); if (c) { c.textContent = hud.countdown > 0 ? String(hud.countdown) : hud.countdown === 0 ? 'GO!' : ''; c.classList.remove('go'); void c.offsetWidth; if (hud.countdown >= 0) c.classList.add('go'); c.dataset.n = String(hud.countdown); }
        E('intro')?.classList.toggle('hide', hud.countdown < 0);
      }
      // queues
      while (hud.floats.length) { const f = hud.floats.shift()!; spawn(E('floats'), `rt3d-float ${f.good ? 'good' : 'bad'}`, f.text, 1300, { left: `${f.sx}px`, top: `${f.sy}px` }); }
      while (hud.banners.length) { const b = hud.banners.shift()!; spawn(E('banners'), `rt3d-banner ${b.tone}`, `<b>${b.title}</b>${b.sub ? `<small>${b.sub}</small>` : ''}`, b.ms + 700, { animationDuration: `${b.ms + 700}ms` }); }
      while (hud.flashes.length) { const f = hud.flashes.shift()!; spawn(E('flashes'), 'rt3d-flash', '', f.dur * 1000 + 100, { background: `#${f.color.toString(16).padStart(6, '0')}`, animationDuration: `${f.dur * 1000}ms` }); }
      while (hud.toasts.length) { const t = hud.toasts.shift()!; spawn(E('toasts'), 'rt3d-toast', t.text, 2200); }
      const vg = E('vig'); if (vg) vg.style.opacity = String(Math.max(0, (hud.mph / max - 0.55) * 1.3).toFixed(2));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [handle]);

  const h = handle.hud;
  return <div className="rt3d-hud" ref={root}>
    <div className="rt3d-vig" ref={set('vig')} />
    <div className="rt3d-flashes" ref={set('flashes')} />

    <div className="rt3d-tl" ref={set('tl')} data-combo="1">
      <div className="rt3d-lbl">SCORE <em>{h.difficulty} ×{h.mult}</em></div>
      <div className="rt3d-score" ref={set('score')}>0</div>
      <div className="rt3d-row">
        <span className="rt3d-stars" ref={set('stars')}>★ 0</span>
        <span className="rt3d-combo" ref={set('combo')} data-lvl="1">×1</span>
        <span className="rt3d-pips" ref={set('pips')}><i className="on" /><i /><i /><i /><i /></span>
      </div>
    </div>

    <div className="rt3d-tr">
      <div className="rt3d-speedo" ref={set('speedo')}>
        <svg viewBox="0 0 110 110" aria-hidden="true">
          <circle cx="55" cy="55" r="46" className="trk" strokeDasharray={`${ARC.toFixed(1)} 999`} transform="rotate(135 55 55)" />
          <circle cx="55" cy="55" r="46" className="arc" ref={set('arc')} strokeDasharray="0 999" transform="rotate(135 55 55)" />
        </svg>
        <div className="rt3d-mph"><b ref={set('mph')}>0</b><small>MPH</small></div>
      </div>
      <div className="rt3d-limit" ref={set('limit')}><small>LIMIT</small><b>{h.limit}</b></div>
    </div>

    <div className="rt3d-top">
      <div className="rt3d-name">{h.levelName}</div>
      {h.endless ? <>
        <div className="rt3d-dist" ref={set('dist')}>0 m</div>
        <div className="rt3d-strikes" ref={set('strikes')}><i /><i /><i /></div>
        {h.best > 0 && <div className="rt3d-bestbar"><i ref={set('best')} /><small>BEST {Math.round(h.best * 0.1).toLocaleString()} m</small></div>}
      </> : <div className="rt3d-prog">
        <i className="fill" ref={set('fill')} />
        <i className="tick" style={{ left: '25%' }} /><i className="tick" style={{ left: '50%' }} /><i className="tick" style={{ left: '75%' }} />
        <i className="car" ref={set('marker')} />
        <i className="flag">⚑</i>
      </div>}
    </div>

    <div className="rt3d-pick">
      <div className="rt3d-chip magnet" ref={set('magnet')} style={{ display: 'none' }}><span>★ MAGNET</span><b ref={set('magnetT')}>10s</b><i ref={set('magnetFill')} /></div>
      <div className="rt3d-chip shield" ref={set('shield')} style={{ display: 'none' }}><span>SHIELD READY</span></div>
    </div>

    <div className="rt3d-toasts" ref={set('toasts')} />
    <div className="rt3d-banners" ref={set('banners')} />
    <div className="rt3d-floats" ref={set('floats')} />

    <div className="rt3d-intro" ref={set('intro')}>
      <div className="rt3d-title">{h.levelName}</div>
      <div className="rt3d-sub">{h.difficulty} · {h.levelSub}</div>
      <div className="rt3d-count" ref={set('count')} data-n="3" />
    </div>
  </div>;
}
