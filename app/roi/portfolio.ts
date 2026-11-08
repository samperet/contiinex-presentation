/*
 * Portfolio of modules: every process can be switched on, each runs through the
 * single-process model in model.ts unchanged, and the results are added up.
 *
 * What the single-process calculator never had to deal with:
 * - Several modules work on the same denied revenue. They are counted in
 *   sequence on one denial pool: the prevention modules first (each owns a
 *   distinct cause of denial), then Denial Analytics on the denials still left,
 *   then Denial Management on what is still written off. Switching a module off
 *   can only lower the total.
 * - Default volumes and staff are set for a $500M hospital (the website's
 *   defaults); until a value is entered they scale with net patient revenue.
 * - A timeline: annual platform license, one-time implementation, months to
 *   go-live and ramp to full run-rate, for the cumulative net benefit.
 */
import { compute, defaults, fieldDefs, GLOBAL_FIELDS, SOLUTIONS, solutionDefaults, type Field, type Inputs, type Solution } from './model.ts';

export const MODULE_KEYS = ['agents', 'mins', 'units', 'pool', 'share', 'capture', 'rework', 'auto'];
// Modules whose revenue pool is denied revenue, in the order they are counted.
export const PREVENTION_IDS = ['ebv', 'pa', 'clm', 'cod'];
export const DENIAL_POOL_IDS = [...PREVENTION_IDS, 'dna', 'dnm'];
// Modules whose revenue is new patient volume rather than revenue on care already delivered.
export const NEW_VOLUME_IDS = ['sch', 'ref', 'crd'];
export const DEFAULT_OFF = NEW_VOLUME_IDS;
export const HORIZON = 36;
export const SIZE_BASE_NPR = 500e6; // the website's defaults describe a $500M hospital
const SCALED_KEYS = ['units', 'agents'];
export const PLAUSIBLE_SHARE_OF_NPR = 0.1;

export const PLAN_FIELDS: Record<string, Field> = {
  license: { id: 'license', label: 'Annual platform license', hint: 'Benchmark ~$1,000 per $1M of NPR', def: 0, min: 0, max: 3e6, step: 10000, unit: '$' },
  impl: { id: 'impl', label: 'One-time implementation', hint: 'Enter your quote; 0 if included', def: 0, min: 0, max: 2e6, step: 25000, unit: '$' },
  golive: { id: 'golive', label: 'Months to go-live', hint: 'A 2–4 week diagnostic, then a 60–90 day pilot', def: 3, min: 0, max: 12, step: 1, unit: 'mo', suffix: true },
  ramp: { id: 'ramp', label: 'Months to full run-rate after go-live', hint: 'Benefit grows evenly over these months', def: 3, min: 0, max: 12, step: 1, unit: 'mo', suffix: true },
};
export const LICENSE_RATE = 0.001; // ~$1,000 per $1M of NPR, the deck's Subscribe benchmark
const GLOBAL_KEYS = ['npr', 'cost', 'hpy', 'price', 'margin'];
const ASSUMPTION_KEYS = ['cost', 'hpy', 'price', 'margin', 'golive', 'ramp']; // hospital-wide values that start typical

export type ModuleState = { on: boolean; inp: Inputs; set: string[] }; // set: keys the user entered
export type Plan = {
  hospital: string;
  g: Inputs; // npr, cost, hpy, price, margin, impl, golive, ramp, and license when set
  licenseSet: boolean; // false: license follows NPR at the benchmark
  mods: Record<string, ModuleState>;
};

export function defaultPlan(): Plan {
  const g: Inputs = {};
  GLOBAL_KEYS.forEach(k => (g[k] = GLOBAL_FIELDS[k].def));
  ['impl', 'golive', 'ramp'].forEach(k => (g[k] = PLAN_FIELDS[k].def));
  const mods: Plan['mods'] = {};
  SOLUTIONS.forEach(s => (mods[s.id] = { on: !DEFAULT_OFF.includes(s.id), inp: moduleDefaults(s), set: [] }));
  return { hospital: '', g, licenseSet: false, mods };
}

