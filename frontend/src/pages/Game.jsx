import { useEffect, useReducer, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StreetView from '../components/StreetView';
import GlobeGuesser from '../components/GlobeGuesser';
import RoundResult from '../components/RoundResult';
import MusicPlayer from '../components/MusicPlayer';
import MovieCard from '../components/MovieCard';
import { api } from '../api';

// ─── State ────────────────────────────────────────────────────────────────────

const init = {
  status: 'loading',
  sessionId: null,
  rounds: [],
  currentRound: 0,
  pendingGuess: null,
  roundGuesses: [],
  roundResult: null,
  totalScore: 0,
  errorMsg: '',
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        status: 'playing',
        sessionId: action.sessionId,
        rounds: action.rounds,
        totalScore: action.totalScore,
        currentRound: action.rounds.findIndex(r => !r.completed),
      };
    case 'SET_PENDING':
      return { ...state, pendingGuess: action.guess };
    case 'SUBMITTING':
      return { ...state, status: 'submitting' };
    case 'GUESS_RESULT': {
      const newGuesses = [...state.roundGuesses, {
        lat: action.lat, lng: action.lng,
        distanceMiles: action.distanceMiles,
        guessNumber: action.guessNumber,
      }];
      if (!action.isRoundComplete) {
        return { ...state, status: 'playing', roundGuesses: newGuesses, pendingGuess: null };
      }
      return {
        ...state,
        status: 'round_complete',
        roundGuesses: newGuesses,
        pendingGuess: null,
        roundResult: {
          actualLat: action.actualLat, actualLng: action.actualLng,
          actualCity: action.actualCity, actualCountry: action.actualCountry,
          roundScore: action.roundScore, guesses: newGuesses,
          gameComplete: action.gameComplete,
        },
        totalScore: state.totalScore + (action.roundScore || 0),
      };
    }
    case 'REVEALED':
      return {
        ...state,
        status: 'round_complete',
        pendingGuess: null,
        roundResult: {
          actualLat: action.actualLat, actualLng: action.actualLng,
          actualCity: action.actualCity, actualCountry: action.actualCountry,
          roundScore: action.roundScore, guesses: state.roundGuesses,
          gameComplete: action.gameComplete,
        },
        totalScore: state.totalScore + (action.roundScore || 0),
      };
    case 'NEXT_ROUND':
      return {
        ...state,
        status: 'playing',
        currentRound: state.currentRound + 1,
        roundGuesses: [], pendingGuess: null, roundResult: null,
      };
    case 'ERROR':
      return { ...state, status: 'error', errorMsg: action.message };
    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Game() {
  const [state, dispatch] = useReducer(reducer, init);
  const navigate = useNavigate();
  const winSize = useWindowSize();
  const [dominant, setDominant] = useState('street'); // 'street' | 'globe'

  useEffect(() => {
    api.getDaily()
      .then(data => dispatch({ type: 'LOADED', ...data }))
      .catch(err => {
        if (err.data?.alreadyPlayed) navigate('/results?played=true');
        else dispatch({ type: 'ERROR', message: err.message });
      });
  }, [navigate]);

  const handleGlobeClick = useCallback(({ lat, lng }) => {
    if (state.status !== 'playing') return;
    dispatch({ type: 'SET_PENDING', guess: { lat, lng } });
  }, [state.status]);

  const handleSubmitGuess = useCallback(async () => {
    if (!state.pendingGuess || state.status !== 'playing') return;
    const round = state.rounds[state.currentRound];
    dispatch({ type: 'SUBMITTING' });
    try {
      const result = await api.submitGuess(
        state.sessionId, round.roundNumber,
        state.pendingGuess.lat, state.pendingGuess.lng,
      );
      dispatch({ type: 'GUESS_RESULT', lat: state.pendingGuess.lat, lng: state.pendingGuess.lng, ...result });
    } catch (err) {
      dispatch({ type: 'ERROR', message: err.message });
    }
  }, [state]);

  const handleReveal = useCallback(async () => {
    if (state.roundGuesses.length === 0) return;
    const round = state.rounds[state.currentRound];
    try {
      const result = await api.revealRound(state.sessionId, round.roundNumber);
      dispatch({ type: 'REVEALED', ...result });
    } catch (err) {
      dispatch({ type: 'ERROR', message: err.message });
    }
  }, [state]);

  const handleNext = useCallback(() => {
    if (state.roundResult?.gameComplete) { navigate('/results'); return; }
    dispatch({ type: 'NEXT_ROUND' });
    setDominant('street');
  }, [state.roundResult, navigate]);

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'error') return <ErrorScreen message={state.errorMsg} />;

  const round = state.rounds[state.currentRound];
  const guessesLeft = round ? 3 - state.roundGuesses.length : 0;
  const isPlaying = state.status === 'playing';
  const actualLocation = state.roundResult
    ? { lat: state.roundResult.actualLat, lng: state.roundResult.actualLng,
        city: state.roundResult.actualCity, country: state.roundResult.actualCountry }
    : null;

  const globe = (
    <GlobeGuesser
      width={dominant === 'globe' ? winSize.w : THUMB_SIZE}
      height={dominant === 'globe' ? winSize.h : THUMB_SIZE}
      pendingGuess={state.status !== 'round_complete' ? state.pendingGuess : null}
      submittedGuesses={state.roundGuesses}
      actualLocation={actualLocation}
      onGlobeClick={handleGlobeClick}
      disabled={!isPlaying}
    />
  );

  const hintText = state.status === 'round_complete'
    ? 'Round complete'
    : state.pendingGuess
    ? 'Click Submit to confirm'
    : 'Click globe to guess';

  return (
    <div style={styles.root}>

      {/* ── Top bar ── */}
      <div style={styles.topbar}>
        <span style={styles.gameName}>GeoRoamer</span>
        <div style={styles.topCenter}>
          {state.rounds.map((r, i) => (
            <div key={i} style={{
              ...styles.roundPip,
              background: i < state.currentRound ? 'var(--success)'
                : i === state.currentRound ? 'var(--primary)' : 'var(--border)',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={styles.score}>{state.totalScore.toLocaleString()} pts</span>
          <button
            className="btn-secondary"
            style={styles.swapBtn}
            onClick={() => setDominant(d => d === 'street' ? 'globe' : 'street')}
          >
            {dominant === 'street' ? '🌐 Globe View' : '📸 Street View'}
          </button>
        </div>
      </div>

      {dominant === 'street' ? (
        /* ══ STREET DOMINANT ══════════════════════════════════════════════════ */
        <>
          {/* Street view fills screen */}
          <div style={styles.fill}>
            {round && <StreetView imageId={round.imageId} />}
          </div>

          {/* Globe panel — bottom right */}
          <div style={styles.globePanel}>
            <div
              style={{ ...styles.panelHeader, cursor: 'pointer' }}
              onClick={() => setDominant('globe')}
              title="Expand globe view"
            >
              <span style={styles.hintText}>{hintText}</span>
              <span style={styles.expandHint}>expand ↗</span>
            </div>
            {globe}
            {state.status !== 'round_complete' && (
              <div style={styles.actions}>
                <GuessIndicators total={3} used={state.roundGuesses.length} />
                <ActionButtons
                  canReveal={state.roundGuesses.length > 0 && guessesLeft > 0}
                  canSubmit={!!state.pendingGuess && isPlaying}
                  submitting={state.status === 'submitting'}
                  onReveal={handleReveal}
                  onSubmit={handleSubmitGuess}
                />
              </div>
            )}
          </div>

          {/* Distance badges — top left */}
          <DistanceBadges guesses={state.roundGuesses} visible={isPlaying} />
        </>
      ) : (
        /* ══ GLOBE DOMINANT ═══════════════════════════════════════════════════ */
        <>
          {/* Globe fills screen */}
          <div style={styles.fill}>
            {globe}
          </div>

          {/* Street view thumbnail — bottom left, click to swap */}
          <div
            style={{ ...styles.streetThumb, cursor: 'pointer' }}
            onClick={() => setDominant('street')}
            title="Expand street view"
          >
            {round && <StreetView imageId={round.imageId} />}
            <div style={styles.thumbLabel}>📸 expand ↗</div>
          </div>

          {/* Guess controls — bottom center */}
          {state.status !== 'round_complete' && (
            <div style={styles.globeBar}>
              <span style={{ ...styles.hintText, fontSize: 13 }}>{hintText}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <GuessIndicators total={3} used={state.roundGuesses.length} />
                <ActionButtons
                  canReveal={state.roundGuesses.length > 0 && guessesLeft > 0}
                  canSubmit={!!state.pendingGuess && isPlaying}
                  submitting={state.status === 'submitting'}
                  onReveal={handleReveal}
                  onSubmit={handleSubmitGuess}
                />
              </div>
            </div>
          )}

          {/* Distance badges — top left (below topbar) */}
          <DistanceBadges guesses={state.roundGuesses} visible={isPlaying} />
        </>
      )}

      {/* Music player — floats below topbar, centred */}
      {round?.previewUrl && (
        <MusicPlayer
          key={round.previewUrl}
          previewUrl={round.previewUrl}
          song={round?.song}
        />
      )}
      <MovieCard movie={round?.movie} />

      {/* Round result modal — same in both modes */}
      {state.status === 'round_complete' && state.roundResult && (
        <RoundResult
          result={state.roundResult}
          currentRound={state.currentRound + 1}
          totalRounds={state.rounds.length}
          totalScore={state.totalScore}
          onNext={handleNext}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const THUMB_SIZE = 300;

function ActionButtons({ canReveal, canSubmit, submitting, onReveal, onSubmit }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {canReveal && (
        <button className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12 }} onClick={onReveal}>
          Reveal
        </button>
      )}
      <button
        className="btn-primary"
        style={{ padding: '8px 14px', fontSize: 13 }}
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {submitting ? '…' : 'Submit'}
      </button>
    </div>
  );
}

function GuessIndicators({ total, used }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: '50%',
          background: i < used ? 'var(--primary)' : 'var(--border)',
        }} />
      ))}
      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>
        {total - used} left
      </span>
    </div>
  );
}

