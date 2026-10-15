// Vertical scale: the top rounds up to the next round step so the line always
// fits; below zero there is just enough room to show any dip.
export function yScale(min: number, max: number) {
  const span = Math.max(max - min, 1);
  const raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const top = max > 0 ? Math.ceil(max / step - 1e-9) * step : span * 0.08;
  const bottom = min < 0 ? min - span * 0.08 : 0;
  const ticks: number[] = [];
  for (let v = Math.ceil(bottom / step) * step; v <= top + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return { top, bottom, ticks };
}
