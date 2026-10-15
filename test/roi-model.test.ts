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
    assert.equal(p.overlap.scale, 1, sol.id);
  }
});

test("overlapping denial shares are scaled to the denial pool", () => {
  const p = P.portfolio(P.defaultPlan());
  // 12% x (15+10+20+15+40+25)% = 15% of NPR claimed against a 12% pool
  assert.ok(Math.abs(p.overlap.claimedPct - 15) < 1e-9);
  assert.ok(Math.abs(p.overlap.scale - 0.8) < 1e-9);
  const denialAddr = p.on.filter(m => P.DENIAL_POOL_IDS.includes(m.sol.id)).reduce((t, m) => t + m.addressable, 0);
  assert.ok(Math.abs(denialAddr - p.npr * 0.12) < 1);
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
