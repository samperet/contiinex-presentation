/*
 * RCM automation ROI model: process configs, inputs, the ROI calculation and
 * the executive-summary view model. Ported line for line from the calculator
 * at contiinex.com/resources/roi-calculator; test/roi-model.test.ts pins it to
 * that calculator's figures.
 */
/* eslint-disable no-var */
export type Range = { def: number; min: number; max: number; step?: number };
export type Labeled = Range & { label: string; hint: string };
export type Solution = {
  id: string; group: string; name: string; process: string; desc: string;
  unit: string; unitOne: string; units: Range; mins: Range; auto: Range;
  pool: Labeled; share: Labeled; capture: Labeled; rework: number | null;
  rev: string; revSub: string; funnel: string[];
  short: string; work: string; one: string; timeLabel: string; denial: boolean;
};
export type Field = Range & { id: string; label: string; hint?: string; unit?: string; suffix?: boolean; presets?: number[] };
export type Inputs = Record<string, number>;
// The model is plain arithmetic over loosely shaped records.
type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any


export const VENDOR = "Contiinex";

export const GROUPS = ["Patient Access", "Revenue Operations", "Revenue Intelligence"];

var BASE_SOLUTIONS: Rec[] = [
  {
    id: "sch",
    group: "Patient Access",
    name: "Patient Scheduling",
    process: "scheduling",
    desc: "Answer scheduling calls, book directly into the EHR/PMS and confirm appointments, so fewer patient calls go unanswered.",
    unit: "scheduling calls",
    unitOne: "call",
    units: { def: 150000, min: 20000, max: 400000, step: 5000 },
    mins: { def: 6, min: 2, max: 20, step: 1 },
    auto: { def: 70, min: 30, max: 95 },
    pool: { label: "Revenue lost to missed calls & no-shows", hint: "% of NPR", def: 3, min: 0.5, max: 10, step: 0.5 },
    share: { label: "Recoverable via call coverage & reminders", hint: "Share of that lost revenue", def: 40, min: 10, max: 80 },
    capture: { label: "Recovered with " + VENDOR, hint: "Share of recoverable revenue", def: 50, min: 10, max: 90 },
    rework: null,
    rev: "Revenue recovered",
    revSub: "from missed calls & no-shows",
    funnel: ["Lost to missed calls & no-shows", "Recoverable", "Recovered by " + VENDOR],
  },
  {
    id: "ebv",
    group: "Patient Access",
    name: "Eligibility & Benefits Verification",
    process: "E&BV",
    desc: "Discover active coverage and verify eligibility, benefits and patient responsibility, so every patient is financially cleared before the visit.",
    unit: "E&BV checks",
    unitOne: "check",
    units: { def: 300000, min: 50000, max: 600000, step: 5000 },
    mins: { def: 20, min: 3, max: 45, step: 1 },
    auto: { def: 80, min: 40, max: 95 },
    pool: { label: "Denials as % of revenue", hint: "% of NPR", def: 12, min: 2, max: 25, step: 0.5 },
    share: { label: "Denials caused by E&BV issues", hint: "Share of total denials", def: 15, min: 5, max: 40 },
    capture: { label: "E&BV denials prevented", hint: "Estimated with " + VENDOR, def: 70, min: 30, max: 95 },
    rework: 1000,
    rev: "Revenue protected",
    revSub: "from avoidable E&BV denials",
    funnel: ["Total denials", "Caused by E&BV", "Prevented by " + VENDOR],
  },
  {
    id: "pa",
    group: "Patient Access",
    name: "Prior Authorization",
    process: "prior auth",
    desc: "Identify services that need authorization, submit requests and track payer status, so approvals are in place before care is delivered.",
    unit: "prior auth requests",
    unitOne: "request",
    units: { def: 25000, min: 5000, max: 80000, step: 1000 },
    mins: { def: 35, min: 10, max: 90, step: 1 },
    auto: { def: 60, min: 30, max: 90 },
    pool: { label: "Denials as % of revenue", hint: "% of NPR", def: 12, min: 2, max: 25, step: 0.5 },
    share: { label: "Denials caused by authorization issues", hint: "Share of total denials", def: 10, min: 2, max: 30 },
    capture: { label: "Authorization denials prevented", hint: "Estimated with " + VENDOR, def: 65, min: 20, max: 95 },
    rework: 1000,
    rev: "Revenue protected",
    revSub: "from avoidable authorization denials",
    funnel: ["Total denials", "Caused by authorization", "Prevented by " + VENDOR],
  },
  {
    id: "ref",
    group: "Patient Access",
    name: "Referral Management",
    process: "referral",
    desc: "Capture, validate and route referrals, then track renewals and closure across connected payer and provider workflows.",
    unit: "referrals",
    unitOne: "referral",
    units: { def: 40000, min: 5000, max: 120000, step: 1000 },
    mins: { def: 15, min: 5, max: 45, step: 1 },
    auto: { def: 65, min: 30, max: 95 },
    pool: { label: "Referral leakage", hint: "Revenue lost to out-of-network leakage, % of NPR", def: 5, min: 1, max: 15, step: 0.5 },
    share: { label: "Leakage from referral processing gaps", hint: "Delays, lost or unclosed referrals", def: 30, min: 5, max: 70 },
    capture: { label: "Retained with " + VENDOR, hint: "Share of that leakage kept in network", def: 40, min: 10, max: 80 },
    rework: null,
    rev: "Revenue retained",
    revSub: "kept in network",
    funnel: ["Total referral leakage", "From processing gaps", "Retained by " + VENDOR],
  },
  {
    id: "clm",
    group: "Revenue Operations",
    name: "Claim Scrubbing & Submission",
    process: "claim scrubbing",
    desc: "Check every claim against payer and client rules before the 837 is released, and stop avoidable rejections at the source.",
    unit: "claims",
    unitOne: "claim",
    units: { def: 150000, min: 30000, max: 400000, step: 5000 },
    mins: { def: 6, min: 2, max: 20, step: 1 },
    auto: { def: 75, min: 40, max: 95 },
    pool: { label: "Denials as % of revenue", hint: "% of NPR", def: 12, min: 2, max: 25, step: 0.5 },
    share: { label: "Denials from claim errors & rejections", hint: "Share of total denials", def: 20, min: 5, max: 50 },
    capture: { label: "Claim-error denials prevented", hint: "Estimated with " + VENDOR, def: 45, min: 20, max: 95 },
    rework: 1000,
    rev: "Revenue protected",
    revSub: "from avoidable claim-error denials",
    funnel: ["Total denials", "From claim errors", "Prevented by " + VENDOR],
  },
  {
    id: "csi",
    group: "Revenue Operations",
    name: "AI Claims Inquiry",
    process: "claim status",
    desc: "Check claim status with payers continuously, interpret each response and trigger the right follow-up automatically.",
    unit: "claim status checks",
    unitOne: "check",
    units: { def: 120000, min: 20000, max: 400000, step: 5000 },
    mins: { def: 12, min: 3, max: 30, step: 1 },
    auto: { def: 75, min: 40, max: 95 },
    pool: { label: "AR written off", hint: "Timely filing & no-response write-offs, % of NPR", def: 2, min: 0.5, max: 6, step: 0.1 },
    share: { label: "Due to missed or late follow-up", hint: "Share of those write-offs", def: 50, min: 10, max: 90 },
    capture: { label: "Recovered with " + VENDOR, hint: "Share avoided by continuous follow-up", def: 60, min: 20, max: 90 },
    rework: null,
    rev: "Revenue recovered",
    revSub: "from avoidable AR write-offs",
    funnel: ["AR written off", "From missed follow-up", "Recovered by " + VENDOR],
  },
  {
    id: "dnm",
    group: "Revenue Operations",
    name: "Denial Management",
    process: "denial work",
    desc: "Diagnose each denial, choose the recovery path, take the next action and feed what's learned upstream to prevent repeats.",
    unit: "denied claims worked",
    unitOne: "denial",
    units: { def: 18000, min: 3000, max: 60000, step: 500 },
    mins: { def: 30, min: 10, max: 90, step: 1 },
    auto: { def: 50, min: 20, max: 90 },
    pool: { label: "Denials as % of revenue", hint: "% of NPR", def: 12, min: 2, max: 25, step: 0.5 },
    share: { label: "Denials currently written off", hint: "Never worked or not recovered", def: 25, min: 10, max: 70 },
    capture: { label: "Additional recovered with " + VENDOR, hint: "Share of written-off denials", def: 30, min: 10, max: 70 },
    rework: null,
    rev: "Revenue recovered",
    revSub: "from denials that are written off today",
    funnel: ["Total denials", "Written off today", "Recovered by " + VENDOR],
  },
  {
    id: "crd",
    group: "Revenue Operations",
    name: "Provider Credentialing",
    process: "credentialing",
    desc: "Manage verification, payer enrollment, effective dates, rosters and recredentialing, so providers are enrolled and billable without delays.",
    unit: "credentialing & enrollment applications",
    unitOne: "application",
    units: { def: 400, min: 50, max: 2000, step: 10 },
    mins: { def: 480, min: 60, max: 1200, step: 30 },
    auto: { def: 55, min: 20, max: 85 },
    pool: { label: "Revenue delayed or lost to enrollment gaps", hint: "% of NPR", def: 1.5, min: 0.2, max: 5, step: 0.1 },
    share: { label: "Caused by slow or missed follow-up", hint: "Share of that revenue", def: 60, min: 10, max: 90 },
    capture: { label: "Recovered with " + VENDOR, hint: "Faster enrollment, fewer lapses", def: 50, min: 10, max: 90 },
    rework: null,
    rev: "Revenue unlocked",
    revSub: "from faster, lapse-free enrollment",
    funnel: ["Delayed or lost to enrollment gaps", "From slow follow-up", "Unlocked by " + VENDOR],
  },
  {
    id: "cod",
    group: "Revenue Intelligence",
    name: "Coding AI Assist",
    process: "coding review",
    desc: "Bring coding intelligence into prior auth, referral, denial and claims inquiry workflows to flag coding risk and guide the next step.",
    unit: "charts reviewed",
    unitOne: "chart",
    units: { def: 100000, min: 20000, max: 300000, step: 5000 },
    mins: { def: 8, min: 2, max: 30, step: 1 },
    auto: { def: 40, min: 15, max: 80 },
    pool: { label: "Denials as % of revenue", hint: "% of NPR", def: 12, min: 2, max: 25, step: 0.5 },
    share: { label: "Denials caused by coding issues", hint: "Share of total denials", def: 15, min: 5, max: 40 },
    capture: { label: "Coding denials prevented", hint: "Estimated with " + VENDOR, def: 40, min: 20, max: 90 },
    rework: 1000,
    rev: "Revenue protected",
    revSub: "from avoidable coding denials",
    funnel: ["Total denials", "Caused by coding", "Prevented by " + VENDOR],
  },
  {
    id: "dna",
    group: "Revenue Intelligence",
    name: "Denial Analytics",
    process: "denial analysis",
    desc: "Expose root causes, repeat patterns, recoverability and emerging denial risk across the revenue cycle.",
    unit: "denials analyzed",
    unitOne: "denial",
    units: { def: 18000, min: 3000, max: 60000, step: 500 },
    mins: { def: 10, min: 3, max: 30, step: 1 },
    auto: { def: 85, min: 50, max: 95 },
    pool: { label: "Denials as % of revenue", hint: "% of NPR", def: 12, min: 2, max: 25, step: 0.5 },
    share: { label: "Preventable denials", hint: "Root cause can be fixed upstream", def: 40, min: 20, max: 90 },
    capture: { label: "Prevented through root-cause fixes", hint: "Estimated with " + VENDOR, def: 15, min: 5, max: 60 },
    rework: 1000,
    rev: "Revenue protected",
    revSub: "through root-cause prevention",
    funnel: ["Total denials", "Preventable", "Prevented by " + VENDOR],
  },
  {
    id: "zba",
    group: "Revenue Intelligence",
    name: "Zero Balance Audit",
    process: "zero-balance review",
    desc: "Identify missed reimbursement, incorrect adjustments, underpayments and recoverable value after claim closure.",
    unit: "zero-balance accounts reviewed",
    unitOne: "account",
    units: { def: 60000, min: 10000, max: 200000, step: 1000 },
    mins: { def: 10, min: 3, max: 30, step: 1 },
    auto: { def: 80, min: 40, max: 95 },
    pool: { label: "Underpayments & incorrect adjustments", hint: "% of NPR", def: 2, min: 0.5, max: 6, step: 0.1 },
    share: { label: "Identifiable in zero-balance review", hint: "Share of that leakage", def: 60, min: 20, max: 90 },
    capture: { label: "Recovered with " + VENDOR, hint: "Share of identified value", def: 50, min: 10, max: 90 },
    rework: null,
    rev: "Revenue recovered",
    revSub: "from underpayments & incorrect adjustments",
    funnel: ["Underpayments & adjustments", "Identifiable", "Recovered by " + VENDOR],
  },
  {
    id: "pcl",
    group: "Revenue Intelligence",
    name: "Patient Collection",
    process: "patient collection",
    desc: "Use AI calling and digital engagement for statement reminders, patient balances, payment-plan conversations and structured follow-up.",
    unit: "patient balance contacts",
    unitOne: "contact",
    units: { def: 80000, min: 10000, max: 250000, step: 1000 },
    mins: { def: 8, min: 2, max: 25, step: 1 },
    auto: { def: 70, min: 30, max: 95 },
    pool: { label: "Patient responsibility", hint: "Patient-owed balances, % of NPR", def: 12, min: 3, max: 30, step: 0.5 },
    share: { label: "Currently uncollected", hint: "Share of patient balances", def: 45, min: 10, max: 80 },
    capture: { label: "Additionally collected with " + VENDOR, hint: "Share of uncollected balances", def: 15, min: 5, max: 50 },
    rework: null,
    rev: "Cash collected",
    revSub: "in additional patient payments",
    funnel: ["Patient responsibility", "Uncollected today", "Collected by " + VENDOR],
  },
];

