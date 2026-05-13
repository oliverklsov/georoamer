import { useEffect, useRef } from 'react';

/**
 * Drop-in ad slot. In development shows a labelled placeholder.
 * In production, set VITE_ADSENSE_CLIENT and pass a data-ad-slot value.
 *
 * Usage:
 *   <AdSlot slot="1234567890" style={{ marginTop: 16 }} />
 *
 * To go live:
 *   1. Add your AdSense <script> tag to index.html
 *   2. Set VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX in frontend/.env
 *   3. Replace each slot="..." with your actual ad unit slot IDs from AdSense
 */

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || '';
const IS_DEV  = import.meta.env.DEV;

export default function AdSlot({ slot, width = 320, height = 100, style }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!CLIENT || !ref.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, []);

  if (IS_DEV || !CLIENT) {
    return (
      <div style={{ ...placeholder, width, height, ...style }}>
        <span style={adLabel}>Ad</span>
        <span style={adSize}>{width}×{height}</span>
      </div>
    );
  }

  return (
    <div style={style}>
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: 'block', width, height }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="fixed"
      />
    </div>
  );
}

const placeholder = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  background: 'rgba(255,255,255,0.03)',
  border: '1px dashed rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.2)',
};
const adLabel = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' };
const adSize  = { fontSize: 9 };
