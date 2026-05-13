const BASE = '/api';

function getToken() {
  return localStorage.getItem('geo_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data });
  return data;
}

export const api = {
  login(username, pin) {
    return request('POST', '/auth', { username, pin });
  },
  checkUsername(username) {
    return request('GET', `/check-username?username=${encodeURIComponent(username)}`);
  },
  getDaily() {
    return request('GET', '/daily');
  },
  submitGuess(sessionId, roundNumber, lat, lng) {
    return request('POST', '/guess', { sessionId, roundNumber, lat, lng });
  },
  revealRound(sessionId, roundNumber) {
    return request('POST', '/reveal-round', { sessionId, roundNumber });
  },
  getLeaderboard(date) {
    const q = date ? `?date=${date}` : '';
    return request('GET', `/leaderboard${q}`);
  },
};

export function saveUser(userId, username, token) {
  localStorage.setItem('geo_user', JSON.stringify({ userId, username }));
  localStorage.setItem('geo_token', token);
}

export function loadUser() {
  try {
    const raw = localStorage.getItem('geo_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearUser() {
  localStorage.removeItem('geo_user');
  localStorage.removeItem('geo_token');
}
