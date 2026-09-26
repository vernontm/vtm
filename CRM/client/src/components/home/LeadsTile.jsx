import React from 'react';
import { Tile, TileHead, Big, Sub, Dot, AMBER, RED } from './shared';

// Leads: the hot ones waiting on a reply lead, with warm and open behind
// them. Opens the leads list.
export default function LeadsTile({ leads, to = '/leads' }) {
  if (!leads) return null;
  const hot = Number(leads.hot) || 0;
  const warm = Number(leads.warm) || 0;
  const open = Number(leads.open) || 0;
  return (
    <Tile to={to}>
      <TileHead label="Leads" right={`${open} open`} />
      <Big color={hot ? RED : 'var(--text)'}>{hot || open}</Big>
      <Sub>{hot ? 'hot, waiting on you' : open === 1 ? 'open lead' : 'open leads'}</Sub>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Dot color={AMBER} size={8} />
        <span style={{ fontSize: 11.5, color: AMBER }}>{warm} warm</span>
      </div>
    </Tile>
  );
}
