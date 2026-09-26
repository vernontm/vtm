import React from 'react';
import { Link } from 'react-router-dom';
import { Tile, TileHead, Dot, EmptyNote, fmtAge, firstName, plural, AMBER, SLATE } from './shared';

// Review queue: the team to-dos sitting with HR, newest first. Every row
// opens the To-Do page where the item lives.
export default function ReviewQueueTile({ items, to = '/todos' }) {
  if (!Array.isArray(items)) return null;
  return (
    <Tile>
      <TileHead label="Review queue" right={items.length ? `${items.length} waiting` : 'all clear'} />
      {items.length === 0 ? <EmptyNote>Nothing to review right now.</EmptyNote> : null}
      <div>
        {items.slice(0, 5).map(item => (
          <div key={item.id} className="home-row">
            <Dot color={Number(item.age_hours) > 24 || item.urgent ? AMBER : SLATE} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="private-value home-clip" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.title}</div>
              <div className="private-value home-clip" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {[item.from_name ? `from ${firstName(item.from_name)}` : null, fmtAge(item.age_hours), item.link_label].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Link to={to} className="home-link">Review</Link>
          </div>
        ))}
      </div>
      <Link to={to} className="home-link" style={{ alignSelf: 'flex-start' }}>
        {items.length > 5 ? `${plural(items.length - 5, 'more item')} on the list` : 'Open the list'} &rarr;
      </Link>
    </Tile>
  );
}
