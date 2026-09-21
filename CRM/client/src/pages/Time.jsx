import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, Play, Square, Plus, Trash2, Check, DollarSign } from 'lucide-react';
import { useClient } from '../context/ClientContext';
import {
  getAdminUsers, getTimeEntries, clockIn, clockOut, addTimeEntry,
  markTimePaid, setEmployeeRate, deleteTimeEntry, payTimeRange,
} from '../api';
import { toast } from '../components/Toast';

const pad = (n) => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const weekStartStr = () => { const d = new Date(); const dow = d.getDay(); d.setDate(d.getDate() - dow); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtHM = (min) => { const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60); const r = m % 60; return h ? `${h}h ${r}m` : `${r}m`; };
const fmtElapsed = (ms) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const fmtDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Time() {
  const { user, isAdmin } = useClient();
  const [employees, setEmployees] = useState([]);
  const [userId, setUserId] = useState(user?.id || '');
  const [data, setData] = useState({ entries: [], hourly_rate: 0, open: null });
  const [loading, setLoading] = useState(true);
  const [nowTs, setNowTs] = useState(Date.now());
  const [addMin, setAddMin] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addDate, setAddDate] = useState(localToday());
  const [rateInput, setRateInput] = useState('');

  // Pay-a-period: pick a date range, the math (minutes -> hours -> $) is done
  // for you, one click settles every entry in the window.
  const weekAgo = () => { const d = new Date(); d.setDate(d.getDate() - 6); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const [payFrom, setPayFrom] = useState(weekAgo());
  const [payTo, setPayTo] = useState(localToday());
  const [payPreview, setPayPreview] = useState(null);   // { minutes, entry_count, suggested_amount }
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const viewingSelf = userId === user?.id;

  useEffect(() => { if (isAdmin) getAdminUsers().then(u => setEmployees(u || [])).catch(() => {}); }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getTimeEntries(isAdmin ? { user_id: userId } : {});
      setData(r || { entries: [], hourly_rate: 0, open: null });
      setRateInput(String(r?.hourly_rate ?? ''));
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  }, [isAdmin, userId]);
  useEffect(() => { load(); }, [load]);

  // Live preview of the selected pay period (debounced).
  useEffect(() => {
    if (!isAdmin || !payFrom || !payTo || payFrom > payTo) { setPayPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const p = await payTimeRange({ user_id: userId, from: payFrom, to: payTo, preview: true });
        setPayPreview(p);
        setPayAmount(p.suggested_amount ? String(p.suggested_amount) : '');
      } catch { setPayPreview(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [isAdmin, userId, payFrom, payTo, data.entries]);

  const doPayRange = async () => {
    if (!payPreview || !payPreview.minutes) return;
    const label = `${fmtHM(payPreview.minutes)} (${fmtDate(payFrom)} to ${fmtDate(payTo)})`;
    if (!window.confirm(`Pay ${label}${payAmount ? ` for ${money(payAmount)}` : ''}? This marks ${payPreview.entry_count} entries paid and records the payment.`)) return;
    setPaying(true);
    try {
      await payTimeRange({ user_id: userId, from: payFrom, to: payTo, amount: payAmount });
      toast('success', `Paid ${label}.`);
      await load();
    } catch (e) { toast('error', e.message); }
    finally { setPaying(false); }
  };

  // live tick while clocked in
  useEffect(() => { if (!data.open) return; const t = setInterval(() => setNowTs(Date.now()), 1000); return () => clearInterval(t); }, [data.open]);
  const liveMs = data.open ? nowTs - new Date(data.open.started_at).getTime() : 0;
  const liveMin = data.open ? Math.floor(liveMs / 60000) : 0;

  const totals = useMemo(() => {
    const today = localToday(), wk = weekStartStr();
    let todayMin = 0, weekMin = 0, unpaidMin = 0;
    for (const e of data.entries) {
      todayMin += e.work_date === today ? e.minutes : 0;
      weekMin += e.work_date >= wk ? e.minutes : 0;
      unpaidMin += e.status === 'logged' ? e.minutes : 0;
    }
    return { todayMin: todayMin + (data.open && data.open.work_date === today ? liveMin : 0), weekMin: weekMin + (data.open ? liveMin : 0), unpaidMin };
  }, [data, liveMin]);
  const owed = (totals.unpaidMin / 60) * (data.hourly_rate || 0);

  const doClockIn = async () => { try { const e = await clockIn(); setData(d => ({ ...d, open: e })); } catch (er) { toast('error', er.message); } };
  const doClockOut = async () => { try { await clockOut(); await load(); } catch (er) { toast('error', er.message); } };
  const doAdd = async () => {
    const m = parseInt(addMin, 10);
    if (!m || m <= 0) return;
    try { await addTimeEntry({ minutes: m, note: addNote.trim(), work_date: addDate }); setAddMin(''); setAddNote(''); await load(); }
    catch (e) { toast('error', e.message); }
  };
  const removeEntry = async (id) => { try { await deleteTimeEntry(id); setData(d => ({ ...d, entries: d.entries.filter(x => x.id !== id) })); } catch (e) { toast('error', e.message); } };
  const payOne = async (id) => { try { await markTimePaid({ ids: [id] }); await load(); } catch (e) { toast('error', e.message); } };
  const payAll = async () => { if (!window.confirm(`Mark all ${fmtHM(totals.unpaidMin)} as paid?`)) return; try { await markTimePaid({ user_id: userId }); await load(); } catch (e) { toast('error', e.message); } };
  const saveRate = async () => { try { await setEmployeeRate({ user_id: userId, hourly_rate: parseFloat(rateInput) || 0 }); toast('success', 'Rate saved'); await load(); } catch (e) { toast('error', e.message); } };

  const empLabel = (e) => e.email + (e.is_admin ? ' (admin)' : '');

  return (
    <div style={{ padding: 24, minHeight: '100%', background: 'var(--bg)' }}>
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Employee</span>
          <select className="form-input" style={{ width: 'auto', minWidth: 240 }} value={userId} onChange={e => setUserId(e.target.value)}>
            {user && <option value={user.id}>{user.email} (me)</option>}
            {employees.filter(e => e.id !== user?.id).map(e => <option key={e.id} value={e.id}>{empLabel(e)}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 20, alignItems: 'start' }}>
        {/* Clock card (only for your own time) */}
        {viewingSelf && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Clock size={16} style={{ color: 'var(--orange)' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Time clock</span>
            </div>
            {data.open ? (
              <>
                <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>{fmtElapsed(liveMs)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Clocked in since {new Date(data.open.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                <button className="btn-primary" onClick={doClockOut} style={{ justifyContent: 'center', width: '100%', background: '#dc2626' }}><Square size={14} /> Clock out</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Not clocked in.</div>
                <button className="btn-primary" onClick={doClockIn} style={{ justifyContent: 'center', width: '100%' }}><Play size={14} /> Clock in</button>
              </>
            )}
          </div>
        )}

        {/* Totals */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 14 }}>Hours</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(totals.todayMin)}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Today</div></div>
            <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(totals.weekMin)}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>This week</div></div>
          </div>
        </div>

        {/* Pay / settle */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 14 }}>Unpaid</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(totals.unpaidMin)}{data.hourly_rate > 0 ? ` · ${money(owed)}` : ''}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>logged, not yet paid</div>
          {isAdmin && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Rate $</span>
                <input className="form-input" type="number" min="0" step="0.5" value={rateInput} onChange={e => setRateInput(e.target.value)} style={{ width: 90 }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>/hr</span>
                <button className="btn-ghost" onClick={saveRate} style={{ padding: '6px 10px' }}>Save</button>
              </div>
              {/* Pay a period: she logs minutes, you pick the week — the math is automatic */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Pay a period</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <input className="form-input" type="date" value={payFrom} onChange={e => setPayFrom(e.target.value)} style={{ width: 145 }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>to</span>
                  <input className="form-input" type="date" value={payTo} onChange={e => setPayTo(e.target.value)} style={{ width: 145 }} />
                </div>
                <div style={{ fontSize: 12.5, marginTop: 8, color: payPreview?.minutes ? 'var(--text)' : 'var(--muted)', fontWeight: 600 }}>
                  {payPreview
                    ? payPreview.minutes
                      ? `${fmtHM(payPreview.minutes)} unpaid across ${payPreview.entry_count} entr${payPreview.entry_count === 1 ? 'y' : 'ies'}${payPreview.hourly_rate > 0 ? ` · ${money(payPreview.suggested_amount)} at $${payPreview.hourly_rate}/hr` : ''}`
                      : 'No unpaid time in this range.'
                    : '…'}
                </div>
                {payPreview?.minutes > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Paid $</span>
                    <input className="form-input" type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={{ width: 110 }} />
                    <button className="btn-primary" onClick={doPayRange} disabled={paying} style={{ flex: 1, justifyContent: 'center' }}>
                      <DollarSign size={14} /> {paying ? 'Paying…' : 'Pay period'}
                    </button>
                  </div>
                )}
              </div>
              {totals.unpaidMin > 0 && <button className="btn-ghost" onClick={payAll} style={{ justifyContent: 'center' }}><Check size={14} /> Mark ALL unpaid time paid</button>}
              {(data.payments || []).length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Payment history</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                    {data.payments.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                        <span>{fmtDate(p.period_start)} to {fmtDate(p.period_end)} · {fmtHM(p.minutes)}</span>
                        <span style={{ fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{p.amount != null ? money(p.amount) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual add (own time only) */}
      {viewingSelf && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Add time — date</div><input className="form-input" type="date" value={addDate} onChange={e => setAddDate(e.target.value)} style={{ width: 160 }} /></div>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Minutes</div><input className="form-input" type="number" min="1" value={addMin} onChange={e => setAddMin(e.target.value)} placeholder="e.g. 48" style={{ width: 110 }} /></div>
          <div style={{ flex: 1, minWidth: 160 }}><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Note (optional)</div><input className="form-input" value={addNote} onChange={e => setAddNote(e.target.value)} placeholder="What you worked on" /></div>
          <button className="btn-primary" onClick={doAdd} disabled={!addMin} style={{ padding: '9px 16px' }}><Plus size={14} /> Add</button>
        </div>
      )}

      {/* Entries */}
      <div className="table-container" style={{ margin: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 140 }}>Date</th>
              <th style={{ minWidth: 90 }}>Time</th>
              <th style={{ minWidth: 200 }}>Note</th>
              <th style={{ minWidth: 100 }}>Status</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
            ) : data.entries.filter(e => e.ended_at || !e.started_at).length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No time logged yet.</td></tr>
            ) : data.entries.filter(e => e.ended_at || !e.started_at).map(e => (
              <tr key={e.id}>
                <td>{fmtDate(e.work_date)}</td>
                <td style={{ fontWeight: 700, color: 'var(--text)' }}>{fmtHM(e.minutes)}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{e.note || (e.started_at ? 'Clocked session' : '—')}</td>
                <td>
                  {e.status === 'paid'
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#16a34a18', border: '1px solid #16a34a40', borderRadius: 999, padding: '2px 10px' }}>Paid</span>
                    : <span style={{ fontSize: 11, fontWeight: 700, color: '#f5a623', background: '#f5a62318', border: '1px solid #f5a62340', borderRadius: 999, padding: '2px 10px' }}>Unpaid</span>}
                </td>
                <td onClick={ev => ev.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {isAdmin && e.status === 'logged' && <button className="btn-ghost" onClick={() => payOne(e.id)} title="Mark paid" style={{ padding: '5px 7px', color: '#16a34a' }}><Check size={14} /></button>}
                    {e.status === 'logged' && <button className="btn-ghost" onClick={() => removeEntry(e.id)} title="Delete" style={{ padding: '5px 7px', color: '#ff5c5c' }}><Trash2 size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
