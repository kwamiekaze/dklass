/**
 * WebAudio sound system — 100% synthesized, no audio files.
 * AudioContext is lazily created on the first user gesture (browser autoplay rules).
 * Self-recovering: engine + music intents are remembered and re-attached whenever
 * the context finally reaches 'running' (first tap, tab refocus, etc.).
 *
 * Signal path:
 *   [SFX nodes] -> sfxBus (0.45) ---\
 *                                    masterGain (mute switch) -> destination
 *   [Track A] -> musicBusA (0..1) -->|
 *   [Track B] -> musicBusB (0..1) -->|  both feed musicBus -> master
 *
 * Two music sub-buses enable smooth 1.5s crossfades between named tracks.
 *
 * NOTE: The iOS hardware silent switch mutes WebAudio at the OS level regardless
 * of what we do here.
 */

const MUTE_KEY = 'dk-game-muted';
const MUSIC_MUTE_KEY = 'dk-game-music-muted';
const SFX_MUTE_KEY = 'dk-game-sfx-muted';

const MASTER_LEVEL = 0.9;
const MUSIC_LEVEL = 0.7;
const SFX_LEVEL = 0.45;
const CROSSFADE_S = 1.5;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicBusA: GainNode | null = null;
let musicBusB: GainNode | null = null;
let sfxBus: GainNode | null = null;

let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let engineFilter: BiquadFilterNode | null = null;
let engineRunning = false;

let muted = false;
let musicMuted = false;
let sfxMuted = false;

// Combo-pitch offset applied to positive SFX (semitones). Reset via setSfxPitchStep(0).
let sfxPitchSemi = 0;

let lastScreechAt = 0;

try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
  musicMuted = localStorage.getItem(MUSIC_MUTE_KEY) === '1';
  sfxMuted = localStorage.getItem(SFX_MUTE_KEY) === '1';
} catch { /* ignore */ }

let mediaDest: MediaStreamAudioDestinationNode | null = null;
let mediaEl: HTMLAudioElement | null = null;

function ensureMediaElement() {
  if (mediaEl || typeof document === 'undefined') return;
  try {
    mediaEl = document.createElement('audio');
    mediaEl.autoplay = false;
    (mediaEl as any).playsInline = true;
    mediaEl.setAttribute('playsinline', '');
    mediaEl.setAttribute('webkit-playsinline', '');
    mediaEl.muted = false;
    mediaEl.style.display = 'none';
    document.body.appendChild(mediaEl);
  } catch { /* ignore */ }
}

function tryPlayMediaEl() {
  if (!mediaEl) return;
  if (mediaEl.paused) {
    const p = mediaEl.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
  }
}

function buildContext() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : MASTER_LEVEL;

    musicBus = ctx.createGain();
    musicBus.gain.value = musicMuted ? 0 : MUSIC_LEVEL;
    musicBus.connect(masterGain);

    musicBusA = ctx.createGain(); musicBusA.gain.value = 0; musicBusA.connect(musicBus);
    musicBusB = ctx.createGain(); musicBusB.gain.value = 0; musicBusB.connect(musicBus);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxMuted ? 0 : SFX_LEVEL;
    sfxBus.connect(masterGain);

    try {
      mediaDest = ctx.createMediaStreamDestination();
      masterGain.connect(mediaDest);
      ensureMediaElement();
      if (mediaEl) {
        try { (mediaEl as any).srcObject = mediaDest.stream; } catch { /* ignore */ }
      }
    } catch {
      masterGain.connect(ctx.destination);
    }
  } catch { /* ignore */ }
}

function isRunning() {
  return !!ctx && (ctx.state as string) === 'running';
}

function rebuildIfClosed() {
  if (!ctx || (ctx.state as string) === 'closed') {
    ctx = null;
    masterGain = null;
    musicBus = null; musicBusA = null; musicBusB = null;
    sfxBus = null;
    engineOsc = null; engineGain = null; engineFilter = null;
    router.teardownAll();
    buildContext();
  }
}

function buildEngineNodes() {
  if (!ctx || !sfxBus || engineOsc) return;
  try {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(sfxBus);
    engineOsc.start();
  } catch { /* ignore */ }
}

