import React, { useEffect, useState } from 'react';
import { getClaudeWorkspaces } from '../api';

// Picks the Claude Code folder whose sessions log to this project.
//
// The options come from whatever tools/claude-sync.mjs last published: Vercel
// cannot see a local disk, so an empty list means the sync has not run on this
// machine yet, not that there are no folders.
const shortPath = (p) => {
  const clean = String(p || '').replace(/^\/Users\/[^/]+\//, '~/');
  return clean.length > 46 ? `…${clean.slice(-45)}` : clean;
};

export default function WorkspacePicker({ value, onChange }) {
  const [options, setOptions] = useState(null);

  useEffect(() => {
    let alive = true;
    getClaudeWorkspaces()
      .then(rows => alive && setOptions(Array.isArray(rows) ? rows : []))
      .catch(() => alive && setOptions([]));
    return () => { alive = false; };
  }, []);

  if (options === null) {
    return <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Loading folders…</div>;
  }

  // A linked path that is no longer on the machine still belongs in the list,
  // otherwise selecting it back would be impossible.
  const known = options.some(o => o.path === value);
  const hint = options.find(o => o.path === value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <select
        className="form-input"
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
      >
        <option value="">— Not linked —</option>
        {!known && value && <option value={value}>{shortPath(value)} (not on this Mac)</option>}
        {options.map(o => (
          <option key={o.path} value={o.path}>
            {shortPath(o.path)} · {o.sessions} session{o.sessions === 1 ? '' : 's'}
          </option>
        ))}
      </select>

      <span style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.45 }}>
        {options.length === 0
          ? 'No folders published yet. Run “node tools/claude-sync.mjs --publish” on your Mac.'
          : hint
            ? `Last active ${hint.last_active || 'unknown'} · ${hint.sessions} session${hint.sessions === 1 ? '' : 's'}`
            : 'Folder whose Claude sessions log to this project.'}
      </span>
    </div>
  );
}
