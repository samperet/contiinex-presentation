// Run with: npm test
// Expected values were read from the original calculator at default inputs.
import test from "node:test";
import assert from "node:assert/strict";
import * as ROI from "../app/roi/model.ts";

function run(id: string, overrides?: Record<string, number>) {
  const sol = ROI.getSolution(id);
  const inp = Object.assign(ROI.defaults(sol), overrides || {});
  const r = ROI.compute(inp, sol);
  return { sol, inp, r, v: ROI.summary(r, sol, inp, "") };
}

test("E&BV defaults match the original breakdown", () => {
  const { r, v } = run("ebv");
  const f = ROI.fmt;
  assert.equal(f.money(r.manualCost), "$1,972,854");
  assert.equal(f.cents(r.cpu), "$7.89");
  assert.equal(f.cents(r.price), "$4.73");
  assert.equal(f.money(r.cnxSpend), "$946,970");
  assert.equal(f.money(r.excCost), "$394,571");
  assert.equal(f.money(r.save1), "$631,313");
  assert.equal(f.money(r.captured), "$6,300,000");
  assert.equal(f.money(r.reworkSaved), "$149,148");
  assert.equal(f.money(r.costSaved), "$780,461");
  assert.equal(f.int(r.hoursSaved), "72,967");
  assert.equal(v.totalTxt, "$7.08M");
  assert.equal(v.roiTxt, "7.5x");
  assert.equal(v.roiSub, "every $1 spent returns $7.48");
  assert.equal(v.marginFrom, "8.00%");
  assert.equal(v.marginTo, "9.47%");
  assert.equal(v.marginBps, "+147 bps");
});

test("headline totals match the original for other processes", () => {
  const expected = { sch: ["$3.5M", "4.7x"], dnm: ["$4.71M", "14.7x"], cod: ["$3.94M", "10.4x"] };
  for (const [id, [total, roi]] of Object.entries(expected)) {
    const { v } = run(id);
    assert.equal(v.totalTxt, total, id);
    assert.equal(v.roiTxt, roi, id);
  }
});

test("every process produces a consistent summary", () => {
  for (const sol of ROI.SOLUTIONS) {
    const { r, v } = run(sol.id);
    assert.equal(r.D.total, r.D.cap + r.D.saved, sol.id);
    assert.ok(Math.abs(r.D.saved - r.costSaved) <= 2, sol.id + " rounded savings drift");
    assert.equal(r.D.e1 - r.D.e0, r.D.total, sol.id);
    assert.equal(v.breakdown.length, 6, sol.id);
    assert.ok(isFinite(r.roi) && r.roi > 0, sol.id);
  }
});

test("only denial-prevention processes have rework hours", () => {
  for (const sol of ROI.SOLUTIONS) {
    const { r } = run(sol.id);
    assert.equal(r.reworkHrs > 0, sol.denial, sol.id);
  }
});

test("platform fee raises spend and lowers savings one-for-one", () => {
  const base = run("clm").r;
  const withFee = run("clm", { fee: 100000 }).r;
  assert.equal(Math.round(withFee.cnxSpend - base.cnxSpend), 100000);
  assert.equal(Math.round(base.save1 - withFee.save1), 100000);
});

test("zero automation spend does not divide by zero", () => {
  const { r, v } = run("pa", { auto: 0 });
  assert.equal(r.roi, 0);
  assert.equal(v.roiTxt, "0.0x");
});

// ---- Portfolio of modules -----------------------------------------------------
import * as P from "../app/roi/portfolio.ts";

function only(id: string, plan = P.defaultPlan()) {
  Object.keys(plan.mods).forEach(k => (plan.mods[k].on = k === id));
  return plan;
}

test("one module with no license matches the single-process model", () => {
  for (const sol of ROI.SOLUTIONS) {
    const plan = only(sol.id);
    plan.licenseSet = true; plan.g.license = 0;
    const p = P.portfolio(plan);
    const { r } = run(sol.id);
    assert.equal(p.total, r.D.total, sol.id);
    assert.equal(p.cap, r.D.cap, sol.id);
    assert.equal(p.spend, r.D.cnx, sol.id);
    assert.equal(p.overlap, 0, sol.id);
  }
});