// One module on, as on the deck's Pricing slide.
export function singleModulePlan(id: string, npr?: number): Plan {
  const p = defaultPlan();
  Object.keys(p.mods).forEach(k => (p.mods[k].on = k === id));
  if (npr && npr > 0) p.g.npr = npr;
  return p;
}

export function withRecommendedScope(p: Plan): Plan {
  return { ...p, mods: Object.fromEntries(Object.entries(p.mods).map(([id, m]) => [id, { ...m, on: !DEFAULT_OFF.includes(id) }])) };
}

export function moduleDefaults(sol: Solution): Inputs {
  return { agents: GLOBAL_FIELDS.agents.def, ...solutionDefaults(sol) };
}

export const license = (p: Plan) => (p.licenseSet ? p.g.license ?? 0 : Math.round(p.g.npr * LICENSE_RATE));
export const sizeFactor = (p: Plan) => p.g.npr / SIZE_BASE_NPR;

// A module input as used: entered values as entered, typical volumes and staff sized to the hospital.
export function moduleValue(p: Plan, id: string, key: string): number {
  const m = p.mods[id];
  const v = m.inp[key];
  return SCALED_KEYS.includes(key) && !m.set.includes(key) ? v * sizeFactor(p) : v;
}

// Inputs for one module as the single-process model expects them. The license
// is charged once for the portfolio, so the per-module fee is zero.
export function moduleInputs(p: Plan, sol: Solution, shareScale = 1): Inputs {
  const base = defaults(sol);
  const inp: Inputs = { ...base, ...p.mods[sol.id].inp, npr: p.g.npr, cost: p.g.cost, hpy: p.g.hpy, price: p.g.price, margin: p.g.margin, fee: 0 };
  SCALED_KEYS.forEach(k => (inp[k] = moduleValue(p, sol.id, k)));
  inp.share = inp.share * shareScale;
  return inp;
}

export type ModuleResult = {
  sol: Solution; on: boolean; tailored: boolean; shareScale: number;
  r: Record<string, number> & { D: Record<string, number> };
  value: number; cap: number; saved: number; spend: number; hoursValue: number; staff0: number; addressable: number; hours: number;
  standalone: number; // value if this module were the only one on
};

// Denial pool counted in sequence across the selected denial modules.
function denialScales(p: Plan, on: (id: string) => boolean) {
  const npr = p.g.npr;
  const selected = DENIAL_POOL_IDS.filter(on);
  const poolPct = selected.reduce((mx, id) => Math.max(mx, p.mods[id].inp.pool), 0);
  const D = (npr * poolPct) / 100;
  const scales: Record<string, number> = {};
  const toScale = (id: string, addressable: number) => {
    const own = (npr * p.mods[id].inp.pool * p.mods[id].inp.share) / 1e4; // what the module would address alone
    return own > 0 ? addressable / own : 0;
  };
  // Prevention: distinct causes of denial, each a share of the pool; scaled down only if they add up to more than all denials.
  const prev = PREVENTION_IDS.filter(on);
  // Scaled over all four prevention causes, selected or not, so switching one off cannot raise the others.
  const claimedShare = PREVENTION_IDS.reduce((t, id) => t + p.mods[id].inp.share, 0);
  const prevScale = claimedShare > 100 ? 100 / claimedShare : 1;
  let remaining = D;
  let prevented = 0;
  prev.forEach(id => {
    const addr = (D * p.mods[id].inp.share * prevScale) / 100;
    scales[id] = toScale(id, addr);
    prevented += (addr * p.mods[id].inp.capture) / 100;
  });
  remaining -= prevented;
  for (const id of ['dna', 'dnm']) {
    if (!on(id)) continue;
    const addr = (remaining * p.mods[id].inp.share) / 100;
    scales[id] = toScale(id, addr);
    remaining -= (addr * p.mods[id].inp.capture) / 100;
  }
  return { scales, poolPct, pool: D, counted: D - remaining };
}

