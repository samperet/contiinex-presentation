'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { fmt as F, GROUPS, SOLUTIONS, summary, VENDOR, type Field, type Pair } from './model';
import NetBenefitChart from './NetBenefitChart';
import { hospitalQuestions, moduleQuestions, walkQuestions, type IQ } from './intake';
import {
  clearSaved, defaultPlan, DENIAL_POOL_IDS, license, SIZE_BASE_NPR, loadSaved, moduleInputs, moduleValue, MODULE_KEYS, NEW_VOLUME_IDS, planFromHash,
  planToHash, portfolio, sanitizePlan, savePlan, singleModulePlan, typicalCount, withRecommendedScope, type Plan, type Portfolio, type Saved,
} from './portfolio';
import { clamp, fieldText, parseField, prefix, rangeText, suffix, validate } from './questions';
import { addUp, fmtExec, roundToTotal, today } from './format';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// One-click revenue sizes; typical volumes and staff scale with revenue until entered.
const SIZES = [250e6, 500e6, 1e9, 2e9];
// Report wording for the model's detailed-calculation labels (model.ts stays byte-identical).
const GLOSSARY: Record<string, string> = {
  'Total (direct + prevented) cost saved': 'Staff cost removed, less usage',
  'Total revenue added to NPR': 'Revenue recovered',
  'Total $ P&L impact (revenue + savings)': 'Contribution a year (this module alone)',
};
type View = { kind: 'report' } | { kind: 'intake'; set: 'hospital' | string; step: number };
type Start = { plan: Plan; resume: Saved | null; fromLink: boolean };

// The plan comes from the link only. Saved work is offered, never shown
// automatically, so one hospital's name and figures never open in front of another.
// ?p=&npr= come from the deck's Pricing slide; ?p=...&agents=...#results is the earlier single-process link.
function start(): Start {
  if (typeof window === 'undefined') return { plan: defaultPlan(), resume: null, fromLink: false };
  const saved = loadSaved();
  const q = new URLSearchParams(window.location.search);
  const p = q.get('p');
  const npr = Number(q.get('npr'));
  let plan: Plan | null = planFromHash(window.location.hash);
  if (!plan && q.has('agents') && p && SOLUTIONS.some(s => s.id === p)) {
    const g: Record<string, string> = {}, inp: Record<string, string> = {};
    q.forEach((v, k) => { if (MODULE_KEYS.includes(k)) inp[k] = v; else g[k] = v; });
    g.license = g.fee ?? '0';
    plan = sanitizePlan({ hospital: q.get('h') ?? '', g, licenseSet: true, mods: Object.fromEntries(SOLUTIONS.map(s => [s.id, s.id === p ? { on: true, inp, set: Object.keys(inp) } : { on: false }])) });
  } else if (!plan && p && SOLUTIONS.some(s => s.id === p)) {
    plan = singleModulePlan(p, isFinite(npr) && npr > 0 ? npr : undefined);
  }
  window.history.replaceState(null, '', window.location.pathname + (plan ? '#' + planToHash(plan) : ''));
  const offer = saved && (saved.plan.hospital.trim() || JSON.stringify(saved.plan) !== JSON.stringify(defaultPlan())) ? saved : null;
  return { plan: plan ?? defaultPlan(), resume: offer, fromLink: !!plan };
}