var OVERRIDES: Record<string, Rec> = {
  ebv: {
    units: { def: 50000, min: 10000, max: 300000, step: 1000 },
    short: "E&BV",
    work: "eligibility checks",
    one: "eligibility check",
    timeLabel: "Average time taken to execute one case of Eligibility & Co-ordination of Benefits",
    pool: { label: "Total denials as % of total revenue", hint: "% of NPR", def: 12, min: 2, max: 25, step: 0.5 },
    share: { label: "% of denials on account of E&BV from the total denials", hint: "Share of total denials", def: 15, min: 5, max: 40 },
    capture: { label: "Potential denial prevention because of E&BV automation by " + VENDOR, hint: "Estimated", def: 70, min: 30, max: 95 },
  },
  pa: { short: "prior auth" },
  clm: { short: "claim scrubbing" },
  cod: { short: "coding review" },
  dna: { short: "denial analytics" },
};

// Solutions whose value comes from preventing denials. They report against
// realized (post-denial) revenue rather than gross NPR.
var DENIAL_IDS = ["ebv", "pa", "clm", "cod", "dna"];

export const SOLUTIONS: Solution[] = BASE_SOLUTIONS.map(function (base) {
  var s = Object.assign({}, base, OVERRIDES[base.id] || {});
  var denial = DENIAL_IDS.indexOf(s.id) !== -1;
  s.short = s.short || s.process;
  s.work = s.work || s.unit;
  s.one = s.one || s.unitOne;
  s.timeLabel = s.timeLabel || "Average time taken to execute one " + s.unitOne;
  s.denial = denial;
  if (denial) {
    s.rev = "Increase in realized revenue";
    s.revSub = "NPR prevented from being denied";
  }
  return s as Solution;
});

