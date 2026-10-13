'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { compute, defaults, fmt as F, getSolution, GROUPS, SOLUTIONS, VENDOR, type Field } from './model';
import ExecSummary from './ExecSummary';
import {
  answersQuery, answerText, clamp, fieldText, loadAnswers, parseField, prefix, questions, rangeText,
  sanitize, saveAnswers, suffix, validate, withProcess, type Answers,
} from './questions';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
type Mode = 'welcome' | 'form' | 'results';

// Saved answers, then any process, revenue or answers passed in the link (the deck's Pricing slide passes p and npr).
function initialState(): { a: Answers; mode: Mode } {
  const ebv = getSolution('ebv');
  let a: Answers = { solId: ebv.id, hospital: '', inp: defaults(ebv), answered: false };
  const saved = loadAnswers();
  if (saved) a = sanitize(saved.solId, saved.hospital, saved.inp ?? {}, !!saved.answered, defaults(getSolution(saved.solId)));
  if (typeof window === 'undefined') return { a, mode: 'welcome' };
  const params = new URLSearchParams(window.location.search);
  if (!params.toString()) return { a, mode: 'welcome' };
  if (params.get('p')) a = withProcess(a, params.get('p')!);
  const raw: Record<string, string> = {};
  params.forEach((v, k) => { raw[k] = v; });
  const showResults = window.location.hash === '#results';
  a = sanitize(a.solId, params.has('h') ? params.get('h') : a.hospital, raw, a.answered || showResults, a.inp);
  window.history.replaceState(null, '', window.location.pathname);
  return { a, mode: showResults ? 'results' : 'welcome' };
}

