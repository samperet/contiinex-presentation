// One money format for every executive surface: the report, the PDF, the deck slide and the intake.
export function fmtExec(v: number, decimals?: number): string {
  const a = Math.abs(v), sign = v < 0 ? '−' : '';
  if (a < 0.5) return '$0';
  if (decimals !== undefined && a >= 1e6) return sign + '$' + (a / 1e6).toFixed(decimals) + 'M';
  if (a >= 1e9) return sign + '$' + +(a / 1e9).toFixed(1) + 'B';
  if (a >= 10e6) return sign + '$' + Math.round(a / 1e6) + 'M';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(1) + 'M';
  return sign + '$' + Math.round(a / 1e3) + 'K';
}

// Round signed values to multiples of `step` so they add up exactly to `total`
// rounded the same way (largest-remainder: only the values closest to a rounding
// boundary move, by one step each).
export function roundToTotal(values: number[], total: number, step: number): { values: number[]; total: number } {
  const u = values.map(v => v / step);
  const r = u.map(Math.round);
  const target = Math.round(total / step);
  let diff = target - r.reduce((t, x) => t + x, 0);
  const moved = new Set<number>();
  while (diff !== 0) {
    const s = Math.sign(diff);
    let best = -1, cost = Infinity;
    r.forEach((x, i) => {
      if (moved.has(i)) return;
      const c = Math.abs(x + s - u[i]);
      if (c < cost) { cost = c; best = i; }
    });
    if (best < 0) break;
    r[best] += s; moved.add(best); diff -= s;
  }
  return { values: r.map(x => x * step), total: target * step };
}

export type Part = { key: string; sign: '+' | '−'; value: number };

// The executive number and the lines that add up to it: whole millions from $10M,
// otherwise one decimal; the displayed lines always add up to the displayed total.
export function addUp(parts: Part[], total: number): { total: string; parts: string[] } {
  const signed = parts.map(p => (p.sign === '+' ? p.value : -p.value));
  if (Math.abs(total) < 1e6) return { total: fmtExec(total), parts: parts.map(p => fmtExec(p.value)) };
  const whole = Math.abs(total) >= 10e6 && parts.every(p => Math.abs(p.value) >= 1e6);
  const step = whole ? 1e6 : 1e5;
  const r = roundToTotal(signed, total, step);
  const f = (v: number) => '$' + (whole ? Math.round(Math.abs(v) / 1e6) : (Math.abs(v) / 1e6).toFixed(1)) + 'M';
  return { total: (r.total < 0 ? '−' : '') + f(r.total), parts: r.values.map(f) };
}

export const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
