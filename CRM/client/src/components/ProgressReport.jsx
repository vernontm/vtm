import React, { useState } from 'react';
import { FileText, Loader } from 'lucide-react';
import { buildProjectReport } from '../api';
import { toast } from './Toast';

// Period report for one project. Lives in the detail sidebar, next to the
// project's own facts, rather than at the foot of the board.
//
// Generating a report can stamp the board's items, so this tells the board to
// reload itself afterwards. They are siblings in the layout, so the nudge
// travels as a window event instead of a shared parent.
export const BOARD_REFRESH_EVENT = 'vtm:project-board-refresh';

const RANGES = [
  { key: 'this-week', label: 'This week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];

const lbl = {
  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
};

export default function ProgressReport({ project }) {
  const [range, setRange] = useState('this-month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientFacing, setClientFacing] = useState(true);
  const [reporting, setReporting] = useState(false);

  const runReport = async () => {
    if (range === 'custom' && (!from || !to)) { toast('error', 'Pick both dates for a custom range.'); return; }
    setReporting(true);
    try {
      const r = await buildProjectReport(project.id, { range, from, to, client_facing: clientFacing });
      toast('success', `Report ready for ${r.range?.label || 'the period'}`);
      if (r.url) window.open(r.url, '_blank', 'noopener');
      window.dispatchEvent(new CustomEvent(BOARD_REFRESH_EVENT, { detail: { projectId: project.id } }));
    } catch (e) { toast('error', e.message); }
    finally { setReporting(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={lbl}>Period</div>
        <select className="form-input" value={range} onChange={e => setRange(e.target.value)} style={{ width: '100%' }}>
          {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      {range === 'custom' && (
        <>
          <div>
            <div style={lbl}>From</div>
            <input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={lbl}>To</div>
            <input className="form-input" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: '100%' }} />
          </div>
        </>
      )}

      <label style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={clientFacing} onChange={e => setClientFacing(e.target.checked)} />
        Client-safe version
      </label>

      <button className="btn-primary" onClick={runReport} disabled={reporting}
        style={{ padding: '9px 16px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {reporting
          ? <><Loader size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Building…</>
          : <><FileText size={14} /> Generate PDF</>}
      </button>

      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        {clientFacing
          ? 'Leaves out internal notes and any step hidden from the client. Safe to send.'
          : 'Includes internal notes and hidden steps. For your eyes only.'}
        {' '}The PDF is also filed on the client’s Documents.
      </div>
    </div>
  );
}
