/*
 * Portfolio of modules: every process can be switched on, each runs through the
 * single-process model in model.ts unchanged, and the results are added up.
 *
 * Two things the single-process calculator never had to deal with:
 * - Several modules claim a share of the same denied revenue. When those shares
 *   add up to more than the denial pool, they are scaled down proportionally so
 *   no denied dollar is counted twice.
 * - A timeline: annual platform license, one-time implementation, months to
 *   go-live and ramp to full run-rate, for the cumulative net benefit.
 */
import { compute, defaults, GLOBAL_FIELDS, SOLUTIONS, solutionDefaults, type Field, type Inputs, type Solution } from './model.ts';

export const MODULE_KEYS = ['agents', 'mins', 'units', 'pool', 'share', 'capture', 'rework', 'auto'];
// Modules whose revenue pool is denied revenue and so can overlap.
export const DENIAL_POOL_IDS = ['ebv', 'pa', 'clm', 'cod', 'dna', 'dnm'];
export const HORIZON = 36;

export const PLAN_FIELDS: Record<string, Field> = {
  license: { id: 'license', label: 'Annual platform license', hint: 'Benchmark ~$1,000 per $1M of NPR', def: 0, min: 0, max: 3e6, step: 10000, unit: '$' },
  impl: { id: 'impl', label: 'One-time implementation', hint: 'Enter your quote; 0 if included', def: 0, min: 0, max: 2e6, step: 25000, unit: '$' },
  golive: { id: 'golive', label: 'Months to go-live', hint: 'A 2–4 week diagnostic, then a 60–90 day pilot', def: 3, min: 0, max: 12, step: 1, unit: 'mo', suffix: true },
  ramp: { id: 'ramp', label: 'Months to full run-rate after go-live', hint: 'Benefit grows evenly over these months', def: 3, min: 0, max: 12, step: 1, unit: 'mo', suffix: true },
};
export const LICENSE_RATE = 0.001; // ~$1,000 per $1M of NPR, the deck's Subscribe benchmark

export type Plan = {
  hospital: string;
  g: Inputs; // npr, cost, hpy, price, margin, impl, golive, ramp, and license when set
  licenseSet: boolean; // false: license follows NPR at the benchmark
  mods: Record<string, { on: boolean; inp: Inputs }>;
};

export function defaultPlan(): Plan {
  const g: Inputs = {};
  ['npr', 'cost', 'hpy', 'price', 'margin'].forEach(k => (g[k] = GLOBAL_FIELDS[k].def));
  ['impl', 'golive', 'ramp'].forEach(k => (g[k] = PLAN_FIELDS[k].def));
  const mods: Plan['mods'] = {};
  SOLUTIONS.forEach(s => (mods[s.id] = { on: true, inp: moduleDefaults(s) }));
  return { hospital: '', g, licenseSet: false, mods };
}

export function moduleDefaults(sol: Solution): Inputs {
  return { agents: GLOBAL_FIELDS.agents.def, ...solutionDefaults(sol) };
}

export const license = (p: Plan) => (p.licenseSet ? p.g.license ?? 0 : Math.round(p.g.npr * LICENSE_RATE));

// Inputs for one module as the single-process model expects them. The license
// is charged once for the portfolio, so the per-module fee is zero.
export function moduleInputs(p: Plan, sol: Solution, shareScale = 1): Inputs {
  const base = defaults(sol);
  const inp: Inputs = { ...base, ...p.mods[sol.id].inp, npr: p.g.npr, cost: p.g.cost, hpy: p.g.hpy, price: p.g.price, margin: p.g.margin, fee: 0 };
  inp.share = inp.share * shareScale;
  return inp;
}

export type ModuleResult = {
  sol: Solution; on: boolean; r: Record<string, number> & { D: Record<string, number> };
  value: number; cap: number; saved: number; spend: number; hoursValue: number; staff0: number; addressable: number; hours: number;
};

