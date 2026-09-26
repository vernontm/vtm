import React from 'react';
import { HomeGrid, HomeStyles } from './shared';
import NextUpTile from './NextUpTile';
import TeamTodayTile from './TeamTodayTile';
import ReviewQueueTile from './ReviewQueueTile';
import OnboardingTile from './OnboardingTile';
import PayrollTile from './PayrollTile';

// The HR home: what is next, who is working, what is waiting for review, who
// is still being set up, and the pay period. A missing section renders
// nothing and the grid closes up.
export default function HrHome({ home }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <HomeStyles />
      <HomeGrid>
        <NextUpTile event={home.next_up} />
        <TeamTodayTile team={home.team_today} />
        <ReviewQueueTile items={home.review_queue} />
        <OnboardingTile people={home.onboarding} />
        <PayrollTile payroll={home.payroll} />
      </HomeGrid>
    </div>
  );
}
