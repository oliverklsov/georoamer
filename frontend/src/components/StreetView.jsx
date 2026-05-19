import { useEffect, useRef } from 'react';
import 'mapillary-js/dist/mapillary.css';

const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_TOKEN || '';

export default function StreetView({ imageId }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !MAPILLARY_TOKEN) return;

    let viewer;
    import('mapillary-js').then(({ Viewer }) => {
      if (!containerRef.current) return;
      viewer = new Viewer({
        accessToken: MAPILLARY_TOKEN,
        container: containerRef.current,
        imageId,
        component: { cover: false },
      });
      viewerRef.current = viewer;
    });

    return () => {
      viewer?.remove();
      viewerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (viewerRef.current && imageId) {
      viewerRef.current.moveTo(imageId).catch(() => {});
    }
  }, [imageId]);

  if (!MAPILLARY_TOKEN) {
    return (
      <div style={styles.placeholder}>
        <div style={styles.placeholderInner}>
          <div style={{ fontSize: 48 }}>🌍</div>
          <p style={{ marginTop: 12, color: 'var(--muted)', textAlign: 'center', maxWidth: 320 }}>
            Street view requires a Mapillary token.
            <br />
            Add <code>VITE_MAPILLARY_TOKEN</code> to <code>frontend/.env</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!imageId) {
    return (
      <div style={styles.placeholder}>
        <div style={styles.placeholderInner}>
          <div style={{ fontSize: 48 }}>📷</div>
          <p style={{ marginTop: 12, color: 'var(--muted)', textAlign: 'center' }}>
            No street view available for this location
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} style={styles.container} />;
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    background: '#000',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    background: 'var(--surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
};
