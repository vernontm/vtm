import React from 'react';
import { HomeGrid, HomeStyles } from './shared';
import BookNextTile from './BookNextTile';
import RouteTile from './RouteTile';
import LeadQuickAdd from './LeadQuickAdd';
import { CountedTasksTile } from './OutreachTile';
import RemindersTile from './RemindersTile';

// The assistant's home: book the next slot with the assistant, today's route
// with directions, add a lead in one line, the counted tasks, and what has a
// date on it. A missing section renders nothing and the grid closes up.
export default function AssistantHome({ home, todos, updateHome }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <HomeStyles />
      <HomeGrid>
        <BookNextTile />
        <RouteTile route={home.route} />
        <LeadQuickAdd startCount={Number(home.outreach?.counters?.lead_created) || 0} />
        <CountedTasksTile outreach={home.outreach} updateHome={updateHome} />
        <RemindersTile todos={todos} />
      </HomeGrid>
    </div>
  );
}
