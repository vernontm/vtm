import React from 'react';
import { Initials, Tile, TileHead, Dot, EmptyNote, fmtHM, countersInWords, firstName, GREEN, SLATE } from './shared';

// Team today: one row per person with their color, the hours they have on the
// clock today, the day's counters in words, and a dot that is green while
// they are clocked in. The caption on the right is the week against the 60
// hour target. Opens the Time page.
export default function TeamTodayTile({ team, to = '/time' }) {
  if (!team) return null;
  const people = Array.isArray(team.people) ? team.people : [];
  const week = `${fmtHM(team.week_minutes)} of ${fmtHM(team.week_target_minutes || 3600)} this week`;
  return (
    <Tile>
      <TileHead label="Team today" to={to} linkLabel="Time" />
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -4 }}>{week}</div>
      {people.length === 0 ? <EmptyNote>Nobody has clocked in yet today.</EmptyNote> : null}
      <div>
        {people.map(p => (
          <div key={p.user_id || p.name} className="home-row">
            <Initials id={p.user_id} name={p.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="private-value home-clip" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{firstName(p.name) || 'Teammate'}</div>
              <div className="private-value home-clip" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {countersInWords(p.counters) || (p.clocked_in ? 'Clocked in, nothing logged yet' : 'Nothing logged today')}
              </div>
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{fmtHM(p.minutes_today)}</span>
            <Dot color={p.clocked_in ? GREEN : SLATE} title={p.clocked_in ? 'Clocked in' : 'Not clocked in'} />
          </div>
        ))}
      </div>
    </Tile>
  );
}
