/* Questions for the step-by-step intake: hospital-wide answers, or one module's fine-tuning. */
import { compute, fieldDefs, fmt as F, GLOBAL_FIELDS, getSolution, VENDOR, type Field, type Solution } from './model.ts';
import { license, moduleInputs, PLAN_FIELDS, portfolio, type Plan } from './portfolio.ts';
import { questions } from './questions.ts';

export type IQ = {
  key: string;
  type: 'modules' | 'text' | 'number';
  section: string;
  title: string;
  hint: string;
  field?: Field;
  placeholder?: string;
  get?: (p: Plan) => number;
  set?: (p: Plan, v: number) => Plan;
  insight?: (p: Plan) => string;
  warn?: (p: Plan) => string;
};

const setGlobal = (key: string) => (p: Plan, v: number): Plan =>
  key === 'license' ? { ...p, licenseSet: true, g: { ...p.g, license: v } } : { ...p, g: { ...p.g, [key]: v } };

export function hospitalQuestions(): IQ[] {
  const g = (key: string, section: string, title: string, hint: string, field: Field, insight: (p: Plan) => string): IQ =>
    ({ key, type: 'number', section, title, hint, field, get: p => (key === 'license' ? license(p) : p.g[key]), set: setGlobal(key), insight });
  const t = (p: Plan) => portfolio(p);
  return [
    { key: 'modules', type: 'modules', section: 'Scope', title: 'Which processes should the model include?', hint: 'Select every process you want Contiinex to take on. Press a letter to toggle, Enter to continue.' },
    { key: 'hospital', type: 'text', section: 'Your organization', title: 'What is the name of your hospital or health system?', hint: 'Optional. It appears on the summary.', placeholder: 'e.g. Riverside Health' },
    g('npr', 'Your organization', 'What is your annual net patient revenue?', 'NPR, in millions of dollars', GLOBAL_FIELDS.npr, p => F.moneyCompact(p.g.npr) + ' a year · ' + F.moneyCompact(t(p).addressable) + ' of it at risk in the selected processes'),
    g('cost', 'Your RCM team', 'What does one RCM employee cost per year?', 'Fully loaded: salary, benefits and overhead', GLOBAL_FIELDS.cost, p => F.cents(p.g.cost / p.g.hpy) + ' per hour of RCM work'),
    g('hpy', 'Your RCM team', 'How many hours does each employee work in a year?', '8 hrs × 22 days × 12 months = 2,112', GLOBAL_FIELDS.hpy, p => F.cents(p.g.cost / p.g.hpy) + ' per hour · ' + F.moneyShort(t(p).staff0) + ' a year of staff time on the selected processes'),
    g('price', 'With ' + VENDOR, 'What will ' + VENDOR + ' cost per transaction?', "As a % of today's manual cost per transaction", GLOBAL_FIELDS.price, p => F.moneyShort(t(p).consumption) + ' a year in usage across the selected processes'),
    g('license', 'With ' + VENDOR, 'What is the annual platform license?', 'Benchmark: about $1,000 per $1M of NPR', PLAN_FIELDS.license, p => 'Total annual spend with ' + VENDOR + ': ' + F.moneyShort(t(p).spend)),
    g('impl', 'With ' + VENDOR, 'What is the one-time implementation cost?', 'EHR and PMS integration and private-cloud setup. Enter your quote, or 0 if included.', PLAN_FIELDS.impl, p => cumulativeLine(p)),
    g('golive', 'Timeline', 'How many months until go-live?', PLAN_FIELDS.golive.hint ?? '', PLAN_FIELDS.golive, p => cumulativeLine(p)),
    g('ramp', 'Timeline', 'After go-live, how many months to reach full run-rate?', PLAN_FIELDS.ramp.hint ?? '', PLAN_FIELDS.ramp, p => cumulativeLine(p)),
    g('margin', 'Financials', 'What is your EBITDA margin today?', 'Used for the P&L view', GLOBAL_FIELDS.margin, p => 'EBITDA today: ' + F.moneyCompact(t(p).e0)),
  ];
}

function cumulativeLine(p: Plan): string {
  const r = portfolio(p);
  const be = r.breakeven === null ? 'no break-even within 3 years' : r.breakeven === 0 ? 'positive from the start' : 'break-even in month ' + r.breakeven;
  return F.moneyCompact(r.net3y) + ' cumulative net over 3 years · ' + be;
}

// Fine-tuning one module: its own questions from the single-process intake.
export function moduleQuestions(id: string): IQ[] {
  const sol: Solution = getSolution(id);
  const defs = fieldDefs(sol);
  const base = questions(sol, {});
  const order = ['agents', 'mins', 'units', 'pool', 'share', 'capture', 'rework', 'auto'];
  return order
    .map(key => base.find(q => q.key === key))
    .filter((q): q is Extract<ReturnType<typeof questions>[number], { type: 'number' }> => !!q && q.type === 'number')
    .map(q => ({
      key: q.key, type: 'number' as const, section: sol.name + ' · ' + q.section, title: q.title, hint: q.hint, field: defs[q.key],
      get: (p: Plan) => p.mods[sol.id].inp[q.key],
      set: (p: Plan, v: number): Plan => ({ ...p, mods: { ...p.mods, [sol.id]: { ...p.mods[sol.id], inp: { ...p.mods[sol.id].inp, [q.key]: v } } } }),
      insight: (p: Plan) => q.insight(compute(moduleInputs(p, sol), sol)),
      warn: q.warn ? (p: Plan) => q.warn!(compute(moduleInputs(p, sol), sol)) : undefined,
    }));
}
