import React from 'react';
import { HomeGrid, HomeStyles } from './shared';
import NextUpTile from './NextUpTile';
import { OutreachTile } from './OutreachTile';
import LeadsTile from './LeadsTile';
import BeforeCallTile from './BeforeCallTile';
import TasksTile from './TasksTile';

// The sales home: the next call (only events that include their email), the
// outreach count against today's target, the leads, what to read before the
// call, and the task list. A missing section renders nothing and the grid
// closes up.
export default function SalesHome({ home, todos, updateHome }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <HomeStyles />
      <HomeGrid>
        <NextUpTile label="My next call" event={home.next_up} sub="Only events that include your email" />
        <OutreachTile outreach={home.outreach} updateHome={updateHome} />
        <LeadsTile leads={home.leads} />
        <BeforeCallTile beforeCall={home.before_call} />
        <TasksTile todos={todos} label="Tasks · Sales" />
      </HomeGrid>
    </div>
  );
}
