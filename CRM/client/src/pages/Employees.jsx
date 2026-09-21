import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Mail, Copy, Trash2, Clock, FileCheck, X, Check } from 'lucide-react';
import { getEmployees, addEmployee, updateEmployee, removeEmployee, inviteEmployee } from '../api';
import { toast } from '../components/Toast';

// The people who work for VTM. This is not the login list: a person belongs
// here from the day they are hired, whether or not anyone has made them an
// account yet, and clients never appear even though they hold logins too.

const money = (v) => v == null || v === '' ? '' : `$${Number(v).toFixed(2)}`;
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)' };
const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 };
const EMPTY = { name: '', email: '', title: '', kind: 'contractor', hourly_rate: '', started_on: '' };

export default function Employees() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [inviteLink, setInviteLink] = useState(null);   // { name, link }
  const [editing, setEditing] = useState(null);         // { id, field }
  const [editValue, setEditValue] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try { const r = await getEmployees(); setRows(r.employees || []); }
    catch (e) { toast('error', e.message); }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const guard = async (fn) => {
    setBusy(true);
    try { await fn(); await load({ silent: true }); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) { toast('error', 'Name and email are both needed.'); return; }
    await guard(async () => { await addEmployee(form); setForm(EMPTY); setAdding(false); toast('success', `${form.name.trim()} added`); });
  };

  const invite = (emp) => guard(async () => {
    const r = await inviteEmployee(emp.id);
    setInviteLink({ name: emp.name, link: r.action_link });
    toast('success', `${emp.name} can now be sent their set-up link`);
  });

  const remove = (emp) => {
    if (!window.confirm(`Remove ${emp.name} from the roster? Their login and logged time are left alone.`)) return;
    guard(() => removeEmployee(emp.id));
  };

  const startEdit = (emp, field) => { setEditing({ id: emp.id, field }); setEditValue(emp[field] == null ? '' : String(emp[field])); };
  const commitEdit = async (emp) => {
    const field = editing?.field;
    setEditing(null);
    if (!field) return;
    const was = emp[field] == null ? '' : String(emp[field]);
    if (editValue === was) return;
    await guard(() => updateEmployee(emp.id, { [field]: editValue }));
  };

  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('success', 'Link copied'); } catch { /* ignore */ } };

  const active = rows.filter(r => r.status !== 'inactive');
  const inactive = rows.filter(r => r.status === 'inactive');

  const cell = (emp, field, render, width) => editing?.id === emp.id && editing.field === field ? (
    <input className="form-input" value={editValue} autoFocus
      onChange={e => setEditValue(e.target.value)}
      onBlur={() => commitEdit(emp)}
      onKeyDown={e => { if (e.key === 'Enter') commitEdit(emp); if (e.key === 'Escape') setEditing(null); }}
      style={{ width: width || 140, padding: '4px 8px', fontSize: 13 }} />
  ) : (
    <span onClick={() => startEdit(emp, field)} title="Click to edit" style={{ cursor: 'text' }}>{render}</span>
  );

  const Row = ({ emp }) => (
    <div style={{ ...card, padding: '14px 16px', marginBottom: 10, opacity: emp.status === 'inactive' ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: 'var(--muted)' }}>
          {(emp.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ minWidth: 150 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>{cell(emp, 'name', emp.name, 180)}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{cell(emp, 'title', emp.title || 'Add a role', 180)}</div>
        </div>

        <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: emp.kind === 'staff' ? '#eef2ff' : '#fef3c7', color: emp.kind === 'staff' ? '#3730a3' : '#92400e' }}>
          {emp.kind === 'staff' ? 'Staff' : 'Contractor'}
        </span>

        <div style={{ fontSize: 12.5, color: 'var(--muted)', minWidth: 90 }}>
          {cell(emp, 'hourly_rate', emp.hourly_rate != null ? `${money(emp.hourly_rate)}/hr` : 'Set rate', 90)}
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, minWidth: 110 }}>
          <Clock size={13} />
          {emp.has_login ? `${emp.hours_this_month} hrs this month` : 'No time yet'}
          {emp.unpaid_hours > 0 && <span style={{ color: '#b45309', fontWeight: 700 }}>({emp.unpaid_hours} unpaid)</span>}
        </div>

        {emp.agreement ? (
          <span title={`${emp.agreement.title} (${emp.agreement.status})`}
            style={{ fontSize: 11.5, color: emp.agreement.status === 'signed' ? '#15803d' : '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileCheck size={13} /> {emp.agreement.status === 'signed' ? 'Contract signed' : 'Contract sent'}
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>No contract</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {emp.has_login ? (
            <span style={{ fontSize: 11.5, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Has login</span>
          ) : (
            <button className="btn-primary" onClick={() => invite(emp)} disabled={busy} style={{ padding: '6px 12px' }}>
              <Mail size={13} /> Invite
            </button>
          )}
          <button className="btn-ghost" title={emp.status === 'inactive' ? 'Mark active' : 'Mark inactive'}
            onClick={() => guard(() => updateEmployee(emp.id, { status: emp.status === 'inactive' ? 'active' : 'inactive' }))}
            style={{ padding: '5px 10px', fontSize: 12 }}>
            {emp.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
          </button>
          <button className="btn-ghost" title="Remove from roster" onClick={() => remove(emp)} style={{ padding: '5px 7px', color: '#ff5c5c' }}><Trash2 size={13} /></button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>{emp.email}</div>
    </div>
  );

  return (
    <div style={{ padding: 24, minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Employees</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Your staff and contractors. Someone belongs here from the day they are hired, whether or not they have a login yet.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => setAdding(a => !a)} style={{ padding: '9px 16px' }}>
            <UserPlus size={14} /> Add someone
          </button>
          <a href="/admin/admin-users" className="btn-ghost" style={{ padding: '9px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
             title="Logins, page permissions and password resets, including client logins">
            Logins and access
          </a>
        </div>
      </div>

      {inviteLink && (
        <div style={{ ...card, padding: '14px 16px', marginBottom: 16, borderColor: '#2563eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>Send this to {inviteLink.name}</div>
            <button className="btn-ghost" onClick={() => setInviteLink(null)} style={{ padding: '4px 6px' }}><X size={13} /></button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Single use. They set their own password, so you never handle it.</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: 1, minWidth: 220, fontSize: 11, wordBreak: 'break-all', background: 'var(--bg)', padding: '8px 10px', borderRadius: 8 }}>{inviteLink.link || 'No link returned'}</code>
            {inviteLink.link && <button className="btn-primary" onClick={() => copy(inviteLink.link)} style={{ padding: '7px 12px' }}><Copy size={13} /> Copy</button>}
          </div>
        </div>
      )}

      {adding && (
        <div style={{ ...card, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div><div style={lbl}>Name</div><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: 170 }} autoFocus /></div>
            <div><div style={lbl}>Email</div><input className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ width: 210 }} /></div>
            <div><div style={lbl}>Role</div><input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Editor" style={{ width: 170 }} /></div>
            <div><div style={lbl}>Type</div>
              <select className="form-input" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))} style={{ width: 130 }}>
                <option value="contractor">Contractor</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div><div style={lbl}>Rate</div><input className="form-input" type="number" min="0" step="0.01" value={form.hourly_rate} onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} placeholder="30.00" style={{ width: 100 }} /></div>
            <div><div style={lbl}>Started</div><input className="form-input" type="date" value={form.started_on} onChange={e => setForm(f => ({ ...f, started_on: e.target.value }))} style={{ width: 150 }} /></div>
            <button className="btn-primary" onClick={save} disabled={busy} style={{ padding: '9px 16px' }}>Add</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setForm(EMPTY); }} style={{ padding: '9px 14px' }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      ) : !rows.length ? (
        <div style={{ ...card, padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Nobody on the roster yet.</div>
      ) : (
        <>
          {active.map(emp => <Row key={emp.id} emp={emp} />)}
          {inactive.length > 0 && (
            <>
              <div style={{ ...lbl, marginTop: 20, marginBottom: 8 }}>Inactive</div>
              {inactive.map(emp => <Row key={emp.id} emp={emp} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