// ============================================================================
// MUSIC TRACKS
// ============================================================================

export type TrackId = 'showroom' | 'sunnyCruise' | 'nightDrive' | 'rushHour' | 'starRush';

// Backwards-compat mood name → track mapping (existing callers).
export type MusicMood = 'calm' | 'tense' | 'dark' | 'ethereal';
const MOOD_TO_TRACK: Record<MusicMood, TrackId> = {
  calm: 'sunnyCruise',
  tense: 'sunnyCruise',
  dark: 'rushHour',
  ethereal: 'nightDrive',
};

interface TrackPreset {
  label: string;
  bpm: number;
  keyMidi: number;
  minor: boolean;
  progression: number[];     // scale-degree root offsets in semitones
  padType: OscillatorType;
  leadType: OscillatorType;
  bassType: OscillatorType;
  filterBase: number;
  filterPeak: number;
  padLevel: number;
  kickLevel: number;
  arp?: boolean;             // add gentle arp always (menu themes)
  swing?: number;            // 0..0.15 groove push
}

const TRACKS: Record<TrackId, TrackPreset> = {
  showroom:    { label: 'Showroom',    bpm:  72, keyMidi: 50, minor: false, progression: [0, 5, 9, 7],  padType: 'sine',     leadType: 'triangle', bassType: 'sine',     filterBase: 900,  filterPeak: 2000, padLevel: 0.16, kickLevel: 0.30, arp: true },
  sunnyCruise: { label: 'Sunny Cruise',bpm: 104, keyMidi: 52, minor: false, progression: [0, 7, 9, 5],  padType: 'triangle', leadType: 'triangle', bassType: 'triangle', filterBase: 1300, filterPeak: 2800, padLevel: 0.13, kickLevel: 0.42 },
  nightDrive:  { label: 'Night Drive', bpm:  90, keyMidi: 45, minor: true,  progression: [0, 10, 3, 8], padType: 'sawtooth', leadType: 'sine',     bassType: 'sine',     filterBase: 900,  filterPeak: 2000, padLevel: 0.15, kickLevel: 0.36, swing: 0.06 },
  rushHour:    { label: 'Rush Hour',   bpm: 122, keyMidi: 43, minor: true,  progression: [0, 8, 3, 10], padType: 'sawtooth', leadType: 'square',   bassType: 'sawtooth', filterBase: 1600, filterPeak: 3400, padLevel: 0.11, kickLevel: 0.60 },
  starRush:    { label: 'Star Rush',   bpm: 132, keyMidi: 48, minor: false, progression: [0, 7, 5, 8],  padType: 'sawtooth', leadType: 'square',   bassType: 'triangle', filterBase: 1700, filterPeak: 3600, padLevel: 0.11, kickLevel: 0.58, arp: true },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class MusicTrack {
  readonly id: TrackId;
  private preset: TrackPreset;
  private timer: number | null = null;
  private barIndex = 0;
  private lowpass: BiquadFilterNode | null = null;
  private out: GainNode | null = null;
  private bus: GainNode;
  intensity = 0; // adaptive endless intensity 0..3
  private duckUntil = 0;

  constructor(id: TrackId, bus: GainNode) {
    this.id = id;
    this.preset = TRACKS[id];
    this.bus = bus;
  }

  isPlaying() { return this.timer !== null; }

  start() {
    if (!ctx) return;
    if (this.timer !== null) return;
    try {
      this.out = ctx.createGain();
      this.out.gain.value = 1.0;
      this.lowpass = ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = this.preset.filterBase * 2;
      this.out.connect(this.lowpass).connect(this.bus);
    } catch { return; }
    this.barIndex = 0;
    this.scheduleNextBar();
  }

  stop() {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (this.out) { try { this.out.disconnect(); } catch { /* ignore */ } this.out = null; }
    if (this.lowpass) { try { this.lowpass.disconnect(); } catch { /* ignore */ } this.lowpass = null; }
  }

  setIntensity(step: number) {
    this.intensity = Math.max(0, Math.min(3, step | 0));
  }

  duck(durMs = 220) {
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    this.duckUntil = t + durMs / 1000;
    try {
      const g = this.out.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.25, t + 0.03);
      g.linearRampToValueAtTime(1.0, t + durMs / 1000 + 0.12);
    } catch { /* ignore */ }
  }

  private currentBpm() {
    return this.preset.bpm + this.intensity * 5;
  }

  private scheduleNextBar() {
    if (!isRunning() || !this.out || !ctx) { this.stop(); return; }
    const bpm = this.currentBpm();
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;
    const t0 = ctx.currentTime + 0.05;
    this.scheduleBar(t0, beatSec);
    this.barIndex++;
    this.timer = window.setTimeout(() => this.scheduleNextBar(), barSec * 1000);
  }

  private scheduleBar(t0: number, beatSec: number) {
    if (!ctx || !this.out) return;
    const p = this.preset;
    const chordIdx = this.barIndex % p.progression.length;
    const root = p.keyMidi + p.progression[chordIdx];
    const third = root + (p.minor ? 3 : 4);
    const fifth = root + 7;
    const octave = root + 12;
    const swing = p.swing ?? 0;

    // Kick — 4-on-the-floor (skip beat-3 on Showroom for laid-back feel)
    const kickBeats = p.bpm < 80 ? [0, 2] : [0, 1, 2, 3];
    for (const b of kickBeats) this.kick(t0 + b * beatSec, p.kickLevel);

    // Bass 8ths
    const bassNotes = [root, fifth, root, octave, fifth, root, octave, fifth];
    for (let i = 0; i < 8; i++) {
      const off = (i % 2 === 1 ? swing : 0);
      this.pluck(t0 + (i + off) * (beatSec / 2), midi(bassNotes[i] - 12), 0.18, p.bassType, beatSec * 0.45);
    }

    // Pad chord
    [root + 12, third + 12, fifth + 12].forEach((n, i) => {
      this.pad(t0, midi(n), p.padLevel * (i === 0 ? 1 : 0.75), p.padType, beatSec * 4);
    });

    // Baseline arp for menu-style tracks
    if (p.arp) {
      const arp = [root, third, fifth, octave, fifth, third];
      for (let i = 0; i < 8; i++) {
        const n = arp[i % arp.length] + 12;
        this.pluck(t0 + i * (beatSec / 2) + beatSec / 4, midi(n), 0.08, 'triangle', beatSec * 0.35);
      }
    }

    // Intensity 1+ : hi-hat tick 8ths
    if (this.intensity >= 1) {
      for (let i = 0; i < 8; i++) this.hat(t0 + i * (beatSec / 2), 0.06 + this.intensity * 0.02);
    }
    // Intensity 2+ : brighter arp voice
    if (this.intensity >= 2) {
      const arp = [octave, octave + 2, octave + 5, octave + 7];
      for (let i = 0; i < 8; i++) {
        const n = arp[i % arp.length] + 12;
        this.pluck(t0 + i * (beatSec / 2) + beatSec / 4, midi(n), 0.07, p.leadType, beatSec * 0.35);
      }
    }
    // Intensity 3 : sub-octave doubling
    if (this.intensity >= 3) {
      this.pad(t0, midi(root - 12), 0.10, 'sawtooth', beatSec * 4);
    }

    // Sparkle every 8 bars
    if (this.barIndex % 8 === 7) {
      const sp = [octave + 12, octave + 15, octave + 19, octave + 24];
      for (let i = 0; i < sp.length; i++) {
        this.pluck(t0 + i * (beatSec / 4) + beatSec * 2, midi(sp[i]), 0.07, 'sine', beatSec * 0.9);
      }
    }

    if (this.lowpass) {
      const target = p.filterBase + Math.min(this.intensity, 3) * ((p.filterPeak - p.filterBase) / 3);
      try {
        if (ctx.currentTime > this.duckUntil) {
          this.lowpass.frequency.setTargetAtTime(target, t0, 0.6);
        }
      } catch { /* ignore */ }
    }
  }

  private kick(t: number, vol: number) {
    if (!ctx || !this.out) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(this.out);
      o.start(t); o.stop(t + 0.3);
    } catch { /* ignore */ }
  }

  private hat(t: number, vol: number) {
    if (!ctx || !this.out) return;
    try {
      const dur = 0.05;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(hp).connect(g).connect(this.out);
      src.start(t); src.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }

  private pluck(t: number, freq: number, vol: number, type: OscillatorType, dur: number) {
    if (!ctx || !this.out) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.out);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }

  private pad(t: number, freq: number, vol: number, type: OscillatorType, dur: number) {
    if (!ctx || !this.out) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + Math.min(0.4, dur * 0.2));
      g.gain.setValueAtTime(vol, t + dur - Math.min(0.5, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.out);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }
}

