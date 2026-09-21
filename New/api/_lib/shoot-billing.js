// The billing math from an influencer contractor agreement, in one place.
//
// This is the ONLY implementation of the minimum, the rounding rule, and the
// mileage reimbursement. The API computes with it server-side and the CRM
// screen previews with the same numbers, so the two can never disagree and a
// client can never submit its own billable figure.
//
// Rules, from Lucy Moreno's agreement (Team/Lucy Moreno/...md):
//   3.2  One hour minimum per Shoot, even if it runs shorter or is ended early.
//   3.3  Time beyond the minimum rounds to the nearest quarter hour. Seven
//        minutes or less past a quarter hour rounds down, eight or more rounds up.
//   3.5  Mileage at the IRS standard business rate in effect on the travel date.
//
// Exhibit A of that agreement carries the worked examples these functions are
// asserted against. If the contract terms ever change, change them here and
// nowhere else.

const MINIMUM_MINUTES = 60;
const ROUND_TO_MINUTES = 15;
// Seven minutes or less past a quarter hour rounds down, so the tipping point
// sits between 7 and 8 rather than at the usual halfway mark of 7.5.
const ROUND_DOWN_AT_OR_BELOW = 7;

// Raw minutes on set -> billable minutes after the minimum and the rounding rule.
function billableMinutes(rawMinutes, opts = {}) {
  const minimum = opts.minimumMinutes == null ? MINIMUM_MINUTES : opts.minimumMinutes;
  const step = opts.roundToMinutes || ROUND_TO_MINUTES;
  const n = Number(rawMinutes);
  if (!Number.isFinite(n) || n <= 0) return 0;

  const withMinimum = Math.max(Math.round(n), minimum);
  const remainder = withMinimum % step;
  if (remainder === 0) return withMinimum;
  return remainder <= ROUND_DOWN_AT_OR_BELOW
    ? withMinimum - remainder
    : withMinimum + (step - remainder);
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Everything owed for one shoot: paid time plus mileage reimbursement.
// mileageRate is passed in rather than read from config, because a historical
// shoot must keep the IRS rate that applied on its own travel date.
function shootTotal({ minutes, miles, hourlyRate, mileageRate }) {
  const billable = billableMinutes(minutes);
  const hours = billable / 60;
  const hoursAmount = round2(hours * (Number(hourlyRate) || 0));
  const mileageAmount = round2((Number(miles) || 0) * (Number(mileageRate) || 0));
  return {
    billable_minutes: billable,
    hours: round2(hours),
    hours_amount: hoursAmount,
    mileage_amount: mileageAmount,
    total_amount: round2(hoursAmount + mileageAmount),
  };
}

// Sum a set of shoots into one invoice total.
function statementTotal(shoots, hourlyRate) {
  return (shoots || []).reduce((acc, s) => {
    const t = shootTotal({
      minutes: s.minutes,
      miles: s.miles,
      hourlyRate,
      mileageRate: s.mileage_rate,
    });
    acc.billable_minutes += t.billable_minutes;
    acc.miles = round2(acc.miles + (Number(s.miles) || 0));
    acc.hours_amount = round2(acc.hours_amount + t.hours_amount);
    acc.mileage_amount = round2(acc.mileage_amount + t.mileage_amount);
    acc.total_amount = round2(acc.total_amount + t.total_amount);
    return acc;
  }, { billable_minutes: 0, miles: 0, hours_amount: 0, mileage_amount: 0, total_amount: 0 });
}

module.exports = {
  billableMinutes,
  shootTotal,
  statementTotal,
  MINIMUM_MINUTES,
  ROUND_TO_MINUTES,
};