test("default scope is nine modules, without the new-volume ones", () => {
  const plan = P.defaultPlan();
  const on = Object.keys(plan.mods).filter(k => plan.mods[k].on);
  assert.equal(on.length, 9);
  for (const id of P.NEW_VOLUME_IDS) assert.equal(plan.mods[id].on, false, id);
});

test("denial modules are counted in sequence on one denial pool", () => {
  const plan = P.defaultPlan();
  const p = P.portfolio(plan);
  // Prevention modules own distinct causes: 15 + 10 + 20 + 15 = 60% of denials, no scaling.
  for (const id of P.PREVENTION_IDS) assert.ok(Math.abs(p.denial.scales[id] - 1) < 1e-9, id);
  // Analytics and management work on what is left, so they are scaled down.
  assert.ok(p.denial.scales.dna < 1 && p.denial.scales.dna > 0);
  assert.ok(p.denial.scales.dnm < p.denial.scales.dna);
  // Never more than the whole denial pool is counted.
  assert.ok(p.denial.counted <= p.denial.pool);
  assert.ok(p.overlap > 0);
  // The breakdown adds up: standalone values minus the shared pool equals the sum of module values.
  assert.ok(Math.abs(p.standaloneSum - p.overlap - p.on.reduce((t, m) => t + m.value, 0)) < 1e-6);
});

test("switching any module off never raises the total", () => {
  const scopes = [P.defaultPlan(), P.withRecommendedScope(P.defaultPlan()), (() => { const a = P.defaultPlan(); Object.values(a.mods).forEach(m => (m.on = true)); return a; })()];
  for (const plan of scopes) {
    const base = P.portfolio(plan).total;
    for (const id of Object.keys(plan.mods).filter(k => plan.mods[k].on)) {
      const without = structuredClone(plan);
      without.mods[id].on = false;
      assert.ok(P.portfolio(without).total < base, `unticking ${id} raised the total`);
    }
  }
});

test("typical volumes and staff scale with hospital size until entered", () => {
  const small = P.defaultPlan(); small.g.npr = 250e6;
  const big = P.defaultPlan(); big.g.npr = 1e9;
  assert.equal(P.moduleValue(big, "ebv", "units"), 2 * P.moduleValue(P.defaultPlan(), "ebv", "units"));
  const a = P.portfolio(small), b = P.portfolio(big);
  assert.ok(Math.abs(b.hours / a.hours - 4) < 1e-9);
  assert.ok(Math.abs(b.shareOfNpr - a.shareOfNpr) < 1e-9); // same share of NPR at any size
  // An entered value is used as entered.
  big.mods.ebv.inp.units = 100000; big.mods.ebv.set = ["units"];
  assert.equal(P.moduleValue(big, "ebv", "units"), 100000);
});

test("report figures add up and are reported", () => {
  const p = P.portfolio(P.defaultPlan());
  assert.ok(Math.abs(p.capRecovered + p.capNew + p.hoursValue - p.spend - p.total) < 1e-6);
  assert.equal(p.capNew, 0);
  assert.equal(p.fullRunMonth, 6);
  assert.ok(Math.abs(p.floor - (p.total - p.hoursValue)) < 1e-6);
  assert.ok(p.lowTotal < p.total && p.allTotal > p.total);
  assert.ok(p.year1 > 0 && p.year1 < p.total);
  assert.equal(p.implausible, false);
  assert.ok(Math.abs(p.return3y - p.net3y / (3 * p.spend)) < 1e-9);
});

test("license is charged once and follows NPR until set", () => {
  const plan = P.defaultPlan();
  assert.equal(P.license(plan), 500000);
  const a = P.portfolio(plan);
  plan.licenseSet = true; plan.g.license = 0;
  const b = P.portfolio(plan);
  assert.equal(Math.round(b.total - a.total), 500000);
});

test("switching modules off removes their value", () => {
  const plan = P.defaultPlan();
  const all = P.portfolio(plan).total;
  plan.mods.pcl.on = false;
  assert.ok(P.portfolio(plan).total < all);
  Object.keys(plan.mods).forEach(k => (plan.mods[k].on = false));
  const none = P.portfolio(plan);
  assert.equal(none.cap, 0);
  assert.equal(none.total, -P.license(plan));
});

