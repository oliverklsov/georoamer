import { useRef } from 'react';

export default function PinInput({ value, onChange, disabled }) {
  const inputs = useRef([]);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  function handleChange(i, e) {
    const ch = e.target.value.replace(/\D/g, '').slice(-1);
    const next = digits.map((d, idx) => idx === i ? ch : d).join('');
    onChange(next);
    if (ch && i < 5) inputs.current[i + 1]?.focus();
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = digits.map((d, idx) => idx === i ? '' : d).join('');
        onChange(next);
      } else if (i > 0) {
        inputs.current[i - 1]?.focus();
        const next = digits.map((d, idx) => idx === i - 1 ? '' : d).join('');
        onChange(next);
      }
      e.preventDefault();
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted.padEnd(6, '').slice(0, 6).replace(/ /g, ''));
      onChange(pasted);
      inputs.current[Math.min(pasted.length, 5)]?.focus();
    }
    e.preventDefault();
  }

  return (
    <div style={styles.row}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => inputs.current[i] = el}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          style={{
            ...styles.box,
            borderColor: d ? 'var(--primary)' : 'var(--border)',
          }}
        />
      ))}
    </div>
  );
}

const styles = {
  row: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
  },
  box: {
    width: 44,
    height: 52,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: 700,
    background: 'var(--surface2)',
    border: '2px solid',
    borderRadius: 8,
    color: 'var(--text)',
    outline: 'none',
    padding: 0,
    transition: 'border-color 0.15s',
    caretColor: 'transparent',
  },
};
