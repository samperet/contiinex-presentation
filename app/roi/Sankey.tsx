'use client';
import { fmt as F, VENDOR } from './model';
import type { Portfolio } from './portfolio';

type Node = { id: string; name: string; value: number; cls: string };
type Link = { from: string; to: string; value: number; cls: string; label: string };

const W = 960, H = 440, NW = 16, X0 = 230, X1 = 714, PADY = 16, GAP = 22;

// Annual flow: today's manual spend and the revenue at risk, and where each dollar ends up.
export default function Sankey({ p }: { p: Portfolio }) {
  const saved = Math.max(0, p.hoursValue - p.spend);
  const paid = Math.min(p.spend, p.hoursValue);
  const extra = Math.max(0, p.spend - p.hoursValue); // spend beyond the staff time it replaces
  const lost = Math.max(0, p.addressable - p.cap);
  const left: Node[] = [
    { id: 'manual', name: 'Manual RCM spend today', value: p.staff0, cls: 'n-src' },
    { id: 'risk', name: 'Revenue at risk', value: p.addressable, cls: 'n-risk' },
  ];
  const right: Node[] = [
    { id: 'paid', name: 'Paid to ' + VENDOR, value: p.spend, cls: 'n-paid' },
    { id: 'staff', name: 'Staff time kept for exceptions', value: Math.max(0, p.staffLeft), cls: 'n-grey' },
    { id: 'ebitda', name: 'Added to EBITDA', value: saved + p.cap, cls: 'n-ebitda' },
    { id: 'lost', name: 'Revenue still lost', value: lost, cls: 'n-lost' },
  ];
  const links: Link[] = [
    { from: 'manual', to: 'paid', value: paid, cls: 'l-paid', label: VENDOR },
    { from: 'manual', to: 'staff', value: Math.max(0, p.staffLeft), cls: 'l-grey', label: '' },
    { from: 'manual', to: 'ebitda', value: saved, cls: 'l-ebitda', label: 'Cost saved' },
    { from: 'risk', to: 'ebitda', value: p.cap, cls: 'l-ebitda', label: 'Captured' },
    { from: 'risk', to: 'lost', value: lost, cls: 'l-lost', label: '' },
  ];
  if (extra > 0) {
    left.push({ id: 'extra', name: 'Spend above staff time replaced', value: extra, cls: 'n-paid' });
    links.push({ from: 'extra', to: 'paid', value: extra, cls: 'l-paid', label: '' });
  }

  const totalL = left.reduce((t, n) => t + n.value, 0), totalR = right.reduce((t, n) => t + n.value, 0);
  const k = (H - 2 * PADY - GAP * (Math.max(left.length, right.length) - 1)) / Math.max(totalL, totalR, 1);
  const h = (v: number) => (v > 0 ? Math.max(v * k, 2) : 0);
  const pos: Record<string, { x: number; y: number; h: number }> = {};
  const place = (nodes: Node[], x: number) => { let y = PADY; nodes.forEach(n => { pos[n.id] = { x, y, h: h(n.value) }; y += h(n.value) + (n.value > 0 ? GAP : 0); }); };
  place(left, X0); place(right, X1);

  const outOff: Record<string, number> = {}, inOff: Record<string, number> = {};
  const bands = links.filter(l => l.value > 0).map(l => {
    const bh = h(l.value), s = pos[l.from], t = pos[l.to];
    const y0 = s.y + (outOff[l.from] || 0), y1 = t.y + (inOff[l.to] || 0);
    outOff[l.from] = (outOff[l.from] || 0) + bh; inOff[l.to] = (inOff[l.to] || 0) + bh;
    const x0 = s.x + NW, x1 = t.x, mx = (x0 + x1) / 2;
    return {
      ...l, mid: { x: mx, y: (y0 + y1) / 2 + bh / 2 },
      d: `M${x0} ${y0}C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}L${x1} ${y1 + bh}C${mx} ${y1 + bh} ${mx} ${y0 + bh} ${x0} ${y0 + bh}Z`,
    };
  });
  const label = (n: Node, side: 'l' | 'r') => {
    const q = pos[n.id];
    if (n.value <= 0) return null;
    const x = side === 'l' ? q.x - 12 : q.x + NW + 12;
    const y = q.y + Math.min(q.h / 2, 24);
    return (
      <text key={'t' + n.id} className="nlabel" x={x} y={y} textAnchor={side === 'l' ? 'end' : 'start'}>
        <tspan className="nname">{n.name}</tspan>
        <tspan className="nval" x={x} dy="19">{F.moneyCompact(n.value)}</tspan>
      </text>
    );
  };
  const desc = `Of ${F.moneyCompact(p.staff0)} of manual RCM spend, ${F.moneyCompact(p.spend)} is paid to ${VENDOR}, ${F.moneyCompact(saved)} is saved and ${F.moneyCompact(p.staffLeft)} stays with staff. Of ${F.moneyCompact(p.addressable)} of revenue at risk, ${F.moneyCompact(p.cap)} is captured. ${F.moneyCompact(saved + p.cap)} is added to EBITDA.`;

  return (
    <div className="sankey-wrap">
      <svg className="sankey" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc}>
        {bands.map(b => (
          <path key={b.from + b.to} className={'band ' + b.cls} d={b.d}>
            <title>{`${left.concat(right).find(n => n.id === b.from)?.name} → ${right.find(n => n.id === b.to)?.name}: ${F.money(b.value)} a year`}</title>
          </path>
        ))}
        {left.concat(right).filter(n => n.value > 0).map(n => (
          <rect key={n.id} className={'node ' + n.cls} x={pos[n.id].x} y={pos[n.id].y} width={NW} height={pos[n.id].h} rx="3">
            <title>{`${n.name}: ${F.money(n.value)} a year`}</title>
          </rect>
        ))}
        {left.map(n => label(n, 'l'))}
        {right.map(n => label(n, 'r'))}
        {bands.filter(b => b.label && h(b.value) >= 10).map(b => (
          <text key={'b' + b.from + b.to} className="blabel" x={b.mid.x} y={b.mid.y + 4} textAnchor="middle">{b.label} · {F.moneyCompact(b.value)}</text>
        ))}
      </svg>
      <div className="flow-legend">
        <span><i className="k-src" />Today’s spend</span>
        <span><i className="k-paid" />Paid to {VENDOR}</span>
        <span><i className="k-ebitda" />Added to EBITDA</span>
        <span><i className="k-grey" />Unchanged</span>
        <span><i className="k-lost" />Still lost</span>
      </div>
    </div>
  );
}
