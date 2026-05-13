import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Game from './pages/Game';
import Results from './pages/Results';
import { loadUser } from './api';

function RequireAuth({ children }) {
  return loadUser() ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/game"
          element={
            <RequireAuth>
              <Game />
            </RequireAuth>
          }
        />
        <Route
          path="/results"
          element={
            <RequireAuth>
              <Results />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
