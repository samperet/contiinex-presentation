import { fieldDefs, fmt as F, VENDOR, type Field, type Inputs, type Solution } from './model';

type Calc = Record<string, number>;
export type Question =
  | { key: 'process'; type: 'choice'; section: string; title: string; hint: string }
  | { key: 'hospital'; type: 'text'; section: string; title: string; hint: string; placeholder: string }
  | { key: string; type: 'number'; section: string; title: string; hint: string; field: Field; insight: (r: Calc) => string; warn?: (r: Calc) => string };

export function questions(sol: Solution, inp: Inputs): Question[] {
  const defs = fieldDefs(sol), work = sol.work;
  const revenue = sol.denial ? 'Denials' : sol.rev;
  const workload = F.cap(sol.short) + ' workload';
  const num = (key: string, section: string, title: string, hint: string, insight: (r: Calc) => string, warn?: (r: Calc) => string): Question =>
    ({ key, type: 'number', section, title, hint, field: defs[key], insight, warn });
  const list: Question[] = [
    { key: 'process', type: 'choice', section: 'Your process', title: 'Which revenue-cycle process do you want to model?', hint: 'Pick one. You can switch later; process-specific answers reset to typical values.' },
    { key: 'hospital', type: 'text', section: 'Your organization', title: 'What is the name of your hospital or health system?', hint: 'Optional. It appears on the executive summary.', placeholder: 'e.g. Riverside Health' },
    num('npr', 'Your organization', 'What is your annual net patient revenue?', 'NPR, in millions of dollars', () => F.moneyCompact(inp.npr) + ' in net patient revenue a year'),
    num('agents', 'Your RCM team', 'How many RCM staff work on ' + work + ' today?', defs.agents.hint ?? '', r => F.int(r.fte) + ' people · ' + F.int(r.teamHrs) + ' work hours a year'),
    num('cost', 'Your RCM team', 'What does one RCM employee cost per year?', 'Fully loaded: salary, benefits and overhead', r => F.cents(r.costHr) + ' per hour of RCM work'),
    num('hpy', 'Your RCM team', 'How many hours does each employee work in a year?', (defs.hpy.hint ?? '') + ' = 2,112', r => 'Team capacity: ' + F.int(r.teamHrs) + ' hours a year at ' + F.cents(r.costHr) + '/hr'),
    num('mins', workload, 'How many minutes does one ' + sol.one + ' take by hand?', sol.id === 'ebv' ? sol.timeLabel : 'Average minutes per ' + sol.one + ', done manually', r => F.cents(r.cpu) + ' of staff time per ' + sol.one),
    num('units', workload, 'How many ' + work + ' does your team handle a year?', F.cap(work) + ' per year',
      r => F.int(r.manualHrs) + ' staff hours and ' + F.moneyShort(r.manualCost) + ' a year · ' + F.pct(r.pctHrs * 100) + ' of team hours',
      r => (r.pctHrs > 1 ? 'That is more hours than the team has. Check the staff count or the volume.' : '')),
    num('pool', revenue, defs.pool.label, defs.pool.hint ?? '', r => (sol.denial ? F.money(r.pool) + ' of revenue not realized · ' + F.money(r.rev0) + ' realized' : F.money(r.pool) + ' a year')),
    num('share', revenue, defs.share.label, defs.share.hint ?? '', r => F.money(r.addressable) + (sol.denial ? ' lost to ' + sol.short + ' denials' : ' addressable') + ' a year'),
    num('capture', revenue, defs.capture.label, defs.capture.hint ?? '', r => F.money(r.captured) + ' ' + sol.rev.toLowerCase() + ' a year'),
  ];
  if (sol.rework) {
    list.push(num('rework', revenue, 'How many hours of rework does every $1M of denials create?', 'Industry standard is about 1,000 hours', r => F.int(r.reworkHrs) + ' rework hours avoided, worth ' + F.moneyShort(r.reworkSaved)));
  }
  list.push(
    num('auto', 'With ' + VENDOR, 'What share of ' + work + ' could run with no human touch?', defs.auto.label, r => F.int(r.automated) + ' of ' + F.int(r.units) + ' a year automated · ' + F.int(r.hrsSaved1) + ' hours freed'),
    num('price', 'With ' + VENDOR, 'What will ' + VENDOR + ' cost per transaction?', "As a % of today's manual cost per " + sol.one, r => F.cents(r.price) + ' vs ' + F.cents(r.cpu) + ' manual · ' + F.moneyShort(r.cnxSpend) + ' a year'),
    num('fee', 'With ' + VENDOR, 'Is there a fixed annual platform fee?', "On top of per-transaction pricing. Enter 0 if there isn't one.", r => 'Total annual spend with ' + VENDOR + ': ' + F.moneyShort(r.cnxSpend)),
    num('margin', 'Financials', 'What is your EBITDA margin today?', defs.margin.hint ?? '', r => 'EBITDA today: ' + F.moneyCompact(r.ebitda0)),
  );
  return list;
}

// ---- Field text --------------------------------------------------------------
const twoDp = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export function fieldText(f: Field, v: number): string {
  if (f.id === 'npr') return twoDp.format(v / 1e6);
  if (f.step && f.step < 1) return String(Math.round(v * 10) / 10);
  return F.int(v);
}
export function parseField(f: Field, text: string): number {
  const v = parseFloat(String(text).replace(/[^0-9.]/g, ''));
  if (isNaN(v)) return NaN;
  return f.id === 'npr' ? v * 1e6 : v;
}
export const prefix = (f: Field) => (f.unit === '$' || f.id === 'npr' ? '$' : '');
export const suffix = (f: Field) => (f.id === 'npr' ? 'M' : f.suffix ? f.unit ?? '' : '');
export const clamp = (f: Field, v: number) => Math.min(f.max, Math.max(f.min, v));
export function rangeText(f: Field): string {
  const t = (v: number) => prefix(f) + fieldText(f, v) + suffix(f);
  return 'Typical range ' + t(f.min) + ' – ' + t(f.max);
}

// Values that would break the model (division by zero, over 100%).
const POSITIVE = new Set(['npr', 'agents', 'cost', 'hpy', 'mins', 'units']);
export function validate(key: string, f: Field, v: number): string {
  if (!isFinite(v)) return 'Please enter a number.';
  if (POSITIVE.has(key) && v <= 0) return 'Please enter a number greater than 0.';
  if (v < 0) return 'Please enter a positive number.';
  if (f.unit === '%' && v > 100) return 'Please enter a percentage up to 100.';
  return '';
}
