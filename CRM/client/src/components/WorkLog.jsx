import React, { useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';
import { getProjectBoard } from '../api';
import { BOARD_REFRESH_EVENT } from './ProgressReport';

// Day-by-day record of Claude Code work on this project, filed by
// tools/claude-sync.mjs. These are project-level comments (no item_id) written
// by "Claude Code", and they are always internal, so the client-safe progress
// report drops them automatically.
export default function WorkLog({ project }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => getProjectBoard(project.id)
      .then(r => {
        if (!alive) return;
        setEntries((r.comments || [])
          .filter(c => !c.item_id && c.author === 'Claude Code')
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
      })
      .catch(() => alive && setEntries([]));
    load();
    const onRefresh = (e) => {
      if (!e.detail?.projectId || e.detail.projectId === project.id) load();
    };
    window.addEventListener(BOARD_REFRESH_EVENT, onRefresh);
    return () => { alive = false; window.removeEventListener(BOARD_REFRESH_EVENT, onRefresh); };
  }, [project.id]);

  if (entries === null) {
    return <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Loading…</div>;
  }

  if (!entries.length) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
        {project.claude_workspace
          ? 'No sessions summarised yet. The sync files a day of work the morning after it happens.'
          : 'Set a Claude workspace above to log development sessions against this project.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 420, overflowY: 'auto' }}>
      {entries.map(entry => {
        // Each entry opens with a "**Claude Code · YYYY-MM-DD**" line.
        const [head, ...rest] = String(entry.body || '').split('\n');
        const day = (head.match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
        const text = rest.join('\n').trim();
        return (
          <div key={entry.id} style={{
            borderLeft: '2px solid var(--orange)',
            paddingLeft: 10,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Terminal size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.04em' }}>
                {day || 'Session'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
