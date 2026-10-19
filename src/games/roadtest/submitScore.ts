import { supabase } from '@/integrations/supabase/client';
import type { LevelResult } from './game/types';

export interface SubmitScoreOutcome {
  isNewBest: boolean;
  previousBest: number | null;
  isGuest: boolean;
  needsUsername?: boolean;
  currentStreak?: number;
  bestStreak?: number;
}

async function resolveDisplayName(userId: string): Promise<{ name: string; hasUsername: boolean; email: string | null }> {
  let name: string | null = null;
  let hasUsername = false;
  let email: string | null = null;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, full_name, email, game_username')
      .eq('id', userId)
      .maybeSingle();
    if (profile) {
      email = profile.email ?? null;
      if (profile.game_username) { name = profile.game_username; hasUsername = true; }
      else {
        const composed = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
        name = composed || profile.full_name?.trim() || (profile.email ? profile.email.split('@')[0] : null);
      }
    }
  } catch { /* ignore */ }
  return { name: name || (email ? email.split('@')[0] : 'Driver'), hasUsername, email };
}

/** Upsert personal best + insert every play + update streak (for signed-in users). */
export async function submitScore(result: LevelResult): Promise<SubmitScoreOutcome> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return { isNewBest: false, previousBest: null, isGuest: true };

  const { name: displayName, hasUsername } = await resolveDisplayName(user.id);
  const stars = Math.max(0, Math.min(5, Math.round((result.score / Math.max(1, result.parScore || 1000)) * 5)));

  // Every play row
  try {
    await supabase.from('game_plays').insert({
      user_id: user.id,
      level_id: result.levelId,
      difficulty: result.difficulty,
      score: result.score,
      grade: result.grade,
      stars,
      distance: result.distance ?? null,
    });
  } catch (e) { console.error('game_plays insert', e); }

  // Streak
  let currentStreak: number | undefined;
  let bestStreak: number | undefined;
  try {
    const { data: streakRow } = await supabase.rpc('record_game_streak');
    const row = Array.isArray(streakRow) ? streakRow[0] : streakRow;
    if (row) { currentStreak = row.current_streak; bestStreak = row.best_streak; }
  } catch (e) { console.error('streak', e); }

  // Personal best upsert
  const { data: existing } = await supabase
    .from('game_scores')
    .select('score')
    .eq('user_id', user.id)
    .eq('level_id', result.levelId)
    .eq('difficulty', result.difficulty)
    .maybeSingle();

  const previousBest = existing?.score ?? null;
  const isNewBest = !existing || existing.score < result.score;
  if (isNewBest) {
    await supabase.from('game_scores').upsert(
      {
        user_id: user.id,
        display_name: displayName,
        level_id: result.levelId,
        difficulty: result.difficulty,
        score: result.score,
        grade: result.grade,
        distance: result.distance ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,level_id,difficulty' }
    );
  }

  return { isNewBest, previousBest, isGuest: false, needsUsername: !hasUsername, currentStreak, bestStreak };
}
