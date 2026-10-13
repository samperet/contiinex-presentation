'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compute, fmt as F, summary, VENDOR, type Inputs, type Pair, type Solution } from './model';

type Fmt = 'x' | 'hours' | 'compact';
const formatCount = (v: number, f: Fmt) =>
  f === 'x' ? F.oneDp.format(v) + 'x' : f === 'hours' ? (v >= 1e4 ? Math.round(v / 1e3) + 'K' : F.int(v)) + ' hrs' : (v < 0 ? '−' : '') + F.moneyCompact(v);

// Counts a headline number up from zero when it appears, then eases between values.
function Count({ value, f }: { value: number; f: Fmt }) {
  const [shown, setShown] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); last.current = value; return; }
    let raf = 0;
    const from = last.current, start = performance.now(), dur = 650;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      last.current = from + (value - from) * (1 - Math.pow(1 - t, 3));
      setShown(last.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{formatCount(shown, f)}</>;
}

export type ExecProps = {
  sol: Solution;
  inp: Inputs;
  hospital: string;
  compact?: boolean; // the Pricing slide shows the headline sections only
  actions?: ReactNode;
  answers?: ReactNode;
};

export default function ExecSummary({ sol, inp, hospital, compact, actions, answers }: ExecProps) {
  const r = compute(inp, sol);
  const v = summary(r, sol, inp, hospital);
  const d = r.D;
  const payback = v.paybackMonths > 0 ? (v.paybackMonths < 1 ? 'under 1 month' : F.oneDp.format(v.paybackMonths) + ' months') : 'n/a';
  const who = v.hospital || 'a ' + v.nprTxt + ' hospital';
  const neg = v.costVal < 0;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const Title = compact ? 'h3' : 'h1';

  return (
    <article className={'roi-exec' + (compact ? ' compact' : '')}>
      <header className="exec-head">
        <div>
          <p className="exec-eyebrow">{v.eyebrow}</p>
          <Title className="exec-title">
            {VENDOR} adds <em>{v.totalTxt}</em> to EBITDA a year for {who}.
          </Title>
          {!compact && <p className="exec-date">{today} · {sol.name} · {v.nprTxt} NPR</p>}
        </div>
        {actions && <div className="exec-actions">{actions}</div>}
      </header>

      <section className="exec-hero">
        <div className="exec-card roi-card">
          <p className="k">Return on {VENDOR} spend</p>
          <p className="big"><Count value={v.roiX} f="x" /></p>
          <p className="s">{v.roiSub}</p>
          <dl className="mini">
            <div><dt>Payback</dt><dd>{payback}</dd></div>
            <div><dt>Annual spend</dt><dd>{F.moneyCompact(v.spend)}</dd></div>
          </dl>
        </div>
        <div className="exec-card">
          <p className="k">Where the {v.totalTxt} comes from</p>
          <div className="split" role="img" aria-label={`${v.revLabel} ${F.moneyCompact(v.revVal)}, operating cost saved ${F.moneyCompact(v.costVal)}`}>
            <span className="seg rev" style={{ width: v.pctRev + '%' }} />
            <span className="seg cost" style={{ width: v.pctCost + '%' }} />
          </div>
          <ul className="exec-legend">
            <li><i className="dot rev" /><span>{v.revLabel}</span><b>{F.moneyCompact(v.revVal)}</b><em>{Math.round(v.pctRev)}%</em></li>
            <li><i className="dot cost" /><span>RCM operating cost saved</span><b>{(neg ? '−' : '') + F.moneyCompact(v.costVal)}</b><em>{Math.round(v.pctCost)}%</em></li>
          </ul>
          <dl className="deltas">
            <Delta label="EBITDA" from={F.moneyCompact(v.ebitdaFrom)} to={F.moneyCompact(v.ebitdaTo)} change={'+' + v.totalTxt} />
            <Delta label="EBITDA margin" from={v.marginFrom} to={v.marginTo} change={v.marginBps} />
            <Delta label={v.revRealized ? 'Realized revenue' : 'Hospital revenue'} from={F.moneyCompact(v.revFrom)} to={F.moneyCompact(v.revTo)} change={'+' + F.moneyCompact(v.revVal)} />
          </dl>
        </div>
      </section>

      <section className="exec-kpis">
        <div className="exec-card">
          <p className="k">Operating cost saved</p>
          <p className="big"><Count value={d.saved} f="compact" /></p>
          <div className="s exec-lines">
            <span><span>{v.savedProcessLabel}</span><b>{v.savedProcessVal}</b></span>
            {sol.rework && <span><span>{v.savedReworkLabel}</span><b>{v.savedReworkVal}</b></span>}
          </div>
        </div>
        <div className="exec-card">
          <p className="k">Staff hours freed</p>
          <p className="big"><Count value={r.hoursSaved} f="hours" /></p>
          <p className="s">{v.hoursSub}</p>
        </div>
        <div className="exec-card">
          <p className="k">{v.revKicker}</p>
          <p className="big"><Count value={d.cap} f="compact" /></p>
          <p className="s">{v.revSub}</p>
        </div>
      </section>

      {!compact && (
        <>
          <section className="exec-grid">
            <div className="exec-card">
              <h3>EBITDA bridge</h3>
              <p className="sub">Annual, today and with {VENDOR}</p>
              <Bridge e0={d.e0} cap={d.cap} saved={d.saved} e1={d.e1} />
            </div>
            <div className="exec-card">
              <h3>Revenue funnel</h3>
              <p className="sub">{sol.funnel[0]}, down to what {VENDOR} captures</p>
              <ol className="hbars">
                {v.funnel.map((st, i) => (
                  <li key={st.label}>
                    <span className="bl">{st.label}</span>
                    <span className="track"><span className={'bar f' + i} style={{ width: Math.max((st.value / Math.max(v.funnel[0].value, 1)) * 100, 0.6) + '%' }} /></span>
                    <b>{F.moneyCompact(st.value)}</b>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="exec-grid">
            <div className="exec-card">
              <h3>Process time</h3>
              <p className="sub">{v.timeSub}</p>
              <Pairs rows={v.timeRows} />
            </div>
            <div className="exec-card">
              <h3>{sol.denial ? 'Denial impact' : 'Revenue leakage'}</h3>
              <p className="sub">{v.leakSub}</p>
              <Pairs rows={v.leakRows} />
            </div>
          </section>

          <section className="exec-card">
            <h3>Unit economics</h3>
            <div className="units">
              <Unit label="Manual cost today" value={v.manualCostTxt} sub={v.manualCostSub} />
              <Unit label={'Cost per ' + sol.one} value={v.cpuTxt} sub={v.cpuSub} />
              <Unit label={VENDOR + ' price per ' + sol.one} value={v.priceTxt} sub={inp.price + '% of the manual cost'} />
              <Unit label="Automated volume" value={F.pct(inp.auto, 0)} sub={v.automatedSub} />
            </div>
          </section>

          <section className="exec-grid bottom">
            {answers}
            <div className="exec-card breakdown">
              <h3>Detailed calculation</h3>
              <p className="sub">Every step of the model, for finance teams</p>
              {v.breakdown.map((sec, i) => (
                <details key={sec.title} open={i === 4}>
                  <summary>{sec.title}</summary>
                  <table>
                    <tbody>
                      {sec.rows.map(row => (
                        <tr key={row.label} className={row.cls}><th scope="row">{row.label}</th><td>{row.value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </article>
  );
}

function Delta({ label, from, to, change }: { label: string; from: string; to: string; change: string }) {
  return <div><dt>{label}</dt><dd>{from} <span className="arrow">→</span> <b>{to}</b> <span className="chg">{change}</span></dd></div>;
}

function Unit({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="unit"><p className="k">{label}</p><p className="v">{value}</p><p className="s">{sub}</p></div>;
}

function Bridge({ e0, cap, saved, e1 }: { e0: number; cap: number; saved: number; e1: number }) {
  const afterRev = e0 + cap;
  const max = Math.max(e0, afterRev, e1, 1);
  const sign = saved < 0 ? '−' : '+';
  const rows = [
    { label: 'EBITDA today', from: 0, to: e0, cls: 'base', val: F.moneyCompact(e0) },
    { label: '+ Revenue', from: e0, to: afterRev, cls: 'rev', val: '+' + F.moneyCompact(cap) },
    { label: sign + ' Cost saved', from: afterRev, to: e1, cls: saved < 0 ? 'neg' : 'cost', val: sign + F.moneyCompact(saved) },
    { label: 'EBITDA with ' + VENDOR, from: 0, to: e1, cls: 'total', val: F.moneyCompact(e1) },
  ];
  return (
    <ol className="hbars" aria-label={`EBITDA today ${F.moneyCompact(e0)}, plus ${F.moneyCompact(cap)} revenue, ${sign}${F.moneyCompact(saved)} cost saved, equals ${F.moneyCompact(e1)}`}>
      {rows.map(b => {
        const lo = Math.min(b.from, b.to), hi = Math.max(b.from, b.to);
        return (
          <li key={b.label}>
            <span className="bl">{b.label}</span>
            <span className="track"><span className={'bar ' + b.cls} style={{ left: (lo / max) * 100 + '%', width: Math.max(((hi - lo) / max) * 100, 0.4) + '%' }} /></span>
            <b>{b.val}</b>
          </li>
        );
      })}
    </ol>
  );
}

function Pairs({ rows }: { rows: Pair[] }) {
  return (
    <>
      {rows.map(p => (
        <div className="pair" key={p.label}>
          <div className="pair-top"><span>{p.label}</span><span className="chg">{p.delta}</span></div>
          <div className="pbar"><span className="pl">Today</span><span className="track"><span className="bar before" style={{ width: p.beforePct + '%' }} /></span><b>{p.beforeTxt}</b></div>
          <div className="pbar"><span className="pl">With {VENDOR}</span><span className="track"><span className="bar after" style={{ width: p.afterPct + '%' }} /></span><b>{p.afterTxt}</b></div>
        </div>
      ))}
    </>
  );
}
