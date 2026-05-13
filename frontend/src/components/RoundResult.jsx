import AdSlot from './AdSlot';

export default function RoundResult({ result, currentRound, totalRounds, totalScore, onNext }) {
  const { actualCity, actualCountry, roundScore, guesses } = result;
  const isLastRound = currentRound >= totalRounds;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.location}>
          <span style={styles.pin}>📍</span>
          <span style={styles.locationText}>{actualCity}, {actualCountry}</span>
        </div>

        <div style={styles.scoreRow}>
          <div style={styles.scoreBig}>{roundScore.toLocaleString()}</div>
          <div style={styles.scoreLabel}>points this round</div>
        </div>

        <div style={styles.guesses}>
          {guesses.map((g, i) => (
            <div key={i} style={styles.guessRow}>
              <span style={styles.guessNum}>Guess {g.guessNumber}</span>
              <span style={{ ...styles.guessDist, color: distanceColor(g.distanceMiles) }}>
                {g.distanceMiles.toLocaleString()} mi
              </span>
            </div>
          ))}
        </div>

        <div style={styles.totalRow}>
          Total: <strong style={{ color: 'var(--primary)' }}>{totalScore.toLocaleString()}</strong> pts
        </div>

        <AdSlot slot="1234567890" width={320} height={100} style={{ margin: '0 auto 20px' }} />

        <button
          className="btn-primary"
          style={styles.btn}
          onClick={onNext}
        >
          {isLastRound ? 'See Final Results' : `Next Round (${currentRound + 1}/${totalRounds})`}
        </button>
      </div>
    </div>
  );
}

function distanceColor(miles) {
  if (miles < 100)  return '#22c55e';
  if (miles < 500)  return '#84cc16';
  if (miles < 1500) return '#f59e0b';
  if (miles < 4000) return '#f97316';
  return '#ef4444';
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: '#0008',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    backdropFilter: 'blur(4px)',
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: '32px 40px',
    minWidth: 320,
    maxWidth: 420,
    textAlign: 'center',
    boxShadow: '0 24px 64px #000a',
  },
  location: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  pin: { fontSize: 24 },
  locationText: { fontSize: 22, fontWeight: 700 },
  scoreRow: { marginBottom: 24 },
  scoreBig: { fontSize: 52, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 },
  scoreLabel: { fontSize: 13, color: 'var(--muted)', marginTop: 4 },
  guesses: {
    background: 'var(--surface2)',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  guessRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  guessNum: { color: 'var(--muted)', fontSize: 13 },
  guessDist: { fontWeight: 600, fontSize: 15 },
  totalRow: {
    color: 'var(--muted)',
    fontSize: 14,
    marginBottom: 24,
  },
  btn: {
    width: '100%',
    padding: '14px 20px',
    fontSize: 15,
  },
};
