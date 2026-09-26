import React from 'react';
import { Bell } from 'lucide-react';
import { Tile, TileHead, IconChip, Sub, plural, AMBER, RED } from './shared';

// Reminders: the open to-dos that carry a date, split into what is due by
// today and what is coming up. The same list the To-Do page shows, so that is
// where it opens. A dated reminders feed of its own can replace the counts
// here without touching the layout.
const dayKey = (d) => {
  const x = new Date(d);
  if (isNaN(x)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

export default function RemindersTile({ todos, to = '/todos' }) {
  if (!Array.isArray(todos)) return null;
  const today = dayKey(new Date());
  const dated = todos.filter(t => !t.done && t.due_date);
  const due = dated.filter(t => dayKey(t.due_date) <= today).length;
  const later = dated.length - due;
  return (
    <Tile to={to}>
      <TileHead label="Reminders" right={dated.length ? plural(dated.length, 'dated item') : 'none set'} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconChip icon={Bell} color={due ? RED : AMBER} size={38} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {dated.length ? [due ? `${due} due today` : null, later ? `${later} coming up` : null].filter(Boolean).join(' · ') : 'Nothing with a date'}
          </div>
          <Sub>{dated.length ? 'From the team to-do list' : 'Put a date on a to-do and it shows up here'}</Sub>
        </div>
      </div>
    </Tile>
  );
}
