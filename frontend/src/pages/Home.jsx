import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, saveUser, loadUser } from '../api';
import PinInput from '../components/PinInput';
import 'mapillary-js/dist/mapillary.css';

const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN || '';

const BG_LOCATIONS = [
  { imageId: '24138118092452070', city: 'Rome',     country: 'Italy'   },
  { imageId: '1037252150317897',  city: 'London',   country: 'UK'      },
  { imageId: '602522840771061',   city: 'Helsinki', country: 'Finland' },
  { imageId: '2883691608569002',  city: 'Toronto',  country: 'Canada'  },
  { imageId: '1438655596699004',  city: 'Brussels', country: 'Belgium' },
  { imageId: '132639088904693',   city: 'Chicago',  country: 'USA'     },
];

export default function Home() {
  const [username, setUsername]       = useState('');
  const [pin, setPin]                 = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [usernameTaken, setUsernameTaken] = useState(null);
  const [bgIdx, setBgIdx]             = useState(0);
  const [locLabel, setLocLabel]       = useState(BG_LOCATIONS[0]);
  const [labelVisible, setLabelVisible] = useState(true);

  const containerRef  = useRef(null);
  const viewerRef     = useRef(null);
  const debounceRef   = useRef(null);
  const firstCycle    = useRef(true);
  const navigate      = useNavigate();

  // Mount background viewer
  useEffect(() => {
    if (!containerRef.current || !MAPILLARY_TOKEN) return;
    import('mapillary-js').then(({ Viewer }) => {
      if (!containerRef.current || viewerRef.current) return;
      viewerRef.current = new Viewer({
        accessToken: MAPILLARY_TOKEN,
        container: containerRef.current,
        imageId: BG_LOCATIONS[0].imageId,
        component: { cover: false, sequence: false, pointer: false, zoom: false, bearing: false },
      });
    });
    return () => { viewerRef.current?.remove(); viewerRef.current = null; };
  }, []);

  // Cycle locations every 10 s
  useEffect(() => {
    const id = setInterval(() => setBgIdx(i => (i + 1) % BG_LOCATIONS.length), 10000);
    return () => clearInterval(id);
  }, []);

  // React to index change
  useEffect(() => {
    if (firstCycle.current) { firstCycle.current = false; return; }
    setLabelVisible(false);
    const t = setTimeout(() => {
      setLocLabel(BG_LOCATIONS[bgIdx]);
      setLabelVisible(true);
      viewerRef.current?.moveTo(BG_LOCATIONS[bgIdx].imageId).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [bgIdx]);

  // Pre-fill returning user
  useEffect(() => {
    const user = loadUser();
    if (user) {
      setUsername(user.username);
      api.checkUsername(user.username).then(d => setUsernameTaken(d.exists)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    api.getLeaderboard().then(setLeaderboard).catch(() => {});
  }, []);

  async function handlePlay(e) {
    e.preventDefault();
    if (!username.trim() || pin.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.login(username.trim(), pin);
      saveUser(data.userId, data.username, data.token);
      navigate('/game');
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  const ready = username.trim().length >= 2 && pin.length === 6;

  return (
    <div style={s.root}>
      {/* Fullscreen background viewer */}
      <div ref={containerRef} style={s.bg} />
      <div style={s.overlay} />

      {/* Location badge */}
      <div style={{ ...s.locBadge, opacity: labelVisible ? 1 : 0 }}>
        <span style={s.locDot} />
        {locLabel.city}, {locLabel.country}
      </div>

      {/* Main card */}
      <div style={s.card}>
        <div style={s.logoRow}>
          <span style={s.globe}>🌍</span>
          <h1 style={s.title}>GeoRoamer</h1>
        </div>
        <p style={s.sub}>5 rounds · 3 guesses · daily challenge</p>

        <form onSubmit={handlePlay} style={s.form}>
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => {
                const val = e.target.value;
                setUsername(val);
                setError('');
                setUsernameTaken(null);
                clearTimeout(debounceRef.current);
                if (val.trim().length >= 2) {
                  debounceRef.current = setTimeout(() => {
                    api.checkUsername(val.trim()).then(d => setUsernameTaken(d.exists)).catch(() => {});
                  }, 350);
                }
              }}
              maxLength={20}
              autoFocus
              autoComplete="username"
              style={s.textInput}
            />
            {username.trim().length >= 2 && usernameTaken !== null && (
              <p style={{ ...s.hint, color: usernameTaken ? 'var(--warn)' : 'var(--success)' }}>
                {usernameTaken ? '● Returning player — enter your PIN' : '● New player — set a 6-digit PIN'}
              </p>
            )}
          </div>

          <div style={s.pinBlock}>
            <span style={s.pinLabel}>
              {usernameTaken === true ? 'Your PIN' : usernameTaken === false ? 'Create PIN' : '6-digit PIN'}
            </span>
            <PinInput value={pin} onChange={p => { setPin(p); setError(''); }} disabled={loading} />
          </div>

          {error && <p style={s.error}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !ready}
            style={s.playBtn}
          >
            {loading ? 'Loading…' : "Play Today's Challenge →"}
          </button>
        </form>

        <div style={s.steps}>
          <Step icon="📸" label="Study street view clues" />
          <Step icon="🌐" label="Click the globe to place your pin" />
          <Step icon="🏆" label="Best guess of 3 counts for score" />
        </div>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div style={s.lb}>
          <div style={s.lbTitle}>Today's Leaderboard</div>
          {leaderboard.slice(0, 8).map(row => (
            <div key={row.rank} style={s.lbRow}>
              <span style={s.lbRank}>
                {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
              </span>
              <span style={s.lbName}>{row.username}</span>
              <span style={s.lbScore}>{row.totalScore.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Step({ icon, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 17, width: 26, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{label}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const glass = {
  background: 'rgba(8, 12, 24, 0.72)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.07)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
};

const s = {
  root: {
    width: '100%',
    height: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: '24px 32px',
    overflowY: 'auto',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    background: 'linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.55) 100%)',
    pointerEvents: 'none',
  },
  locBadge: {
    position: 'absolute',
    bottom: 20,
    left: 24,
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.04em',
    color: 'rgba(255,255,255,0.55)',
    transition: 'opacity 0.5s ease',
    pointerEvents: 'none',
  },
  locDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--primary)',
    boxShadow: '0 0 8px var(--primary)',
    flexShrink: 0,
  },
  card: {
    ...glass,
    position: 'relative',
    zIndex: 10,
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    padding: '40px 36px',
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  globe: {
    fontSize: 44,
    lineHeight: 1,
    filter: 'drop-shadow(0 0 20px rgba(79,142,247,0.6))',
  },
  title: {
    fontSize: 38,
    fontWeight: 900,
    letterSpacing: '-0.03em',
    background: 'linear-gradient(135deg, #fff 30%, #6fa3ff 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    margin: 0,
  },
  sub: {
    margin: '-12px 0 0',
    color: 'var(--muted)',
    fontSize: 14,
    textAlign: 'center',
    letterSpacing: '0.01em',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  textInput: {
    display: 'block',
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 15,
    fontFamily: 'inherit',
    padding: '13px 16px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  hint: {
    fontSize: 12,
    marginTop: 7,
    marginBottom: 0,
  },
  pinBlock: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: '14px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  pinLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
  },
  error: {
    color: 'var(--danger)',
    fontSize: 13,
    textAlign: 'center',
    margin: 0,
  },
  playBtn: {
    width: '100%',
    padding: '15px 0',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: 'inherit',
    letterSpacing: '0.02em',
    color: '#fff',
    background: 'linear-gradient(135deg, #3b7ef4 0%, #5fa3ff 100%)',
    border: 'none',
    borderRadius: 14,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(79,142,247,0.45)',
    transition: 'opacity 0.15s, transform 0.1s, box-shadow 0.2s',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 11,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: '14px 18px',
  },
  lb: {
    ...glass,
    position: 'relative',
    zIndex: 10,
    width: 230,
    flexShrink: 0,
    borderRadius: 20,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  lbTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    padding: '16px 18px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  lbRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 18px',
    gap: 10,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  lbRank: { width: 26, fontSize: 15 },
  lbName: { flex: 1, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  lbScore: { fontWeight: 700, color: 'var(--primary)', fontSize: 14, flexShrink: 0 },
};