function moduleResult(p: Plan, sol: Solution, on: boolean, shareScale: number): ModuleResult {
  const r = compute(moduleInputs(p, sol, shareScale), sol) as ModuleResult['r'];
  const d = r.D;
  const alone = shareScale === 1 ? d.cap + d.saved : (() => { const s = (compute(moduleInputs(p, sol), sol) as ModuleResult['r']).D; return s.cap + s.saved; })();
  return {
    sol, on, tailored: p.mods[sol.id].set.length > 0, shareScale, r,
    value: d.cap + d.saved, cap: d.cap, saved: d.saved, spend: d.cnx, hoursValue: d.hv, staff0: d.staff0,
    addressable: r.addressable, hours: r.hoursSaved, standalone: alone,
  };
}

// Totals only (no timeline): used for the floor, the low-end case and the all-modules comparison.
function totals(p: Plan) {
  const isOn = (id: string) => p.mods[id].on;
  const { scales } = denialScales(p, isOn);
  const on = SOLUTIONS.filter(s => isOn(s.id)).map(s => moduleResult(p, s, true, scales[s.id] ?? 1));
  const sum = (f: (m: ModuleResult) => number) => on.reduce((t, m) => t + f(m), 0);
  const spend = sum(m => m.spend) + license(p);
  return sum(m => m.cap) + sum(m => m.hoursValue) - spend;
}