function DistanceBadges({ guesses, visible }) {
  if (!visible || guesses.length === 0) return null;
  return (
    <div style={styles.distanceBadges}>
      {guesses.map((g, i) => (
        <div key={i} style={{ ...styles.badge, color: distanceColor(g.distanceMiles) }}>
          Guess {g.guessNumber}: {g.distanceMiles.toLocaleString()} mi
        </div>
      ))}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ ...styles.root, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 48 }}>🌍</div>
      <p style={{ color: 'var(--muted)' }}>Loading today's challenge…</p>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div style={{ ...styles.root, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: 'var(--danger)', fontSize: 18 }}>Something went wrong</p>
      <p style={{ color: 'var(--muted)' }}>{message}</p>
      <button className="btn-primary" onClick={() => window.location.reload()}>Retry</button>
    </div>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const handler = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return size;
}

// ─── Helpers / Styles ─────────────────────────────────────────────────────────

function distanceColor(miles) {
  if (miles < 100)  return '#22c55e';
  if (miles < 500)  return '#84cc16';
  if (miles < 1500) return '#f59e0b';
  if (miles < 4000) return '#f97316';
  return '#ef4444';
}

const panel = {
  background: 'var(--surface)cc',
  border: '1px solid var(--border)',
  borderRadius: 16,
  backdropFilter: 'blur(8px)',
  boxShadow: '0 8px 32px #0008',
};

