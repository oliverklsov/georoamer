import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, loadUser } from '../api';

const SHARE_TIERS = [
  { min: 4500, emoji: '🟩' },
  { min: 3500, emoji: '🟨' },
  { min: 2000, emoji: '🟧' },
  { min: 500,  emoji: '🟥' },
  { min: 0,    emoji: '⬜' },
];

function scoreEmoji(score) {
  return SHARE_TIERS.find(t => score >= t.min).emoji;
}

function buildShareText({ date, rounds, totalScore, streak }) {
  const grid = rounds
    .slice()
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map(r => scoreEmoji(r.roundScore ?? 0))
    .join('');
  const streakLine = streak > 1 ? ` · 🔥 ${streak}-day streak` : '';
  return `GeoRoamer ${date}\n${grid}\n${totalScore.toLocaleString()} pts${streakLine}`;
}

export default function Results() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [leaderboard, setLeaderboard] = useState([]);
  const [me, setMe] = useState(null);
  const [copied, setCopied] = useState(false);
  const user = loadUser();
  const alreadyPlayed = params.get('played') === 'true';

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    api.getLeaderboard().then(setLeaderboard).catch(() => {});
    api.me().then(setMe).catch(() => {});
  }, [navigate, user]);

  const myEntry = leaderboard.find(r => r.username === user?.username);
  const canShare = me?.today?.completed && me.today.rounds?.length > 0;

  async function handleShare() {
    if (!canShare) return;
    const text = buildShareText({
      date: me.today.date,
      rounds: me.today.rounds,
      totalScore: me.today.totalScore,
      streak: me.streak,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select-and-prompt if clipboard API unavailable
      window.prompt('Copy your result:', text);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.icon}>{alreadyPlayed ? '🔒' : '🎉'}</div>
        <h1 style={styles.title}>
          {alreadyPlayed ? 'Already played today!' : 'Challenge Complete!'}
        </h1>
        {myEntry && (
          <div style={styles.myScore}>
            <div style={styles.scoreBig}>{myEntry.totalScore.toLocaleString()}</div>
            <div style={styles.scoreLabel}>your score · rank #{myEntry.rank}</div>
          </div>
        )}

        {me && me.streak > 0 && (
          <div style={styles.streak}>
            <span style={styles.streakFlame}>🔥</span>
            <span style={styles.streakNum}>{me.streak}</span>
            <span style={styles.streakLabel}>day streak</span>
          </div>
        )}

        {canShare && (
          <>
            <div style={styles.gridPreview}>
              {me.today.rounds
                .slice()
                .sort((a, b) => a.roundNumber - b.roundNumber)
                .map(r => (
                  <span key={r.roundNumber} style={styles.gridCell}>
                    {scoreEmoji(r.roundScore ?? 0)}
                  </span>
                ))}
            </div>
            <button
              className="btn-primary"
              style={{ width: '100%', padding: 14, marginBottom: 12 }}
              onClick={handleShare}
            >
              {copied ? '✓ Copied to clipboard!' : '📋 Share result'}
            </button>
          </>
        )}

        <p style={styles.comeback}>Come back tomorrow for a new set of locations.</p>
        <button className="btn-secondary" style={{ width: '100%', padding: 14 }} onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>

      {leaderboard.length > 0 && (
        <div style={styles.lbWrap}>
          <h2 style={styles.lbTitle}>Today's Leaderboard</h2>
          <div style={styles.lbList}>
            {leaderboard.map(row => (
              <div
                key={row.rank}
                style={{
                  ...styles.lbRow,
                  background: row.username === user?.username ? 'var(--surface2)' : 'transparent',
                }}
              >
                <span style={styles.lbRank}>#{row.rank}</span>
                <span style={styles.lbName}>
                  {row.username}
                  {row.username === user?.username && <span style={styles.you}> you</span>}
                </span>
                <span style={styles.lbScore}>{row.totalScore.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    padding: 32,
    overflowY: 'auto',
    flexWrap: 'wrap',
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '40px 48px',
    textAlign: 'center',
    width: 360,
  },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: 800, marginBottom: 24 },
  myScore: { marginBottom: 16 },
  scoreBig: { fontSize: 64, fontWeight: 900, color: 'var(--primary)', lineHeight: 1 },
  scoreLabel: { fontSize: 14, color: 'var(--muted)', marginTop: 4 },
  streak: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '8px 14px',
    marginBottom: 20,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 999,
  },
  streakFlame: { fontSize: 18 },
  streakNum: { fontSize: 20, fontWeight: 800, color: 'var(--primary)' },
  streakLabel: { fontSize: 13, color: 'var(--muted)' },
  gridPreview: {
    display: 'flex',
    justifyContent: 'center',
    gap: 4,
    fontSize: 28,
    marginBottom: 12,
    letterSpacing: 2,
  },
  gridCell: { lineHeight: 1 },
  comeback: { color: 'var(--muted)', fontSize: 14, marginBottom: 24, marginTop: 8 },
  lbWrap: { width: 300 },
  lbTitle: { fontSize: 16, fontWeight: 700, color: 'var(--muted)', marginBottom: 12 },
  lbList: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  lbRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    gap: 12,
  },
  lbRank: { color: 'var(--muted)', width: 28, fontSize: 13 },
  lbName: { flex: 1, fontSize: 15, fontWeight: 500 },
  you: { fontSize: 11, color: 'var(--primary)', fontWeight: 700 },
  lbScore: { fontWeight: 700, color: 'var(--primary)', fontSize: 15 },
};
