'use client';
import { useEffect, useRef, useState } from 'react';
import { fmtExec } from './format';
import { HORIZON } from './portfolio';
import { yScale } from './scale';

type Props = { cumulative: number[]; breakeven: number | null; golive: number; beNote?: string; width?: number; height?: number; interactive?: boolean };

const money = (v: number) => (v === 0 ? '$0' : fmtExec(v));
let uid = 0;

// Cumulative net benefit over 36 months. Drawn at its real pixel width so text
// stays at its set size on a phone, a projector and in print (pass `width` for print).
export default function NetBenefitChart({ cumulative, breakeven, golive, beNote = '', width, height, interactive = true }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(width ?? 900);
  const [hover, setHover] = useState<number | null>(null);
  const id = useRef('net' + ++uid).current;
  useEffect(() => {
    if (width || !wrap.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setMeasured(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [width]);

  const W = width ?? measured;
  const H = height ?? Math.round(Math.min(300, Math.max(210, W * 0.3)));
  const L = 58, R = 64, T = 30, B = 30;
  const min = Math.min(0, ...cumulative), max = Math.max(0, ...cumulative);
  const { top: yMax, bottom: yMin, ticks } = yScale(min, max);
  const x = (m: number) => L + (m / HORIZON) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - T - B);
  const line = cumulative.map((v, m) => (m ? 'L' : 'M') + x(m).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
  const area = line + `L${x(HORIZON)} ${y(0)}L${x(0)} ${y(0)}Z`;
  const end = cumulative[HORIZON];
  const xTicks = W >= 560 ? [0, 6, 12, 24, 36] : [0, 12, 24, 36];
  const xLabel = (m: number) => (m === 0 ? 'Start' : m % 12 === 0 ? `Year ${m / 12}` : `Month ${m}`);
  const merged = breakeven !== null && breakeven > 0 && golive > 0 && breakeven - golive <= 2;
  const trough = cumulative.indexOf(min);
  const showTrough = min < -500;
  const hv = hover === null ? null : cumulative[hover];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(HORIZON, Math.round(((px - L) / (W - L - R)) * HORIZON))));
  };

  return (
    <div className="net-wrap" ref={wrap}>
      <svg className="net" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Cumulative net benefit after everything paid to Contiinex: ${money(end)} after three years${breakeven ? `, break-even in month ${breakeven}${beNote}` : ''}.`}>
        <defs>
          <clipPath id={id + '-above'}><rect x={0} y={0} width={W} height={y(0)} /></clipPath>
          <clipPath id={id + '-below'}><rect x={0} y={y(0)} width={W} height={H} /></clipPath>
        </defs>
        {ticks.map(v => (
          <g key={v}>
            <line className={'grid' + (v === 0 ? ' zero' : '')} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text className="axis" x={L - 8} y={y(v) + 4} textAnchor="end">{money(v)}</text>
          </g>
        ))}
        {xTicks.map(m => (
          <text key={m} className="axis" x={x(m)} y={H - 8} textAnchor={m === 0 ? 'start' : m === HORIZON ? 'end' : 'middle'}>{xLabel(m)}</text>
        ))}
        <path className="area pos" d={area} clipPath={`url(#${id}-above)`} />
        <path className="area neg" d={area} clipPath={`url(#${id}-below)`} />
        <path className="curve" d={line} />
        {merged ? (
          <g className="marker be">
            <line x1={x(breakeven!)} x2={x(breakeven!)} y1={T - 6} y2={H - B} />
            <text x={x(breakeven!) + 6} y={T - 12}>Go-live month {golive} · break-even month {breakeven}{beNote}</text>
          </g>
        ) : (
          <>
            {golive > 0 && golive < HORIZON && (
              <g className="marker golive">
                <line x1={x(golive)} x2={x(golive)} y1={T - 6} y2={H - B} />
                <text x={x(golive) + 6} y={T - 12}>Go-live month {golive}</text>
              </g>
            )}
            {breakeven !== null && breakeven > 0 && (
              <g className="marker be">
                <line x1={x(breakeven)} x2={x(breakeven)} y1={T + 10} y2={H - B} />
                <text x={x(breakeven) + 6} y={T + 6}>Break-even month {breakeven}{beNote}</text>
              </g>
            )}
          </>
        )}
        {showTrough && (
          <g className="marker trough">
            <circle cx={x(trough)} cy={y(min)} r={4} />
            <text x={x(trough) + 8} y={Math.min(y(min) + 16, H - B - 2)}>Peak investment {money(min)}</text>
          </g>
        )}
        <circle className="end-dot" cx={x(HORIZON)} cy={y(end)} r={5} />
        <text className="end-label" x={x(HORIZON) + 8} y={y(end) + 4}>{money(end)}</text>
        {interactive && hover !== null && hv !== null && (
          <g className="crosshair">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />
            <circle cx={x(hover)} cy={y(hv)} r={5} />
          </g>
        )}
        {interactive && <rect className="hit" x={L} y={T} width={W - L - R} height={H - T - B} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />}
      </svg>
      {interactive && hover !== null && hv !== null && (
        <div className="net-tip" style={{ left: x(hover) }}>
          <b>{money(hv)}</b>
          <span>cumulative net · month {hover}</span>
        </div>
      )}
    </div>
  );
}
