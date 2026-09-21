import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, Play, Square, Plus, Trash2, Check, DollarSign, Camera, Send, ThumbsUp, AlertCircle } from 'lucide-react';
import { useClient } from '../context/ClientContext';
import {
  getAdminUsers, getTimeEntries, clockIn, clockOut, addTimeEntry,
  markTimePaid, setEmployeeRate, deleteTimeEntry, payTimeRange,
  addShoot, submitStatement, approveStatement, disputeStatement, payStatement,
} from '../api';
import { toast } from '../components/Toast';

const pad = (n) => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const weekStartStr = () => { const d = new Date(); const dow = d.getDay(); d.setDate(d.getDate() - dow); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtHM = (min) => { const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60); const r = m % 60; return h ? `${h}h ${r}m` : `${r}m`; };
const fmtElapsed = (ms) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const fmtDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mirrors New/api/_lib/shoot-billing.js so the form can show what a shoot is
// worth before it is saved. ADVISORY ONLY: the server recomputes on save and
// its answer is the one that gets paid, so a drift here can mislead but can
// never mispay. Keep the two in step.
const previewBillableMinutes = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const withMin = Math.max(Math.round(n), 60);
  const rem = withMin % 15;
  if (rem === 0) return withMin;
  return rem <= 7 ? withMin - rem : withMin + (15 - rem);
};
const minutesBetween = (date, call, wrap) => {
  if (!date || !call || !wrap) return 0;
  const a = new Date(`${date}T${call}`), b = new Date(`${date}T${wrap}`);
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 60000);
};

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
  // Shoot logging (influencer contractors): call/wrap + location + miles.
  const [shDate, setShDate] = useState(localToday());
  const [shLocation, setShLocation] = useState('');
  const [shCall, setShCall] = useState('');
  const [shWrap, setShWrap] = useState('');
  const [shMiles, setShMiles] = useState('');
  const [shSaving, setShSaving] = useState(false);
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

  // ── Shoots and per-shoot invoices ──────────────────────────────────────
  const shMinutes = minutesBetween(shDate, shCall, shWrap);
  const shBillable = previewBillableMinutes(shMinutes);
  const shMileage = (Number(shMiles) || 0) * (data.mileage_rate || 0);
  const shTotal = (shBillable / 60) * (data.hourly_rate || 0) + shMileage;

  const doAddShoot = async () => {
    if (!shMinutes) { toast('error', 'Enter a call time and a wrap time.'); return; }
    setShSaving(true);
    try {
      await addShoot({
        work_date: shDate, location: shLocation.trim(),
        call_at: `${shDate}T${shCall}`, wrap_at: `${shDate}T${shWrap}`,
        miles: Number(shMiles) || 0,
      });
      setShLocation(''); setShCall(''); setShWrap(''); setShMiles('');
      toast('success', 'Shoot logged.');
      await load();
    } catch (e) { toast('error', e.message); }
    finally { setShSaving(false); }
  };

  const doSubmitInvoice = async (entryId) => {
    try {
      const r = await submitStatement({ entry_ids: [entryId] });
      toast('success', `Invoice sent for ${money(r.statement?.total_amount)}.`);
      await load();
    } catch (e) { toast('error', e.message); }
  };
  const doApprove = async (id) => { try { await approveStatement({ statement_id: id }); toast('success', 'Invoice approved.'); await load(); } catch (e) { toast('error', e.message); } };
  const doDispute = async (id) => {
    const note = window.prompt('What is wrong with this invoice? She will see this note.');
    if (note == null) return;
    try { await disputeStatement({ statement_id: id, note }); toast('success', 'Invoice disputed.'); await load(); } catch (e) { toast('error', e.message); }
  };
  const doPayStatement = async (st) => {
    if (!window.confirm(`Pay ${money(st.total_amount)}? This marks the shoot paid and records the payment.`)) return;
    try { await payStatement({ statement_id: st.id }); toast('success', `Paid ${money(st.total_amount)}.`); await load(); } catch (e) { toast('error', e.message); }
  };

  const shoots = (data.entries || []).filter(e => e.kind === 'shoot');
  const uninvoiced = shoots.filter(e => !e.statement_id);
  const statements = data.statements || [];
  const stLabel = { submitted: ['Awaiting approval', '#b45309'], approved: ['Approved, awaiting payment', '#1d4ed8'], disputed: ['Disputed', '#b91c1c'], paid: ['Paid', '#16a34a'], draft: ['Draft', 'var(--muted)'] };

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

      {/* Log a shoot. The rate, the one hour minimum, the quarter-hour rounding
          and the mileage rate all come from the contract; the preview below is
          advisory and the server recomputes on save. */}
      {viewingSelf && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Camera size={15} style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: 13, fontWeight: 800 }}>Log a shoot</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Date</div><input className="form-input" type="date" value={shDate} onChange={e => setShDate(e.target.value)} style={{ width: 150 }} /></div>
            <div style={{ flex: 1, minWidth: 150 }}><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Location</div><input className="form-input" value={shLocation} onChange={e => setShLocation(e.target.value)} placeholder="Where the shoot was" /></div>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Call time</div><input className="form-input" type="time" value={shCall} onChange={e => setShCall(e.target.value)} style={{ width: 120 }} /></div>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Wrap time</div><input className="form-input" type="time" value={shWrap} onChange={e => setShWrap(e.target.value)} style={{ width: 120 }} /></div>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Miles driven</div><input className="form-input" type="number" min="0" step="0.1" value={shMiles} onChange={e => setShMiles(e.target.value)} placeholder="0" style={{ width: 110 }} /></div>
            <button className="btn-primary" onClick={doAddShoot} disabled={!shMinutes || shSaving} style={{ padding: '9px 16px' }}><Plus size={14} /> {shSaving ? 'Saving...' : 'Log shoot'}</button>
          </div>
          {shMinutes > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5 }}>
              <span style={{ color: 'var(--muted)' }}>On set <strong style={{ color: 'var(--text)' }}>{fmtHM(shMinutes)}</strong></span>
              <span style={{ color: 'var(--muted)' }}>Billed <strong style={{ color: 'var(--text)' }}>{(shBillable / 60).toFixed(2)} hrs</strong>{shBillable !== shMinutes && <span style={{ color: 'var(--muted)' }}> (minimum and rounding applied)</span>}</span>
              {Number(shMiles) > 0 && <span style={{ color: 'var(--muted)' }}>Mileage <strong style={{ color: 'var(--text)' }}>{money(shMileage)}</strong> at {money(data.mileage_rate)}/mi</span>}
              <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{money(shTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Shoots not yet invoiced. Per-shoot invoicing, so each one submits on its own. */}
      {viewingSelf && uninvoiced.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Ready to invoice</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {uninvoiced.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <span style={{ fontWeight: 700, minWidth: 130 }}>{fmtDate(e.work_date)}</span>
                <span style={{ color: 'var(--muted)', flex: 1, minWidth: 120 }}>{e.location || 'No location'}</span>
                <span style={{ color: 'var(--muted)' }}>{((e.billable_minutes || e.minutes) / 60).toFixed(2)} hrs</span>
                {Number(e.miles) > 0 && <span style={{ color: 'var(--muted)' }}>{e.miles} mi</span>}
                <button className="btn-primary" onClick={() => doSubmitInvoice(e.id)} style={{ padding: '6px 12px' }}><Send size={13} /> Submit invoice</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices. She sees her own status; an admin gets the buttons. */}
      {statements.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Invoices</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {statements.map(st => {
              const [text, colour] = stLabel[st.status] || [st.status, 'var(--muted)'];
              return (
                <div key={st.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
                    <span style={{ fontWeight: 700, minWidth: 130 }}>{fmtDate(st.period_start)}</span>
                    <span style={{ color: 'var(--muted)' }}>{((st.billable_minutes || 0) / 60).toFixed(2)} hrs{Number(st.miles) > 0 ? ` · ${st.miles} mi` : ''}</span>
                    <span style={{ color: colour, fontWeight: 700 }}>{text}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(st.total_amount)}</span>
                    {isAdmin && st.status === 'submitted' && (
                      <>
                        <button className="btn-ghost" onClick={() => doApprove(st.id)} style={{ padding: '5px 10px', color: '#16a34a' }}><ThumbsUp size={13} /> Approve</button>
                        <button className="btn-ghost" onClick={() => doDispute(st.id)} style={{ padding: '5px 10px', color: '#b91c1c' }}><AlertCircle size={13} /> Dispute</button>
                      </>
                    )}
                    {isAdmin && (st.status === 'approved' || st.status === 'submitted') && (
                      <button className="btn-primary" onClick={() => doPayStatement(st)} style={{ padding: '6px 12px' }}><DollarSign size={13} /> Pay</button>
                    )}
                  </div>
                  {st.status === 'disputed' && st.dispute_note && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{st.dispute_note}</div>
                  )}
                </div>
              );
            })}
          </div>
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
