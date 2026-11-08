'use client';
import { getSolution, VENDOR } from './model';
import { portfolio, singleModulePlan } from './portfolio';
import { addUp, fmtExec } from './format';

// One-module summary on the deck's Pricing slide. Same engine, scope and rounding
// as the calculator it links to, so the slide and the calculator show the same number.
export default function ExecSummary({ solId, npr }: { solId: string; npr: number }) {
  const sol = getSolution(solId);
  const p = portfolio(singleModulePlan(sol.id, npr));
  const shown = addUp([
    { key: 'rec', sign: '+', value: p.cap },
    { key: 'staff', sign: '+', value: p.hoursValue },
    { key: 'paid', sign: '−', value: p.spend },
  ], p.total);
  const rev = p.capNew > 0 ? 'new patient volume, before cost of care' : sol.denial ? 'revenue protected from denials' : 'revenue recovered';
  return (
    <article className="roi-slide-sum">
      <p className="slide-eyebrow">One-module example · {sol.name}</p>
      <p className="slide-hero">About {shown.total} a year added to EBITDA</p>
      <p className="slide-sub">{sol.name} alone, at full run-rate, on typical values for a {fmtExec(npr)} hospital. After everything paid to {VENDOR}. An estimate, not a quote.</p>
      <ul className="slide-row">
        <li><b>+{shown.parts[0]}</b>{rev}</li>
        <li><b>+{shown.parts[1]}</b>staff cost removed</li>
        <li><b>−{shown.parts[2]}</b>paid to {VENDOR}</li>
        <li><b>{p.breakeven === null ? 'Not within 3 yrs' : p.breakeven === 0 ? 'From the start' : 'Month ' + p.breakeven}</b>break-even</li>
      </ul>
    </article>
  );
}
