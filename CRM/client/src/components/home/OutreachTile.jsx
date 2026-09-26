import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { countRoutineItem } from '../../api';
import { Tile, TileHead, Bar, Stat, Big, EmptyNote, GREEN } from './shared';

// Outreach today: the counted targets off the daily routine ("Reach out to 50
// leads"), plus what the day's app events add up to. +1 writes straight to
// the routine check the Routines page reads, so the two never disagree.
// Sales gets the headline count, the assistant gets every counted row.

// +1: show it, tell the server, put it back if the server says no.
function useBump(outreach, updateHome) {
  const [err, setErr] = useState('');
  const set = (itemId, count) => updateHome(h => ({
    ...h,
    outreach: { ...h.outreach, items: (h.outreach?.items || []).map(x => x.item_id === itemId ? { ...x, count } : x) },
  }));
  const bump = async (it) => {
    const next = (Number(it.count) || 0) + 1;
    setErr('');
    set(it.item_id, next);
    try {
      await countRoutineItem({ routine_id: it.routine_id, item_id: it.item_id, period_key: outreach.period_key, count: next });
    } catch (e) {
      set(it.item_id, it.count);
      setErr(e.message || 'Could not update the count');
    }
  };
  return { bump, err };
}

function PlusOne({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="home-pill"
      style={{ padding: '7px 11px', fontSize: 12.5 }}>
      <Plus size={13} /> 1
    </button>
  );
}

// Sales: one headline count toward the target, with the day's tallies under it.
export function OutreachTile({ outreach, updateHome, to = '/routines' }) {
  const { bump, err } = useBump(outreach, updateHome);
  if (!outreach) return null;
  const counters = outreach.counters || {};
  const main = (outreach.items || []).find(it => Number(it.target) > 0) || null;
  const count = Number(main?.count) || 0;
  const target = Number(main?.target) || 0;
  const hit = target > 0 && count >= target;
  return (
    <Tile>
      <TileHead label="Outreach today" right={main ? (hit ? 'target hit' : `${target - count} to go`) : null} />
      {main ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Big size={30} color={hit ? GREEN : 'var(--text)'}>{count} of {target}</Big>
              <div className="home-clip" style={{ fontSize: 12, color: 'var(--muted)' }}>{main.text}</div>
            </div>
            <PlusOne onClick={() => bump(main)} label={`Add one to ${main.text}`} />
          </div>
          <Bar value={target ? count / target : 0} color={hit ? GREEN : 'var(--orange)'} />
        </>
      ) : (
        <EmptyNote>No counted target on today's list.</EmptyNote>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat n={counters.text_sent} label="texts" />
        <Stat n={counters.meeting_created} label="booked" />
        <Stat n={counters.lead_created} label="leads" />
      </div>
      {err ? <EmptyNote><span style={{ color: '#dc2626' }}>{err}</span></EmptyNote> : null}
      <Link to={to} className="home-link" style={{ alignSelf: 'flex-start' }}>Open the routine &rarr;</Link>
    </Tile>
  );
}

// The assistant's task tile: every counted row, each with its own +1.
export function CountedTasksTile({ outreach, updateHome, label = 'Tasks · Assistant', to = '/routines' }) {
  const { bump, err } = useBump(outreach, updateHome);
  if (!outreach) return null;
  const targets = (outreach.items || []).filter(it => Number(it.target) > 0);
  const done = targets.filter(it => (Number(it.count) || 0) >= Number(it.target)).length;
  return (
    <Tile>
      <TileHead label={label} right={targets.length ? `${done} of ${targets.length} done` : 'nothing counted'} />
      {targets.length === 0 ? <EmptyNote>No counted tasks today.</EmptyNote> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {targets.map(it => {
          const count = Number(it.count) || 0, target = Number(it.target);
          const hit = count >= target;
          return (
            <div key={it.item_id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="home-clip" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{it.text}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: hit ? GREEN : 'var(--text)', flexShrink: 0 }}>{count} of {target}</span>
                <PlusOne onClick={() => bump(it)} label={`Add one to ${it.text}`} />
              </div>
              <Bar value={target ? count / target : 0} color={hit ? GREEN : 'var(--orange)'} />
            </div>
          );
        })}
      </div>
      {err ? <EmptyNote><span style={{ color: '#dc2626' }}>{err}</span></EmptyNote> : null}
      <Link to={to} className="home-link" style={{ alignSelf: 'flex-start' }}>Open the routine &rarr;</Link>
    </Tile>
  );
}

export default OutreachTile;
