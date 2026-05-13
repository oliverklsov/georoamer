import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, loadUser } from '../api';

export default function Results() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [leaderboard, setLeaderboard] = useState([]);
  const user = loadUser();
  const alreadyPlayed = params.get('played') === 'true';

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    api.getLeaderboard().then(setLeaderboard).catch(() => {});
  }, [navigate, user]);

  const myEntry = leaderboard.find(r => r.username === user?.username);

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
  myScore: { marginBottom: 24 },
  scoreBig: { fontSize: 64, fontWeight: 900, color: 'var(--primary)', lineHeight: 1 },
  scoreLabel: { fontSize: 14, color: 'var(--muted)', marginTop: 4 },
  comeback: { color: 'var(--muted)', fontSize: 14, marginBottom: 24 },
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