export function portfolio(p: Plan) {
  // Overlap: selected modules drawing on denied revenue.
  const denialOn = SOLUTIONS.filter(s => DENIAL_POOL_IDS.includes(s.id) && p.mods[s.id].on);
  const claimed = denialOn.reduce((t, s) => t + (p.mods[s.id].inp.pool * p.mods[s.id].inp.share) / 100, 0); // % of NPR
  const denialPoolPct = denialOn.reduce((m, s) => Math.max(m, p.mods[s.id].inp.pool), 0);
  const overlapScale = claimed > denialPoolPct && claimed > 0 ? denialPoolPct / claimed : 1;

  const modules: ModuleResult[] = SOLUTIONS.map(sol => {
    const scale = DENIAL_POOL_IDS.includes(sol.id) ? overlapScale : 1;
    const r = compute(moduleInputs(p, sol, scale), sol) as ModuleResult['r'];
    const d = r.D;
    return {
      sol, on: p.mods[sol.id].on, r,
      value: d.cap + d.saved, cap: d.cap, saved: d.saved, spend: d.cnx, hoursValue: d.hv, staff0: d.staff0,
      addressable: r.addressable, hours: r.hoursSaved,
    };
  });
  const on = modules.filter(m => m.on);
  const sum = (f: (m: ModuleResult) => number) => on.reduce((t, m) => t + f(m), 0);

  const lic = license(p);
  const cap = sum(m => m.cap);
  const consumption = sum(m => m.spend);
  const hoursValue = sum(m => m.hoursValue);
  const staff0 = sum(m => m.staff0);
  const addressable = sum(m => m.addressable);
  const spend = consumption + lic;
  const saved = hoursValue - spend; // operating cost saved, after everything paid to Contiinex
  const total = cap + saved;
  const hours = sum(m => m.hours);

  // P&L: realized revenue excludes the denial pool when a denial module is on.
  const npr = p.g.npr;
  const rev0 = npr - (denialOn.length ? (npr * denialPoolPct) / 100 : 0);
  const e0 = (rev0 * p.g.margin) / 100;
  const e1 = e0 + total;
  const rev1 = rev0 + cap;
  const m0 = rev0 ? e0 / rev0 : 0;
  const m1 = rev1 ? e1 / rev1 : 0;

  // Monthly timeline: benefit and consumption ramp in after go-live; license from month 1.
  const golive = Math.max(0, Math.round(p.g.golive));
  const ramp = Math.max(0, Math.round(p.g.ramp));
  const monthlyNet = (cap + hoursValue - consumption) / 12;
  const cumulative: number[] = [-p.g.impl];
  for (let m = 1; m <= HORIZON; m++) {
    const k = m <= golive ? 0 : ramp === 0 ? 1 : Math.min(1, (m - golive) / ramp);
    cumulative.push(cumulative[m - 1] + k * monthlyNet - lic / 12);
  }
  const breakeven = findBreakeven(cumulative);

  return {
    modules, on, overlap: { scale: overlapScale, claimedPct: claimed, poolPct: denialPoolPct },
    license: lic, consumption, spend, cap, hoursValue, saved, total, staff0, addressable, hours,
    fte: hours / p.g.hpy, roi: spend > 0 ? total / spend : 0, payback: total > 0 ? spend / (total / 12) : 0,
    npr, rev0, rev1, e0, e1, m0, m1, cumulative, breakeven, net3y: cumulative[HORIZON],
    staffLeft: staff0 - hoursValue,
  };
}

// First month the running total is at or above zero after having been below it
// (or month 0 when it never goes negative).
function findBreakeven(c: number[]): number | null {
  let wasNegative = false;
  for (let m = 0; m < c.length; m++) {
    if (c[m] < 0) wasNegative = true;
    else if (wasNegative) return m;
  }
  return wasNegative ? null : 0;
}

export type Portfolio = ReturnType<typeof portfolio>;

// ---- Persistence and share links --------------------------------------------
const STORAGE_KEY = 'contiinex-roi-plan-v2';

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return v != null && v !== '' && isFinite(n) && n >= 0 ? n : fallback;
};

// Rebuild a plan from untrusted JSON (storage or a link), keeping only known numeric fields.
export function sanitizePlan(raw: unknown): Plan {
  const p = defaultPlan();
  if (!raw || typeof raw !== 'object') return p;
  const o = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  p.hospital = typeof o.hospital === 'string' ? o.hospital.slice(0, 120) : '';
  if (o.g && typeof o.g === 'object') {
    Object.keys(p.g).forEach(k => (p.g[k] = num(o.g[k], p.g[k])));
    if (o.licenseSet) { p.licenseSet = true; p.g.license = num(o.g.license, 0); }
  }
  if (o.mods && typeof o.mods === 'object') {
    SOLUTIONS.forEach(s => {
      const m = o.mods[s.id];
      if (!m || typeof m !== 'object') return;
      p.mods[s.id].on = m.on !== false;
      const inp = p.mods[s.id].inp;
      if (m.inp && typeof m.inp === 'object') Object.keys(inp).forEach(k => (inp[k] = num(m.inp[k], inp[k])));
    });
  }
  return p;
}

export function loadPlan(): Plan | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? sanitizePlan(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function savePlan(p: Plan) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

// Only what differs from the defaults goes into the link, base64url-encoded.
export function planToHash(p: Plan): string {
  const d = defaultPlan();
  const out: Record<string, unknown> = {};
  if (p.hospital.trim()) out.hospital = p.hospital.trim();
  const g: Inputs = {};
  Object.keys(p.g).forEach(k => { if (p.g[k] !== d.g[k]) g[k] = p.g[k]; });
  if (p.licenseSet) { out.licenseSet = true; g.license = p.g.license ?? 0; }
  if (Object.keys(g).length) out.g = g;
  const mods: Record<string, unknown> = {};
  SOLUTIONS.forEach(s => {
    const m = p.mods[s.id], dm = d.mods[s.id];
    const inp: Inputs = {};
    Object.keys(m.inp).forEach(k => { if (m.inp[k] !== dm.inp[k]) inp[k] = m.inp[k]; });
    if (!m.on || Object.keys(inp).length) mods[s.id] = { ...(m.on ? {} : { on: false }), ...(Object.keys(inp).length ? { inp } : {}) };
  });
  if (Object.keys(mods).length) out.mods = mods;
  const json = JSON.stringify(out);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json).toString('base64');
  return 'plan=' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function planFromHash(hash: string): Plan | null {
  const m = /plan=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString();
    return sanitizePlan(JSON.parse(json));
  } catch {
    return null;
  }
}

