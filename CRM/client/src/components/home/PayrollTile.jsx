import React from 'react';
import { Tile, TileHead, Big, Sub, Initials, usd, fmtHM, fmtDay, firstName } from './shared';

// Payroll: the half month period we are in, what it adds up to, and who it is
// going to. The hours come from the same time entries the Time page shows, so
// that is where the tile goes.
export default function PayrollTile({ payroll, to = '/time' }) {
  if (!payroll) return null;
  const people = Array.isArray(payroll.people) ? payroll.people : [];
  return (
    <Tile to={to}>
      <TileHead label="Payroll" right={payroll.due_on ? `due ${fmtDay(payroll.due_on)}` : null} />
      <Big>{usd(payroll.total)}</Big>
      <Sub>{payroll.period_label || 'this period'}</Sub>
      <div>
        {people.slice(0, 5).map(p => (
          <div key={p.user_id || p.name} className="home-row">
            <Initials id={p.user_id} name={p.name} size={28} />
            <span className="private-value home-clip" style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text)' }}>{firstName(p.name) || 'Teammate'}</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{fmtHM(p.minutes)}</span>
            <span className="private-value" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{usd(p.amount)}</span>
          </div>
        ))}
      </div>
    </Tile>
  );
}
