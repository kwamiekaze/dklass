/**
 * Carrollton Rush: the wire. A room is one Supabase Realtime broadcast channel named after its 4 letter code,
 * so nobody needs an account: open the link, type a name, drive. (In development `?mplocal=1` swaps in a
 * BroadcastChannel so two tabs on one machine can race without the network.)
 *
 * Client-trust, like Star Rush: every phone runs its own rules engine and reports its own time and faults.
 * Fine for racing friends; nothing here is a ranked leaderboard.
 */
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GarageId } from '../../g3d/garage';
import type { Difficulty } from '../../game/types';

export interface RushPlayer { id: string; name: string; car: GarageId; joinedAt: number }
export interface RushSettings { trips: number; difficulty: Difficulty }

export type RushMsg =
  | { t: 'hello'; p: RushPlayer; lobby: boolean }
  | { t: 'bye'; id: string }
  | { t: 'cfg'; s: RushSettings }
  | { t: 'start'; seed: number; startAt: number; s: RushSettings; roster: RushPlayer[] }
  | { t: 'st'; id: string; x: number; z: number; h: number; v: number; sig: number; trip: number; pen: number; faults: number; strikes: number; score: number; done: number; out: string }
  | { t: 'ev'; id: string; text: string; tone: 'good' | 'bad' | 'info' }
  | { t: 'ready'; id: string }
  | { t: 'go'; inMs: number }
  | { t: 'lobby' };

export interface Wire { send(m: RushMsg): void; close(): void }

const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(): string { let s = ''; for (let i = 0; i < 4; i++) s += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]; return s; }
export function cleanCode(v: string): string { return v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IO01L]/g, '').slice(0, 4); }
export function cleanName(v: string): string { return v.replace(/[<>"'`\n\r\t]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14).trim(); }

const local = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mplocal') === '1';

/** join the room's channel; `onMsg` gets every message from the others (never our own) */
export function openWire(code: string, me: string, onMsg: (m: RushMsg) => void, onState?: (s: 'live' | 'down') => void): Wire {
  if (local() && typeof BroadcastChannel !== 'undefined') {
    const bc = new BroadcastChannel(`crush-${code}`);
    bc.onmessage = (e) => { const m = e.data as RushMsg & { _from?: string }; if (m && m._from !== me) onMsg(m); };
    setTimeout(() => onState?.('live'), 30);
    return { send: (m) => bc.postMessage({ ...m, _from: me }), close: () => bc.close() };
  }
  const ch: RealtimeChannel = supabase.channel(`crush:${code}`, { config: { broadcast: { self: false, ack: false } } });
  ch.on('broadcast', { event: 'm' }, (p) => { const m = p.payload as RushMsg; if (m) onMsg(m); });
  let live = false;
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') { live = true; onState?.('live'); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { if (live || status !== 'CLOSED') onState?.('down'); live = false; }
  });
  return {
    send: (m) => { if (live) void ch.send({ type: 'broadcast', event: 'm', payload: m }); },
    close: () => { void supabase.removeChannel(ch); },
  };
}

/** a stable id for this browser tab's player */
export function myId(): string {
  try {
    const k = 'dk-rush-id'; let v = sessionStorage.getItem(k);
    if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); sessionStorage.setItem(k, v); }
    return v;
  } catch { return Math.random().toString(36).slice(2, 12); }
}
export function savedName(): string { try { return localStorage.getItem('dk-rush-name') ?? ''; } catch { return ''; } }
export function saveName(n: string) { try { localStorage.setItem('dk-rush-name', n); } catch { /* ignore */ } }

/** the room link to share */
export function roomLink(code: string): string {
  const base = typeof window !== 'undefined' ? `${window.location.origin}/play` : 'https://drivingklass.com/play';
  return `${base}?room=${code}`;
}
