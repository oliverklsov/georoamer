export default function MusicPlayer({ previewUrl, song }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.clueRow}>
        <span style={styles.clueBadge}>🎵 Music Clue</span>
        <span style={styles.clueHint}>This song is linked to today's location</span>
      </div>
      <div style={styles.header}>
        <span style={styles.label}>
          {song ? `${song.title} — ${song.artist}` : 'Local track'}
        </span>
      </div>
      <audio
        controls
        autoPlay
        src={previewUrl}
        style={styles.audio}
      />
    </div>
  );
}

const styles = {
  wrap: {
    position: 'absolute',
    top: 56,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 320,
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
    gap: 8,
    padding: '8px 12px 4px',
    borderBottom: '1px solid var(--border)',
  },
  clueBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  clueHint: {
    fontSize: 10,
    color: 'var(--muted)',
    fontStyle: 'italic',
  },
  header: {
    padding: '6px 12px 4px',
  },
  label: {
    fontSize: 12,
    color: 'var(--text)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  audio: {
    display: 'block',
    width: '100%',
    padding: '0 12px 10px',
    boxSizing: 'border-box',
  },
};
