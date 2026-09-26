import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, MessageSquare } from 'lucide-react';
import { Tile, TileHead, Initials, EmptyNote } from './shared';

// Before your call: who the next call is with, the first lines of their
// notes, and the last thing either side texted. Open notes goes to the
// discovery doc when there is one, otherwise to the conversation.
export default function BeforeCallTile({ beforeCall }) {
  if (!beforeCall) return null;
  const bc = beforeCall;
  const snippet = String(bc.notes || bc.last_contact_summary || '').trim().split(/\n+/).slice(0, 3).join(' ');
  const lastText = (bc.last_texts || []).slice(-1)[0] || null;
  const phone = bc.phone || bc.contact_phone || null;
  return (
    <Tile>
      <TileHead label="Before your call" to={bc.client_id ? `/clients?open=${bc.client_id}` : '/clients'} linkLabel="Open client" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Initials id={bc.client_id} name={bc.name || bc.business} size={38} />
        <div style={{ minWidth: 0 }}>
          <div className="private-value home-clip" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{bc.name || bc.business || 'Your next contact'}</div>
          {bc.business && bc.business !== bc.name
            ? <div className="private-value home-clip" style={{ fontSize: 12, color: 'var(--muted)' }}>{bc.business}</div>
            : null}
        </div>
      </div>
      {snippet
        ? <div className="private-value" style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{snippet}</div>
        : <EmptyNote>No notes on file yet.</EmptyNote>}
      {lastText?.body ? (
        <div className="private-value" style={{ fontSize: 11.5, color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {lastText.direction === 'out' ? 'You last texted: ' : 'They last texted: '}{lastText.body}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {bc.discovery_notes_url
          ? <a href={bc.discovery_notes_url} target="_blank" rel="noreferrer" className="home-pill"><FileText size={12} /> Open notes</a>
          : null}
        {phone
          ? <Link to="/inbox" className="home-pill"><MessageSquare size={12} /> Open the conversation</Link>
          : null}
      </div>
    </Tile>
  );
}
