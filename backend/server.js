import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { LOCATIONS } from './locations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const MAPILLARY_TOKEN = process.env.MAPILLARY_TOKEN || '';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const DB_PATH = process.env.DB_PATH || join(__dirname, 'game.db');

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// ─── Database ────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    UNIQUE NOT NULL,
    token      TEXT    UNIQUE NOT NULL,
    pin_hash   TEXT,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS location_images (
    location_id   INTEGER PRIMARY KEY,
    image_id      TEXT NOT NULL,
    is_pano       INTEGER,
    quality_score REAL,
    cached_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    date        TEXT    NOT NULL,
    completed   INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS round_results (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          INTEGER NOT NULL REFERENCES game_sessions(id),
    round_number        INTEGER NOT NULL,
    location_id         INTEGER NOT NULL,
    best_distance_miles REAL,
    round_score         INTEGER DEFAULT 0,
    guesses_used        INTEGER DEFAULT 0,
    completed           INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS itunes_tracks (
    location_id INTEGER PRIMARY KEY,
    preview_url TEXT NOT NULL,
    cached_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS movie_cache (
    location_id INTEGER NOT NULL,
    decade      INTEGER NOT NULL,
    title       TEXT    NOT NULL,
    year        INTEGER NOT NULL,
    poster_url  TEXT,
    cached_at   TEXT    DEFAULT (datetime('now')),
    PRIMARY KEY (location_id, decade)
  );

  CREATE TABLE IF NOT EXISTS guesses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    round_result_id INTEGER NOT NULL REFERENCES round_results(id),
    guess_number    INTEGER NOT NULL,
    lat             REAL    NOT NULL,
    lng             REAL    NOT NULL,
    distance_miles  REAL    NOT NULL
  );
`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seededRandom(seed, i) {
  let x = Math.sin(seed * 9301 + i * 49297 + 233280) * 1e9;
  return x - Math.floor(x);
}

function getLocationIdsForSeed(seed, exclude) {
  const ids = [];
  const used = new Set();
  let i = 0;
  while (ids.length < 5) {
    const idx = Math.floor(seededRandom(seed, i) * LOCATIONS.length);
    const id = LOCATIONS[idx].id;
    if (!used.has(idx) && !exclude.has(id)) {
      used.add(idx);
      ids.push(id);
    }
    i++;
    if (i > LOCATIONS.length * 10) break;
  }
  return ids;
}

function getDailyLocationIds(date) {
  const seed = parseInt(date.replace(/-/g, ''), 10);
  const recentlyUsed = new Set();
  for (let d = 1; d <= 6; d++) {
    const pastDate = new Date(date);
    pastDate.setDate(pastDate.getDate() - d);
    const pastDateStr = pastDate.toISOString().slice(0, 10);
    const pastSeed = parseInt(pastDateStr.replace(/-/g, ''), 10);
    getLocationIdsForSeed(pastSeed, new Set()).forEach(id => recentlyUsed.add(id));
  }
  return getLocationIdsForSeed(seed, recentlyUsed);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreFromMiles(distanceMiles) {
  const km = distanceMiles * 1.60934;
  return Math.max(0, Math.round(5000 * Math.exp(-km / 1500)));
}

// Score a Mapillary candidate. Higher = better.
// Panos are dramatically better for guessing (player can look around).
// quality_score is Mapillary's own 0–1 estimate; recency favors modern cameras.
function rankMapillaryCandidate(c) {
  let score = 0;
  if (c.is_pano) score += 100;
  if (typeof c.quality_score === 'number') score += c.quality_score * 50;
  if (c.captured_at) {
    const ageYears = (Date.now() - new Date(c.captured_at).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < 5) score += 10;
    else if (ageYears < 10) score += 5;
  }
  return score;
}

async function fetchMapillaryCandidates(lat, lng, radius) {
  const url =
    `https://graph.mapillary.com/images?fields=id,is_pano,quality_score,captured_at` +
    `&lat=${lat}&lng=${lng}&radius=${radius}&limit=30&access_token=${MAPILLARY_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.data ?? [];
}

async function fetchImageId(locationId) {
  // is_pano column on cache row means a row was created by the new (ranked) algorithm.
  // Legacy rows (is_pano IS NULL) get refreshed once.
  const cached = db
    .prepare('SELECT image_id, is_pano FROM location_images WHERE location_id = ?')
    .get(locationId);
  if (cached && cached.is_pano !== null) return cached.image_id;

  const loc = LOCATIONS.find(l => l.id === locationId);
  if (!loc || !MAPILLARY_TOKEN) return cached?.image_id ?? null;

  // Widen the search until we find candidates; pick the best by rank.
  // Final radii are large because for a country-level guessing game a
  // shot tens of km from the iconic spot is still useful, and some Wikipedia
  // coordinates land in spots Mapillary just hasn't been driven through.
  let best = null;
  let bestScore = -Infinity;
  for (const radius of [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000]) {
    try {
      const candidates = await fetchMapillaryCandidates(loc.lat, loc.lng, radius);
      for (const c of candidates) {
        const s = rankMapillaryCandidate(c);
        if (s > bestScore) { bestScore = s; best = c; }
      }
      if (best) break;
    } catch (err) {
      console.error(`Mapillary fetch error (r=${radius}):`, err.message);
    }
  }

  if (!best) {
    // Surface this in Fly logs so we can identify the locations that have
    // genuine zero coverage at 50km and either move their coords or drop
    // them from rotation.
    console.warn(`Mapillary: no candidates within 50km for location ${locationId} (${loc.city}, ${loc.country})`);
    return cached?.image_id ?? null;
  }

  db.prepare(
    'INSERT OR REPLACE INTO location_images (location_id, image_id, is_pano, quality_score, cached_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
  ).run(locationId, best.id, best.is_pano ? 1 : 0, best.quality_score ?? null);
  return best.id;
}

// Migrate existing DB — add pin_hash if it doesn't exist yet
const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!cols.includes('pin_hash')) {
  db.prepare("ALTER TABLE users ADD COLUMN pin_hash TEXT").run();
}

// Migrate location_images: add quality columns so we can distinguish legacy
// (random-first-hit) rows from new ranked picks and refresh them once.
const imgCols = db.prepare("PRAGMA table_info(location_images)").all().map(c => c.name);
if (!imgCols.includes('is_pano')) {
  db.prepare("ALTER TABLE location_images ADD COLUMN is_pano INTEGER").run();
}
if (!imgCols.includes('quality_score')) {
  db.prepare("ALTER TABLE location_images ADD COLUMN quality_score REAL").run();
}

function createPinHash(pin) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const computed = scryptSync(pin, salt, 32).toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

// ─── iTunes ───────────────────────────────────────────────────────────────────

async function fetchItunesPreviewUrl(locationId) {
  const cached = db.prepare('SELECT preview_url FROM itunes_tracks WHERE location_id = ?').get(locationId);
  if (cached) return cached.preview_url;

  const loc = LOCATIONS.find(l => l.id === locationId);
  if (!loc?.song) return null;

  try {
    const term = encodeURIComponent(`${loc.song.title} ${loc.song.artist}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`
    );
    const data = await res.json();
    const previewUrl = data.results?.[0]?.previewUrl ?? null;
    if (previewUrl) {
      db.prepare('INSERT OR REPLACE INTO itunes_tracks (location_id, preview_url) VALUES (?, ?)').run(locationId, previewUrl);
    }
    return previewUrl;
  } catch (err) {
    console.error('iTunes search error:', err.message);
    return null;
  }
}

// ─── Wikidata movies ──────────────────────────────────────────────────────────

const COUNTRY_QID = {
  'USA': 'Q30', 'Canada': 'Q16', 'Mexico': 'Q96',
  'Brazil': 'Q155', 'Argentina': 'Q414', 'Chile': 'Q298',
  'Peru': 'Q419', 'Colombia': 'Q739', 'Ecuador': 'Q736',
  'UK': 'Q145', 'France': 'Q142', 'Italy': 'Q38',
  'Spain': 'Q29', 'Germany': 'Q183', 'Netherlands': 'Q55',
  'Austria': 'Q40', 'Czech Republic': 'Q213', 'Poland': 'Q36',
  'Switzerland': 'Q39', 'Norway': 'Q20', 'Denmark': 'Q35',
  'Sweden': 'Q34', 'Finland': 'Q33', 'Hungary': 'Q28',
  'Greece': 'Q41', 'Turkey': 'Q43', 'Russia': 'Q159',
  'Portugal': 'Q45', 'Iceland': 'Q189', 'Ireland': 'Q27',
  'Belgium': 'Q31', 'Croatia': 'Q224', 'Bulgaria': 'Q219',
  'Serbia': 'Q403', 'Slovenia': 'Q215', 'Egypt': 'Q79',
  'South Africa': 'Q258', 'Kenya': 'Q114', 'Ghana': 'Q117',
  'Nigeria': 'Q1033', 'Morocco': 'Q1028', 'Senegal': 'Q1041',
  'DR Congo': 'Q974', 'Madagascar': 'Q1019',
  'Japan': 'Q17', 'South Korea': 'Q884', 'China': 'Q148',
  'Hong Kong': 'Q8646', 'Singapore': 'Q334', 'Thailand': 'Q869',
  'Vietnam': 'Q881', 'Malaysia': 'Q833', 'Indonesia': 'Q252',
  'Philippines': 'Q928', 'India': 'Q668', 'UAE': 'Q878',
  'Saudi Arabia': 'Q851', 'Israel': 'Q801', 'Uzbekistan': 'Q265',
  'Kazakhstan': 'Q232', 'Bangladesh': 'Q902', 'Sri Lanka': 'Q854',
  'Australia': 'Q408', 'New Zealand': 'Q664', 'Costa Rica': 'Q800',
  'Cuba': 'Q241', 'Dominican Republic': 'Q786', 'Panama': 'Q804',
  'Belarus': 'Q184',
  'Uruguay': 'Q77', 'Bolivia': 'Q750', 'Paraguay': 'Q733',
  'Estonia': 'Q191', 'Latvia': 'Q211', 'Lithuania': 'Q37',
  'Slovakia': 'Q214', 'Romania': 'Q218', 'Ukraine': 'Q212',
  'Bosnia': 'Q225', 'Albania': 'Q222', 'Malta': 'Q233',
  'Cyprus': 'Q229', 'North Macedonia': 'Q221', 'Moldova': 'Q217',
  'Luxembourg': 'Q32', 'Ethiopia': 'Q115', 'Tanzania': 'Q924',
  'Uganda': 'Q1036', 'Tunisia': 'Q948', 'Rwanda': 'Q1037',
  'Mozambique': 'Q1029', 'Zambia': 'Q953', 'Zimbabwe': 'Q954',
  'Angola': 'Q916', 'Pakistan': 'Q843', 'Nepal': 'Q837',
  'Myanmar': 'Q836', 'Cambodia': 'Q424', 'Mongolia': 'Q711',
  'Georgia': 'Q230', 'Armenia': 'Q399', 'Azerbaijan': 'Q227',
  'Lebanon': 'Q822', 'Jordan': 'Q810', 'Iran': 'Q794',
  'Taiwan': 'Q865', 'Oman': 'Q842', 'Qatar': 'Q846',
  'Kuwait': 'Q817', 'Turkmenistan': 'Q874', 'Kyrgyzstan': 'Q813',
  'Tajikistan': 'Q863', 'Afghanistan': 'Q889', 'Fiji': 'Q712',
  'Papua New Guinea': 'Q691', 'Jamaica': 'Q766', 'Haiti': 'Q790',
  'Honduras': 'Q783', 'Guatemala': 'Q774', 'Nicaragua': 'Q811',
  'El Salvador': 'Q792',
};

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010];

function wikimediaThumbnail(fullUrl, width = 160) {
  if (!fullUrl) return null;
  const match = fullUrl.match(/Special:FilePath\/(.+)$/);
  if (!match) return fullUrl.replace('http://', 'https://');
  return `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${match[1]}&width=${width}`;
}

function buildMovieSparql(qid, decade, requirePoster) {
  const posterClause = requirePoster
    ? '?film wdt:P18 ?poster .'
    : 'OPTIONAL { ?film wdt:P18 ?poster }';
  return `
    SELECT ?film ?filmLabel ?year ?poster WHERE {
      VALUES ?type { wd:Q11424 wd:Q24869 wd:Q1261214 }
      ?film wdt:P31 ?type ;
            wdt:P495 wd:${qid} ;
            wdt:P577 ?date ;
            wikibase:sitelinks ?sitelinks .
      BIND(YEAR(?date) AS ?year)
      FILTER(?year >= ${decade} && ?year <= ${decade + 9})
      ${posterClause}
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    ORDER BY DESC(?sitelinks)
    LIMIT 1
  `;
}

// Wikidata aggressively rate-limits cloud-provider IPs (Fly is hit hard).
// When throttled it serves an HTML error page. We short-circuit further calls
// for a cooldown window instead of burning every request on a guaranteed-bad
// response — the cache is the steady-state path anyway.
let wikidataCooldownUntil = 0;

async function runMovieSparql(sparql) {
  if (Date.now() < wikidataCooldownUntil) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
      { headers: { 'User-Agent': 'GeoRoamer/1.0 (educational geography game)' }, signal: controller.signal }
    );
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.includes('json')) {
      wikidataCooldownUntil = Date.now() + 15 * 60 * 1000;
      console.warn(`Wikidata throttled or errored (status=${res.status}, ct=${contentType}). Cooling down 15 min.`);
      return null;
    }
    const data = await res.json();
    return data.results?.bindings?.[0] ?? null;
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Wikidata error:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMovieForLocation(locationId, dateSeed) {
  const loc = LOCATIONS.find(l => l.id === locationId);
  const qid = loc ? COUNTRY_QID[loc.country] : null;
  if (!qid) return null;

  const decadeIdx = Math.floor(seededRandom(dateSeed, locationId + 500) * DECADES.length);
  const decade = DECADES[decadeIdx];

  // Reuse cache only when it has a poster — refresh poster-less rows once so
  // we get a chance to grab one with the new poster-required first pass.
  const cached = db.prepare('SELECT * FROM movie_cache WHERE location_id = ? AND decade = ?').get(locationId, decade);
  if (cached && cached.poster_url) {
    return { title: cached.title, year: cached.year, posterUrl: cached.poster_url, decade };
  }

  // First pass: require a poster. Falls back to films without if the
  // country/decade has none on Wikidata (rare but happens for small markets).
  let row = await runMovieSparql(buildMovieSparql(qid, decade, true));
  if (!row) row = await runMovieSparql(buildMovieSparql(qid, decade, false));
  if (!row) {
    // Keep the (titled) cached row if we had one, even without a poster.
    if (cached) return { title: cached.title, year: cached.year, posterUrl: null, decade };
    return null;
  }

  const title = row.filmLabel?.value ?? null;
  const year = parseInt(row.year?.value) || null;
  const posterUrl = wikimediaThumbnail(row.poster?.value ?? null);

  if (title && year) {
    db.prepare('INSERT OR REPLACE INTO movie_cache (location_id, decade, title, year, poster_url) VALUES (?, ?, ?, ?, ?)')
      .run(locationId, decade, title, year, posterUrl);
  }
  return title && year ? { title, year, posterUrl, decade } : null;
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare('SELECT * FROM users WHERE token = ?').get(auth.slice(7));
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Login / register
app.post('/api/auth', (req, res) => {
  const raw = req.body.username;
  const pin = String(req.body.pin ?? '').trim();

  if (!raw || typeof raw !== 'string') return res.status(400).json({ error: 'Username required' });
  const username = raw.trim().slice(0, 20);
  if (username.length < 2) return res.status(400).json({ error: 'Username too short' });
  if (!/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 6 digits' });

  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!existing || !existing.pin_hash) {
    // New user, or existing user who never set a PIN — create/update with this PIN
    const token = randomBytes(32).toString('hex');
    const pin_hash = createPinHash(pin);
    if (!existing) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO users (username, token, pin_hash) VALUES (?, ?, ?)')
        .run(username, token, pin_hash);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
      return res.json({ userId: user.id, username: user.username, token: user.token, created: true });
    } else {
      db.prepare('UPDATE users SET pin_hash = ?, token = ? WHERE id = ?')
        .run(pin_hash, token, existing.id);
      return res.json({ userId: existing.id, username: existing.username, token, created: false });
    }
  }

  // Existing user with a PIN — verify it
  if (!verifyPin(pin, existing.pin_hash)) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }
  res.json({ userId: existing.id, username: existing.username, token: existing.token, created: false });
});

// Check if username is already taken
app.get('/api/check-username', (req, res) => {
  const username = String(req.query.username ?? '').trim().slice(0, 20);
  if (username.length < 2) return res.json({ exists: false });
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  res.json({ exists: !!user });
});

// Get today's game (creates session if needed)
app.get('/api/daily', requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  let session = db
    .prepare('SELECT * FROM game_sessions WHERE user_id = ? AND date = ?')
    .get(req.user.id, today);

  if (!session) {
    const locationIds = getDailyLocationIds(today);
    const { lastInsertRowid: sessionId } = db
      .prepare('INSERT INTO game_sessions (user_id, date) VALUES (?, ?)')
      .run(req.user.id, today);
    for (let i = 0; i < locationIds.length; i++) {
      db.prepare(
        'INSERT INTO round_results (session_id, round_number, location_id) VALUES (?, ?, ?)'
      ).run(sessionId, i + 1, locationIds[i]);
    }
    session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId);
  }

  if (session.completed) {
    return res.status(403).json({ error: 'Already played today', alreadyPlayed: true });
  }

  const rounds = db
    .prepare('SELECT * FROM round_results WHERE session_id = ? ORDER BY round_number')
    .all(session.id);

  const dateSeed = parseInt(today.replace(/-/g, ''), 10);
  const roundsWithImages = await Promise.all(
    rounds.map(async r => {
      const loc = LOCATIONS.find(l => l.id === r.location_id);
      const [imageId, previewUrl, movie] = await Promise.all([
        fetchImageId(r.location_id),
        fetchItunesPreviewUrl(r.location_id),
        fetchMovieForLocation(r.location_id, dateSeed),
      ]);
      return {
        roundNumber: r.round_number,
        imageId,
        previewUrl,
        song: loc?.song ?? null,
        movie,
        completed: r.completed === 1,
        guessesUsed: r.guesses_used,
        roundScore: r.round_score,
      };
    })
  );

  res.json({ sessionId: session.id, date: today, rounds: roundsWithImages, totalScore: session.total_score });
});

// Submit a guess
app.post('/api/guess', requireAuth, (req, res) => {
  const { sessionId, roundNumber, lat, lng } = req.body;
  if (sessionId == null || roundNumber == null || lat == null || lng == null) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const session = db
    .prepare('SELECT * FROM game_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.completed) return res.status(403).json({ error: 'Game already complete' });

  const round = db
    .prepare('SELECT * FROM round_results WHERE session_id = ? AND round_number = ?')
    .get(sessionId, roundNumber);
  if (!round) return res.status(404).json({ error: 'Round not found' });
  if (round.completed) return res.status(403).json({ error: 'Round already complete' });
  if (round.guesses_used >= 3) return res.status(403).json({ error: 'No guesses remaining' });

  const location = LOCATIONS.find(l => l.id === round.location_id);
  if (!location) return res.status(500).json({ error: 'Location data missing' });

  const distanceMiles = haversineDistance(lat, lng, location.lat, location.lng);
  const guessNumber = round.guesses_used + 1;

  db.prepare(
    'INSERT INTO guesses (round_result_id, guess_number, lat, lng, distance_miles) VALUES (?, ?, ?, ?, ?)'
  ).run(round.id, guessNumber, lat, lng, distanceMiles);

  const bestDistance = round.best_distance_miles === null
    ? distanceMiles
    : Math.min(round.best_distance_miles, distanceMiles);

  const isRoundComplete = guessNumber >= 3;
  const roundScore = scoreFromMiles(bestDistance);

  db.prepare(`
    UPDATE round_results
    SET guesses_used = ?, best_distance_miles = ?, completed = ?, round_score = ?
    WHERE id = ?
  `).run(guessNumber, bestDistance, isRoundComplete ? 1 : 0, roundScore, round.id);

  let gameComplete = false;
  if (isRoundComplete) {
    const allRounds = db.prepare('SELECT * FROM round_results WHERE session_id = ?').all(sessionId);
    const totalScore = allRounds.reduce((sum, r) => {
      if (r.id === round.id) return sum + (roundScore ?? 0);
      return sum + (r.round_score ?? 0);
    }, 0);
    gameComplete = allRounds.every(r => r.completed || r.id === round.id);
    db.prepare('UPDATE game_sessions SET completed = ?, total_score = ? WHERE id = ?')
      .run(gameComplete ? 1 : 0, totalScore, sessionId);
  }

  res.json({
    distanceMiles: Math.round(distanceMiles),
    guessNumber,
    isRoundComplete,
    gameComplete,
    roundScore,
    actualLat: isRoundComplete ? location.lat : null,
    actualLng: isRoundComplete ? location.lng : null,
    actualCity: isRoundComplete ? location.city : null,
    actualCountry: isRoundComplete ? location.country : null,
  });
});

// Skip remaining guesses and reveal round
app.post('/api/reveal-round', requireAuth, (req, res) => {
  const { sessionId, roundNumber } = req.body;

  const session = db
    .prepare('SELECT * FROM game_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const round = db
    .prepare('SELECT * FROM round_results WHERE session_id = ? AND round_number = ?')
    .get(sessionId, roundNumber);
  if (!round) return res.status(404).json({ error: 'Round not found' });
  if (round.completed) return res.status(403).json({ error: 'Already complete' });
  if (round.guesses_used === 0) return res.status(400).json({ error: 'Make at least one guess first' });

  const location = LOCATIONS.find(l => l.id === round.location_id);
  const roundScore = scoreFromMiles(round.best_distance_miles);

  db.prepare('UPDATE round_results SET completed = 1, round_score = ? WHERE id = ?')
    .run(roundScore, round.id);

  const allRounds = db.prepare('SELECT * FROM round_results WHERE session_id = ?').all(sessionId);
  const totalScore = allRounds.reduce((sum, r) => sum + (r.id === round.id ? roundScore : (r.round_score ?? 0)), 0);
  const gameComplete = allRounds.every(r => r.completed || r.id === round.id);

  db.prepare('UPDATE game_sessions SET completed = ?, total_score = ? WHERE id = ?')
    .run(gameComplete ? 1 : 0, totalScore, sessionId);

  res.json({
    roundScore,
    actualLat: location.lat,
    actualLng: location.lng,
    actualCity: location.city,
    actualCountry: location.country,
    gameComplete,
  });
});

// Current user: streak + today's per-round scores (for share grid)
app.get('/api/me', requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const completedDates = new Set(
    db.prepare('SELECT date FROM game_sessions WHERE user_id = ? AND completed = 1')
      .all(req.user.id)
      .map(r => r.date)
  );

  // Walk back from today (or yesterday if today not yet played) counting consecutive completed days.
  let streak = 0;
  const cursor = new Date(today);
  if (!completedDates.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (completedDates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const session = db
    .prepare('SELECT * FROM game_sessions WHERE user_id = ? AND date = ?')
    .get(req.user.id, today);

  let todayInfo = null;
  if (session) {
    const rounds = db
      .prepare('SELECT round_number, round_score, completed FROM round_results WHERE session_id = ? ORDER BY round_number')
      .all(session.id);
    todayInfo = {
      date: today,
      completed: session.completed === 1,
      totalScore: session.total_score,
      rounds: rounds.map(r => ({
        roundNumber: r.round_number,
        roundScore: r.round_score,
        completed: r.completed === 1,
      })),
    };
  }

  res.json({ streak, today: todayInfo });
});

// Daily leaderboard
app.get('/api/leaderboard', (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT u.username, gs.total_score, gs.created_at
    FROM game_sessions gs
    JOIN users u ON gs.user_id = u.id
    WHERE gs.date = ? AND gs.completed = 1
    ORDER BY gs.total_score DESC
    LIMIT 50
  `).all(date);
  res.json(rows.map((r, i) => ({ rank: i + 1, username: r.username, totalScore: r.total_score })));
});

// ─── Serve frontend (production) ─────────────────────────────────────────────

const frontendDist = join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (_, res) => res.sendFile(join(frontendDist, 'index.html')));

app.listen(PORT, () => {
  console.log(`GeoRoamer → http://localhost:${PORT}`);
});