const styles = {
  root: {
    width: '100%', height: '100%',
    position: 'relative', background: '#000', overflow: 'hidden',
  },
  fill: {
    position: 'absolute', inset: 0, zIndex: 1,
  },
  topbar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 48, zIndex: 30,
    background: 'linear-gradient(#000c, transparent)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px',
  },
  topCenter: { display: 'flex', gap: 8, alignItems: 'center' },
  gameName: { fontWeight: 800, fontSize: 16, color: 'var(--primary)' },
  roundPip: { width: 28, height: 6, borderRadius: 3, transition: 'background 0.3s' },
  score: { fontWeight: 700, fontSize: 15 },
  swapBtn: {
    padding: '5px 12px', fontSize: 13, fontWeight: 600,
  },
  // Street-dominant: globe panel bottom-right
  globePanel: {
    ...panel,
    position: 'absolute', bottom: 12, right: 12, zIndex: 20,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    width: THUMB_SIZE + 16,
  },
  panelHeader: {
    padding: '8px 12px 4px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  hintText: { fontSize: 12, color: 'var(--muted)' },
  expandHint: { fontSize: 11, color: 'var(--primary)', fontWeight: 600 },
  actions: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 10px 10px', gap: 8,
  },
  // Globe-dominant: street view thumbnail bottom-left
  streetThumb: {
    ...panel,
    position: 'absolute', bottom: 12, left: 12, zIndex: 20,
    width: 280, height: 180,
    overflow: 'hidden',
    borderRadius: 12,
  },
  thumbLabel: {
    position: 'absolute', bottom: 6, left: 0, right: 0,
    textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.5)',
    pointerEvents: 'none',
  },
  // Globe-dominant: controls bar bottom-center
  globeBar: {
    ...panel,
    position: 'absolute', bottom: 12, left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 20,
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '10px 16px',
    whiteSpace: 'nowrap',
  },
  distanceBadges: {
    position: 'absolute', top: 56, left: 12,
    display: 'flex', flexDirection: 'column', gap: 6, zIndex: 25,
  },
  badge: {
    background: 'var(--surface)dd',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 13, fontWeight: 600,
    backdropFilter: 'blur(4px)',
  },
};