export const GLOBAL_FIELDS: Record<string, Field> = {
  npr: { id: "npr", label: "Hospital net patient revenue (NPR)", hint: "Annual", def: 500e6, min: 50e6, max: 3e9, step: 10e6, presets: [100e6, 250e6, 500e6, 1e9, 2e9] },
  agents: { id: "agents", label: "Total RCM agents count for the process", hint: "Agents working this process today", def: 75, min: 1, max: 1000, step: 1 },
  cost: { id: "cost", label: "Hospital spend per RCM employee per year", hint: "Fully loaded", def: 50000, min: 25000, max: 120000, step: 1000, unit: "$" },
  hpy: { id: "hpy", label: "Total work hours of an RCM employee per year", hint: "8 hrs × 22 days × 12 months", def: 2112, min: 1600, max: 2400, step: 8, unit: "hrs", suffix: true },
  price: { id: "price", label: "Per transaction price of " + VENDOR, hint: "% of manual cost per transaction", def: 60, min: 20, max: 90, step: 1, unit: "%", suffix: true },
  fee: { id: "fee", label: "Annual platform fee", hint: "Fixed yearly fee on top of per-transaction pricing", def: 0, min: 0, max: 500000, step: 5000, unit: "$" },
  margin: { id: "margin", label: "Hospital EBITDA margin today", hint: "Used for the P&L and EBITDA view", def: 8, min: 0, max: 25, step: 0.5, unit: "%", suffix: true },
};

