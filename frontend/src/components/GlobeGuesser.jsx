import { useCallback, useMemo, useRef, useEffect } from 'react';
import Globe from 'react-globe.gl';

const EARTH_TEXTURE = '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const SKY_TEXTURE   = '//unpkg.com/three-globe/example/img/night-sky.png';

export default function GlobeGuesser({
  width,
  height,
  pendingGuess,
  submittedGuesses,
  actualLocation,
  onGlobeClick,
  disabled,
}) {
  const globeRef = useRef();

  // Auto-spin to face actual location when revealed
  useEffect(() => {
    if (!actualLocation || !globeRef.current) return;
    globeRef.current.pointOfView(
      { lat: actualLocation.lat, lng: actualLocation.lng, altitude: 1.8 },
      800
    );
  }, [actualLocation]);

  const handleClick = useCallback(({ lat, lng }) => {
    if (!disabled) onGlobeClick({ lat, lng });
  }, [disabled, onGlobeClick]);

  const points = useMemo(() => {
    const pts = [];

    submittedGuesses.forEach((g, i) => {
      pts.push({
        lat: g.lat,
        lng: g.lng,
        color: distanceColor(g.distanceMiles),
        radius: 0.55,
        label: `Guess ${i + 1}: ${g.distanceMiles.toLocaleString()} mi`,
      });
    });

    if (pendingGuess) {
      pts.push({
        lat: pendingGuess.lat,
        lng: pendingGuess.lng,
        color: '#ffffff',
        radius: 0.65,
        label: 'Click Submit to confirm',
      });
    }

    if (actualLocation) {
      pts.push({
        lat: actualLocation.lat,
        lng: actualLocation.lng,
        color: '#22c55e',
        radius: 0.75,
        label: `📍 ${actualLocation.city}, ${actualLocation.country}`,
      });
    }

    return pts;
  }, [pendingGuess, submittedGuesses, actualLocation]);

  // Arc from best guess to actual after reveal
  const arcs = useMemo(() => {
    if (!actualLocation || submittedGuesses.length === 0) return [];
    const best = submittedGuesses.reduce((b, g) => g.distanceMiles < b.distanceMiles ? g : b);
    return [{
      startLat: best.lat,
      startLng: best.lng,
      endLat: actualLocation.lat,
      endLng: actualLocation.lng,
      color: ['#ffffff88', '#22c55e88'],
    }];
  }, [submittedGuesses, actualLocation]);

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      globeImageUrl={EARTH_TEXTURE}
      backgroundImageUrl={SKY_TEXTURE}
      onGlobeClick={handleClick}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointColor="color"
      pointAltitude={0.015}
      pointRadius="radius"
      pointLabel="label"
      arcsData={arcs}
      arcColor="color"
      arcAltitude={0.25}
      arcDashLength={0.5}
      arcDashGap={0.2}
      arcDashAnimateTime={1500}
      atmosphereColor="#4f8ef7"
      atmosphereAltitude={0.12}
    />
  );
}

function distanceColor(miles) {
  if (miles < 100)  return '#22c55e'; // green
  if (miles < 500)  return '#84cc16'; // lime
  if (miles < 1500) return '#f59e0b'; // amber
  if (miles < 4000) return '#f97316'; // orange
  return '#ef4444';                    // red
}
