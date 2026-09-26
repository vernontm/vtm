import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Tile, TileHead, EmptyNote, fmtTime, firstName, plural, mapsUrl } from './shared';

// Today's route: every stop on the shared calendar in order, who is on it,
// and directions for the ones with a place. The server sends maps_url; a
// stop without one falls back to a map search on the location.
export default function RouteTile({ route, to = '/appointments', full = true }) {
  if (!Array.isArray(route)) return null;
  return (
    <Tile full={full}>
      <TileHead label="Today's route" right={route.length ? plural(route.length, 'stop') : 'no stops'} />
      {route.length === 0 ? <EmptyNote>Nothing on the road today.</EmptyNote> : null}
      <div>
        {route.map((r, i) => {
          const who = (r.who || []).map(firstName).filter(Boolean).join(', ');
          const link = r.maps_url || (r.location ? mapsUrl(r.location) : null);
          return (
            <div key={r.id || `${r.start_time}-${i}`} className="home-row">
              <span style={{
                minWidth: 62, padding: '5px 8px', borderRadius: 9, flexShrink: 0, textAlign: 'center',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: 11.5, fontWeight: 800, color: 'var(--text)',
              }}>{fmtTime(r.start_time)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="private-value home-clip" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{r.title || '(no title)'}</div>
                <div className="private-value home-clip" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {[who ? `with ${who}` : null, r.location].filter(Boolean).join(' · ') || 'No place set'}
                </div>
              </div>
              {link ? <a href={link} target="_blank" rel="noreferrer" className="home-pill"><MapPin size={12} /> Directions</a> : null}
            </div>
          );
        })}
      </div>
      <Link className="home-link" to={to} style={{ alignSelf: 'flex-start' }}>Open the calendar &rarr;</Link>
    </Tile>
  );
}
