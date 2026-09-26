import React from 'react';
import { HomeGrid, HomeStyles } from './shared';
import MoneyTiles from './MoneyTiles';
import NextUpTile from './NextUpTile';
import TeamTodayTile from './TeamTodayTile';
import { TeamChatTile, ClientsTile } from './RowTiles';
import HeldUpTile from './HeldUpTile';

// Ray's home. The order is the order he put the phone in: the money first,
// then what is next, then who is working and what they are on, then team
// chat and clients, and last what is held up. Every tile hides itself when
// its section is missing from the /home reply and the grid closes up.
export default function CeoHome({ home }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 22 }}>
      <HomeStyles />
      <MoneyTiles money={home.money} />
      <HomeGrid>
        <NextUpTile event={home.next_up} />
        <TeamTodayTile team={home.team_today} />
        <TeamChatTile unread={home.team_unread} />
        <ClientsTile active={home.clients_active} />
        <HeldUpTile items={home.held_up} />
      </HomeGrid>
    </div>
  );
}