export default function RoiPage() {
  const init = useMemo(start, []);
  const [plan, setPlanState] = useState<Plan>(init.plan);
  const [resume, setResume] = useState<Saved | null>(init.resume);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<View>({ kind: 'report' });
  const [copied, setCopied] = useState(false);
  const lastModule = useRef<string | null>(null);
  const returnFocus = useRef<string | null>(null);
  // A named save is never overwritten by a different plan until the advisor resumes, discards or starts a new hospital.
  const protectedName = useRef(init.resume?.plan.hospital.trim() || '');
  const setPlan = (f: (p: Plan) => Plan) => { setPlanState(f); setDirty(true); };
  const p = portfolio(plan);
  const who = plan.hospital.trim() || 'a ' + fmtExec(plan.g.npr) + ' hospital';
  const date = today();

  // Save only once this session has changed something, so opening the page never overwrites saved work.
  useEffect(() => {
    if (!dirty) return;
    if (!protectedName.current || plan.hospital.trim() === protectedName.current) savePlan(plan, date);
  }, [plan, dirty, date]);
  // Keep what is on screen in the address bar, so a reload rebuilds it.
  useEffect(() => {
    if (init.fromLink || dirty) window.history.replaceState(null, '', window.location.pathname + '#' + planToHash(plan));
  }, [plan, dirty, init.fromLink]);
  useEffect(() => { document.title = `Contiinex ROI estimate – ${plan.hospital.trim() || fmtExec(plan.g.npr) + ' hospital'} – ${date}`; }, [plan.hospital, plan.g.npr, date]);
  useEffect(() => {
    if (view.kind !== 'report') return;
    const id = lastModule.current;
    lastModule.current = null;
    if (id) document.getElementById('mod-' + id)?.scrollIntoView({ block: 'center' });
    else if (!returnFocus.current) window.scrollTo(0, 0);
    const sel = returnFocus.current;
    returnFocus.current = null;
    if (sel) document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: !!id });
  }, [view.kind]);
  useEffect(() => {
    const open = () => document.querySelectorAll('.report details').forEach(d => ((d as HTMLDetailsElement).open = true));
    window.addEventListener('beforeprint', open);
    return () => window.removeEventListener('beforeprint', open);
  }, []);

  const questionsFor = (set: string) => (set === 'hospital' ? hospitalQuestions() : set === 'all' ? walkQuestions(plan) : moduleQuestions(set));
  const openIntake = (set: 'hospital' | 'all' | string, key?: string) => {
    const qs = questionsFor(set);
    if (set !== 'hospital' && set !== 'all') lastModule.current = set;
    returnFocus.current = set === 'all' ? '#walk-btn' : set === 'hospital' ? (key ? `[data-akey="${key}"]` : '#tailor-btn') : `#mod-${set} button.fine`;
    setView({ kind: 'intake', set, step: Math.max(0, key ? qs.findIndex(q => q.key === key) : 0) });
  };
  const copyLink = () => {
    const url = window.location.href.split(/[?#]/)[0] + '#' + planToHash(plan);
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link:', url));
    else window.prompt('Copy this link:', url);
  };
  const newHospital = () => {
    clearSaved(); protectedName.current = ''; setPlanState(defaultPlan()); setDirty(false); setResume(null); setEditing(false);
    window.history.replaceState(null, '', window.location.pathname); window.scrollTo(0, 0);
  };

  if (view.kind === 'intake') {
    return (
      <main className="roi-page mode-intake">
        <TopBar />
        <Intake
          key={view.set}
          plan={plan} setPlan={setPlan}
          questions={questionsFor(view.set)}
          title={view.set === 'all' ? 'Walkthrough of the variables' : view.set === 'hospital' ? 'Tailor to your hospital' : 'Fine-tune · ' + SOLUTIONS.find(s => s.id === view.set)!.name}
          start={view.step}
          onDone={() => setView({ kind: 'report' })}
        />
      </main>
    );
  }

  return (
    <main className={'roi-page mode-report' + (editing ? ' is-editing' : '')}>
      <TopBar>
        <button type="button" className={'roi-btn sm ' + (editing ? 'primary' : 'ghost')} onClick={() => setEditing(e => !e)}>{editing ? 'Done editing' : 'Edit inputs'}</button>
        <button type="button" className="linkish" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
        <button type="button" className="linkish" onClick={() => window.print()}>Save PDF</button>
        <button type="button" className="linkish" onClick={newHospital}>New hospital</button>
      </TopBar>
      {resume && (
        <div className="resume-line">
          <span>Saved estimate{resume.savedAt ? ` from ${resume.savedAt}` : ''}</span>
          <button type="button" className="linkish" onClick={() => { protectedName.current = ''; setPlanState(resume.plan); setDirty(true); setResume(null); }}>Resume</button>
          <button type="button" className="linkish muted" onClick={() => { protectedName.current = ''; clearSaved(); setResume(null); }}>Discard</button>
        </div>
      )}
      <div className="report-layout">
        {editing && <EditPanel plan={plan} p={p} setPlan={setPlan} openIntake={openIntake} />}
        <Report plan={plan} p={p} who={who} date={date} setPlan={setPlan} onWalk={() => openIntake('all')} />
      </div>
    </main>
  );
}

function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="roi-top">
      <a className="brand" href="./index.html"><img src="./brand/contiinex-logo.png" alt="Contiinex" width="200" height="40" /></a>
      <div className="top-actions">
        {children}
        <nav className="tabs" aria-label="Pages">
          <a href="./index.html"><span className="long">Presentation</span><span className="short">Deck</span></a>
          <a className="active" href="./pricing.html" aria-current="page"><span className="long">ROI calculator</span><span className="short">ROI</span></a>
        </nav>
      </div>
    </header>
  );
}