export function portfolio(p: Plan) {
  const isOn = (id: string) => p.mods[id].on;
  const denial = denialScales(p, isOn);
  const modules: ModuleResult[] = SOLUTIONS.map(sol => moduleResult(p, sol, isOn(sol.id), isOn(sol.id) ? denial.scales[sol.id] ?? 1 : 1));
  const on = modules.filter(m => m.on);
  const sum = (f: (m: ModuleResult) => number) => on.reduce((t, m) => t + f(m), 0);

  const lic = license(p);
  const cap = sum(m => m.cap);
  const capNew = on.filter(m => NEW_VOLUME_IDS.includes(m.sol.id)).reduce((t, m) => t + m.cap, 0);
  const capDenial = on.filter(m => DENIAL_POOL_IDS.includes(m.sol.id)).reduce((t, m) => t + m.cap, 0);
  const consumption = sum(m => m.spend);
  const hoursValue = sum(m => m.hoursValue);
  const staff0 = sum(m => m.staff0);
  const addressable = sum(m => m.addressable);
  const spend = consumption + lic;
  const saved = hoursValue - spend; // operating cost saved, after everything paid to Contiinex
  const total = cap + saved;
  const hours = sum(m => m.hours);
  const standaloneSum = sum(m => m.standalone);
  const overlap = standaloneSum - sum(m => m.value); // value counted once instead of per module

  // P&L: realized revenue excludes the denial pool when a denial module is on.
  const npr = p.g.npr;
  const anyDenial = DENIAL_POOL_IDS.some(isOn);
  const rev0 = npr - (anyDenial ? denial.pool : 0);
  const e0 = (rev0 * p.g.margin) / 100;
  const e1 = e0 + total;
  const rev1 = rev0 + cap;

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
  const net3y = cumulative[HORIZON];
  const cost3y = 3 * spend + p.g.impl;

  // Low end: every capture and automation rate at the bottom of its typical range.
  const low: Plan = { ...p, mods: Object.fromEntries(Object.entries(p.mods).map(([id, m]) => {
    const f = fieldDefs(SOLUTIONS.find(s => s.id === id)!);
    return [id, { ...m, inp: { ...m.inp, capture: f.capture.min, auto: f.auto.min } }];
  })) };
  const allOn: Plan = { ...p, mods: Object.fromEntries(Object.entries(p.mods).map(([id, m]) => [id, { ...m, on: true }])) };

  return {
    modules, on, denial,
    license: lic, consumption, spend, cap, capNew, capDenial, capRecovered: cap - capNew, hoursValue, saved, total, staff0, addressable, hours,
    standaloneSum, overlap,
    fte: hours / p.g.hpy, npr, rev0, rev1, e0, e1, m0: rev0 ? e0 / rev0 : 0, m1: rev1 ? e1 / rev1 : 0,
    cumulative, breakeven, net3y, cost3y, return3y: cost3y > 0 ? net3y / cost3y : 0,
    year1: cumulative[12] + p.g.impl, // first 12 months, before implementation
    fullRunMonth: golive + ramp,
    floor: cap - spend, // if freed staff time is redeployed rather than removed
    shareOfNpr: npr > 0 ? total / npr : 0,
    lowTotal: totals(low),
    allTotal: on.length === modules.length ? total : totals(allOn),
    implausible: npr > 0 && total / npr > PLAUSIBLE_SHARE_OF_NPR,
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

// How many inputs are still typical values, for the basis line.
export function typicalCount(p: Plan): { typical: number; total: number } {
  const d = defaultPlan();
  let total = 0, entered = 0;
  ASSUMPTION_KEYS.forEach(k => { total++; if (p.g[k] !== d.g[k]) entered++; });
  total++; if (p.licenseSet) entered++;
  SOLUTIONS.filter(s => p.mods[s.id].on).forEach(s => {
    MODULE_KEYS.forEach(k => {
      if (k === 'rework' && !s.rework) return;
      if (k === 'agents') return; // staff count feeds intake hints only, not a report figure
      total++;
      if (p.mods[s.id].set.includes(k)) entered++;
    });
  });
  return { typical: total - entered, total };
}

// ---- Persistence and share links --------------------------------------------
const STORAGE_KEY = 'contiinex-roi-plan-v3';

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
      if ('on' in m) p.mods[s.id].on = !!m.on;
      const st = p.mods[s.id];
      if (m.inp && typeof m.inp === 'object') Object.keys(st.inp).forEach(k => (st.inp[k] = num(m.inp[k], st.inp[k])));
      const set = Array.isArray(m.set) ? m.set.filter((k: unknown) => typeof k === 'string' && MODULE_KEYS.includes(k)) : null;
      // Older links have no set list: anything that differs from the default was entered.
      const dflt = moduleDefaults(s);
      st.set = set ?? MODULE_KEYS.filter(k => st.inp[k] !== undefined && st.inp[k] !== dflt[k]);
    });
    // One denial rate for the hospital: the first entered one, else the typical value.
    const src = DENIAL_POOL_IDS.find(id => p.mods[id].set.includes('pool'));
    if (src) {
      const v = p.mods[src].inp.pool;
      DENIAL_POOL_IDS.forEach(id => { const st = p.mods[id]; st.inp.pool = v; if (!st.set.includes('pool')) st.set = [...st.set, 'pool']; });
    } else {
      DENIAL_POOL_IDS.forEach(id => { p.mods[id].inp.pool = moduleDefaults(SOLUTIONS.find(s => s.id === id)!).pool; });
    }
  }
  return p;
}

export type Saved = { plan: Plan; savedAt: string | null };

export function loadSaved(): Saved | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const o = JSON.parse(s);
    return { plan: sanitizePlan(o.plan ?? o), savedAt: typeof o.savedAt === 'string' ? o.savedAt : null };
  } catch {
    return null;
  }
}

export function savePlan(p: Plan, savedAt: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan: p, savedAt }));
  } catch {
    /* storage unavailable */
  }
}

export function clearSaved() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
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
    const entry: Record<string, unknown> = {};
    if (m.on !== dm.on) entry.on = m.on;
    if (Object.keys(inp).length) entry.inp = inp;
    if (m.set.length) entry.set = m.set;
    if (Object.keys(entry).length) mods[s.id] = entry;
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
