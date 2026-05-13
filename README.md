# GeoRoamer

A daily geography guessing game. Every day you get 5 locations shown in street view — rotate the 3D globe, click to place your guess, and see how many miles off you are. Up to 3 guesses per round.

## Setup

### 1. Get a Mapillary token

1. Create a free account at [mapillary.com](https://www.mapillary.com)
2. Go to [mapillary.com/dashboard/developers](https://www.mapillary.com/dashboard/developers)
3. Create an application and copy the **Client Token**

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and set MAPILLARY_TOKEN
npm install
npm run dev
```

Runs on `http://localhost:3001`.

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env and set VITE_MAPILLARY_TOKEN to your token
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## How it works

- **Daily seed**: locations are picked deterministically from the date — all players get the same 5 spots.
- **Scoring**: each round is worth up to 5,000 points. Score = `round(5000 × e^(−km/1500))`. Max total: 25,000.
- **Leaderboard**: persisted in SQLite (`backend/game.db`), visible on the home and results pages.
- **No password**: just pick a username. Your token is stored in `localStorage`.

## Tech

| Layer    | Stack                          |
|----------|-------------------------------|
| Frontend | React + Vite                  |
| Street view | mapillary-js               |
| Globe    | react-globe.gl (Three.js)     |
| Backend  | Node.js + Express             |
| Database | SQLite via better-sqlite3     |

## Production

Build the frontend and serve it from the backend:

```bash
cd frontend && npm run build
```

Then in `backend/server.js` add:
```js
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, '../frontend/dist')));
app.get('*', (_, res) => res.sendFile(join(__dirname, '../frontend/dist/index.html')));
```
