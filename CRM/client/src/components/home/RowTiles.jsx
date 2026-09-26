import React from 'react';
import { MessagesSquare, Users } from 'lucide-react';
import { Tile, IconChip, Dot, plural, RED, VIOLET } from './shared';

// The two small row tiles Ray and HR see under Team today: unread team chat
// and how many clients are active. Each renders nothing when its number is
// missing from the reply.

function RowTile({ icon, color, title, sub, to, dot }) {
  return (
    <Tile to={to} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
        <IconChip icon={icon} color={color} size={38} />
        {dot ? <span style={{ position: 'absolute', top: -1, right: -1 }}><Dot color={RED} size={10} /></span> : null}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        <span className="home-clip private-value" style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{sub}</span>
      </span>
    </Tile>
  );
}

export function TeamChatTile({ unread, to = '/inbox' }) {
  if (unread === undefined) return null;
  const n = Number(unread) || 0;
  return <RowTile icon={MessagesSquare} color={VIOLET} title="Team" sub={n ? plural(n, 'unread chat') : 'No unread chats'} to={to} dot={n > 0} />;
}

export function ClientsTile({ active, to = '/clients' }) {
  if (active === undefined) return null;
  return <RowTile icon={Users} color="var(--orange)" title="Clients" sub={`${Number(active) || 0} active`} to={to} />;
}
