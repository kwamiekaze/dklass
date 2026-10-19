import { useEffect, useRef } from 'react';
import { LEVELS } from '../game/levels';
import { DIFFICULTIES } from '../game/types';
import type { LevelResult } from '../game/types';
import type { RunAftermath } from '../runComplete';
import { ShareScoreButton } from './ShareScoreButton';
import { sound } from '../sound';

interface Props {
  result: LevelResult;
  aftermath?: RunAftermath | null;
  onRetry: () => void;
  onNext: (nextLevelId: string) => void;
  onMenu: () => void;
}

export function ReportCard({ result, aftermath, onRetry, onNext, onMenu }: Props) {
  const idx = LEVELS.findIndex((l) => l.id === result.levelId);
  const next = idx >= 0 && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
  const diff = DIFFICULTIES.find((d) => d.id === result.difficulty);
  const confettiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!result.isNewBest || !confettiRef.current) return;
    const el = confettiRef.current;
    for (let i = 0; i < 40; i++) {
      const bit = document.createElement('span');
      bit.className = 'confetti-bit';
      bit.style.left = Math.random() * 100 + '%';
      bit.style.animationDelay = (Math.random() * 0.4) + 's';
      bit.style.background = i % 3 === 0 ? '#ffe89a' : '#f2c14e';
      el.appendChild(bit);
    }
    return () => { el.innerHTML = ''; };
  }, [result.isNewBest]);

  useEffect(() => {
    if (aftermath?.xp.leveledUp) { try { sound.fanfare(); } catch { /* ignore */ } }
  }, [aftermath?.xp.leveledUp]);

  return (
    <div className="screen report-screen">
      {result.isNewBest && (
        <>
          <div className="confetti-layer" ref={confettiRef} aria-hidden="true" />
          <div className="pb-banner">🏆 NEW PERSONAL BEST</div>
        </>
      )}

      <div className="report-card">
        <header className="report-head">
          <div>
            <div className="report-eyebrow">DrivingKlass · Instructor Report Card</div>
            <h2>{result.levelName}</h2>
            {diff && <div className="report-eyebrow" style={{ marginTop: 4 }}>{diff.label} · ×{diff.scoreMul} multiplier</div>}
          </div>
          <div className={`grade-stamp ${result.passed ? 'grade-pass' : 'grade-fail'}`} aria-label={`Grade ${result.grade}`}>
            {result.grade}
          </div>
        </header>

        <div className="report-score">
          <span>Final score</span>
          <strong>{result.score}</strong>
        </div>

        {result.gained !== undefined && (
          <div className="report-ledger" aria-label="Points earned and lost">
            <div className="up"><small>EARNED</small><b>+{Math.round(result.gained).toLocaleString()}</b></div>
            <div className="down"><small>LOST</small><b>-{Math.round(result.lost ?? 0).toLocaleString()}</b></div>
            <div className="rec">
              <small>SAFETY RECORD</small>
              <span className="shields">{[0, 1, 2].map((i) => <i key={i} className={i >= 3 - (result.strikes ?? 0) ? 'gone' : ''} />)}</span>
            </div>
            <div className="streak"><small>BEST STREAK</small><b>×{result.maxCombo ?? 1}</b></div>
          </div>
        )}

        <table className="report-table">
          <tbody>
            {result.events.map((e) => (
              <tr key={e.label} className={e.points < 0 ? 'row-fault' : ''}>
                <td>{e.label}{e.count > 1 ? ` ×${e.count}` : ''}</td>
                <td className="pts">{e.points > 0 ? '+' : ''}{e.points}</td>
              </tr>
            ))}
            {diff && diff.scoreMul > 1 && (
              <tr>
                <td>{diff.label} difficulty multiplier</td>
                <td className="pts">×{diff.scoreMul}</td>
              </tr>
            )}
            {result.distance !== undefined && (
              <tr>
                <td>Distance driven</td>
                <td className="pts">{result.distance}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="report-feedback">
          <h3>Instructor notes</h3>
          <ul>
            {result.feedback.map((f) => <li key={f}>{f}</li>)}
            {result.isNewBest && result.previousBest != null && (
              <li><strong>New personal best!</strong> Previous: {result.previousBest.toLocaleString()}</li>
            )}
          </ul>
        </div>

        {aftermath && (
          <div className="aftermath">
            <div className="aftermath-xp">
              <span>+{aftermath.xp.gained.toLocaleString()} XP</span>
              {aftermath.xp.leveledUp && aftermath.xp.newRank && (
                <span className="rank-up">🎉 RANK UP · {aftermath.xp.newRank.icon} {aftermath.xp.newRank.label}</span>
              )}
            </div>
            {aftermath.unlocked.length > 0 && (
              <div className="aftermath-badges">
                <strong>🏅 New badges:</strong>
                <ul>{aftermath.unlocked.map((a) => <li key={a.id}>{a.icon} {a.label}</li>)}</ul>
              </div>
            )}
            {aftermath.completedMissions.length > 0 && (
              <div className="aftermath-missions">
                <strong>📋 Missions complete:</strong>
                <ul>{aftermath.completedMissions.map((m) => <li key={m.id}>{m.label} · +{m.xp} XP</li>)}</ul>
              </div>
            )}
            {aftermath.isDailyChallenge && (
              <div className={`aftermath-daily${aftermath.dailyBeat ? ' beat' : ''}`}>
                {aftermath.dailyBeat ? '🏆 Daily par beaten!' : 'Daily Challenge attempted — try again tomorrow for a streak.'}
              </div>
            )}
          </div>
        )}

        <div className="btn-row">
          <button className="dk-btn dk-btn-outline" onClick={onRetry}>Retry Lesson</button>
          {next && result.passed && !next.endless ? (
            <button className="dk-btn dk-btn-gold" onClick={() => onNext(next.id)}>Next: {next.name}</button>
          ) : (
            <button className="dk-btn dk-btn-gold" onClick={onMenu}>Back to Menu</button>
          )}
        </div>

        <ShareScoreButton result={result} />

        <div className="book-block">
          <p className="book-kicker">{result.passed ? 'You drive like a five star.' : 'Great practice run.'}</p>
          <h3>Now drive the real thing.</h3>
          <p className="book-sub">Private, one on one coaching in a spotless ride, built around you.</p>
          <div className="book-btns">
            <a className="dk-btn dk-btn-gold book-primary" href="https://drivingklass.com" target="_blank" rel="noopener noreferrer">Book your lesson</a>
            <a className="dk-btn dk-btn-outline book-call" href="tel:+14044045820">Call 404-404-5820</a>
          </div>
        </div>
      </div>
    </div>
  );
}
