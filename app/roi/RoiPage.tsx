'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, SlidersHorizontal, X } from 'lucide-react';
import { fmt as F, GROUPS, SOLUTIONS, summary, type Field } from './model';
import { Count } from './ExecSummary';
import Sankey from './Sankey';
import NetBenefitChart from './NetBenefitChart';
import { hospitalQuestions, moduleQuestions, type IQ } from './intake';
import {
  defaultPlan, DENIAL_POOL_IDS, license, loadPlan, moduleDefaults, moduleInputs, MODULE_KEYS, planFromHash, planToHash,
  portfolio, sanitizePlan, savePlan, type Plan,
} from './portfolio';
import { clamp, fieldText, parseField, prefix, rangeText, suffix, validate } from './questions';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
type View = { kind: 'dashboard' } | { kind: 'intake'; set: 'hospital' | string; step: number };

// Link, then saved plan, then typical values. ?p=&npr= come from the deck's Pricing slide;
// ?p=...&agents=...#results is the earlier single-process share link.
function initialPlan(): Plan {
  if (typeof window === 'undefined') return defaultPlan();
  const fromLink = planFromHash(window.location.hash);
  let plan = fromLink ?? loadPlan() ?? defaultPlan();
  const q = new URLSearchParams(window.location.search);
  const p = q.get('p');
  if (q.has('agents') && p && plan.mods[p]) {
    const raw: Record<string, unknown> = { hospital: q.get('h') ?? '', g: {}, mods: {} };
    const g: Record<string, string> = {}, inp: Record<string, string> = {};
    q.forEach((v, k) => { if (MODULE_KEYS.includes(k)) inp[k] = v; else g[k] = v; });
    raw.g = g; raw.licenseSet = true; g.license = g.fee ?? '0';
    raw.mods = Object.fromEntries(SOLUTIONS.map(s => [s.id, s.id === p ? { on: true, inp } : { on: false }]));
    plan = sanitizePlan(raw);
  } else {
    if (q.get('npr') && isFinite(Number(q.get('npr'))) && Number(q.get('npr')) > 0) plan = { ...plan, g: { ...plan.g, npr: Number(q.get('npr')) } };
    if (p && plan.mods[p]) plan = { ...plan, mods: { ...plan.mods, [p]: { ...plan.mods[p], on: true } } };
  }
  if (window.location.search || window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  return plan;
}

export default function RoiPage() {
  const init = useMemo(initialPlan, []);
  const [plan, setPlan] = useState<Plan>(init);
  const [view, setView] = useState<View>({ kind: 'dashboard' });
  const lastModule = useRef<string | null>(null);

  useEffect(() => { savePlan(plan); }, [plan]);
  useEffect(() => {
    if (view.kind !== 'dashboard') return;
    const id = lastModule.current;
    lastModule.current = null;
    if (id) document.getElementById('mod-' + id)?.scrollIntoView({ block: 'center' });
    else window.scrollTo(0, 0);
  }, [view.kind]);

  const openIntake = (set: 'hospital' | string, key?: string) => {
    const qs = set === 'hospital' ? hospitalQuestions() : moduleQuestions(set);
    if (set !== 'hospital') lastModule.current = set;
    setView({ kind: 'intake', set, step: Math.max(0, key ? qs.findIndex(q => q.key === key) : 0) });
  };

  return (
    <main className={'roi-page mode-' + view.kind}>
      <header className="roi-top">
        <a className="brand" href="./index.html"><img src="./brand/contiinex-logo.png" alt="Contiinex" width="200" height="40" /></a>
        <a className="back-link" href="./index.html"><ArrowLeft size={16} /> Presentation</a>
      </header>
      {view.kind === 'dashboard'
        ? <Dashboard plan={plan} setPlan={setPlan} openIntake={openIntake} />
        : <Intake
            key={view.set}
            plan={plan} setPlan={setPlan}
            questions={view.set === 'hospital' ? hospitalQuestions() : moduleQuestions(view.set)}
            title={view.set === 'hospital' ? 'Tailor to your hospital' : 'Fine-tune · ' + SOLUTIONS.find(s => s.id === view.set)!.name}
            start={view.step}
            onDone={() => setView({ kind: 'dashboard' })}
          />}
    </main>
  );
}

// ---- Dashboard ---------------------------------------------------------------------
function Dashboard({ plan, setPlan, openIntake }: { plan: Plan; setPlan: (f: (p: Plan) => Plan) => void; openIntake: (set: string, key?: string) => void }) {
  const p = portfolio(plan);
  const [copied, setCopied] = useState(false);
  const [detailId, setDetailId] = useState<string>(SOLUTIONS[1].id);
  const maxValue = Math.max(...p.modules.map(m => m.value), 1);
  const nOn = p.on.length;
  const who = plan.hospital.trim() || 'a ' + F.moneyCompact(plan.g.npr) + ' hospital';
  const bps = Math.round((p.m1 - p.m0) * 1e4);
  const be = p.breakeven === null ? 'No break-even within 3 years' : p.breakeven === 0 ? 'Positive from the start' : `Break-even in month ${p.breakeven}`;
  const tailored = (id: string) => MODULE_KEYS.some(k => plan.mods[id].inp[k] !== moduleDefaults(SOLUTIONS.find(s => s.id === id)!)[k]);
  const isDefault = JSON.stringify(plan) === JSON.stringify({ ...defaultPlan(), mods: plan.mods }) && SOLUTIONS.every(s => !tailored(s.id));
  const toggle = (id: string) => setPlan(q => ({ ...q, mods: { ...q.mods, [id]: { ...q.mods[id], on: !q.mods[id].on } } }));
  const setGroup = (g: string, on: boolean) => setPlan(q => ({ ...q, mods: Object.fromEntries(Object.entries(q.mods).map(([id, m]) => [id, SOLUTIONS.find(s => s.id === id)!.group === g ? { ...m, on } : m])) }));

  const copyLink = () => {
    const url = window.location.href.split(/[?#]/)[0] + '#' + planToHash(plan);
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link:', url));
    else window.prompt('Copy this link:', url);
  };

  const detailMod = p.modules.find(m => m.sol.id === detailId)!;
  const detailScale = DENIAL_POOL_IDS.includes(detailId) && detailMod.on ? p.overlap.scale : 1;
  const detail = summary(detailMod.r, detailMod.sol, moduleInputs(plan, detailMod.sol, detailScale), plan.hospital);

  const assumptions: { key: string; label: string; value: string }[] = [
    { key: 'npr', label: 'Net patient revenue', value: F.moneyCompact(plan.g.npr) },
    { key: 'cost', label: 'Cost per RCM employee', value: F.money(plan.g.cost) },
    { key: 'hpy', label: 'Work hours per employee', value: F.int(plan.g.hpy) + ' hrs' },
    { key: 'price', label: 'Contiinex price per transaction', value: plan.g.price + '% of manual cost' },
    { key: 'license', label: 'Annual platform license', value: F.moneyCompact(license(plan)) + (plan.licenseSet ? '' : ' (benchmark)') },
    { key: 'impl', label: 'One-time implementation', value: plan.g.impl ? F.moneyCompact(plan.g.impl) : 'Not entered' },
    { key: 'golive', label: 'Go-live', value: 'Month ' + plan.g.golive },
    { key: 'ramp', label: 'Ramp to full run-rate', value: plan.g.ramp + ' months' },
    { key: 'margin', label: 'EBITDA margin today', value: F.pct(plan.g.margin) },
  ];

  return (
    <div className="dash roi-exec">
      <section className="dash-hero">
        <div>
          <p className="roi-eyebrow">ROI calculator · {nOn} of {SOLUTIONS.length} modules · {isDefault ? 'typical values' : 'your values'}</p>
          <h1>Contiinex adds <em>{F.moneyCompact(p.total)}</em> to EBITDA a year for {who}.</h1>
          <p className="dash-sub">
            {isDefault
              ? 'These are typical starting values for every module. Switch modules on or off, fine-tune any of them, or tailor the hospital-wide figures.'
              : 'Switch modules on or off, fine-tune any of them, or change the hospital-wide figures.'}
          </p>
        </div>
        <div className="dash-actions">
          <button type="button" className="roi-btn primary" onClick={() => openIntake('hospital')}><SlidersHorizontal size={16} /> Tailor to your hospital</button>
          <button type="button" className="roi-btn ghost sm" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
          <button type="button" className="roi-btn ghost sm" onClick={() => window.print()}>Save PDF</button>
          {!isDefault && <button type="button" className="roi-btn ghost sm" onClick={() => setPlan(() => defaultPlan())}>Reset to typical values</button>}
        </div>
      </section>

      <section className="dash-kpis">
        <div className="exec-card hero-k">
          <p className="k">EBITDA added a year</p>
          <p className="big"><Count value={p.total} f="compact" /></p>
          <p className="s">{F.moneyCompact(p.cap)} revenue captured · {p.saved < 0 ? '−' : ''}{F.moneyCompact(p.saved)} cost saved</p>
        </div>
        <div className="exec-card">
          <p className="k">Return on spend</p>
          <p className="big"><Count value={p.roi} f="x" /></p>
          <p className="s">{F.moneyCompact(p.spend)} a year to Contiinex · pays back in {p.payback > 0 && p.payback < 1 ? 'under a month' : p.payback > 0 ? F.oneDp.format(p.payback) + ' months' : 'n/a'}</p>
        </div>
        <div className="exec-card">
          <p className="k">3-year cumulative net</p>
          <p className="big"><Count value={p.net3y} f="compact" /></p>
          <p className="s">{be}</p>
        </div>
        <div className="exec-card">
          <p className="k">EBITDA margin</p>
          <p className="big">{F.pct(p.m1 * 100, 1)}</p>
          <p className="s">from {F.pct(p.m0 * 100, 1)} · {F.signed(bps)} bps</p>
        </div>
        <div className="exec-card">
          <p className="k">Staff hours freed</p>
          <p className="big"><Count value={p.hours} f="hours" /></p>
          <p className="s">≈ {F.int(p.fte)} full-time people</p>
        </div>
      </section>

      <div className="dash-main">
        <aside className="exec-card modules-card" aria-label="Modules">
          <div className="card-head"><h3>Modules</h3><span className="muted">{nOn} selected</span></div>
          <p className="sub">Value per module a year. Untick to leave a process out.</p>
          {GROUPS.map(g => {
            const mods = p.modules.filter(m => m.sol.group === g);
            const allOn = mods.every(m => m.on);
            return (
              <div className="mod-group" key={g}>
                <div className="mod-group-head">
                  <span>{g}</span>
                  <button type="button" className="linkish" onClick={() => setGroup(g, !allOn)}>{allOn ? 'None' : 'All'}</button>
                </div>
                {mods.map(m => (
                  <div className={'mod-row' + (m.on ? '' : ' off')} key={m.sol.id} id={'mod-' + m.sol.id}>
                    <label className="mod-check">
                      <input type="checkbox" checked={m.on} onChange={() => toggle(m.sol.id)} />
                      <span className="box" aria-hidden="true"><Check size={13} /></span>
                      <span className="mod-name">{m.sol.name}{tailored(m.sol.id) && <em className="chip-tailored">tailored</em>}</span>
                    </label>
                    <span className="mod-val">{F.moneyCompact(m.value)}</span>
                    <span className="mod-bar"><i style={{ width: (Math.max(0, m.value) / maxValue) * 100 + '%' }} /></span>
                    <button type="button" className="linkish fine" onClick={() => openIntake(m.sol.id)} aria-label={'Fine-tune ' + m.sol.name}>Fine-tune</button>
                  </div>
                ))}
              </div>
            );
          })}
          {p.overlap.scale < 1 && (
            <p className="overlap-note">
              The selected denial modules claim {F.oneDp.format(p.overlap.claimedPct)}% of NPR in denials against a {F.oneDp.format(p.overlap.poolPct)}% denial pool, so their shares are scaled to {Math.round(p.overlap.scale * 100)}% to avoid counting the same denial twice.
            </p>
          )}
        </aside>

        <div className="dash-charts">
          <div className="exec-card">
            <div className="card-head"><h3>Cumulative net benefit</h3><span className="muted">{be}</span></div>
            <p className="sub">Value captured minus everything paid to Contiinex, month by month. Go-live in month {plan.g.golive}, full run-rate {plan.g.ramp} months later.</p>
            <NetBenefitChart cumulative={p.cumulative} breakeven={p.breakeven} golive={Math.round(plan.g.golive)} />
          </div>
          <div className="exec-card">
            <div className="card-head"><h3>Where the money goes</h3><span className="muted">Annual, at full run-rate</span></div>
            <p className="sub">Today’s manual spend and revenue at risk on the selected processes, and where each dollar ends up.</p>
            <Sankey p={p} />
          </div>
        </div>
      </div>

      <section className="exec-grid bottom">
        <div className="exec-card">
          <h3>Hospital-wide assumptions</h3>
          <p className="sub">Shared by every module. Select one to change it.</p>
          <ul className="answers">
            {assumptions.map(a => (
              <li key={a.key}><button type="button" onClick={() => openIntake('hospital', a.key)}><span>{a.label}</span><b>{a.value}</b></button></li>
            ))}
          </ul>
        </div>
        <div className="exec-card breakdown">
          <div className="card-head">
            <h3>Detailed calculation</h3>
            <label className="roi-pick"><span className="sr-only">Module</span>
              <select value={detailId} onChange={e => setDetailId(e.target.value)}>
                {GROUPS.map(g => <optgroup key={g} label={g}>{SOLUTIONS.filter(s => s.group === g).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
              </select><ChevronDown size={15} />
            </label>
          </div>
          <p className="sub">Every step for one module{detailScale < 1 ? `, with its denial share scaled to ${Math.round(detailScale * 100)}% for overlap` : ''}{detailMod.on ? '' : ' (not selected)'}.</p>
          {detail.breakdown.map((sec, i) => (
            <details key={sec.title} open={i === 4}>
              <summary>{sec.title}</summary>
              <table><tbody>{sec.rows.map(row => <tr key={row.label} className={row.cls}><th scope="row">{row.label}</th><td>{row.value}</td></tr>)}</tbody></table>
            </details>
          ))}
        </div>
      </section>
      <p className="fine">
        Illustrative estimate, not a quote. Module values are each process’s cost saved plus revenue captured, before the platform license; the license is charged once across all modules. Per-process math follows the calculator at contiinex.com/resources/roi-calculator. Contiinex reserves the right to adjust final pricing.
      </p>
    </div>
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
      setPlan(p => q.set!(p, v));
    }
    if (isLast) return onDone();
    go(step + 1, 1);
  };
  const prev = () => (step === 0 ? onDone() : go(step - 1, -1));
  const toggleMod = (id: string) => setPlan(p => ({ ...p, mods: { ...p.mods, [id]: { ...p.mods[id], on: !p.mods[id].on } } }));

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
      <div className="intake-bar" aria-hidden="false">
        <span className="intake-title">{title} · {step + 1} of {qs.length}</span>
        <div className="roi-progress"><i style={{ width: ((step + 1) / qs.length) * 100 + '%' }} /></div>
        <button type="button" className="roi-btn ghost sm" onClick={onDone}><X size={15} /> Back to summary</button>
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
            value={plan.hospital} onChange={e => { const v = e.target.value.slice(0, 120); setPlan(p => ({ ...p, hospital: v })); }} />
        )}

        {q.type === 'number' && (
          <NumberAnswer field={q.field!} value={value} draft={draft} invalid={!!error} title={q.title} inputRef={inputRef}
            onDraft={text => {
              setDraft(text); setError('');
              const v = parseField(q.field!, text);
              if (isFinite(v) && v >= 0 && !validate(q.key, q.field!, v)) setPlan(p => q.set!(p, v));
            }}
            onSet={v => { setPlan(p => q.set!(p, v)); setDraft(fieldText(q.field!, v)); setError(''); }}
          />
        )}

        {q.insight && <p className={'insight' + (warn ? ' warn' : '')} aria-live="polite">{warn || q.insight(plan)}</p>}
        {q.type === 'modules' && <p className="insight" aria-live="polite">{nOn} of {SOLUTIONS.length} selected · {F.moneyCompact(portfolio(plan).total)} a year added to EBITDA</p>}
        <p className="error" role="alert">{error}</p>

        <div className="roi-actions">
          <button type="button" className="roi-btn primary" onClick={next}>{isLast ? 'See the summary' : 'OK'} <Check size={18} /></button>
          <span className="kbd">press <b>Enter ↵</b></span>
        </div>
      </div>
      <div className="roi-dock">
        <div className="ticker" aria-live="polite">
          <span className="ticker-label">Projected annual impact</span> <b>{F.moneyCompact(portfolio(plan).total)}</b> · <b>{F.oneDp.format(portfolio(plan).roi)}x</b> ROI
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
