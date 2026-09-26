import React from 'react';
import { Link } from 'react-router-dom';
import { Tile, TileHead, Bar, Initials, EmptyNote, plural } from './shared';

// Onboarding: who is still being set up and the step they are on. The steps
// are counted server side (invited, has a login, app installed, first clock
// in, contractor agreement signed). Opens the team page.
export default function OnboardingTile({ people, to = '/employees' }) {
  if (!Array.isArray(people)) return null;
  const rows = people.filter(Boolean);
  return (
    <Tile>
      <TileHead label="Onboarding" right={rows.length ? `${plural(rows.length, 'person', 'people')} starting` : 'nobody starting'} />
      {rows.length === 0 ? <EmptyNote>No one is mid onboarding.</EmptyNote> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(p => {
          const total = Number(p.steps_total) || 0;
          const done = Number(p.steps_done) || 0;
          return (
            <div key={p.member_id || p.name} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Initials id={p.member_id} name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="private-value home-clip" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                  <div className="private-value home-clip" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.next_step ? `Next: ${p.next_step}` : 'All steps done'}</div>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{done} of {total}</span>
              </div>
              <Bar value={total ? done / total : 0} />
            </div>
          );
        })}
      </div>
      <Link to={to} className="home-link" style={{ alignSelf: 'flex-start' }}>Open the team page &rarr;</Link>
    </Tile>
  );
}