type TrackChangeListener = (id: TrackId, label: string) => void;

class MusicRouter {
  wantedTrack: TrackId | null = null;
  wantedIntensity = 0;
  private active: MusicTrack | null = null;
  private prev: MusicTrack | null = null;
  private slot: 'A' | 'B' = 'A';
  private listeners = new Set<TrackChangeListener>();

  onChange(fn: TrackChangeListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  playTrack(id: TrackId) {
    if (this.wantedTrack === id) return;
    const notify = this.wantedTrack !== id;
    this.wantedTrack = id;
    this.attach();
    if (notify && this.active) {
      const label = TRACKS[id].label;
      this.listeners.forEach((fn) => { try { fn(id, label); } catch { /* ignore */ } });
    }
  }

  /** Actually build the requested track (called from attach/revive paths). */
  attach() {
    if (!isRunning() || !ctx || !musicBusA || !musicBusB) return;
    if (muted || musicMuted) return;
    if (!this.wantedTrack) return;
    if (this.active && this.active.id === this.wantedTrack) return;

    // If we're mid-crossfade already, kill the outgoing track fast.
    if (this.prev) { try { this.prev.stop(); } catch { /* ignore */ } this.prev = null; }

    const nextSlot: 'A' | 'B' = this.active ? (this.slot === 'A' ? 'B' : 'A') : this.slot;
    const nextBus = nextSlot === 'A' ? musicBusA : musicBusB;
    const prevBus = nextSlot === 'A' ? musicBusB : musicBusA;

    const next = new MusicTrack(this.wantedTrack, nextBus);
    next.setIntensity(this.wantedIntensity);
    next.start();

    // Fade in the next bus, fade out the previous bus.
    const t = ctx.currentTime;
    try {
      nextBus.gain.cancelScheduledValues(t);
      nextBus.gain.setValueAtTime(nextBus.gain.value, t);
      nextBus.gain.linearRampToValueAtTime(1.0, t + CROSSFADE_S);
      prevBus.gain.cancelScheduledValues(t);
      prevBus.gain.setValueAtTime(prevBus.gain.value, t);
      prevBus.gain.linearRampToValueAtTime(0.0, t + CROSSFADE_S);
    } catch { /* ignore */ }

    const outgoing = this.active;
    this.prev = outgoing;
    this.active = next;
    this.slot = nextSlot;

    if (outgoing) {
      window.setTimeout(() => {
        if (this.prev === outgoing) {
          try { outgoing.stop(); } catch { /* ignore */ }
          this.prev = null;
        }
      }, CROSSFADE_S * 1000 + 60);
    }
  }

  stop() {
    this.wantedTrack = null;
    if (this.active) { try { this.active.stop(); } catch { /* ignore */ } this.active = null; }
    if (this.prev) { try { this.prev.stop(); } catch { /* ignore */ } this.prev = null; }
    if (ctx && musicBusA && musicBusB) {
      const t = ctx.currentTime;
      try {
        musicBusA.gain.cancelScheduledValues(t); musicBusA.gain.setValueAtTime(0, t);
        musicBusB.gain.cancelScheduledValues(t); musicBusB.gain.setValueAtTime(0, t);
      } catch { /* ignore */ }
    }
  }

  teardownAll() {
    if (this.active) { try { this.active.stop(); } catch { /* ignore */ } this.active = null; }
    if (this.prev) { try { this.prev.stop(); } catch { /* ignore */ } this.prev = null; }
  }

  setIntensity(step: number) {
    this.wantedIntensity = Math.max(0, Math.min(3, step | 0));
    this.active?.setIntensity(this.wantedIntensity);
  }

  duck(ms = 220) { this.active?.duck(ms); this.prev?.duck(ms); }

  wants() { return this.wantedTrack !== null; }
}

const router = new MusicRouter();

// ============================================================================

function revive() {
  if (!isRunning()) return;
  if (engineRunning && !engineOsc) buildEngineNodes();
  if (router.wants() && !muted && !musicMuted) router.attach();
  tryPlayMediaEl();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (engineOsc) {
        try { engineOsc.stop(); } catch { /* ignore */ }
        try { engineOsc.disconnect(); } catch { /* ignore */ }
        engineOsc = null;
      }
      if (engineGain) { try { engineGain.disconnect(); } catch { /* ignore */ } engineGain = null; }
      if (engineFilter) { try { engineFilter.disconnect(); } catch { /* ignore */ } engineFilter = null; }
      router.teardownAll();
    } else {
      sound.ensureRunning();
      revive();
      tryPlayMediaEl();
    }
  });
}