test("cumulative net benefit starts at minus implementation and breaks even after go-live", () => {
  const plan = P.defaultPlan();
  plan.g.impl = 400000;
  const p = P.portfolio(plan);
  assert.equal(p.cumulative.length, P.HORIZON + 1);
  assert.equal(p.cumulative[0], -400000);
  assert.ok(p.cumulative[plan.g.golive] < p.cumulative[0]); // license only until go-live
  assert.ok(p.breakeven !== null && p.breakeven > plan.g.golive);
  assert.ok(p.cumulative[p.breakeven!] >= 0 && p.cumulative[p.breakeven! - 1] < 0);
});

test("share links round-trip the plan", () => {
  const plan = P.defaultPlan();
  plan.hospital = "Riverside Health";
  plan.mods.cod.on = false;
  plan.mods.ebv.inp.agents = 40;
  plan.mods.ebv.set = ["agents"];
  plan.mods.sch.on = true;
  plan.g.npr = 1.2e9;
  const back = P.planFromHash("#" + P.planToHash(plan));
  assert.deepEqual(back, plan);
  assert.deepEqual(P.planFromHash("#plan=not-json"), null);
});

// ---- Net benefit chart scale ---------------------------------------------------
import { yScale } from "../app/roi/scale.ts";

test("chart scale always contains the whole line", () => {
  const cases: [number, number][] = [[-0.33e6, 119.06e6], [-0.2e6, 38e6], [-750e3, 63e6], [0, 4e6], [-5e6, -1e6], [-2e6, 0.5e6], [0, 100e6]];
  for (const [min, max] of cases) {
    const s = yScale(min, max);
    assert.ok(s.top >= max, `top ${s.top} < max ${max}`);
    assert.ok(s.bottom <= min, `bottom ${s.bottom} > min ${min}`);
    assert.ok(s.ticks.includes(0), `no zero tick for ${min}..${max}`);
    assert.ok(s.ticks.every(t => t >= s.bottom - 1 && t <= s.top + 1));
  }
});

// ---- Executive number formatting -------------------------------------------------
import { addUp, roundToTotal, fmtExec } from "../app/roi/format.ts";

test("executive lines always add up to the executive number as displayed", () => {
  const cases: [number, number, number, number][] = [[34.57e6, 0, 9.89e6, 6.12e6], [69.15e6, 0, 19.77e6, 12.25e6], [12.6e6, 0, 3.45e6, 2.89e6], [3.1e6, 0.4e6, 0.9e6, 0.7e6], [20.44e6, 5.55e6, 7.45e6, 4.45e6]];
  for (const [rec, nv, staff, paid] of cases) {
    const total = rec + nv + staff - paid;
    const parts = [{ key: "r", sign: "+" as const, value: rec }, ...(nv ? [{ key: "n", sign: "+" as const, value: nv }] : []), { key: "s", sign: "+" as const, value: staff }, { key: "p", sign: "−" as const, value: paid }];
    const out = addUp(parts, total);
    const n = (t: string) => Number(t.replace(/[^0-9.]/g, ""));
    const sum = out.parts.reduce((t, x, i) => t + (parts[i].sign === "+" ? n(x) : -n(x)), 0);
    assert.ok(Math.abs(sum - n(out.total)) < 1e-9, `${out.parts.join(" ")} != ${out.total}`);
    // The displayed total is the exact total, correctly rounded.
    const step = Math.abs(total) >= 10e6 ? 1 : 0.1;
    assert.ok(Math.abs(n(out.total) - total / 1e6) <= step / 2 + 1e-9, `${out.total} vs ${total}`);
  }
});

test("rounding to a total moves each value by at most one step", () => {
  const v = [12.34e6, 9.87e6, 5.55e6, -2.8e6, -0.5e6];
  const total = v.reduce((t, x) => t + x, 0);
  const r = roundToTotal(v, total, 1e5);
  assert.ok(Math.abs(r.values.reduce((t, x) => t + x, 0) - r.total) < 1);
  r.values.forEach((x, i) => assert.ok(Math.abs(x - v[i]) <= 1e5 + 1));
  assert.equal(fmtExec(38.34e6), "$38M");
  assert.equal(fmtExec(6.12e6), "$6.1M");
  assert.equal(fmtExec(930e3), "$930K");
});

