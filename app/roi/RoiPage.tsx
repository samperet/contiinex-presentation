'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { fmt as F, GROUPS, SOLUTIONS, summary, VENDOR, type Field } from './model';
import NetBenefitChart from './NetBenefitChart';
import { hospitalQuestions, moduleQuestions, type IQ } from './intake';
import {
  clearSaved, defaultPlan, DENIAL_POOL_IDS, license, loadSaved, moduleInputs, moduleValue, MODULE_KEYS, NEW_VOLUME_IDS, planFromHash,
  planToHash, portfolio, sanitizePlan, savePlan, singleModulePlan, typicalCount, withRecommendedScope, type Plan, type Portfolio, type Saved,
} from './portfolio';
import { clamp, fieldText, parseField, prefix, rangeText, suffix, validate } from './questions';
import { addUp, fmtExec, roundToTotal, today } from './format';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
type View = { kind: 'report' } | { kind: 'intake'; set: 'hospital' | string; step: number };
type Start = { plan: Plan; resume: Saved | null };

// The plan comes from the link only. Saved work is offered, never shown
// automatically, so one hospital's name and figures never open in front of another.
// ?p=&npr= come from the deck's Pricing slide; ?p=...&agents=...#results is the earlier single-process link.
function start(): Start {
  if (typeof window === 'undefined') return { plan: defaultPlan(), resume: null };
  const saved = loadSaved();
  const q = new URLSearchParams(window.location.search);
  const p = q.get('p');
  const npr = Number(q.get('npr'));
  let plan: Plan | null = planFromHash(window.location.hash);
  if (!plan && q.has('agents') && p && SOLUTIONS.some(s => s.id === p)) {
    const g: Record<string, string> = {}, inp: Record<string, string> = {};
    q.forEach((v, k) => { if (MODULE_KEYS.includes(k)) inp[k] = v; else g[k] = v; });
    g.license = g.fee ?? '0';
    plan = sanitizePlan({ hospital: q.get('h') ?? '', g, licenseSet: true, mods: Object.fromEntries(SOLUTIONS.map(s => [s.id, s.id === p ? { on: true, inp } : { on: false }])) });
  } else if (!plan && p && SOLUTIONS.some(s => s.id === p)) {
    plan = singleModulePlan(p, isFinite(npr) && npr > 0 ? npr : undefined);
  }
  if (window.location.search || window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  const offer = !plan && saved && (saved.plan.hospital.trim() || JSON.stringify(saved.plan) !== JSON.stringify(defaultPlan())) ? saved : null;
  return { plan: plan ?? defaultPlan(), resume: offer };
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
  const setPlan = (f: (p: Plan) => Plan) => { setPlanState(f); setDirty(true); setResume(null); };
  const p = portfolio(plan);
  const who = plan.hospital.trim() || 'a ' + fmtExec(plan.g.npr) + ' hospital';
  const date = today();

  // Save only once this session has changed something, so opening the page never overwrites saved work.
  useEffect(() => { if (dirty) savePlan(plan, date); }, [plan, dirty, date]);
  useEffect(() => { document.title = `Contiinex ROI estimate – ${plan.hospital.trim() || fmtExec(plan.g.npr) + ' hospital'} – ${date}`; }, [plan.hospital, plan.g.npr, date]);
  useEffect(() => {
    if (view.kind !== 'report') return;
    const id = lastModule.current;
    lastModule.current = null;
    if (id) document.getElementById('mod-' + id)?.scrollIntoView({ block: 'center' });
    else window.scrollTo(0, 0);
  }, [view.kind]);
  useEffect(() => {
    const open = () => document.querySelectorAll('.report details').forEach(d => ((d as HTMLDetailsElement).open = true));
    window.addEventListener('beforeprint', open);
    return () => window.removeEventListener('beforeprint', open);
  }, []);

  const openIntake = (set: 'hospital' | string, key?: string) => {
    const qs = set === 'hospital' ? hospitalQuestions() : moduleQuestions(set);
    if (set !== 'hospital') lastModule.current = set;
    setView({ kind: 'intake', set, step: Math.max(0, key ? qs.findIndex(q => q.key === key) : 0) });
  };
  const copyLink = () => {
    const url = window.location.href.split(/[?#]/)[0] + '#' + planToHash(plan);
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link:', url));
    else window.prompt('Copy this link:', url);
  };
  const newHospital = () => { clearSaved(); setPlanState(defaultPlan()); setDirty(false); setResume(null); setEditing(false); window.scrollTo(0, 0); };

  if (view.kind === 'intake') {
    return (
      <main className="roi-page mode-intake">
        <TopBar />
        <Intake
          key={view.set}
          plan={plan} setPlan={setPlan}
          questions={view.set === 'hospital' ? hospitalQuestions() : moduleQuestions(view.set)}
          title={view.set === 'hospital' ? 'Tailor to your hospital' : 'Fine-tune · ' + SOLUTIONS.find(s => s.id === view.set)!.name}
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
          <span>Saved work: {resume.plan.hospital.trim() || 'an earlier estimate'}{resume.savedAt ? ` (saved ${resume.savedAt})` : ''}</span>
          <button type="button" className="linkish" onClick={() => { setPlanState(resume.plan); setDirty(true); setResume(null); }}>Resume</button>
          <button type="button" className="linkish muted" onClick={() => { clearSaved(); setResume(null); }}>Discard</button>
        </div>
      )}
      <div className="report-layout">
        {editing && <EditPanel plan={plan} p={p} setPlan={setPlan} openIntake={openIntake} />}
        <Report plan={plan} p={p} who={who} date={date} editing={editing} setPlan={setPlan} />
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
        <a className="back-link" href="./index.html"><ArrowLeft size={16} /> Presentation</a>
      </div>
    </header>
  );
}

// ---- The executive report -----------------------------------------------------------
function Report({ plan, p, who, date, editing, setPlan }: { plan: Plan; p: Portfolio; who: string; date: string; editing: boolean; setPlan: (f: (p: Plan) => Plan) => void }) {
  const [detailId, setDetailId] = useState<string>(p.on[0]?.sol.id ?? SOLUTIONS[1].id);
  const nOn = p.on.length;
  const single = nOn === 1 ? p.on[0].sol : null;
  const excluded = p.modules.filter(m => !m.on);
  const tc = typicalCount(plan);
  const lic = license(plan);
  const implNote = plan.g.impl > 0 ? `after ${fmtExec(plan.g.impl)} one-time implementation` : 'implementation quote pending, not included';
  const be = p.breakeven === null ? 'no break-even within three years' : p.breakeven === 0 ? 'positive from the start' : `break-even in month ${p.breakeven}`;

  // Tier 2: the lines that add up to the executive number.
  const lines = [
    { key: 'rec', sign: '+' as const, value: p.capRecovered, label: 'Revenue recovered on care already delivered',
      note: p.capDenial > 0 ? `Of which ${fmtExec(p.capDenial)} is denials prevented or recovered${p.capRecovered - p.capDenial > 1e5 ? '; the rest is write-offs, underpayments and patient balances' : ''}. Assumes it flows fully to EBITDA.` : 'Write-offs, underpayments and patient balances recovered. Assumes it flows fully to EBITDA.' },
    ...(p.capNew > 0 ? [{ key: 'new', sign: '+' as const, value: p.capNew, label: 'New patient volume, before the cost of care',
      note: 'Scheduling, referral and credentialing revenue, before the cost of delivering the care.' }] : []),
    { key: 'staff', sign: '+' as const, value: p.hoursValue, label: 'Staff cost removed',
      note: `About ${F.int(p.fte)} FTE-equivalents of work. Counts only if that work leaves the cost base (attrition, avoided hires).` },
    { key: 'paid', sign: '−' as const, value: p.spend, label: `Paid to ${VENDOR}, license and usage`,
      note: `License ${fmtExec(lic)} a year${plan.licenseSet ? '' : ' at the ~$1,000 per $1M of NPR benchmark'}; usage at ${plan.g.price}% of today’s manual cost per transaction. Not a quote.` },
  ];
  const shown = addUp(lines, p.total);
  const kicker = 'Estimated EBITDA added a year, at full run-rate' + (p.fullRunMonth > 0 ? ` from month ${p.fullRunMonth}` : '');
  const basis = tc.typical === tc.total
    ? `Estimate on typical industry values · ${single ? '1 of 12 modules · ' + single.name : nOn + ' of 12 modules'} · for ${who} · not a quote. A 2–4 week diagnostic replaces these values with your claims data.`
    : `Based on figures supplied${plan.hospital.trim() ? ' for ' + plan.hospital.trim() : ''}; ${tc.typical} of ${tc.total} inputs are still typical values · ${single ? '1 of 12 modules · ' + single.name : nOn + ' of 12 modules'} · not a quote.`;

  const ranked = [...p.on].sort((a, b) => b.standalone - a.standalone);
  // Appendix rows rounded to $0.1M so they add up to the total row.
  const showOverlap = p.overlap > 5e4;
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
        {single && (
          <div className="scope-note no-print">
            <span>This estimate covers one process, as on the presentation slide.</span>
            <button type="button" className="roi-btn ghost sm" onClick={() => setPlan(q => withRecommendedScope(q))}>See the recommended scope (9 modules)</button>
          </div>
        )}
        {p.implausible && <p className="flag">Above the typical range for a hospital this size ({Math.round(p.shareOfNpr * 100)}% of net patient revenue). Check the inputs before sharing.</p>}
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
        <p><b>Floor.</b> If freed staff time is redeployed rather than removed: about {fmtExec(p.floor)} a year.</p>
        {excluded.length > 0 && <p><b>Not included.</b> {excluded.map(m => m.sol.name).join(', ')}. With all 12 modules: up to about {fmtExec(p.allTotal)} a year.</p>}
      </section>
      <p className="rep-disclosure">Assumes recovered revenue flows fully to EBITDA and that staff time no longer needed leaves the cost base. Denial modules share one denial pool and are counted once, in sequence.</p>

      <h2 className="rep-divider">How we got there</h2>
      <section className="rep-block">
        <h3>Cumulative net benefit, after everything paid to {VENDOR}</h3>
        <div className="screen-only"><NetBenefitChart cumulative={p.cumulative} breakeven={p.breakeven} golive={Math.round(plan.g.golive)} /></div>
        <div className="print-only"><NetBenefitChart cumulative={p.cumulative} breakeven={p.breakeven} golive={Math.round(plan.g.golive)} width={690} height={168} interactive={false} /></div>
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
        <p className="rep-small">Each module’s contribution is its revenue recovered plus staff cost removed, less usage, as if it were the only module. {excluded.length > 0 ? `Not included: ${excluded.map(m => m.sol.name).join(', ')}.` : ''}</p>
      </section>

      <section className="rep-block">
        <h3>What the number rests on</h3>
        <table className="rep-table rests">
          <thead><tr><th scope="col">Module</th><th scope="col">Revenue pool</th><th scope="col">Addressable</th><th scope="col">Recovered</th><th scope="col">Automated</th><th scope="col">Volume a year</th></tr></thead>
          <tbody>
            {ranked.map(m => {
              const id = m.sol.id, inp = plan.mods[id].inp;
              return (
                <tr key={id}>
                  <th scope="row">{m.sol.name}</th>
                  <td>{pctTxt(inp.pool)} of NPR {entered(id, 'pool')}</td>
                  <td>{pctTxt(inp.share * m.shareScale)}{m.shareScale < 0.999 ? '*' : ''} {entered(id, 'share')}</td>
                  <td>{pctTxt(inp.capture)} {entered(id, 'capture')}</td>
                  <td>{pctTxt(inp.auto)} {entered(id, 'auto')}</td>
                  <td>{F.int(moduleValue(plan, id, 'units'))} {entered(id, 'units')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="rep-small">
          Hospital-wide: net patient revenue {fmtExec(plan.g.npr)}; {F.money(plan.g.cost)} per RCM employee a year; {F.int(plan.g.hpy)} paid hours each; {VENDOR} usage at {plan.g.price}% of manual cost per transaction; license {fmtExec(lic)} a year; go-live month {Math.round(plan.g.golive)}, {Math.round(plan.g.ramp)}-month ramp; EBITDA margin today {pctTxt(plan.g.margin)}.
          {p.on.some(m => m.shareScale < 0.999) ? ' * Share after counting the denial pool once: analytics and denial management work only on the denials left after prevention.' : ''}
          {' '}Values marked entered were supplied; all others are typical values. Typical volumes and staff are set for a $500M hospital and scale with net patient revenue until entered.
        </p>
      </section>

      <section className="rep-block">
        <h3>Method and caveats</h3>
        <ul className="rep-list">
          <li>Per-process math follows the calculator at contiinex.com/resources/roi-calculator. Revenue recovered counts in full as EBITDA (no contribution margin).</li>
          <li>Staff cost removed counts only if the work leaves the cost base. If freed time is redeployed instead, the estimate falls to about {fmtExec(p.floor)} a year.</li>
          <li>Denials are one pool, counted in sequence: prevention modules (eligibility, authorization, claim scrubbing, coding) each own a distinct cause; denial analytics and denial management work on what is left.</li>
          <li>Benefit starts at go-live and grows evenly to full run-rate; the license is paid from month 1.</li>
          <li>With every recovery and automation rate at the low end of its typical range: about {fmtExec(p.lowTotal)} a year.</li>
          <li>Net return over three years: {F.oneDp.format(p.return3y)}x, that is three-year net benefit divided by three years of {VENDOR} license and usage{plan.g.impl > 0 ? ' plus implementation' : ''}.</li>
          <li>Not a quote; {VENDOR} reserves the right to adjust final pricing.</li>
        </ul>
      </section>

      {editing && (
        <section className="rep-block no-print">
          <div className="card-head">
            <h3>Detailed calculation</h3>
            <label className="roi-pick"><span className="sr-only">Module</span>
              <select value={detailId} onChange={e => setDetailId(e.target.value)}>
                {GROUPS.map(g => <optgroup key={g} label={g}>{SOLUTIONS.filter(s => s.group === g).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
              </select><ChevronDown size={15} />
            </label>
          </div>
          <p className="rep-small">Every step for one module{detailMod.shareScale < 0.999 ? `, with its denial share counted after prevention (${Math.round(detailMod.shareScale * 100)}%)` : ''}{detailMod.on ? '' : ' (not included)'}.</p>
          <div className="breakdown">
            {detail.breakdown.map((sec, i) => (
              <details key={sec.title} open={i === 4}>
                <summary>{sec.title}</summary>
                <table><tbody>{sec.rows.map(row => <tr key={row.label} className={row.cls}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody></table>
              </details>
            ))}
          </div>
        </section>
      )}

    </article>
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
        <div className="card-head"><h3>Hospital</h3><button type="button" className="roi-btn primary sm" onClick={() => openIntake('hospital')}>Tailor to your hospital</button></div>
        <label className="name-field">
          <span>Hospital or health system</span>
          <input type="text" value={plan.hospital} placeholder="e.g. Riverside Health" autoComplete="organization"
            onChange={e => { const v = e.target.value.slice(0, 120); setPlan(q => ({ ...q, hospital: v })); }} />
        </label>
        <ul className="answers">
          {assumptions.map(a => <li key={a.key}><button type="button" onClick={() => openIntake('hospital', a.key)}><span>{a.label}</span><b>{a.value}</b></button></li>)}
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
  const [step, setStep] = useState(start);
  const [dir, setDir] = useState(1);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const q = qs[step];
  const isLast = step === qs.length - 1;
  const p = portfolio(plan);

  useEffect(() => {
    setError('');
    if (q.type === 'number') setDraft(fieldText(q.field!, q.get!(plan)));
    // Focus at once so the first keystrokes land in the new answer.
    const el = inputRef.current ?? document.querySelector<HTMLElement>('.roi-q .roi-btn.primary');
    el?.focus({ preventScroll: true });
    if (el instanceof HTMLInputElement && q.type === 'number') requestAnimationFrame(() => el.select());
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n: number, d: number) => { setDir(d); setStep(n); };
  const next = () => {
    if (q.type === 'number') {
      const v = parseField(q.field!, draft);
      const err = validate(q.key, q.field!, v);
      if (err) { setError(err); inputRef.current?.focus(); return; }
      if (v !== q.get!(plan)) setPlan(pl => q.set!(pl, v));
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
        {q.hint && <p className="qhint">{q.hint}</p>}

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