export const sound = {
  get muted() { return muted; },
  get musicMuted() { return musicMuted; },
  get sfxMuted() { return sfxMuted; },
  isReady() { return ctx !== null; },

  init() {
    if (!ctx) buildContext();
    ensureMediaElement();
    this.ensureRunning();
    tryPlayMediaEl();
  },

  ensureRunning() {
    rebuildIfClosed();
    if (!ctx) return;
    if ((ctx.state as string) === 'running') {
      revive();
      tryPlayMediaEl();
      return;
    }
    try {
      const p = ctx.resume();
      if (p && typeof p.then === 'function') {
        p.then(() => { revive(); tryPlayMediaEl(); }).catch(() => {
          try { ctx?.close(); } catch { /* ignore */ }
          ctx = null; masterGain = null;
        });
      }
    } catch {
      try { ctx?.close(); } catch { /* ignore */ }
      ctx = null; masterGain = null;
    }
  },

  setMuted(v: boolean) {
    muted = v;
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    if (masterGain && ctx) {
      try { masterGain.gain.setTargetAtTime(v ? 0 : MASTER_LEVEL, ctx.currentTime, 0.02); } catch { /* ignore */ }
    }
  },

  toggleMute(): boolean {
    this.setMuted(!muted);
    if (muted) router.teardownAll();
    else if (router.wants() && !musicMuted) router.attach();
    return muted;
  },

  setMusicMuted(v: boolean) {
    musicMuted = v;
    try { localStorage.setItem(MUSIC_MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    if (musicBus && ctx) {
      try { musicBus.gain.setTargetAtTime(v ? 0 : MUSIC_LEVEL, ctx.currentTime, 0.02); } catch { /* ignore */ }
    }
    if (v) router.teardownAll();
    else if (router.wants()) router.attach();
  },
  toggleMusicMuted(): boolean { this.setMusicMuted(!musicMuted); return musicMuted; },

  setSfxMuted(v: boolean) {
    sfxMuted = v;
    try { localStorage.setItem(SFX_MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
    if (sfxBus && ctx) {
      try { sfxBus.gain.setTargetAtTime(v ? 0 : SFX_LEVEL, ctx.currentTime, 0.02); } catch { /* ignore */ }
    }
  },
  toggleSfxMuted(): boolean { this.setSfxMuted(!sfxMuted); return sfxMuted; },

  startEngine() {
    engineRunning = true;
    if (isRunning()) buildEngineNodes();
  },

  updateEngine(speed01: number) {
    if (!isRunning() || !engineOsc || !engineGain || !engineFilter) return;
    try {
      const t = ctx!.currentTime;
      engineOsc.frequency.setTargetAtTime(60 + speed01 * 220, t, 0.05);
      engineFilter.frequency.setTargetAtTime(300 + speed01 * 1400, t, 0.05);
      engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.11, t, 0.05);
    } catch { /* ignore */ }
  },

  stopEngine() {
    engineRunning = false;
    if (engineOsc) {
      try { engineOsc.stop(); } catch { /* ignore */ }
      try { engineOsc.disconnect(); } catch { /* ignore */ }
      engineOsc = null;
    }
    if (engineGain) { try { engineGain.disconnect(); } catch { /* ignore */ } engineGain = null; }
    if (engineFilter) { try { engineFilter.disconnect(); } catch { /* ignore */ } engineFilter = null; }
  },

  // ---- SFX ----
  setSfxPitchStep(step: number) {
    // Each step = 1 semitone; capped so pitch never goes wild.
    sfxPitchSemi = Math.max(0, Math.min(6, step));
  },

  starPickup() { playArpP([880, 1175, 1568], 0.07, 'triangle', 0.12); },
  checkpoint() { playArpP([660, 990], 0.09, 'sine', 0.14); },
  stopDing() { playToneP(1320, 0.18, 'sine', 0.15); },
  collision() {
    playThud();
    router.duck(220);
    try { navigator.vibrate?.(60); } catch { /* ignore */ }
  },
  nearMissHorn() { playToneP(340, 0.16, 'square', 0.10); },
  nearMissWhoosh() {
    if (!isRunning() || !sfxBus) return;
    try {
      const t = ctx!.currentTime;
      const dur = 0.22;
      const buf = ctx!.createBuffer(1, Math.floor(ctx!.sampleRate * dur), ctx!.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx!.createBufferSource();
      src.buffer = buf;
      const bp = ctx!.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 4;
      const g = ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(sfxBus);
      src.start(t); src.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  },
  dogBark() {
    playTone(720, 0.06, 'square', 0.09);
    setTimeout(() => playTone(880, 0.06, 'square', 0.09), 90);
  },
  ownerShout() {
    if (!isRunning() || !sfxBus) return;
    try {
      const t = ctx!.currentTime;
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(220, t + 0.22);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g).connect(sfxBus);
      o.start(t); o.stop(t + 0.26);
    } catch { /* ignore */ }
  },
  yieldBuzz() {
    playTone(180, 0.09, 'sawtooth', 0.10);
    setTimeout(() => playTone(150, 0.09, 'sawtooth', 0.10), 90);
  },
  catastrophe() {
    playThud();
    router.duck(500);
    if (!isRunning() || !sfxBus) return;
    try {
      const t = ctx!.currentTime;
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.6);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      o.connect(g).connect(sfxBus);
      o.start(t); o.stop(t + 0.7);
    } catch { /* ignore */ }
  },
  threeStarJingle() {
    playArp([784, 988, 1319, 1568, 1976], 0.09, 'triangle', 0.16);
  },
  fanfare() { playArp([523, 659, 784, 1047, 1319], 0.11, 'triangle', 0.18); },
  /** Score went up a tier: bright rising run. */
  tierUp() { playArp([523, 659, 784, 1047], 0.06, 'triangle', 0.14); },
  /** Small points lost, streak dropped a tier: two falling notes. */
  tierDown() { playArp([494, 392, 311], 0.08, 'sawtooth', 0.08); },
  /** A strike: a low falling sweep with a thud, you can hear the points leave. */
  strikeHit() {
    playThud();
    if (!isRunning() || !sfxBus) return;
    try {
      const t = ctx!.currentTime;
      const o = ctx!.createOscillator(); const g = ctx!.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.5);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(sfxBus);
      o.start(t); o.stop(t + 0.6);
    } catch { /* ignore */ }
  },
  uiTick() { playTone(880, 0.04, 'square', 0.05); },

  /** Star Magnet pickup: rising sparkly whoosh. */
  magnetPickup() {
    playArp([784, 988, 1319, 1568], 0.06, 'triangle', 0.12);
    setTimeout(() => playArp([1568, 1976, 2637], 0.06, 'sine', 0.10), 240);
  },
  /** Shield pickup: warm ascending chime. */
  shieldPickup() {
    playArp([523, 784, 1047, 1568], 0.08, 'sine', 0.14);
  },
  /** Shield absorbing a hit: soft glassy shatter. */
  shieldBreak() {
    playTone(1760, 0.12, 'triangle', 0.12);
    setTimeout(() => playTone(1320, 0.14, 'sine', 0.10), 60);
  },
  /** Personal-best fanfare sweep. */
  personalBest() {
    playArp([523, 659, 784, 1047, 1319, 1568, 1976, 2637], 0.06, 'triangle', 0.16);
  },

  tireScreech(intensity01 = 0.7) {
    if (!isRunning() || !sfxBus) return;
    const now = performance.now();
    if (now - lastScreechAt < 180) return;
    lastScreechAt = now;
    try {
      const t = ctx!.currentTime;
      const dur = 0.28;
      const buf = ctx!.createBuffer(1, Math.floor(ctx!.sampleRate * dur), ctx!.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx!.createBufferSource();
      src.buffer = buf;
      const bp = ctx!.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1600;
      bp.Q.value = 8;
      const g = ctx!.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.13 * intensity01, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(sfxBus);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  },

  // ---- Music routing API ----
  /** Play a named track with 1.5s crossfade. */
  playTrack(id: TrackId) { router.playTrack(id); },
  /** Legacy mood API — maps mood → track. */
  startMusic(mood: MusicMood = 'tense') { router.playTrack(MOOD_TO_TRACK[mood] ?? 'sunnyCruise'); },
  stopMusic() { router.stop(); },
  setMusicMood(mood: MusicMood) { router.playTrack(MOOD_TO_TRACK[mood] ?? 'sunnyCruise'); },
  /** Legacy combo intensity — kept as a no-op-ish shim (SFX pitch now handles combo feel). */
  setMusicIntensity(_combo: number) { /* no-op */ },
  /** Set adaptive endless intensity (0..3). */
  setEndlessIntensity(step: number) { router.setIntensity(step); },
  setMusicFinalPush(_v: boolean) { /* absorbed by track routing */ },
  duckMusic(ms = 220) { router.duck(ms); },

  onTrackChange(fn: TrackChangeListener) { return router.onChange(fn); },
  currentTrackId(): TrackId | null { return router.wantedTrack; },
};

// SFX helpers ----------------------------------------------------------------
function pitchMul() { return Math.pow(2, sfxPitchSemi / 12); }

function playToneP(freq: number, dur: number, type: OscillatorType, vol: number) {
  playTone(freq * pitchMul(), dur, type, vol);
}
function playArpP(freqs: number[], step: number, type: OscillatorType, vol: number) {
  const m = pitchMul();
  playArp(freqs.map((f) => f * m), step, type, vol);
}

function playTone(freq: number, dur: number, type: OscillatorType, vol: number) {
  if (!isRunning() || !sfxBus) return;
  try {
    const t = ctx!.currentTime;
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* ignore */ }
}

function playArp(freqs: number[], step: number, type: OscillatorType, vol: number) {
  freqs.forEach((f, i) => {
    setTimeout(() => playTone(f, step * 1.6, type, vol), i * step * 1000);
  });
}

function playThud() {
  if (!isRunning() || !sfxBus) return;
  try {
    const t = ctx!.currentTime;
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + 0.3);

    const buf = ctx!.createBuffer(1, ctx!.sampleRate * 0.15, ctx!.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const n = ctx!.createBufferSource();
    n.buffer = buf;
    const ng = ctx!.createGain();
    ng.gain.value = 0.14;
    n.connect(ng).connect(sfxBus);
    n.start(t);
  } catch { /* ignore */ }
}

/** Pick a chapter-appropriate music track for a given level. */
export function pickTrackForLevel(level: { id: string; nightAlpha?: number; endless?: boolean }): TrackId {
  if (level.endless) return 'rushHour';
  if (level.id === 'road-test-final' || level.id === 'everything-at-once') return 'rushHour';
  if (level.nightAlpha && level.nightAlpha > 0.15) return 'nightDrive';
  return 'sunnyCruise';
}

/** Legacy — retained for any external callers; now defers to the track picker. */
export function pickMoodForLevel(level: { id: string; nightAlpha?: number; endless?: boolean; weatherTint?: unknown }): MusicMood {
  const t = pickTrackForLevel(level);
  if (t === 'nightDrive') return 'ethereal';
  if (t === 'rushHour') return 'dark';
  return 'calm';
}
