import React from 'react';
import { Tile, TileHead, Bar, Sub, plural } from './shared';

// Tasks: the team to-do list the Dashboard already loads, as a single line of
// progress with whatever is next. Opens the To-Do page.
export default function TasksTile({ todos, label = 'Tasks', to = '/todos' }) {
  if (!Array.isArray(todos)) return null;
  const total = todos.length;
  const done = todos.filter(t => t.done).length;
  const next = todos.find(t => !t.done)?.title || null;
  return (
    <Tile to={to}>
      <TileHead label={label} right={total ? `${done} of ${total} done` : 'nothing on the list'} />
      <Bar value={total ? done / total : 0} />
      <Sub>{next ? `Next: ${next}` : total ? 'All done for today' : 'Add a task to get started'}</Sub>
      {total ? <Sub>{plural(total - done, 'item')} still open</Sub> : null}
    </Tile>
  );
}
