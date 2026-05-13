export default function MovieCard({ movie }) {
  if (!movie?.title) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.clueRow}>
        <span style={styles.clueBadge}>🎬 Country Clue</span>
        <span style={styles.decadeTag}>{movie.decade}s</span>
      </div>
      <div style={styles.clueHint}>Produced in today's country</div>
      <div style={styles.body}>
        {movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={movie.title}
            style={styles.poster}
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div style={styles.posterFallback}>🎬</div>
        )}
        <div style={styles.info}>
          <div style={styles.title}>{movie.title}</div>
          <div style={styles.year}>{movie.year}</div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'absolute',
    top: 56,
    right: 12,
    width: 180,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    zIndex: 30,
    boxShadow: '0 8px 32px #0009',
    overflow: 'hidden',
  },
  clueRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px 4px',
    borderBottom: '1px solid var(--border)',
  },
  clueBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  decadeTag: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--muted)',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '2px 6px',
  },
  clueHint: {
    fontSize: 10,
    color: 'var(--muted)',
    fontStyle: 'italic',
    padding: '4px 10px 6px',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0 0 10px',
  },
  poster: {
    width: '100%',
    height: 240,
    objectFit: 'cover',
    display: 'block',
    background: 'var(--border)',
  },
  posterFallback: {
    width: '100%',
    height: 240,
    background: 'var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 48,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '8px 10px 0',
    minWidth: 0,
  },
  title: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text)',
    lineHeight: 1.3,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  year: {
    fontSize: 11,
    color: 'var(--muted)',
    fontWeight: 500,
  },
};
