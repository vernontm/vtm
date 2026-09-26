import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Check } from 'lucide-react';
import NudgeModal from '../NudgeModal';
import { Tile, TileHead, Dot, EmptyNote, plural, RED, AMBER } from './shared';

// Held up: what is waiting on somebody else. Every row that the nudges
// endpoint can write a message for gets a Nudge button, which opens the same
// modal the Money page uses with that row's kind and id. A quiet hot lead is
// not a nudge kind, so that row just opens the lead.
// Kinds: docs/engineer/role-homes-contracts.md.
const NUDGE_KINDS = ['invoice', 'manual_invoice', 'payment', 'agreement', 'plan'];
const SEVERITY = { red: RED, amber: AMBER };

export default function HeldUpTile({ items, to = '/money', full = true }) {
  const [nudge, setNudge] = useState(null);          // { kind, id, key }
  const [done, setDone] = useState({});              // { 'kind:id': 'sent' | 'scheduled' }
  if (!Array.isArray(items)) return null;

  const rowLink = (h) => h.client_id ? `${h.kind === 'lead' ? '/leads' : '/clients'}?open=${h.client_id}` : null;

  return (
    <Tile full={full}>
      <TileHead label="Held up" right={items.length ? plural(items.length, 'item') : 'all clear'} />
      {items.length === 0 ? <EmptyNote>Nothing is waiting on anyone.</EmptyNote> : null}
      <div>
        {items.map(h => {
          const key = `${h.kind}:${h.id}`;
          const link = rowLink(h);
          const color = SEVERITY[h.severity] || AMBER;
          return (
            <div key={key} className="home-row">
              <Dot color={color} title={h.severity === 'red' ? 'Red: act today' : 'Amber: worth a look'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="private-value home-clip" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.title}</div>
                {h.sub ? <div className="private-value home-clip" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{h.sub}</div> : null}
              </div>
              {NUDGE_KINDS.includes(h.kind) && (
                done[key] ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#16a34a', flexShrink: 0 }}>
                    <Check size={12} /> {done[key] === 'scheduled' ? 'Nudge scheduled' : 'Nudged just now'}
                  </span>
                ) : (
                  <button type="button" className="home-pill" title="Send a reminder by text or email" onClick={() => setNudge({ kind: h.kind, id: h.id, key })}>
                    <Send size={12} /> Nudge
                  </button>
                )
              )}
              {link ? <Link to={link} className="home-link">{h.kind === 'lead' ? 'Open lead' : 'Open client'}</Link> : null}
            </div>
          );
        })}
      </div>
      <Link to={to} className="home-link" style={{ alignSelf: 'flex-start' }}>Open Money &rarr;</Link>
      {nudge && (
        <NudgeModal
          kind={nudge.kind}
          id={nudge.id}
          onClose={() => setNudge(null)}
          onSent={(_reply, { scheduled } = {}) => setDone(prev => ({ ...prev, [nudge.key]: scheduled ? 'scheduled' : 'sent' }))}
        />
      )}
    </Tile>
  );
}