export function getSolution(id: string | null | undefined): Solution {
  for (var i = 0; i < SOLUTIONS.length; i++) if (SOLUTIONS[i].id === id) return SOLUTIONS[i];
  return SOLUTIONS[1];
}

// Annual volume field: the per-solution range is scaled up for whole-hospital volumes.
export function volumeField(sol: Solution): Range {
  var u = sol.units;
  return { def: u.def * 5, min: Math.max(1, u.min), max: u.max * 20, step: u.step };
}

// Every input the model reads, with labels resolved for the chosen solution.
export function fieldDefs(sol: Solution): Record<string, Field> {
  var pct = function (f: Rec): Field { return Object.assign({ unit: "%", suffix: true, step: 1 }, f) as Field; };
  var defs: Record<string, Field> = {
    npr: GLOBAL_FIELDS.npr,
    agents: GLOBAL_FIELDS.agents,
    cost: GLOBAL_FIELDS.cost,
    hpy: GLOBAL_FIELDS.hpy,
    mins: Object.assign({ id: "mins", label: sol.timeLabel, hint: "Minutes, manual", unit: "min", suffix: true }, sol.mins),
    units: Object.assign({ id: "units", label: "Total number of process requests performed in a year", hint: cap(sol.work) + " per year" }, volumeField(sol)),
    pool: pct(Object.assign({ id: "pool" }, sol.pool, sol.denial ? { label: "Total expected denials as % of total revenue" } : {})),
    share: pct(Object.assign({ id: "share" }, sol.share)),
    capture: pct(Object.assign({ id: "capture" }, sol.capture)),
    auto: Object.assign({ id: "auto", label: "% of " + sol.work + " automated by " + VENDOR, unit: "%", suffix: true, step: 1 }, sol.auto),
    price: GLOBAL_FIELDS.price,
    margin: GLOBAL_FIELDS.margin,
    fee: GLOBAL_FIELDS.fee,
  };
  if (sol.rework) {
    defs.rework = { id: "rework", label: "Average hours of re-work for every $1M of denials", hint: "Industry standard", def: sol.rework, min: 200, max: 3000, step: 50, unit: "hrs", suffix: true };
  }
  return defs;
}