export default function RoiPage() {
  const init = useMemo(initialState, []);
  const [a, setA] = useState<Answers>(init.a);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [fromResults, setFromResults] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sol = getSolution(a.solId);
  const qs = questions(sol, a.inp);
  const q = qs[Math.min(step, qs.length - 1)];
  const r = compute(a.inp, sol);

  useEffect(() => { saveAnswers(a); }, [a]);

  // Reset the text box whenever a new question appears.
  useEffect(() => {
    if (mode !== 'form') return;
    setError('');
    if (q.type === 'number') setDraft(fieldText(q.field, a.inp[q.key]));
    const t = window.setTimeout(() => {
      const el = inputRef.current ?? document.querySelector<HTMLElement>('.roi-choice.on, .roi-q .roi-btn.primary');
      el?.focus({ preventScroll: true });
      if (el instanceof HTMLInputElement) el.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, [mode, step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'welcome') document.querySelector<HTMLElement>('.roi-welcome .roi-btn.primary')?.focus({ preventScroll: true });
    if (mode === 'results') window.scrollTo(0, 0);
  }, [mode]);

  const setInput = (key: string, v: number) => setA(p => ({ ...p, inp: { ...p.inp, [key]: v } }));

  const go = (n: number, d: number) => { setDir(d); setStep(n); setMode('form'); };
  const showResults = () => { setA(p => ({ ...p, answered: true })); setFromResults(false); setMode('results'); };

  const next = () => {
    if (mode === 'welcome') { setFromResults(false); return go(0, 1); }
    if (mode !== 'form') return;
    if (q.type === 'number') {
      const v = parseField(q.field, draft);
      const err = validate(q.key, q.field, v);
      if (err) { setError(err); inputRef.current?.focus(); return; }
      setInput(q.key, v);
    }
    if (step >= qs.length - 1) return showResults();
    go(step + 1, 1);
  };
  const prev = () => {
    if (mode !== 'form') return;
    if (step === 0) return setMode('welcome');
    go(step - 1, -1);
  };
  const choose = (id: string) => {
    setA(p => withProcess(p, id));
    // Brief pause so the selection registers before moving on.
    window.setTimeout(() => (fromResults ? showResults() : go(1, 1)), 260);
  };
  const edit = (key: string) => { setFromResults(true); go(Math.max(0, qs.findIndex(x => x.key === key)), 1); };

  // Keyboard: Enter next, Shift+Enter back, letters pick a process.
  const keys = useRef({ next, prev, choose, mode, q });
  keys.current = { next, prev, choose, mode, q };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement;
      const inField = !!t.closest?.('input, textarea');
      if (e.key === 'Enter' && !e.shiftKey) {
        if (k.mode === 'welcome' || (k.mode === 'form' && (inField || t === document.body))) { e.preventDefault(); k.next(); }
        return;
      }
      if (k.mode !== 'form') return;
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); k.prev(); return; }
      if (!inField && k.q.type === 'choice' && e.key.length === 1) {
        const i = LETTERS.indexOf(e.key.toUpperCase());
        if (i >= 0 && i < SOLUTIONS.length) { e.preventDefault(); k.choose(SOLUTIONS[i].id); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Print every calculation section, not just the open ones.
  useEffect(() => {
    const open = () => document.querySelectorAll('.breakdown details').forEach(d => ((d as HTMLDetailsElement).open = true));
    window.addEventListener('beforeprint', open);
    return () => window.removeEventListener('beforeprint', open);
  }, []);

  const copyLink = () => {
    const url = window.location.href.split(/[?#]/)[0] + '?' + answersQuery(a) + '#results';
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link:', url));
    else window.prompt('Copy this link:', url);
  };

  const progress = mode === 'welcome' ? 0 : mode === 'results' ? 1 : (step + 1) / qs.length;
  const isLast = step === qs.length - 1;

  return (
    <main className={'roi-page mode-' + mode}>
      <header className="roi-top">
        <a className="brand" href="./index.html"><img src="./brand/contiinex-logo.png" alt="Contiinex" width="200" height="40" /></a>
        <a className="back-link" href="./index.html"><ArrowLeft size={16} /> Presentation</a>
        <div className="roi-progress" aria-hidden="true"><i style={{ width: progress * 100 + '%' }} /></div>
      </header>

      {mode === 'welcome' && (
        <section className="roi-screen roi-welcome">
          <div className="roi-q enter">
            <p className="roi-eyebrow">ROI calculator · revenue-cycle automation</p>
            <h1>What would {VENDOR} add to <em>your EBITDA?</em></h1>
            <p className="lede">
              Answer {qs.length} quick questions about one revenue-cycle process. Every answer starts with a typical value, so you can press Enter to accept it. You get an executive summary with ROI, cost saved, hours freed and revenue recovered.
            </p>
            <div className="roi-actions">
              <button type="button" className="roi-btn primary" onClick={next}>Start <ArrowRight size={18} /></button>
              <span className="kbd">press <b>Enter ↵</b></span>
              {a.answered && <button type="button" className="roi-btn ghost" onClick={showResults}>View the last summary</button>}
            </div>
            <p className="fine">About two minutes. Your answers stay in this browser.</p>
          </div>
        </section>
      )}

      {mode === 'form' && (
        <section className="roi-screen roi-form">
          <div key={step + ':' + sol.id} className={'roi-q ' + (dir < 0 ? 'enter-down' : 'enter')} aria-labelledby="qtitle">
            <p className="roi-eyebrow">{q.section}</p>
            <h2 className="qtitle" id="qtitle">
              <span className="qnum">{step + 1}<ArrowRight size={15} /></span>
              {q.title}
            </h2>
            {q.hint && <p className="qhint">{q.hint}</p>}

            {q.type === 'choice' && (
              <div className="roi-choices" role="radiogroup" aria-labelledby="qtitle">
                {GROUPS.map(g => (
                  <div className="choice-group" key={g}>
                    <p className="group-label">{g}</p>
                    {SOLUTIONS.filter(s => s.group === g).map(s => {
                      const i = SOLUTIONS.indexOf(s), on = s.id === a.solId;
                      return (
                        <button key={s.id} type="button" role="radio" aria-checked={on} className={'roi-choice' + (on ? ' on' : '')} onClick={() => choose(s.id)}>
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
              <input
                ref={inputRef} className="roi-answer text" type="text" autoComplete="organization" placeholder={q.placeholder}
                value={a.hospital} onChange={e => setA(p => ({ ...p, hospital: e.target.value.slice(0, 120) }))}
              />
            )}

            {q.type === 'number' && (
              <NumberAnswer
                field={q.field} value={a.inp[q.key]} draft={draft} invalid={!!error} title={q.title} inputRef={inputRef}
                onDraft={text => {
                  setDraft(text); setError('');
                  const v = parseField(q.field, text);
                  if (isFinite(v) && v >= 0) setInput(q.key, v);
                }}
                onSet={v => { setInput(q.key, v); setDraft(fieldText(q.field, v)); setError(''); }}
              />
            )}

            {q.type === 'number' && (() => {
              const warn = q.warn?.(r) ?? '';
              return <p className={'insight' + (warn ? ' warn' : '')} aria-live="polite">{warn || q.insight(r)}</p>;
            })()}
            <p className="error" role="alert">{error}</p>

            {q.type !== 'choice' && (
              <div className="roi-actions">
                <button type="button" className="roi-btn primary" onClick={next}>{isLast ? 'See my summary' : 'OK'} <Check size={18} /></button>
                <span className="kbd">press <b>Enter ↵</b></span>
                {fromResults && !isLast && <button type="button" className="roi-btn ghost" onClick={showResults}>Back to summary</button>}
              </div>
            )}
          </div>
          <div className="roi-dock">
            <div className="ticker" aria-live="polite">
              {step > 0 && <><span className="ticker-label">Projected annual impact</span> <b>{F.moneyCompact(r.D.total)}</b> · <b>{F.oneDp.format(r.D.cnx > 0 ? r.D.total / r.D.cnx : 0)}x</b> ROI</>}
            </div>
            <div className="stepper">
              <button type="button" aria-label="Previous question" onClick={prev}><ChevronUp size={20} /></button>
              <button type="button" aria-label="Next question" onClick={next}><ChevronDown size={20} /></button>
            </div>
          </div>
        </section>
      )}

      {mode === 'results' && (
        <section className="roi-screen roi-results">
          <ExecSummary
            sol={sol} inp={a.inp} hospital={a.hospital}
            actions={<>
              <button type="button" className="roi-btn ghost sm" onClick={() => { setFromResults(false); go(0, 1); }}>Edit answers</button>
              <button type="button" className="roi-btn ghost sm" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
              <button type="button" className="roi-btn primary sm" onClick={() => window.print()}>Save PDF</button>
            </>}
            answers={
              <div className="exec-card">
                <h3>Your answers</h3>
                <p className="sub">Select one to change it.</p>
                <ul className="answers">
                  {qs.map(x => (
                    <li key={x.key}>
                      <button type="button" onClick={() => edit(x.key)}>
                        <span>{x.type === 'number' ? x.field.label : x.type === 'choice' ? 'Process' : 'Organization'}</span>
                        <b>{answerText(x, sol, a.inp, a.hospital)}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            }
          />
          <p className="fine">Illustrative estimate, not a quote. Defaults are typical starting points; replace them with your own figures. {VENDOR} reserves the right to adjust final pricing.</p>
        </section>
      )}
    </main>
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
        <input
          ref={inputRef} className="roi-answer" type="text" inputMode="decimal" autoComplete="off" aria-label={title} aria-describedby="roi-range"
          value={draft} onChange={e => onDraft(e.target.value)}
        />
        {suf && <span className="affix">{suf}</span>}
      </div>
      <input
        className="roi-slider" type="range" aria-label={title} min={f.min} max={f.max} step={f.step || 1}
        value={clamp(f, value)} style={{ ['--fill' as string]: fill }} onChange={e => onSet(parseFloat(e.target.value))}
      />
      <p className="range" id="roi-range">{rangeText(f)}</p>
      {f.presets && (
        <div className="roi-presets">
          {f.presets.map(p => (
            <button key={p} type="button" className={'chip' + (p === value ? ' on' : '')} onClick={() => { onSet(p); inputRef.current?.focus(); }}>
              {F.moneyShort(p, 0)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
