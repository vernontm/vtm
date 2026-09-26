import React from 'react';
import { DollarSign, Repeat, Receipt, Zap } from 'lucide-react';
import { Tile, Big, Sub, Dot, usd, fmtDay, plural, GREEN, RED, AMBER, VIOLET } from './shared';

// The money row at the top of Ray's home: what came in this month and what
// the client plans bring in every month lead, then what is still out and what
// the tools cost. Same numbers as the Money page and the phone's Money
// screen, all from the `money` block of GET /home. The whole row renders
// nothing when the reply carries no money section.
export default function MoneyTiles({ money, to = '/money' }) {
  if (!money) return null;
  const plans = money.client_plans || {};
  const out = money.outstanding || {};
  const tools = money.tools || {};
  const cur = Number(money.collected_month) || 0;
  const prev = Number(money.collected_prev_month) || 0;
  const delta = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

  const tiles = [
    {
      label: `Collected in ${money.month || 'this month'}`, icon: DollarSign, color: GREEN, to,
      value: usd(cur),
      hint: delta == null
        ? `${plural(money.payments_this_week, 'payment')} this week`
        : delta === 0 ? `level with ${usd(prev)} last month`
          : `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}% on ${usd(prev)} last month`,
      dot: Number(out.overdue) > 0 ? RED : Number(out.total) > 0 ? AMBER : GREEN,
      foot: Number(out.total) > 0 ? `${usd(out.total)} outstanding` : 'nothing outstanding',
    },
    {
      label: 'Client plans per month', icon: Repeat, color: 'var(--orange)', to,
      value: usd(plans.mrr),
      hint: plural(plans.active, 'active plan'),
      dot: Number(plans.past_due) > 0 ? RED : GREEN,
      foot: Number(plans.past_due) > 0 ? `${plans.past_due} past due` : 'all current',
    },
    {
      label: 'Outstanding', icon: Receipt, color: Number(out.overdue) > 0 ? RED : AMBER, to,
      value: usd(out.total),
      hint: `${plural(out.count, 'unpaid item')} · ${Number(out.overdue) || 0} overdue`,
    },
    {
      label: 'Tools per month', icon: Zap, color: VIOLET, to,
      value: usd(tools.monthly),
      hint: tools.next?.service
        ? `${plural(tools.count, 'tool')} · next ${tools.next.service} ${fmtDay(tools.next.date)}`
        : plural(tools.count, 'tool'),
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
      {tiles.map(t => (
        <Tile key={t.label} to={t.to} style={{ gap: 5 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5 }}>
            <t.icon size={12} color={t.color} /> <span className="home-clip">{t.label}</span>
          </div>
          <Big>{t.value}</Big>
          <Sub>{t.hint}</Sub>
          {t.foot ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Dot color={t.dot} size={8} />
              <span className="home-clip" style={{ fontSize: 11.5, color: t.dot }}>{t.foot}</span>
            </div>
          ) : null}
        </Tile>
      ))}
    </div>
  );
}