function globalDefaults(): Inputs {
  var out: Inputs = {};
  Object.keys(GLOBAL_FIELDS).forEach(function (k) { out[k] = GLOBAL_FIELDS[k].def; });
  return out;
}

export function solutionDefaults(sol: Solution): Inputs {
  var out: Inputs = {
    units: volumeField(sol).def,
    mins: sol.mins.def,
    auto: sol.auto.def,
    pool: sol.pool.def,
    share: sol.share.def,
    capture: sol.capture.def,
  };
  if (sol.rework) out.rework = sol.rework;
  return out;
}

export function defaults(sol: Solution): Inputs {
  return Object.assign(globalDefaults(), solutionDefaults(sol));
}

/*
 * The ROI calculation. `inp` holds the inputs (percentages as 0-100),
 * `sol` the chosen solution. Returns raw figures plus a rounded set in `.D`
 * that the summary uses so its totals add up exactly.
 */
export function compute(inp: Inputs, sol: Solution): Rec {
  var r: Rec = {};
  // Team and unit cost
  r.fte = inp.agents;
  r.teamHrs = r.fte * inp.hpy;
  r.costHr = inp.cost / inp.hpy;
  r.units = inp.units;
  r.manualHrs = (r.units * inp.mins) / 60;
  r.manualCost = r.manualHrs * r.costHr;
  r.cpu = (inp.mins / 60) * r.costHr;
  r.pctHrs = r.teamHrs ? r.manualHrs / r.teamHrs : 0;
  // Automation spend and process savings
  r.price = (r.cpu * inp.price) / 100;
  r.automated = (r.units * inp.auto) / 100;
  r.cnxSpend = r.automated * r.price + (inp.fee || 0);
  r.hrsSaved1 = (r.automated * inp.mins) / 60;
  r.excUnits = r.units - r.automated;
  r.excCost = r.excUnits * r.cpu;
  r.withCnx = r.cnxSpend + r.excCost;
  r.save1 = r.manualCost - r.withCnx;
  // Revenue funnel: NPR x pool% x share% x capture%
  r.pool = (inp.npr * inp.pool) / 100;
  r.addressable = (r.pool * inp.share) / 100;
  r.capPct = inp.capture;
  r.captured = (r.addressable * r.capPct) / 100;
  r.reworkHrs = sol.rework ? (r.captured / 1e6) * inp.rework : 0;
  r.reworkSaved = r.reworkHrs * r.costHr;
  // Totals
  r.costSaved = r.save1 + r.reworkSaved;
  r.total = r.costSaved + r.captured;
  r.hoursSaved = r.hrsSaved1 + r.reworkHrs;
  r.fteFreed = r.hoursSaved / inp.hpy;
  r.roi = r.cnxSpend ? r.total / r.cnxSpend : 0;
  r.payback = r.total > 0 ? r.cnxSpend / (r.total / 12) : 0;
  r.afterHrs = r.manualHrs - r.hrsSaved1;
  r.afterPctHrs = r.teamHrs ? r.afterHrs / r.teamHrs : 0;
  r.touchAfter = inp.mins * (1 - inp.auto / 100);
  // P&L
  r.rev0 = sol.denial ? inp.npr - r.pool : inp.npr;
  r.ebitda0 = (r.rev0 * inp.margin) / 100;
  r.opex0 = r.rev0 - r.ebitda0;
  r.otherOpex = r.opex0 - r.manualCost - r.reworkSaved;
  r.npr1 = r.rev0 + r.captured;
  r.opex1 = r.otherOpex + r.excCost + r.cnxSpend;
  r.ebitda1 = r.npr1 - r.opex1;
  r.m0 = r.rev0 ? r.ebitda0 / r.rev0 : 0;
  r.m1 = r.npr1 ? r.ebitda1 / r.npr1 : 0;
  r.equivRev = inp.margin > 0 ? r.total / (inp.margin / 100) : 0;
  r.hoursValue = r.hoursSaved * r.costHr;

  var round = Math.round;
  var d: Rec = {};
  d.cap = round(r.captured);
  d.hv = round(r.hoursValue);
  d.cnx = round(r.cnxSpend);
  d.saved = d.hv - d.cnx;
  d.total = d.cap + d.saved;
  d.exp = round(inp.npr);
  d.lost0 = round(sol.denial ? r.pool : 0);
  d.npr0 = d.exp - d.lost0;
  d.e0 = round(r.ebitda0);
  d.e1 = d.e0 + d.total;
  d.npr1 = d.npr0 + d.cap;
  d.opex0 = d.npr0 - d.e0;
  d.opex1 = d.opex0 - d.saved;
  d.staff0 = round(r.manualCost + r.reworkSaved);
  d.staff1 = d.staff0 - d.hv;
  d.other = d.opex0 - d.staff0;
  d.m1 = d.npr1 ? d.e1 / d.npr1 : 0;
  r.D = d;
  r.poolAfter = r.pool - r.captured;
  r.addrAfter = r.addressable - r.captured;
  return r;
}