// ---- The executive report -----------------------------------------------------------
function Report({ plan, p, who, date, setPlan, onWalk }: { plan: Plan; p: Portfolio; who: string; date: string; setPlan: (f: (p: Plan) => Plan) => void; onWalk: () => void }) {
  const [detailId, setDetailId] = useState<string>(p.on[0]?.sol.id ?? SOLUTIONS[1].id);
  const nOn = p.on.length;
  const single = nOn === 1 ? p.on[0].sol : null;
  const excluded = p.modules.filter(m => !m.on);
  const tc = typicalCount(plan);
  const lic = license(plan);
  const implNote = plan.g.impl > 0 ? `after ${fmtExec(plan.g.impl)} one-time implementation` : 'implementation quote pending, not included';
  const beNote = plan.g.impl > 0 ? '' : ', before implementation';
  const be = p.breakeven === null ? 'no break-even within three years' : p.breakeven === 0 ? 'positive from the start' : `break-even in month ${p.breakeven}${beNote}`;

  // Tier 2: the lines that add up to the executive number.
  const fteToday = p.staff0 / plan.g.cost;
  const lines = [
    ...(p.capRecovered > 0 ? [{ key: 'rec', sign: '+' as const, value: p.capRecovered, label: 'Revenue recovered on care already delivered',
      note: p.capDenial > 0 ? `Of which ${fmtExec(p.capDenial)} is denials prevented or recovered${p.capRecovered - p.capDenial > 1e5 ? '; the rest is write-offs, underpayments and patient balances' : ''}. Assumes it flows fully to EBITDA.` : 'Write-offs, underpayments and patient balances recovered. Assumes it flows fully to EBITDA.' }] : []),
    ...(p.capNew > 0 ? [{ key: 'new', sign: '+' as const, value: p.capNew, label: 'New patient volume, before the cost of care',
      note: 'Scheduling, referral and credentialing revenue, before the cost of delivering the care.' }] : []),
    { key: 'staff', sign: '+' as const, value: p.hoursValue, label: 'Staff cost removed',
      note: `About ${Math.round((100 * p.hoursValue) / Math.max(p.staff0, 1))}% of today’s modelled manual work in these ${nOn === 1 ? 'process' : nOn + ' processes'} (about ${F.int(p.fte)} of ${F.int(fteToday)} FTE-equivalents; check against your RCM headcount). Counts only if that work leaves the cost base (attrition, avoided hires).` },
    { key: 'paid', sign: '−' as const, value: p.spend, label: `Paid to ${VENDOR}, license and usage`,
      note: `License ${fmtExec(lic)} a year${plan.licenseSet ? '' : ' at the ~$1,000 per $1M of NPR benchmark'}; usage at ${plan.g.price}% of today’s manual cost per transaction. Not a quote.` },
  ];
  const shown = addUp(lines, p.total);
  const kicker = 'Estimated EBITDA added a year, at full run-rate' + (p.fullRunMonth > 0 ? ` from month ${p.fullRunMonth}` : '');
  const basis = tc.typical === tc.total
    ? `Estimate on typical industry values · ${single ? '1 of 12 modules · ' + single.name : nOn + ' of 12 modules'} · for ${who} · not a quote. A 2–4 week diagnostic replaces these values with your claims data.`
    : `Typical industry values sized to ${fmtExec(plan.g.npr)} net patient revenue; ${tc.total - tc.typical} of ${tc.total} inputs supplied${plan.hospital.trim() ? ' by ' + plan.hospital.trim() : ''} · ${single ? '1 of 12 modules · ' + single.name : nOn + ' of 12 modules'} · not a quote.`;

  const ranked = [...p.on].sort((a, b) => b.standalone - a.standalone);
  // Operational impact: the website's before-and-after pairs, added up across the selected modules.
  const sumOn = (f: (r: Record<string, number>) => number) => p.on.reduce((t, m) => t + f(m.r), 0);
  const hrs0 = sumOn(r => r.manualHrs), hrs1 = sumOn(r => r.afterHrs), team = sumOn(r => r.teamHrs);
  const anyDenial = p.on.some(m => DENIAL_POOL_IDS.includes(m.sol.id));
  const rate0 = p.denial.poolPct, rate1 = p.npr > 0 ? ((p.denial.pool - p.capDenial) / p.npr) * 100 : 0;
  const ops: Pair[] = [
    pair('Staff hours on these processes a year', hrs0, hrs1, v => F.intShort(v) + ' hrs', F.signed(F.pctChange(hrs0, hrs1)) + '%'),
    pair('Share of RCM team hours on these processes', team ? (hrs0 / team) * 100 : 0, team ? (hrs1 / team) * 100 : 0, v => F.pct(v), F.signed(Math.round(((hrs1 - hrs0) / Math.max(team, 1)) * 1000) / 10) + ' pts'),
    ...(anyDenial ? [pair('Denied revenue, % of NPR', rate0, rate1, v => F.pct(v, 2), F.signed(Math.round((rate1 - rate0) * 100) / 100) + ' pts')] : []),
  ];
  const overloaded = p.on.filter(m => m.r.pctHrs > 1).map(m => m.sol.name);
  // Appendix rows rounded to $0.1M so they add up to the total row.
  const showOverlap = Math.abs(p.overlap) >= 5e4;
  const rows = roundToTotal([...ranked.map(m => m.standalone), ...(showOverlap ? [-p.overlap] : []), -lic], p.total, 1e5);
  const m1 = (v: number) => (v < 0 ? '−' : '') + '$' + (Math.abs(v) / 1e6).toFixed(1) + 'M';
  const detailMod = p.modules.find(m => m.sol.id === detailId) ?? p.modules[0];
  const detail = summary(detailMod.r, detailMod.sol, moduleInputs(plan, detailMod.sol, detailMod.shareScale), plan.hospital);
  const entered = (id: string, k: string) => (plan.mods[id].set.includes(k) ? <i className="entered">entered</i> : null);
  const pctTxt = (v: number) => (Math.round(v * 10) / 10) + '%';

  return (
    <article className="report">
      <header className="rep-head">
        <img className="print-only rep-logo" src="./brand/contiinex-logo.png" alt="Contiinex" width="160" height="32" />
        <p>Prepared for {who} · {date} · Illustrative estimate, not a quote</p>
      </header>

      <section className="rep-hero">
        <p className="rep-kicker">{kicker}</p>
        <h1 className="rep-number">{shown.total}</h1>
        <p className="rep-basis">{basis}</p>
        <div className="size-row no-print" role="group" aria-label="Hospital size">
          <span className="size-label">Hospital size</span>
          <div className="size-chips">
            {SIZES.map(v => (
              <button key={v} type="button" className={'chip' + (Math.abs(plan.g.npr - v) < 1 ? ' on' : '')} aria-pressed={Math.abs(plan.g.npr - v) < 1}
                onClick={() => setPlan(q => ({ ...q, g: { ...q.g, npr: v } }))}>{fmtExec(v)}</button>
            ))}
          </div>
          <button type="button" id="walk-btn" className="roi-btn primary sm walk-btn" onClick={onWalk}>Walk through the variables</button>
        </div>
        {single && (
          <div className="scope-note no-print">
            <span>This estimate covers one process, as on the presentation slide.</span>
            <button type="button" className="roi-btn ghost sm" onClick={() => setPlan(q => withRecommendedScope(q))}>See the recommended scope (9 modules)</button>
          </div>
        )}
        {p.implausible && <p className="flag">Above the typical range for a hospital this size ({pctTxt(p.shareOfNpr * 100)} of net patient revenue). Check the inputs before sharing.</p>}
      </section>

      <section className="rep-tier2" aria-label="How it adds up">
        {lines.map((l, i) => (
          <div className={'t2-row' + (l.sign === '−' ? ' minus' : '')} key={l.key}>
            <span className="t2-val">{l.sign} {shown.parts[i]}</span>
            <span className="t2-text"><b>{l.label}</b><small>{l.note}</small></span>
          </div>
        ))}
      </section>

      <section className="rep-tier3">
        <p><b>Timing.</b> Year 1 about {fmtExec(p.year1)}, with go-live in month {Math.round(plan.g.golive)} and full run-rate from month {p.fullRunMonth}; {be}; about {fmtExec(p.net3y)} net over three years ({implNote}).</p>
        <p><b>Scale.</b> About {pctTxt(p.shareOfNpr * 100)} of net patient revenue.</p>
        <p><b>Downside.</b> About {fmtExec(p.lowTotal)} a year if every recovery and automation rate sits at the low end of its typical range; about {fmtExec(p.floor)} if freed staff time is redeployed rather than removed.</p>
        {excluded.length > 0 && <p><b>Not included.</b> {excluded.map(m => m.sol.name).join(', ')}{excluded.every(m => NEW_VOLUME_IDS.includes(m.sol.id)) ? ' (new patient volume, before the cost of care)' : ''}. With all 12 modules: up to about {fmtExec(p.allTotal)} a year (upper bound).</p>}
      </section>
      <p className="rep-disclosure">Assumes recovered revenue flows fully to EBITDA and that staff time no longer needed leaves the cost base. Denial modules share one denial pool and are counted once, in sequence.</p>

      <h2 className="rep-divider">How we got there</h2>
      <section className="rep-block">
        <h3>Cumulative net benefit, after everything paid to {VENDOR}</h3>
        <div className="screen-only"><NetBenefitChart cumulative={p.cumulative} breakeven={p.breakeven} golive={Math.round(plan.g.golive)} beNote={beNote} /></div>
        <div className="print-only"><NetBenefitChart cumulative={p.cumulative} breakeven={p.breakeven} golive={Math.round(plan.g.golive)} beNote={beNote} width={690} height={168} interactive={false} /></div>
      </section>

      <section className="rep-block no-print">
        <h3>Operational impact</h3>
        <p className="rep-small">The contiinex.com calculator’s before-and-after view, added up across the selected modules.</p>
        <Pairs rows={ops} />
        {overloaded.length > 0 && <p className="flag">More manual hours than the staff on the process have: {overloaded.join(', ')}. Check the staff count or the volume.</p>}
      </section>

      <section className="rep-block page-2">
        <h3>Where the {shown.total} comes from</h3>
        <table className="rep-table">
          <thead><tr><th scope="col">Module</th><th scope="col">Contribution a year</th></tr></thead>
          <tbody>
            {ranked.map((m, i) => <tr key={m.sol.id}><th scope="row">{m.sol.name}</th><td>{m1(rows.values[i])}</td></tr>)}
            {showOverlap && <tr className="adj"><th scope="row">Shared denial pool, counted once</th><td>{m1(rows.values[ranked.length])}</td></tr>}
            <tr className="adj"><th scope="row">Platform license</th><td>{m1(rows.values[rows.values.length - 1])}</td></tr>
            <tr className="tot"><th scope="row">EBITDA added a year</th><td>{m1(rows.total)}</td></tr>
          </tbody>
        </table>
        <p className="rep-small">Each module’s contribution is its revenue recovered plus staff cost removed, less its {VENDOR} usage, as if it were the only module. Of the {shown.parts[lines.findIndex(l => l.key === 'paid')]} a year paid to {VENDOR}, {fmtExec(lic)} is the platform license (row above); the rest is usage, netted inside each module’s row. {excluded.length > 0 ? `Not included: ${excluded.map(m => m.sol.name).join(', ')}.` : ''}</p>
      </section>

      <section className="rep-block">
        <h3>What the number rests on</h3>
        <table className="rep-table rests">
          <thead><tr><th scope="col">Module</th><th scope="col">Revenue pool</th><th scope="col">Addressable</th><th scope="col">Recovered</th><th scope="col">Automated</th><th scope="col">Min / task</th><th scope="col">Volume a year</th></tr></thead>
          <tbody>
            {ranked.map(m => {
              const id = m.sol.id, inp = plan.mods[id].inp;
              return (
                <tr key={id}>
                  <th scope="row">{m.sol.name}</th>
                  <td>{pctTxt(inp.pool)} of NPR{DENIAL_POOL_IDS.includes(id) ? ' · denials' : ''} {entered(id, 'pool')}</td>
                  <td>{m.shareScale < 0.999 ? Math.round(inp.share * m.shareScale) + '%*' : pctTxt(inp.share)} {entered(id, 'share')}</td>
                  <td>{pctTxt(inp.capture)} {entered(id, 'capture')}</td>
                  <td>{pctTxt(inp.auto)} {entered(id, 'auto')}</td>
                  <td>{F.int(inp.mins)} {entered(id, 'mins')}</td>
                  <td>{F.int(moduleValue(plan, id, 'units'))} {entered(id, 'units')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="rep-small">
          {p.on.some(m => DENIAL_POOL_IDS.includes(m.sol.id)) ? `The denial modules share one denial pool of ${pctTxt(p.denial.poolPct)} of NPR, counted once. ` : ''}Hospital-wide: net patient revenue {fmtExec(plan.g.npr)}; {F.money(plan.g.cost)} per RCM employee a year; {F.int(plan.g.hpy)} paid hours each; {VENDOR} usage at {plan.g.price}% of manual cost per transaction; license {fmtExec(lic)} a year; go-live month {Math.round(plan.g.golive)}, {Math.round(plan.g.ramp)}-month ramp; EBITDA margin today {pctTxt(plan.g.margin)}.
          {p.on.some(m => m.shareScale < 0.999) ? ' * Share after counting the denial pool once: analytics and denial management work only on the denials left after prevention.' : ''}
          {' '}Values marked entered were supplied; all others are typical values. {Math.abs(plan.g.npr - SIZE_BASE_NPR) < 1 ? 'Typical volumes and staff are for a $500M hospital.' : `Typical volumes and staff are scaled from a $500M reference hospital to ${fmtExec(plan.g.npr)} of net patient revenue; entered values are used as given.`}
        </p>
      </section>

      <section className="rep-block">
        <h3>Method and caveats</h3>
        <ul className="rep-list">
          <li>Per-process math follows the calculator at contiinex.com/resources/roi-calculator. Revenue recovered counts in full as EBITDA (no contribution margin).</li>
          <li>EBITDA today about {fmtExec(p.e0)} ({pctTxt(plan.g.margin)} margin{p.rev0 < p.npr ? ', on revenue after denials' : ''}); with this estimate about {fmtExec(p.e1)}, a margin of about {pctTxt(p.m1 * 100)}. Most of the gain is recovered revenue counted in full; see the Downside line.</li>
          <li>Staff cost removed counts only if the work leaves the cost base. If freed time is redeployed instead, the estimate falls to about {fmtExec(p.floor)} a year.</li>
          <li>Denials are one pool, counted in sequence: prevention modules (eligibility, authorization, claim scrubbing, coding) each own a distinct cause; denial analytics and denial management work on what is left.</li>
          <li>Benefit starts at go-live and grows evenly to full run-rate; the license is paid from month 1.</li>
          <li>Return on {VENDOR} spend: {F.oneDp.format(p.spend > 0 ? p.total / p.spend : 0)}x a year at full run-rate, as the contiinex.com calculator defines it; {F.oneDp.format(p.return3y)}x over three years, net benefit divided by three years of license and usage{plan.g.impl > 0 ? ' plus implementation' : ''}.</li>
          <li>Not a quote; {VENDOR} reserves the right to adjust final pricing.</li>
        </ul>
      </section>

      <details className="rep-block no-print module-detail">
        <summary>Per-module detail, as the contiinex.com calculator shows it</summary>
        <div className="card-head">
          <label className="roi-pick"><span className="sr-only">Module</span>
            <select value={detailId} onChange={e => setDetailId(e.target.value)}>
              {GROUPS.map(g => <optgroup key={g} label={g}>{SOLUTIONS.filter(s => s.group === g).map(s => <option key={s.id} value={s.id}>{s.name}{plan.mods[s.id].on ? '' : ' (not included)'}</option>)}</optgroup>)}
            </select><ChevronDown size={15} />
          </label>
        </div>
        <p className="rep-small">This module on its own, before the platform license{detailMod.shareScale < 0.999 ? `, with its denial share counted after prevention (${Math.round(detailMod.shareScale * 100)}% of its stand-alone share)` : ''}.</p>
        <div className="md-grid">
          <div><p className="k">Contribution a year</p><p className="v">{fmtExec(detailMod.value)}</p><p className="s">{detail.revKicker}: {fmtExec(detail.revVal)} · staff cost removed, less usage: {fmtExec(detail.costVal)}</p></div>
          <div><p className="k">Return on usage spend</p><p className="v">{detail.roiTxt}</p><p className="s">{detail.roiSub}</p></div>
          <div><p className="k">Manual cost today</p><p className="v">{detail.manualCostTxt}</p><p className="s">{detail.manualCostSub}</p></div>
          <div><p className="k">Per {detailMod.sol.one}</p><p className="v">{detail.cpuTxt} → {detail.priceTxt}</p><p className="s">manual today → {VENDOR} at {plan.g.price}% of it · {detail.automatedSub}</p></div>
        </div>
        <h4>Process time</h4>
        <p className="rep-small">{detail.timeSub}</p>
        <Pairs rows={detail.timeRows} />
        <h4>{detailMod.sol.denial ? 'Denial impact' : 'Revenue impact'}</h4>
        <p className="rep-small">{detail.leakSub}</p>
        <Pairs rows={detail.leakRows} />
        <h4>Every step</h4>
        <div className="breakdown">
          {detail.breakdown.map(sec => (
            <details key={sec.title}>
              <summary>{sec.title.replace(/^Total impact on P&L using .*/, 'Contribution of this module')}</summary>
              <table><tbody>{sec.rows.filter(row => !row.label.startsWith('Hospital EBITDA')).map(row => <tr key={row.label} className={row.cls}><th scope="row">{GLOSSARY[row.label] ?? row.label}</th><td>{row.value}</td></tr>)}</tbody></table>
            </details>
          ))}
        </div>
      </details>

    </article>
  );
}

// Before-and-after bars, as on the contiinex.com calculator.
function pair(label: string, before: number, after: number, f: (v: number) => string, delta: string): Pair {
  const max = Math.max(before, after, 1e-9);
  return { label, delta, beforeTxt: f(before), afterTxt: f(after), beforePct: (before / max) * 100, afterPct: Math.max((after / max) * 100, 0.6) };
}
function Pairs({ rows }: { rows: Pair[] }) {
  return (
    <div className="pairs">
      {rows.map(r => (
        <div className="pair" key={r.label}>
          <div className="pair-top"><span>{r.label}</span><span className="chg">{r.delta}</span></div>
          <div className="pbar"><span className="pl">Today</span><span className="track"><span className="bar before" style={{ width: r.beforePct + '%' }} /></span><b>{r.beforeTxt}</b></div>
          <div className="pbar"><span className="pl">With {VENDOR}</span><span className="track"><span className="bar after" style={{ width: r.afterPct + '%' }} /></span><b>{r.afterTxt}</b></div>
        </div>
      ))}
    </div>
  );
}

// ---- Edit panel ------------------------------------------------------------------
function EditPanel({ plan, p, setPlan, openIntake }: { plan: Plan; p: Portfolio; setPlan: (f: (p: Plan) => Plan) => void; openIntake: (set: string, key?: string) => void }) {
  const toggle = (id: string) => setPlan(q => ({ ...q, mods: { ...q.mods, [id]: { ...q.mods[id], on: !q.mods[id].on } } }));
  const assumptions: { key: string; label: string; value: string }[] = [
    { key: 'npr', label: 'Net patient revenue', value: fmtExec(plan.g.npr) },
    { key: 'margin', label: 'EBITDA margin today', value: (Math.round(plan.g.margin * 10) / 10) + '%' },
    { key: 'cost', label: 'Cost per RCM employee', value: F.money(plan.g.cost) },
    { key: 'hpy', label: 'Paid hours per employee', value: F.int(plan.g.hpy) },
    { key: 'price', label: `${VENDOR} usage price`, value: plan.g.price + '% of manual' },
    { key: 'license', label: 'Annual platform license', value: fmtExec(license(plan)) + (plan.licenseSet ? '' : ' (benchmark)') },
    { key: 'impl', label: 'One-time implementation', value: plan.g.impl ? fmtExec(plan.g.impl) : 'Quote pending' },
    { key: 'golive', label: 'Go-live', value: 'Month ' + Math.round(plan.g.golive) },
    { key: 'ramp', label: 'Ramp to full run-rate', value: Math.round(plan.g.ramp) + ' months' },
  ];
  return (
    <aside className="edit-panel no-print" aria-label="Edit inputs">
      <div className="edit-card">
        <div className="card-head"><h3>Hospital</h3><button type="button" id="tailor-btn" className="roi-btn primary sm" onClick={() => openIntake('hospital')}>Tailor to your hospital</button></div>
        <label className="name-field">
          <span>Hospital or health system</span>
          <input type="text" value={plan.hospital} placeholder="e.g. Riverside Health" autoComplete="organization"
            onChange={e => { const v = e.target.value.slice(0, 120); setPlan(q => ({ ...q, hospital: v })); }} />
        </label>
        <ul className="answers">
          {assumptions.map(a => <li key={a.key}><button type="button" data-akey={a.key} onClick={() => openIntake('hospital', a.key)}><span>{a.label}</span><b>{a.value}</b></button></li>)}
        </ul>
      </div>
      <div className="edit-card">
        <div className="card-head"><h3>Modules</h3><span className="muted">{p.on.length} of 12</span></div>
        <p className="rep-small">Contribution a year, as if each were the only module. Untick to leave a process out.</p>
        {GROUPS.map(g => (
          <div className="mod-group" key={g}>
            <div className="mod-group-head"><span>{g}</span></div>
            {p.modules.filter(m => m.sol.group === g).map(m => (
              <div className={'mod-row' + (m.on ? '' : ' off')} key={m.sol.id} id={'mod-' + m.sol.id}>
                <label className="mod-check">
                  <input type="checkbox" checked={m.on} onChange={() => toggle(m.sol.id)} />
                  <span className="box" aria-hidden="true"><Check size={13} /></span>
                  <span className="mod-name">{m.sol.name}{m.tailored && <em className="chip-tailored">entered</em>}{NEW_VOLUME_IDS.includes(m.sol.id) && <em className="chip-volume">new volume</em>}</span>
                </label>
                <span className="mod-val">{m.on ? fmtExec(m.standalone) : '+' + fmtExec(m.standalone)}</span>
                <button type="button" className="linkish fine" onClick={() => openIntake(m.sol.id)} aria-label={'Fine-tune ' + m.sol.name}>Fine-tune</button>
              </div>
            ))}
          </div>
        ))}
        {DENIAL_POOL_IDS.filter(id => plan.mods[id].on).length > 1 && (
          <p className="overlap-note">Denial modules share one denial pool and are counted once: {fmtExec(p.overlap)} less than their contributions added up.</p>
        )}
      </div>
    </aside>
  );
}

// ---- Step-by-step intake -----------------------------------------------------------
function Intake({ plan, setPlan, questions: qs, title, start, onDone }: {
  plan: Plan; setPlan: (f: (p: Plan) => Plan) => void; questions: IQ[]; title: string; start: number; onDone: () => void;
}) {
  const draftFor = (i: number) => (qs[i].type === 'number' ? fieldText(qs[i].field!, qs[i].get!(plan)) : '');
  const [step, setStep] = useState(start);
  const [dir, setDir] = useState(1);
  const [draft, setDraft] = useState(() => draftFor(start));
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const q = qs[step];
  const isLast = step === qs.length - 1;
  const p = portfolio(plan);

  useEffect(() => {
    // Focus at once so the first keystrokes replace the new answer (its draft was set with the step).
    const el = inputRef.current ?? document.querySelector<HTMLElement>('.roi-q .roi-btn.primary');
    el?.focus({ preventScroll: true });
    if (el instanceof HTMLInputElement && q.type === 'number') el.select();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n: number, d: number) => { setError(''); setDraft(draftFor(n)); setDir(d); setStep(n); };
  const next = () => {
    if (q.type === 'number') {
      const v = parseField(q.field!, draft);
      const err = validate(q.key, q.field!, v);
      if (err) { setError(err); inputRef.current?.focus(); return; }
      if (draft.trim() !== fieldText(q.field!, q.get!(plan))) setPlan(pl => q.set!(pl, v));
    }
    if (isLast) return onDone();
    go(step + 1, 1);
  };
  const prev = () => (step === 0 ? onDone() : go(step - 1, -1));
  const toggleMod = (id: string) => setPlan(pl => ({ ...pl, mods: { ...pl.mods, [id]: { ...pl.mods[id], on: !pl.mods[id].on } } }));

  const keys = useRef({ next, prev, toggleMod, q, onDone });
  keys.current = { next, prev, toggleMod, q, onDone };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement;
      const inField = !!t.closest?.('input[type=text], textarea');
      if (e.key === 'Escape') { e.preventDefault(); k.onDone(); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (inField || t === document.body || t.matches?.('input[type=checkbox]')) { e.preventDefault(); k.next(); }
        return;
      }
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); k.prev(); return; }
      if (!inField && k.q.type === 'modules' && e.key.length === 1) {
        const i = LETTERS.indexOf(e.key.toUpperCase());
        if (i >= 0 && i < SOLUTIONS.length) { e.preventDefault(); k.toggleMod(SOLUTIONS[i].id); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = q.type === 'number' ? q.get!(plan) : 0;
  const warn = q.warn?.(plan) ?? '';
  const nOn = SOLUTIONS.filter(s => plan.mods[s.id].on).length;

  return (
    <section className="roi-screen roi-form">
      <div className="intake-bar">
        <span className="intake-title">{title} · {step + 1} of {qs.length}</span>
        <div className="roi-progress"><i style={{ width: ((step + 1) / qs.length) * 100 + '%' }} /></div>
        <button type="button" className="roi-btn ghost sm" onClick={onDone}><X size={15} /> Back to the report</button>
      </div>
      <div key={step} className={'roi-q ' + (dir < 0 ? 'enter-down' : 'enter')} aria-labelledby="qtitle">
        <p className="roi-eyebrow">{q.section}</p>
        <h2 className="qtitle" id="qtitle"><span className="qnum">{step + 1}<ChevronDown size={15} style={{ transform: 'rotate(-90deg)' }} /></span>{q.title}</h2>
        {q.hint && <p className="qhint">{q.hint}{q.type === 'modules' && <span className="kbd-hint"> Press a letter to toggle, Enter to continue.</span>}</p>}

        {q.type === 'modules' && (
          <div className="roi-choices" role="group" aria-labelledby="qtitle">
            {GROUPS.map(g => (
              <div className="choice-group" key={g}>
                <p className="group-label">{g}</p>
                {SOLUTIONS.filter(s => s.group === g).map(s => {
                  const i = SOLUTIONS.indexOf(s), on = plan.mods[s.id].on;
                  return (
                    <button key={s.id} type="button" role="checkbox" aria-checked={on} className={'roi-choice multi' + (on ? ' on' : '')} onClick={() => toggleMod(s.id)}>
                      <span className="key">{LETTERS[i]}</span>
                      <span className="choice-text"><b>{s.name}</b><small>{s.desc}</small></span>
                      <Check className="tick" size={18} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {q.type === 'text' && (
          <input ref={inputRef} className="roi-answer text" type="text" autoComplete="organization" placeholder={q.placeholder}
            value={plan.hospital} onChange={e => { const v = e.target.value.slice(0, 120); setPlan(pl => ({ ...pl, hospital: v })); }} />
        )}

        {q.type === 'number' && (
          <NumberAnswer field={q.field!} value={value} draft={draft} invalid={!!error} title={q.title} inputRef={inputRef}
            onDraft={text => {
              setDraft(text); setError('');
              const v = parseField(q.field!, text);
              if (isFinite(v) && v >= 0 && !validate(q.key, q.field!, v) && v !== q.get!(plan)) setPlan(pl => q.set!(pl, v));
            }}
            onSet={v => { setPlan(pl => q.set!(pl, v)); setDraft(fieldText(q.field!, v)); setError(''); }}
          />
        )}

        {q.insight && <p className={'insight' + (warn ? ' warn' : '')} aria-live="polite">{warn || q.insight(plan)}</p>}
        {q.type === 'modules' && <p className="insight" aria-live="polite">{nOn} of {SOLUTIONS.length} selected</p>}
        <p className="error" role="alert">{error}</p>

        <div className="roi-actions">
          <button type="button" className="roi-btn primary" onClick={next}>{isLast ? 'See the report' : 'OK'} <Check size={18} /></button>
          {step >= 3 && !isLast && <button type="button" className="roi-btn ghost" onClick={onDone}>See the report</button>}
        </div>
      </div>
      <div className="roi-dock">
        <div className="ticker" aria-live="polite">
          <span className="ticker-label">EBITDA added a year, at full run-rate</span> <b>{addUp([{ key: 'r', sign: '+', value: p.cap }, { key: 's', sign: '+', value: p.hoursValue }, { key: 'p', sign: '−', value: p.spend }], p.total).total}</b>
        </div>
        <div className="stepper">
          <button type="button" aria-label="Previous question" onClick={prev}><ChevronUp size={20} /></button>
          <button type="button" aria-label="Next question" onClick={next}><ChevronDown size={20} /></button>
        </div>
      </div>
    </section>
  );
}

function NumberAnswer({ field: f, value, draft, invalid, title, inputRef, onDraft, onSet }: {
  field: Field; value: number; draft: string; invalid: boolean; title: string;
  inputRef: React.RefObject<HTMLInputElement | null>; onDraft: (t: string) => void; onSet: (v: number) => void;
}) {
  const pre = prefix(f), suf = suffix(f);
  const fill = ((clamp(f, value) - f.min) / (f.max - f.min)) * 100 + '%';
  return (
    <>
      <div className={'roi-answer-row' + (invalid ? ' invalid' : '')}>
        {pre && <span className="affix">{pre}</span>}
        <input ref={inputRef} className="roi-answer" type="text" inputMode="decimal" autoComplete="off" aria-label={title} aria-describedby="roi-range"
          value={draft} onChange={e => onDraft(e.target.value)} />
        {suf && <span className="affix">{suf}</span>}
      </div>
      <input className="roi-slider" type="range" aria-label={title} min={f.min} max={f.max} step={f.step || 1}
        value={clamp(f, value)} style={{ ['--fill' as string]: fill }} onChange={e => onSet(parseFloat(e.target.value))} />
      <p className="range" id="roi-range">{rangeText(f)}</p>
      {f.presets && (
        <div className="roi-presets">
          {f.presets.map(v => (
            <button key={v} type="button" className={'chip' + (v === value ? ' on' : '')} onClick={() => { onSet(v); inputRef.current?.focus(); }}>{F.moneyShort(v, 0)}</button>
          ))}
        </div>
      )}
    </>
  );
}
