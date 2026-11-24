/*
 * The season switch for the home page.
 *   drivingklass.com/xmas   always shows the Christmas estate (the preview link).
 *   drivingklass.com/       shows HOME_SEASON: 'main' (the everyday homepage) or 'xmas'.
 * To put the Christmas look on the homepage, set HOME_SEASON to 'xmas'. To take the decorations down, set it back to 'main'.
 * The rest of the site reads XMAS / seasonFor() and never needs another edit.
 */
export type Season = 'main' | 'xmas';
export const HOME_SEASON: Season = 'main';

export function seasonFor(path: string): Season {
  return /^\/xmas\/?$/i.test(path) ? 'xmas' : HOME_SEASON;
}

/** The season of this visit, fixed when the 3D world first loads (the world is built once per visit). */
export const SEASON: Season = typeof location === 'undefined' ? HOME_SEASON : seasonFor(location.pathname);
export const XMAS = SEASON === 'xmas';
