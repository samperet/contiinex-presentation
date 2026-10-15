'use client';
import { useState } from 'react';
import { fmt as F } from './model';
import { HORIZON } from './portfolio';
import { yScale } from './scale';

const W = 960, H = 300, L = 64, R = 24, T = 18, B = 34;

export default function NetBenefitChart({ cumulative, breakeven, golive }: { cumulative: number[]; breakeven: number | null; golive: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const { top: yMax, bottom: yMin, ticks: ys } = yScale(Math.min(0, ...cumulative), Math.max(0, ...cumulative));
  const x = (m: number) => L + (m / HORIZON) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - T - B);
  const line = cumulative.map((v, m) => (m ? 'L' : 'M') + x(m).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
  const area = line + `L${x(HORIZON)} ${y(0)}L${x(0)} ${y(0)}Z`;
  const end = cumulative[HORIZON];
  const hv = hover === null ? null : cumulative[hover];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(HORIZON, Math.round(((px - L) / (W - L - R)) * HORIZON))));
  };

  return (
    <div className="net-wrap">
      <svg className="net" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Cumulative net benefit over ${HORIZON} months: ${F.moneyCompact(end)} by month ${HORIZON}${breakeven ? `, break-even in month ${breakeven}` : ''}.`}>
        <defs>
          <clipPath id="net-above"><rect x={0} y={0} width={W} height={y(0)} /></clipPath>
          <clipPath id="net-below"><rect x={0} y={y(0)} width={W} height={H} /></clipPath>
        </defs>
        {ys.map(v => (
          <g key={v}>
            <line className={'grid' + (v === 0 ? ' zero' : '')} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text className="axis" x={L - 10} y={y(v) + 4} textAnchor="end">{v === 0 ? '$0' : (v < 0 ? '−' : '') + F.moneyCompact(v)}</text>
          </g>
        ))}
        {[0, 6, 12, 18, 24, 30, 36].map(m => (
          <text key={m} className="axis" x={x(m)} y={H - 10} textAnchor="middle">{m === 0 ? 'Start' : m % 12 === 0 ? `Year ${m / 12}` : `M${m}`}</text>
        ))}
        <path className="area pos" d={area} clipPath="url(#net-above)" />
        <path className="area neg" d={area} clipPath="url(#net-below)" />
        <path className="curve" d={line} />
        {golive > 0 && golive < HORIZON && (
          <g className="marker golive">
            <line x1={x(golive)} x2={x(golive)} y1={T} y2={H - B} />
            <text x={x(golive) + 6} y={T + 10}>Go-live</text>
          </g>
        )}
        {breakeven !== null && breakeven > 0 && (
          <g className="marker be">
            <line x1={x(breakeven)} x2={x(breakeven)} y1={T} y2={H - B} />
            <circle cx={x(breakeven)} cy={y(cumulative[breakeven])} r={5} />
            <text x={x(breakeven) + 8} y={T + 28}>Break-even · month {breakeven}</text>
          </g>
        )}
        <circle className="end-dot" cx={x(HORIZON)} cy={y(end)} r={5} />
        {hover !== null && hv !== null && (
          <g className="crosshair">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />
            <circle cx={x(hover)} cy={y(hv)} r={5} />
          </g>
        )}
        <rect className="hit" x={L} y={T} width={W - L - R} height={H - T - B} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && hv !== null && (
        <div className="net-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{hv < 0 ? '−' : ''}{F.moneyCompact(hv)}</b>
          <span>cumulative net · month {hover}</span>
        </div>
      )}
    </div>
  );
}
