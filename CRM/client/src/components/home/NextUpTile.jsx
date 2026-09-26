import React from 'react';
import { Video, MapPin } from 'lucide-react';
import { Tile, TileHead, Big, Sub, fmtTime, mapsUrl } from './shared';

// Next up: the tile at the top of most role homes. The time, what it is, and
// a Join for a Meet link or Directions for a place. Sales sees the same tile
// under the name "My next call" with only events that include their email.
// The section is absent from the reply for roles that do not use it, and then
// the tile renders nothing.
export default function NextUpTile({ label = 'Next up', event, sub, to = '/appointments', full = true }) {
  if (event === undefined) return null;
  const link = event?.meet_link;
  const place = event?.location;
  return (
    <Tile full={full}>
      <TileHead label={label} to={to} linkLabel="Calendar" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {event ? (
            <>
              <Big size={30}>{fmtTime(event.start_time)}</Big>
              <Sub>{event.title || '(no title)'}{place ? ` · ${place}` : ''}</Sub>
            </>
          ) : (
            <>
              <Big size={22}>Nothing scheduled</Big>
              <Sub>Open the calendar to add something</Sub>
            </>
          )}
          {sub ? <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{sub}</div> : null}
        </div>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="home-pill"><Video size={13} /> Join</a>
        ) : place ? (
          <a href={mapsUrl(place)} target="_blank" rel="noreferrer" className="home-pill"><MapPin size={13} /> Directions</a>
        ) : null}
      </div>
    </Tile>
  );
}