// ---- Fixes from the verification review -------------------------------------------
import { validate } from "../app/roi/questions.ts";

test("the denial rate is one hospital-wide value", () => {
  const plan = P.defaultPlan();
  plan.mods.cod.inp.pool = 25; plan.mods.cod.set = ["pool"];
  const back = P.sanitizePlan(JSON.parse(JSON.stringify(plan)));
  for (const id of P.DENIAL_POOL_IDS) assert.equal(back.mods[id].inp.pool, 25, id);
  assert.equal(back.mods.pcl.inp.pool, plan.mods.pcl.inp.pool); // patient balances are a different pool
  const p = P.portfolio(back);
  // The appendix still reconciles: standalone values minus the shared pool equal the module values.
  assert.ok(Math.abs(p.standaloneSum - p.overlap - p.on.reduce((t, m) => t + m.value, 0)) < 1e-6);
});

test("unticking never raises the total, even with fine-tuned shares and captures", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let trial = 0; trial < 60; trial++) {
    const plan = P.defaultPlan();
    for (const id of Object.keys(plan.mods)) {
      plan.mods[id].on = rnd() > 0.3;
      plan.mods[id].inp.share = Math.round(5 + rnd() * 90);
      plan.mods[id].inp.capture = Math.round(5 + rnd() * 90);
    }
    const base = P.portfolio(plan);
    for (const m of base.on) {
      const w = structuredClone(plan); w.mods[m.sol.id].on = false;
      if (m.standalone > 0) assert.ok(P.portfolio(w).total <= base.total + 1e-6, `trial ${trial}: unticking ${m.sol.id} raised the total`);
    }
  }
});

test("the deck slide and the calculator show the same number for one module", () => {
  for (const sol of ROI.SOLUTIONS) for (const npr of [1e8, 5e8, 1e9, 2e9, 5e9]) {
    const p = P.portfolio(P.singleModulePlan(sol.id, npr));
    const slide = addUp([{ key: "c", sign: "+", value: p.cap }, { key: "s", sign: "+", value: p.hoursValue }, { key: "p", sign: "−", value: p.spend }], p.total);
    const calc = addUp([
      ...(p.capRecovered > 0 ? [{ key: "r", sign: "+" as const, value: p.capRecovered }] : []),
      ...(p.capNew > 0 ? [{ key: "n", sign: "+" as const, value: p.capNew }] : []),
      { key: "s", sign: "+", value: p.hoursValue }, { key: "p", sign: "−", value: p.spend }], p.total);
    assert.equal(slide.total, calc.total, `${sol.id} @ ${npr}`);
  }
});

test("implausible typed values are refused", () => {
  const f = ROI.GLOBAL_FIELDS.npr;
  assert.ok(validate("npr", f, 5001000e6));
  assert.equal(validate("npr", f, 1e9), "");
});

// ---- Walkthrough covers every input of the contiinex.com calculator ----------------
import { walkQuestions } from "../app/roi/intake.ts";

test("the walkthrough asks for every variable the website calculator uses", () => {
  const plan = P.defaultPlan();
  Object.values(plan.mods).forEach(m => (m.on = true));
  const qs = walkQuestions(plan);
  const keys = new Set(qs.map(q => q.key));
  // Hospital-wide inputs on contiinex.com (its platform fee is our annual license), plus the timeline.
  for (const k of ["npr", "cost", "hpy", "price", "margin", "license", "impl", "golive", "ramp"]) assert.ok(keys.has(k), k);
  // Every per-process input, for every module, including rework where the website has it.
  for (const sol of ROI.SOLUTIONS) {
    const asked = qs.filter(q => q.section.startsWith(sol.name)).map(q => q.key);
    const want = ["agents", "mins", "units", "pool", "share", "capture", "auto", ...(sol.rework ? ["rework"] : [])];
    assert.deepEqual([...asked].sort(), want.sort(), sol.id);
  }
  // Only the selected modules are walked through.
  const nine = walkQuestions(P.defaultPlan());
  assert.equal(nine.filter(q => q.section.startsWith("Patient Scheduling")).length, 0);
});
