// The task model the app shows, built on two CRM endpoints: routines
// (recurring checklists, ticked per period, team-wide) and team to-dos
// (one-off items that can be assigned to one person). Home's Tasks tile and
// the Tasks space both read through here so the numbers agree.
const pad = (n) => String(n).padStart(2, '0');

// Same period key the web CRM writes, so a check made on either side counts.
export function periodKey(cadence, d = new Date()) {
  const y = d.getFullYear(), m = pad(d.getMonth() + 1), day = pad(d.getDate());
  if (cadence === 'monthly') return `${y}-${m}`;
  if (cadence === 'weekly') {
    const dow = (d.getDay() + 6) % 7;                 // 0 = Monday
    const mon = new Date(d); mon.setDate(d.getDate() - dow);
    return `W:${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
  }
  return `${y}-${m}-${day}`;
}

export const CADENCE_LABEL = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };

const isToday = (iso) => {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

// Flatten routines into checkable rows for the current period.
export function routineRows(resp) {
  const routines = resp?.routines || [];
  const checks = resp?.checks || [];
  const doneMap = {};
  checks.forEach(c => { doneMap[`${c.item_id}@${c.period_key}`] = c; });
  const rows = [];
  for (const r of routines) {
    const pk = periodKey(r.cadence || 'daily');
    for (const it of r.items || []) {
      const check = doneMap[`${it.id}@${pk}`];
      rows.push({ id: `${r.id}:${it.id}`, routineId: r.id, itemId: it.id, periodKey: pk, text: it.text, routine: r, cadence: r.cadence || 'daily', done: !!check, doneBy: check?.done_by_name || null });
    }
  }
  return rows;
}

// One-off to-dos that belong on this person's day: assigned to them, or open
// and unassigned. Finished ones stay for the day they were finished.
export function myTodos(todos, myId) {
  return (todos || []).filter(t => {
    if (t.done && !isToday(t.done_at)) return false;
    if (t.assigned_to && myId && t.assigned_to !== myId) return false;
    return true;
  });
}

export function todayProgress(routinesResp, todos, myId) {
  const rows = routineRows(routinesResp);
  const mine = myTodos(todos, myId);
  const total = rows.length + mine.length;
  const done = rows.filter(r => r.done).length + mine.filter(t => t.done).length;
  const next = rows.find(r => !r.done)?.text || mine.find(t => !t.done)?.title || null;
  return { total, done, next };
}
