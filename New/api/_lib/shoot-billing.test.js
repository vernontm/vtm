// Regression guard for the contract billing math.
// Run with:  node New/api/_lib/shoot-billing.test.js
//
// The rounding table below is Exhibit A of the signed influencer agreement,
// verbatim. If one of these ever fails, the CRM is paying a contractor an
// amount their contract does not agree with. Fix the code, not the table.
const { billableMinutes, shootTotal, statementTotal } = require('./shoot-billing.js');

let failures = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log('Exhibit A rounding table (hours billed)');
[[35, 1.00], [67, 1.00], [68, 1.25], [100, 1.75], [142, 2.25], [143, 2.50], [180, 3.00]]
  .forEach(([mins, hours]) => check(`${mins} min`, billableMinutes(mins) / 60, hours));

console.log('Minimum and boundary behaviour');
[[0, 0], [-5, 0], [1, 60], [60, 60], [61, 60], [67, 60], [68, 75], [75, 75], [76, 75], [83, 90]]
  .forEach(([mins, want]) => check(`${mins} min`, billableMinutes(mins), want));

console.log('Shoot total (time plus mileage)');
check('1h40, 24 miles, $30/hr, $0.70/mi',
  shootTotal({ minutes: 100, miles: 24, hourlyRate: 30, mileageRate: 0.70 }),
  { billable_minutes: 105, hours: 1.75, hours_amount: 52.5, mileage_amount: 16.8, total_amount: 69.3 });
check('short shoot still bills the 1 hour minimum',
  shootTotal({ minutes: 20, miles: 0, hourlyRate: 30, mileageRate: 0.70 }).total_amount, 30);
check('no mileage rate means no mileage money',
  shootTotal({ minutes: 60, miles: 50, hourlyRate: 30, mileageRate: 0 }).mileage_amount, 0);

console.log('Statement total keeps each shoot own mileage rate');
check('two shoots across an IRS rate change',
  statementTotal([
    { minutes: 60, miles: 10, mileage_rate: 0.67 },
    { minutes: 68, miles: 10, mileage_rate: 0.70 },
  ], 30),
  { billable_minutes: 135, miles: 20, hours_amount: 67.5, mileage_amount: 13.7, total_amount: 81.2 });

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