// ---- Formatting -------------------------------------------------------
var intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
var oneDp = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
var MINUS = "−";

function moneyShort(v: number, digits?: number): string {
  var a = Math.abs(v), sign = v < 0 ? MINUS : "";
  if (a < 0.5) return "$0";
  if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(digits == null ? 2 : digits) + "B";
  if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(digits == null ? 2 : digits) + "M";
  if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(digits == null ? 0 : digits) + "K";
  return sign + "$" + a.toFixed(0);
}
function money(v: number): string { return (v < 0 ? MINUS + "$" : "$") + intFmt.format(Math.abs(Math.round(v))); }
function cents(v: number): string { return "$" + v.toFixed(2); }
function int(v: number): string { return intFmt.format(Math.round(v)); }
function intShort(v: number): string { return v >= 1e6 ? oneDp.format(v / 1e6) + "M" : intFmt.format(Math.round(v)); }
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function pct(v: number, digits?: number): string { return (digits == null ? oneDp.format(v) : v.toFixed(digits)) + "%"; }
function signed(v: number): string { return (v > 0 ? "+" : v < 0 ? MINUS : "") + Math.abs(v); }
function pctChange(from: number, to: number): number { return from ? Math.round(((to - from) / from) * 100) : 0; }
// Compact money with trailing zeros dropped ($1.5M, $820K). Sign is not shown.
function moneyCompact(v: number): string {
  var a = Math.abs(v);
  if (a >= 1e9) return "$" + +(a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + +(a / 1e6).toFixed(2) + "M";
  return "$" + Math.round(a / 1e3) + "K";
}

export const fmt = {
  moneyShort: moneyShort, money: money, cents: cents, int: int, intShort: intShort,
  cap: cap, pct: pct, signed: signed, pctChange: pctChange, moneyCompact: moneyCompact, oneDp: oneDp,
};

// ---- Executive view model ------------------------------------------------
export type Pair = { label: string; delta: string; beforeTxt: string; afterTxt: string; beforePct: number; afterPct: number };
function pair(label: string, before: number, after: number, f: (v: number) => string, delta: string): Pair {
  var max = Math.max(before, after, 1e-9);
  return {
    label: label, delta: delta,
    beforeTxt: f(before), afterTxt: f(after),
    beforePct: (before / max) * 100,
    afterPct: Math.max((after / max) * 100, 0.6),
  };
}

export function summary(r: Rec, sol: Solution, inp: Inputs, hospital: string) {
  var d = r.D, work = sol.work, name = (hospital || "").trim();
  var roiX = d.cnx > 0 ? d.total / d.cnx : 0;
  var bps = Math.round((d.m1 - r.m0) * 1e4);
  var denom = Math.max(1, d.cap + Math.max(0, d.saved));
  var pctRev = (d.cap / denom) * 100;
  var pctCost = (Math.max(0, d.saved) / denom) * 100;
  var revLabel = sol.denial ? "Increase in realized revenue" : "Revenue increase";
  var reworkSaved = sol.rework ? r.reworkSaved : 0;
  var processSaved = d.saved - reworkSaved;
  var poolAfterPct = (r.poolAfter / inp.npr) * 100;

  return {
    eyebrow: "Executive summary · " + sol.name + (name ? " · " + name : ""),
    hospital: name,
    total: d.total,
    totalTxt: moneyCompact(d.total),
    nprTxt: moneyCompact(inp.npr),
    roiX: roiX,
    roiTxt: oneDp.format(roiX) + "x",
    roiSub: "every $1 spent returns " + cents(roiX),
    paybackMonths: r.payback,
    spend: d.cnx,
    pctRev: pctRev,
    pctCost: pctCost,
    revLabel: revLabel,
    revVal: d.cap,
    costVal: d.saved,
    ebitdaFrom: d.e0,
    ebitdaTo: d.e1,
    marginFrom: pct(r.m0 * 100, 2),
    marginTo: pct(d.m1 * 100, 2),
    marginBps: signed(bps) + " bps",
    revFrom: d.npr0,
    revTo: d.npr1,
    revRealized: sol.denial,
    // Unit economics
    manualCostTxt: moneyShort(r.manualCost),
    manualCostSub: int(r.manualHrs) + " staff hours × " + cents(r.costHr) + " per hour, done manually today",
    cpuTxt: cents(r.cpu),
    cpuSub: int(inp.mins) + " min per " + sol.one + " × " + cents(r.costHr) + " per hour",
    priceTxt: cents(r.price),
    automatedSub: int(r.automated) + " of " + int(r.units) + " a year, no human touch",
    // Headline KPIs
    savedProcessLabel: cap(sol.short) + " process savings: " + moneyShort(r.manualCost) + " manual → " + moneyShort(r.withCnx) + " with " + VENDOR,
    savedProcessVal: moneyShort(processSaved),
    savedReworkLabel: "+ Denial re-work avoided: " + int(r.reworkHrs) + " hrs",
    savedReworkVal: moneyShort(reworkSaved),
    hoursSub:
      (sol.rework ? int(r.hrsSaved1) + " on " + work + " + " + int(r.reworkHrs) + " denial re-work · " : "") +
      "worth " + moneyShort(d.hv) + " at " + cents(r.costHr) + "/hr · ≈ " + oneDp.format(r.fteFreed) + " full-time people",
    revKicker: sol.rev,
    revSub: sol.revSub + " · " + pct(inp.pool) + " × " + pct(inp.share, 0) + " × " + pct(r.capPct, 0) + " of NPR",
    // Before / after
    timeSub: "Staff time on " + work + ", before and with " + VENDOR,
    timeRows: [
      pair("Staff hours on " + work + " per year", r.manualHrs, r.afterHrs,
        function (v: number) { return intShort(v) + " hrs"; }, signed(pctChange(r.manualHrs, r.afterHrs)) + "%"),
      pair("Share of RCM team hours on " + work, r.pctHrs * 100, r.afterPctHrs * 100,
        function (v: number) { return pct(v); }, signed(Math.round((r.afterPctHrs - r.pctHrs) * 1000) / 10) + " pts"),
    ],
    leakSub: sol.denial ? "Fewer denials related to " + work : "Revenue leakage and manual handling, before and with " + VENDOR,
    leakRows: [
      pair(sol.denial ? cap(sol.short) + "-related denials ($)" : sol.funnel[1] + " ($)", r.addressable, r.addrAfter,
        function (v: number) { return moneyShort(v); }, signed(pctChange(r.addressable, r.addrAfter)) + "%"),
      pair(sol.denial ? "Overall denial rate (% of NPR)" : sol.pool.label + " (% of NPR)", inp.pool, poolAfterPct,
        function (v: number) { return pct(v, 2); }, signed(Math.round((poolAfterPct - inp.pool) * 100) / 100) + " pts"),
    ],
    funnel: [
      { label: sol.funnel[0], value: r.pool },
      { label: sol.funnel[1], value: r.addressable },
      { label: sol.funnel[2], value: r.captured },
    ],
    breakdown: breakdown(r, sol, inp),
  };
}

export type Section = { title: string; rows: { label: string; value: string; cls: string }[] };
function breakdown(r: Rec, sol: Solution, inp: Inputs): Section[] {
  var work = sol.work;
  var section = function (title: string, rows: string[][]): Section {
    return { title: title, rows: rows.map(function (x) { return { label: x[0], value: x[1], cls: x[2] || "" }; }) };
  };
  var revenueRows: string[][] = [
    ["Total hospital NPR", money(inp.npr)],
    [sol.pool.label, pct(inp.pool)],
    [sol.denial ? "Revenue not realized with denials" : "Revenue in this pool per year", money(r.pool)],
  ]
    .concat(sol.denial ? [["Net expected realized revenue (post denials)", money(r.rev0)]] : [])
    .concat([
      [sol.share.label, pct(inp.share)],
      [sol.denial ? "Potential revenue not realized because of denials for reasons of " + sol.short : "Addressable revenue", money(r.addressable)],
      [sol.capture.label, pct(r.capPct)],
      [sol.denial ? "Potential increase in realized revenue" : sol.rev + " per year", money(r.captured), "tot"],
    ])
    .concat(sol.denial ? [["New net realized revenue", money(r.rev0 + r.captured), "tot"]] : []);
  if (sol.rework) {
    revenueRows = revenueRows.concat([
      ["Average hours of re-work for every $1M of denials", int(inp.rework)],
      ["Total re-work hours prevented", int(r.reworkHrs)],
      ["Manual cost per hour of denial re-work", cents(r.costHr)],
      ["Total $ saved on denial re-work (prevented)", money(r.reworkSaved), "tot"],
    ]);
  }
  return [
    section("Assumptions on manual spend", [
      ["Hospital NPR", money(inp.npr)],
      ["Total RCM agents count for the process", int(inp.agents)],
      ["Hospital spend per RCM employee per year", money(inp.cost)],
      ["Total work hours of an RCM employee per year", int(inp.hpy)],
      ["Total work hours of the RCM team in a year", int(r.teamHrs)],
      ["Hospital cost per hour for RCM on manual operation", cents(r.costHr)],
      [sol.timeLabel + " (minutes)", int(inp.mins)],
      ["Total number of process requests performed in a year (" + work + ")", int(r.units)],
      ["Total hours spent on " + work + " by the RCM team", int(r.manualHrs)],
      ["Total cost spent on " + work + " in a year", money(r.manualCost), "tot"],
      ["Cost per " + sol.one, cents(r.cpu)],
      ["% of hours spent on " + work + " from the total RCM work hours", pct(r.pctHrs * 100)],
    ]),
    section("Spend on " + VENDOR, [
      ["Per transaction price of " + VENDOR + " (" + inp.price + "% of manual cost)", cents(r.price)],
      ["% of " + work + " automated by " + VENDOR, pct(inp.auto)],
      ["Total number of " + work + " automated by " + VENDOR + " over 12 months", int(r.automated)],
    ]
      .concat(inp.fee ? [["Annual platform fee", money(inp.fee)]] : [])
      .concat([["Total $ spend on " + VENDOR + " for " + sol.short + " automation per year", money(r.cnxSpend), "tot"]])),
    section("Savings 1: process cost using " + VENDOR, [
      ["Total number of manual hours saved using " + VENDOR, int(r.hrsSaved1)],
      ["Cost incurred on the remaining " + pct(100 - inp.auto, 0) + " (exception handling)", money(r.excCost)],
      ["Total cost incurred", money(r.withCnx)],
      ["Savings in a year on " + sol.short + " spend using " + VENDOR, money(r.save1), "tot"],
    ]),
    section("Savings 2: " + (sol.denial ? "denials prevented using " + VENDOR : sol.rev.toLowerCase()), revenueRows),
    section("Total impact on P&L using " + VENDOR, [
      ["Total (direct + prevented) cost saved", money(r.costSaved)],
      ["Total revenue added to NPR", money(r.captured)],
      ["Total $ P&L impact (revenue + savings)", money(r.total), "grand"],
      ["Hospital EBITDA today (" + pct(inp.margin) + " margin)", money(r.ebitda0)],
      ["Hospital EBITDA with " + VENDOR + " (" + pct(r.m1 * 100, 2) + " margin)", money(r.ebitda1), "tot"],
    ]),
    section("Number of hours saved per year using " + VENDOR, [
      ["Manual hours saved on " + sol.short + " process execution", int(r.hrsSaved1)],
      ["Manual hours saved on denial prevention", int(r.reworkHrs)],
      ["Total number of manual hours saved in a year", int(r.hoursSaved), "tot"],
    ]),
  ];
}

export type Summary = ReturnType<typeof summary>;
