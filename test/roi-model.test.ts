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
