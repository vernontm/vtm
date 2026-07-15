import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Trash2, ArrowLeft, Building2, Calendar,
  KeyRound, CheckCircle2, Circle, Clock, ShieldCheck, ListChecks,
  Briefcase, Lock, Eye, EyeOff, Copy, Pencil, ExternalLink,
  FileSignature, Sparkles, DollarSign, Download,
  StickyNote, Phone, CheckSquare, PhoneIncoming, PhoneOutgoing, Flag, Activity, X, Mail,
  ChevronLeft, ChevronRight, ChevronDown,
} from 'lucide-react';
import { usePageActions } from '../context/UiContext';
import {
  getClients, createClient, updateClient, deleteClient,
  getClientPlatforms, createClientPlatform, updateClientPlatform, deleteClientPlatform,
  getClientTasks, createClientTask, updateClientTask, deleteClientTask,
  getClientCredentials, createClientCredential, updateClientCredential, deleteClientCredential,
  getClientActivity, createClientActivity, updateClientActivity, deleteClientActivity, generateClientSummary, uploadFile,
  getProjects, createProject,
  getDeals, createDeal, updateDeal, deleteDeal, createDealInvoice,
  getAgreements, getAgreementFileUrl, updatePayment, sendAgreementForSignature,
  analyzeDeal, generateAgreement, suggestProjects, generateAccessInstructions, draftClientEmail, sendClientEmail, approveAgreement, approveAgreementRow, previewAgreementToken, setAgreementPlans, setupCustomAgreement, markAgreementSent, startMaintenance,
} from '../api';
import Modal from '../components/Modal';
import InlineEdit from '../components/InlineEdit';
import { toast } from '../components/Toast';

// ── Journey stages ────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'lead',            label: 'Lead',            color: '#8a8a8a' },
  { key: 'onboarding',      label: 'Onboarding Call', color: '#f5a623' },
  { key: 'awaiting_access', label: 'Awaiting Access', color: '#2563eb' },
  { key: 'scoping',         label: 'Scoping',         color: '#784bd1' },
  { key: 'plan_review',     label: 'Plan Review',     color: '#3b82f6' },
  { key: 'in_build',        label: 'In Progress',     color: '#22c55e' },
  { key: 'live',            label: 'Live',            color: '#16a34a' },
  { key: 'paused',          label: 'Paused',          color: '#ff5c5c' },
];
const stageOf = (k) => STAGES.find(s => s.key === k) || STAGES[0];

const ACCESS_STATUS = {
  needed:    { label: 'Needed',    color: '#ff5c5c', icon: Circle },
  requested: { label: 'Requested', color: '#f5a623', icon: Clock },
  granted:   { label: 'Granted',   color: '#22c55e', icon: CheckCircle2 },
  blocked:   { label: 'Blocked',   color: '#ff5c5c', icon: Circle },
};

const SOURCES = ['Walk-in', 'Referral', 'Instagram', 'TikTok', 'Google', 'Website', 'Cold outreach', 'Event / networking', 'Other'];
const CLIENT_TYPES = ['Websites', 'Apps & CRMs', 'Marketing', 'AI Services', 'Coaching'];
const NOTE_TAGS = { Important: '#f5a623', Call: '#3b82f6', Meeting: '#784bd1', Update: '#22c55e', Idea: '#0ea5e9' };
const CALL_OUTCOMES = ['Connected', 'No answer', 'Left voicemail', 'Booked meeting', 'Not interested', 'Follow up'];
const TASK_PRIORITY = { low: '#8a8a8a', medium: '#3b82f6', high: '#f5a623', urgent: '#ff5c5c' };

// Lead pipeline temperature + ranking (leads only). Temperature is the pipeline
// stage in the funnel; rank is how strong/priority the lead is.
// Darker colors so white pill text is easy to read.
const TEMPERATURES = [
  { key: 'hot',  label: 'Hot',  color: '#b91c1c' },
  { key: 'warm', label: 'Warm', color: '#b45309' },
  { key: 'cold', label: 'Cold', color: '#1d4ed8' },
];
const tempOf = (k) => TEMPERATURES.find(t => t.key === k) || TEMPERATURES[1];
const RANKS = [
  { key: 'high',   label: 'High',   color: '#15803d' },
  { key: 'medium', label: 'Medium', color: '#b45309' },
  { key: 'low',    label: 'Low',    color: '#475569' },
];
const rankOf = (k) => RANKS.find(r => r.key === k) || RANKS[1];

const EMPTY_CLIENT = { business_name: '', owner_name: '', contact_phone: '', contact_email: '', industry: '', website_url: '', source: 'Walk-in', client_type: [], notes: '', stage: 'lead', lead_temperature: 'warm', lead_rank: 'medium', potential_value: '', firstNote: '' };

function StageBadge({ stage }) {
  const s = stageOf(stage);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px',
      borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
      color: s.color, background: `${s.color}18`, border: `1px solid ${s.color}40`,
    }}>
      {s.label}
    </span>
  );
}

// A small solid-color pill that opens a dropdown to change value (temperature/rank).
// Solid dark fill + white text for legibility.
function PillSelect({ value, options, onChange, minWidth = 54 }) {
  const cur = options.find(o => o.key === value) || options[0];
  return (
    <select
      value={cur.key}
      onClick={e => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); onChange(e.target.value); }}
      style={{
        appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', minWidth,
        padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)',
        color: '#fff', background: cur.color, border: `1px solid ${cur.color}`, textAlign: 'center',
      }}
    >
      {options.map(o => <option key={o.key} value={o.key} style={{ color: 'var(--text)', background: 'var(--surface)' }}>{o.label}</option>)}
    </select>
  );
}

const fmtUsd = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

// Kanban board for leads — one column per temperature (Hot / Warm / Cold).
// Drag a card between columns to change its temperature. Each card carries a
// potential-revenue amount; the board totals it per column and overall.
function LeadsBoard({ leads, onOpen, onTempChange, onRankChange, onDelete }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const grandTotal = leads.reduce((s, l) => s + (Number(l.potential_value) || 0), 0);
  return (
    <div style={{ overflowX: 'auto', padding: '16px 24px' }}>
    {/* Pipeline total */}
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 14px', background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.30)', borderRadius: 10 }}>
      <DollarSign size={15} style={{ color: '#16a34a' }} />
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>Total potential: {fmtUsd(grandTotal)}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>across {leads.length} lead{leads.length !== 1 ? 's' : ''}</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TEMPERATURES.length}, minmax(240px, 1fr))`, gap: 14, alignItems: 'start' }}>
      {TEMPERATURES.map(col => {
        const colLeads = leads.filter(l => (l.lead_temperature || 'warm') === col.key);
        const colTotal = colLeads.reduce((s, l) => s + (Number(l.potential_value) || 0), 0);
        const isOver = overCol === col.key;
        return (
          <div
            key={col.key}
            onDragOver={e => { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key); }}
            onDragLeave={() => setOverCol(o => o === col.key ? null : o)}
            onDrop={e => { e.preventDefault(); if (dragId) onTempChange(dragId, col.key); setDragId(null); setOverCol(null); }}
            style={{
              background: isOver ? '#2a2f3a' : '#1e222b',
              border: `1px solid ${isOver ? col.color : 'rgba(255,255,255,0.10)'}`, borderRadius: 14, minHeight: 200,
              transition: 'background 0.12s, border-color 0.12s',
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: col.color, boxShadow: `0 0 8px ${col.color}` }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)' }}>{col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: col.color, borderRadius: 999, padding: '0 8px', marginLeft: 'auto' }}>{colLeads.length}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', marginTop: 6 }}>{fmtUsd(colTotal)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, minHeight: 60 }}>
              {colLeads.length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center', padding: '16px 0' }}>Drop a lead here</div>}
              {colLeads.map(l => {
                const rk = rankOf(l.lead_rank || 'medium');
                const desc = (l.notes || l.industry || (l.client_type || []).join(', ') || '').trim();
                const cycleRank = () => {
                  const idx = RANKS.findIndex(r => r.key === (l.lead_rank || 'medium'));
                  onRankChange(l.id, RANKS[(idx + 1) % RANKS.length].key);
                };
                const initial = (l.owner_name || l.business_name || '?')[0].toUpperCase();
                return (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onClick={() => onOpen(l)}
                    className="lead-card"
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px',
                      boxShadow: 'var(--shadow-sm)', cursor: 'pointer', opacity: dragId === l.id ? 0.5 : 1,
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}
                  >
                    {/* Title + small rank dot */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span className="private-value" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.business_name || '—'}</span>
                      <button className="lead-card-del" onClick={e => { e.stopPropagation(); onDelete(l); }} title="Delete lead"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 1, flexShrink: 0 }}><Trash2 size={13} /></button>
                      <span
                        onClick={e => { e.stopPropagation(); cycleRank(); }}
                        title={`Rank: ${rk.label} — click to change`}
                        style={{ width: 11, height: 11, borderRadius: '50%', background: rk.color, flexShrink: 0, marginTop: 3, cursor: 'pointer', boxShadow: `0 0 0 3px ${rk.color}22` }}
                      />
                    </div>
                    {/* Description snippet */}
                    {desc && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{desc}</div>
                    )}
                    {/* Potential revenue — shown only when set; edited on the detail page */}
                    {(l.potential_value != null && l.potential_value !== '') && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.28)', borderRadius: 8, padding: '3px 8px', alignSelf: 'flex-start' }}>
                        <DollarSign size={12} style={{ color: '#16a34a', flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#16a34a' }}>{fmtUsd(l.potential_value)}</span>
                      </div>
                    )}
                    {/* Footer: owner + date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-3)', color: 'var(--muted)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initial}</span>
                      <span className="private-value" style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.owner_name || l.source || '—'}</span>
                      {l.created_at && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                          <Calendar size={11} /> {new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

// kind='lead'   -> stage === 'lead' (still trying to convert, hasn't paid/started)
// kind='client' -> stage !== 'lead' (paid and started with VTM)
// Same crm_clients table either way — moving a lead's stage off 'lead' is what
// "converts" it; it just disappears from the Leads list and shows up in Clients.
export default function Clients({ kind = 'client' }) {
  const isLeadView = kind === 'lead';
  const noun = isLeadView ? 'Lead' : 'Client';

  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_CLIENT);
  const [selected, setSelected] = useState(null); // client being viewed
  const [deleteTarget, setDeleteTarget] = useState(null); // client pending delete confirmation
  const [selectedIds, setSelectedIds] = useState(new Set()); // row checkboxes
  const [tempFilter, setTempFilter] = useState('all'); // leads pipeline filter
  const [view, setView] = useState('board'); // leads: 'board' (default) | 'list'
  const [searchParams, setSearchParams] = useSearchParams();

  const toggleSelectId = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());

  const load = async () => {
    setLoadError('');
    try { setClients(await getClients()); }
    catch (e) { console.error(e); setLoadError(e?.message || 'Failed to load clients'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // Reset the open detail view + selection when switching between /leads and /clients.
  useEffect(() => { setSelected(null); clearSelection(); setTempFilter('all'); setView('board'); }, [kind]);

  // Deep-link support: /clients?open=<id> (used by Dashboard links) opens a
  // specific record directly, regardless of whether it's a lead or client.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || !clients.length) return;
    const found = clients.find(c => c.id === openId);
    if (found) setSelected(found);
    searchParams.delete('open');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, clients]);

  const scoped = useMemo(() =>
    clients.filter(c => isLeadView ? c.stage === 'lead' : c.stage !== 'lead'),
    [clients, isLeadView]
  );

  const filtered = useMemo(() =>
    scoped
      .filter(c => !isLeadView || tempFilter === 'all' || (c.lead_temperature || 'warm') === tempFilter)
      .filter(c => !search ||
        (c.business_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.owner_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.industry || '').toLowerCase().includes(search.toLowerCase())),
    [scoped, search, isLeadView, tempFilter]
  );

  // Persist a temperature / rank change on a lead (optimistic).
  const patchLead = async (id, patch) => {
    setClients(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
    try { await updateClient(id, patch); } catch (e) { toast('error', e.message); }
  };
  const bulkSetTemp = async (temp) => {
    const ids = [...selectedIds];
    setClients(cs => cs.map(c => selectedIds.has(c.id) ? { ...c, lead_temperature: temp } : c));
    clearSelection();
    try { await Promise.all(ids.map(id => updateClient(id, { lead_temperature: temp }))); }
    catch (e) { toast('error', e.message); }
  };
  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !window.confirm(`Delete ${ids.length} ${noun.toLowerCase()}${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setClients(cs => cs.filter(c => !selectedIds.has(c.id)));
    clearSelection();
    try { await Promise.all(ids.map(id => deleteClient(id))); }
    catch (e) { toast('error', e.message); load(); }
  };

  const openAdd = () => { setForm({ ...EMPTY_CLIENT, stage: isLeadView ? 'lead' : 'onboarding' }); setModal('add'); };
  const handleCreate = async () => {
    if (!form.business_name.trim()) return;
    try {
      const { firstNote, ...payload } = form;
      // numeric column: '' -> null, otherwise a Number
      payload.potential_value = (payload.potential_value === '' || payload.potential_value == null)
        ? null : Number(payload.potential_value);
      const c = await createClient(payload);
      if (firstNote && firstNote.trim() && c && c.id) {
        await createClientActivity({ client_id: c.id, type: 'note', tag: 'Important', body: firstNote.trim() }).catch(() => {});
      }
      setModal(null); await load(); setSelected(c);
    } catch (e) { toast('error', e.message); }
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteClient(deleteTarget.id);
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      await load();
    } catch (e) { toast('error', e.message); }
  };

  usePageActions(() => selected ? null : (
    <button className="btn-primary" onClick={openAdd}><Plus size={15} /> New {noun}</button>
  ), [selected, noun]);

  const deleteModal = deleteTarget && (
    <Modal title={`Delete ${noun}`} onClose={() => setDeleteTarget(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
      <p style={{ color: 'var(--muted)' }}>Delete <strong style={{ color: 'var(--text)' }}>{deleteTarget.business_name}</strong> and all its platforms, tasks, and links? This cannot be undone.</p>
    </Modal>
  );

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selected) {
    const DetailComponent = (selected.stage === 'lead') ? LeadDetail : ClientDetail;
    return (
      <>
        <DetailComponent
          client={selected}
          onBack={() => { setSelected(null); load(); }}
          onDelete={() => setDeleteTarget(selected)}
          onPatch={(patch) => setSelected(s => ({ ...s, ...patch }))}
        />
        {deleteModal}
      </>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder={`Search ${isLeadView ? 'leads' : 'clients'}…`} value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        {/* Leads pipeline filter (cold / warm / hot) — list view only; the
            board's columns already are the pipeline. */}
        {isLeadView && view === 'list' && (
          <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2 }}>
            {[{ key: 'all', label: 'All', color: 'var(--text)' }, ...TEMPERATURES].map(t => {
              const count = t.key === 'all' ? scoped.length : scoped.filter(c => (c.lead_temperature || 'warm') === t.key).length;
              const on = tempFilter === t.key;
              return (
                <button key={t.key} onClick={() => setTempFilter(t.key)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)',
                  background: on ? 'var(--surface)' : 'transparent', color: on ? (t.color === 'var(--text)' ? 'var(--text)' : t.color) : 'var(--muted)',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                }}>
                  {t.label}<span style={{ fontSize: 11, color: 'var(--muted)' }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* Board / List toggle (leads only) */}
        {isLeadView && (
          <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2, marginLeft: 'auto' }}>
            {[{ key: 'board', label: 'Board' }, { key: 'list', label: 'List' }].map(v => {
              const on = view === v.key;
              return (
                <button key={v.key} onClick={() => setView(v.key)} style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)',
                  background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                }}>{v.label}</button>
              );
            })}
          </div>
        )}
      </div>

      {loadError && (
        <div style={{ margin: '12px 20px', padding: '12px 16px', background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 8, fontSize: 13, color: '#ff5c5c', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>Couldn't load clients: {loadError}</span>
          <button onClick={load} style={{ padding: '6px 14px', borderRadius: 6, background: '#ff5c5c', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {isLeadView && view === 'board' ? (
        loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60 }}>Loading…</div>
        ) : (
          <LeadsBoard
            leads={filtered}
            onOpen={setSelected}
            onTempChange={(id, t) => patchLead(id, { lead_temperature: t })}
            onRankChange={(id, r) => patchLead(id, { lead_rank: r })}
            onDelete={setDeleteTarget}
          />
        )
      ) : (
      <>
      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: 'rgba(37,99,235,0.08)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{selectedIds.size} selected</span>
          {isLeadView && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Set temperature:</span>
              {TEMPERATURES.map(t => (
                <button key={t.key} onClick={() => bulkSetTemp(t.key)} style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  color: t.color, background: `${t.color}18`, border: `1px solid ${t.color}40`,
                }}>{t.label}</button>
              ))}
            </div>
          )}
          <button onClick={bulkDelete} className="btn-ghost" style={{ padding: '5px 12px', color: '#ff5c5c', borderColor: '#ff5c5c55' }}><Trash2 size={13} /> Delete</button>
          <button onClick={clearSelection} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      <div className="table-container desktop-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input type="checkbox"
                  checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
                  onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(c => c.id)) : new Set())}
                  style={{ cursor: 'pointer', accentColor: 'var(--orange)' }} />
              </th>
              <th style={{ minWidth: 220 }}>Business</th>
              <th style={{ minWidth: 160 }}>Owner</th>
              {isLeadView
                ? <><th style={{ minWidth: 110 }}>Temperature</th><th style={{ minWidth: 100 }}>Rank</th></>
                : <th style={{ minWidth: 150 }}>Stage</th>}
              <th style={{ minWidth: 130 }}>Source</th>
              <th style={{ minWidth: 150 }}>Type</th>
              <th style={{ minWidth: 120 }}>Added</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No {isLeadView ? 'leads' : 'clients'} yet.</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer', background: selectedIds.has(c.id) ? 'rgba(37,99,235,0.06)' : undefined }} onClick={() => setSelected(c)}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelectId(c.id)} style={{ cursor: 'pointer', accentColor: 'var(--orange)' }} />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      {c.logo_url ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={15} style={{ color: 'var(--muted)' }} />}
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.business_name || '—'}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--muted)' }}>{c.owner_name || '—'}</td>
                {isLeadView ? (
                  <>
                    <td onClick={e => e.stopPropagation()}><PillSelect value={c.lead_temperature || 'warm'} options={TEMPERATURES} onChange={v => patchLead(c.id, { lead_temperature: v })} /></td>
                    <td onClick={e => e.stopPropagation()}><PillSelect value={c.lead_rank || 'medium'} options={RANKS} onChange={v => patchLead(c.id, { lead_rank: v })} /></td>
                  </>
                ) : (
                  <td><StageBadge stage={c.stage} /></td>
                )}
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.source || '—'}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{(c.client_type || []).join(', ') || '—'}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                <td onClick={e => e.stopPropagation()}>
                  <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => setDeleteTarget(c)} title={`Delete ${noun.toLowerCase()}`}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mobile-cards">
        {!loading && filtered.map(c => (
          <div key={c.id} className="mobile-card" onClick={() => setSelected(c)} style={{ cursor: 'pointer', position: 'relative', border: selectedIds.has(c.id) ? '1px solid var(--orange)' : undefined }}>
            <div className="mobile-card-row primary" style={{ gap: 8 }}>
              <input type="checkbox" checked={selectedIds.has(c.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelectId(c.id)} style={{ accentColor: 'var(--orange)' }} />
              <Building2 size={14} style={{ color: 'var(--orange)' }} />
              <span>{c.business_name || '—'}</span>
            </div>
            {isLeadView ? (
              <div className="mobile-card-row" style={{ gap: 8 }} onClick={e => e.stopPropagation()}>
                <PillSelect value={c.lead_temperature || 'warm'} options={TEMPERATURES} onChange={v => patchLead(c.id, { lead_temperature: v })} />
                <PillSelect value={c.lead_rank || 'medium'} options={RANKS} onChange={v => patchLead(c.id, { lead_rank: v })} />
              </div>
            ) : (
              <div className="mobile-card-row"><StageBadge stage={c.stage} /></div>
            )}
            {c.owner_name && <div className="mobile-card-row">{c.owner_name}</div>}
            <button
              className="btn-ghost"
              style={{ position: 'absolute', top: 10, right: 10, padding: '5px 7px', color: '#ff5c5c' }}
              onClick={e => { e.stopPropagation(); setDeleteTarget(c); }}
              title={`Delete ${noun.toLowerCase()}`}
            ><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      </>
      )}

      {deleteModal}

      {modal === 'add' && (
        <Modal title="New Lead / Client" onClose={() => setModal(null)} onSubmit={handleCreate} submitLabel="Create">
          <div className="form-group">
            <label className="form-label">Business Name *</label>
            <input className="form-input" value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} placeholder="e.g. Harbor & Vine" required autoFocus />
          </div>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Contact Name</label>
              <input className="form-input" value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Jane Doe" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="tel" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="(000) 000-0000" />
            </div>
          </div>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="you@business.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Source</label>
              <select className="form-input" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {isLeadView && (
            <>
              <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Temperature</label>
                  <select className="form-input" value={form.lead_temperature} onChange={e => setForm(f => ({ ...f, lead_temperature: e.target.value }))}>
                    {TEMPERATURES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Rank</label>
                  <select className="form-input" value={form.lead_rank} onChange={e => setForm(f => ({ ...f, lead_rank: e.target.value }))}>
                    {RANKS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Potential revenue ($)</label>
                <input className="form-input" type="number" min="0" step="100" value={form.potential_value ?? ''}
                  onChange={e => setForm(f => ({ ...f, potential_value: e.target.value }))} placeholder="e.g. 5000" />
              </div>
            </>
          )}
          <div className="form-group">
            <label className="form-label">Interested in</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CLIENT_TYPES.map(t => {
                const on = (form.client_type || []).includes(t);
                return (
                  <button type="button" key={t} onClick={() => setForm(f => ({ ...f, client_type: on ? f.client_type.filter(x => x !== t) : [...(f.client_type || []), t] }))}
                    style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: on ? '1.5px solid var(--orange)' : '1.5px solid var(--border)', background: on ? 'rgba(37,99,235,0.12)' : 'var(--surface)', color: on ? 'var(--orange)' : 'var(--text)' }}>{t}</button>
                );
              })}
            </div>
          </div>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Stage</label>
              <select className="form-input" value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Industry</label>
              <input className="form-input" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="Restaurant" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">First note (what you learned)</label>
            <textarea className="form-input" rows={3} value={form.firstNote} onChange={e => setForm(f => ({ ...f, firstNote: e.target.value }))} placeholder="Met at the restaurant — wants a site with online ordering, follow up Friday…" style={{ resize: 'vertical' }} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Client detail ──────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',  label: 'Overview',   icon: Building2 },
  { key: 'activity',  label: 'Activity',   icon: Activity },
  { key: 'deals',     label: 'Deals',      icon: DollarSign },
  { key: 'agreement', label: 'Agreement',  icon: FileSignature },
  { key: 'vault',     label: 'Vault',      icon: Lock },
  { key: 'access',    label: 'Platforms & Access', icon: KeyRound },
  { key: 'tasks',     label: 'Onboarding Tasks',   icon: ListChecks },
  { key: 'projects',  label: 'Projects',   icon: Briefcase },
];

function ClientDetail({ client, onBack, onDelete, onPatch, children }) {
  const [tab, setTab] = useState('overview');

  const saveField = async (field, value) => {
    onPatch({ [field]: value });
    try { await updateClient(client.id, { [field]: value }); }
    catch (e) { toast('error', e.message); }
  };

  const stage = stageOf(client.stage);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '7px 9px', flexShrink: 0 }}><ArrowLeft size={16} /></button>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {client.logo_url ? <img src={client.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={20} style={{ color: 'var(--muted)' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>{client.business_name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{client.owner_name || 'No owner set'}</span>
            {(client.client_type || []).map(t => (
              <span key={t} style={{ fontSize: 10, fontWeight: 700, color: 'var(--orange)', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 999, padding: '1px 8px' }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <select
            className="form-input"
            style={{ width: 'auto', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: stage.color, background: `${stage.color}14`, border: `1px solid ${stage.color}40`, borderRadius: 999 }}
            value={client.stage || 'lead'}
            onChange={e => saveField('stage', e.target.value)}
          >
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn-ghost" style={{ padding: '7px 9px', color: '#ff5c5c' }} onClick={onDelete} title="Delete client"><Trash2 size={15} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '11px 14px', background: 'none', border: 'none',
            borderBottom: tab === t.key ? '2px solid var(--orange)' : '2px solid transparent', cursor: 'pointer',
            color: tab === t.key ? 'var(--text)' : 'var(--muted)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)',
          }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 28 }}>
        {tab === 'overview'  && <OverviewTab client={client} saveField={saveField} />}
        {tab === 'activity'  && <ActivityTab clientId={client.id} />}
        {tab === 'deals'     && <DealsTab client={client} />}
        {tab === 'agreement' && <AgreementTab client={client} />}
        {tab === 'vault'     && <VaultTab clientId={client.id} />}
        {tab === 'access'    && <AccessTab clientId={client.id} />}
        {tab === 'tasks'     && <TasksTab clientId={client.id} />}
        {tab === 'projects'  && <ProjectsTab client={client} />}
      </div>
      {children}
    </div>
  );
}

// ── Lead one-page view (business details + activity timeline) ───────────────
const ACT_CATS = [
  { key: 'Call',    color: '#2563eb', icon: Phone },
  { key: 'Meeting', color: '#7c3aed', icon: Calendar },
  { key: 'Update',  color: '#16a34a', icon: StickyNote },
  { key: 'Idea',    color: '#d97706', icon: Flag },
];
const catOf = (k) => ACT_CATS.find(c => c.key === k);
const isSummary = (a) => a.tag === 'Summary' || (a.body || '').startsWith('📝');
const actDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const LEAD_STEPS = [
  { key: 'overview',  label: 'Overview',           blurb: 'Business details, activity, and AI summaries.' },
  { key: 'terms',     label: 'Terms',              blurb: 'Review and edit the agreement terms, then approve.' },
  { key: 'deals',     label: 'Deals & Projects',   blurb: 'Create the deal and projects with pricing.' },
  { key: 'agreement', label: 'Agreement',          blurb: 'Preview the agreement and approve it.' },
  { key: 'payment',   label: 'Payment',            blurb: 'Choose which payment plans to offer the client in their portal.' },
  { key: 'access',    label: 'Platforms & Access', blurb: 'A task list of the tools you need access to, with instructions.' },
  { key: 'proposal',  label: 'Proposal',           blurb: 'Draft the cover email to the client, with their portal link.' },
  { key: 'send',      label: 'Send',               blurb: 'Send the agreement to sign and the proposal email, then track it.' },
];

// In custom-payment-plan mode the client picks a plan (and signs) in their
// portal, so the admin pipeline skips the fixed Agreement + Payment steps.
function stepsFor(mode) {
  return mode === 'custom' ? LEAD_STEPS.filter(s => s.key !== 'agreement' && s.key !== 'payment') : LEAD_STEPS;
}

// Register a step's primary action into the pipeline's sticky footer button, so
// approving the step and advancing are one click. onClick is kept in a ref so the
// footer object stays stable (only re-set when label/disabled/busy change).
function useStepFooter(setFooter, { label, disabled, busy, onClick }) {
  const ref = useRef(onClick);
  ref.current = onClick;
  useEffect(() => {
    setFooter({ label, disabled: !!disabled, busy: !!busy, onClick: () => ref.current && ref.current() });
    return () => setFooter(null);
  }, [label, disabled, busy, setFooter]);
}

// Lightweight markdown → styled document HTML (headings, bold, bullets, rules).
function mdToDocHtml(md) {
  if (!md) return '';
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\b_(.+?)_\b/g, '<em>$1</em>');
  const lines = md.split('\n');
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    if (/^(---|___|\*\*\*)\s*$/.test(line.trim())) { closeList(); html += '<div style="height:1px;background:var(--border);margin:16px 0"></div>'; continue; }
    if (/^#{1,6}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      const txt = inline(line.replace(/^#+\s*/, ''));
      const size = level === 1 ? 20 : level === 2 ? 15 : 13.5;
      html += `<div style="font-weight:800;font-size:${size}px;margin:${level <= 2 ? '18px 0 8px' : '12px 0 4px'};color:var(--text);font-family:var(--font-display)">${txt}</div>`;
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) { html += '<ul style="margin:4px 0;padding-left:20px">'; inList = true; }
      html += `<li style="margin:4px 0;line-height:1.6">${inline(line.replace(/^[-*]\s+/, ''))}</li>`;
    } else {
      closeList();
      html += `<p style="margin:7px 0;line-height:1.65">${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

// Step 1 — Terms: structure the agreement. Two modes:
//  • Fixed — AI drafts the real contract from the notes; Ray edits/approves it.
//  • Custom payment plan — Ray sets the deal value + which plans to offer; the
//    client picks one (and signs) in their portal, so no fixed contract here.
function TermsStep({ client, savedDraft, onApprove, setFooter, paymentMode, setPaymentMode }) {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [terms, setTerms] = useState('');
  const [changes, setChanges] = useState('');
  const [draft, setDraft] = useState(savedDraft || null);
  const [docTab, setDocTab] = useState('agreement');
  const [busy, setBusy] = useState('');
  // Custom-plan state
  const allow = paymentMode === 'custom';
  const [total, setTotal] = useState('');
  const [maint, setMaint] = useState(''); // monthly maintenance ($)
  const [offered, setOffered] = useState(null); // { planKey: bool }

  useEffect(() => {
    (async () => {
      try {
        const d = await getAgreements(client.id);
        const ag = (d.agreements || [])[0];
        if (ag) {
          if (ag.payment_mode === 'custom') {
            setPaymentMode('custom');
            if (ag.total_amount) setTotal(String(ag.total_amount));
            if (ag.terms?.maintenance) setMaint(String(ag.terms.maintenance));
            if (Array.isArray(ag.plan_options) && ag.plan_options.length) {
              setOffered(Object.fromEntries(computePlans(ag.total_amount).map(p => [p.key, ag.plan_options.some(o => o.key === p.key)])));
            }
          } else if (!savedDraft && ag.terms) {
            setDraft({
              total: ag.total_amount,
              installments: (d.payments || []).filter(p => p.kind !== 'recurring').map(p => ({ amount: p.amount, trigger: p.due_condition })),
              monthly: (d.payments || []).filter(p => p.kind === 'recurring').map(p => ({ amount: p.amount, item: p.description || 'Recurring' })),
              agreement_markdown: ag.terms.agreement_markdown,
              nda_markdown: ag.terms.nda_markdown,
            });
          }
        }
      } catch (e) { /* no agreement yet — fine */ }
      finally { setLoading(false); }
    })();
  }, [client.id]);

  // Default all plans "on" once a value is present in custom mode.
  useEffect(() => {
    if (allow && Number(total) > 0 && !offered) {
      setOffered(Object.fromEntries(computePlans(Number(total)).map(p => [p.key, true])));
    }
  }, [allow, total]);

  const runAnalyze = async () => {
    setBusy('analyze');
    try {
      const a = await analyzeDeal(client.id);
      setAnalysis(a);
      if (a.suggested_total && !total) setTotal(String(a.suggested_total));
      if (Array.isArray(a.suggested_monthly) && a.suggested_monthly[0] && !maint) setMaint(String(a.suggested_monthly[0].amount || ''));
      const seed = (a.suggested_installments || []).map(i => `- ${money(i.amount)} ${i.trigger ? '(' + i.trigger + ')' : ''}`).join('\n');
      const monthly = (a.suggested_monthly || []).map(m => `- ${money(m.amount)}/mo ${m.item}`).join('\n');
      setTerms(`${a.suggested_structure || ''}\n\nInstallments:\n${seed}${monthly ? '\n\nMonthly:\n' + monthly : ''}`.trim());
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const runGenerate = async (withChanges) => {
    setBusy('generate');
    try {
      let d;
      if (withChanges && draft && changes.trim()) {
        d = await generateAgreement(client.id, changes.trim(), {
          agreement_markdown: draft.agreement_markdown, nda_markdown: draft.nda_markdown,
          total: draft.total, installments: draft.installments, monthly: draft.monthly,
        });
      } else {
        if (!terms.trim()) { toast('error', 'Add some terms first (or run Analyze).'); setBusy(''); return; }
        d = await generateAgreement(client.id, terms);
      }
      setDraft(d);
      if (withChanges && changes.trim()) setChanges('');
      setDocTab('agreement');
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const approveFixed = () => { onApprove(draft); toast('success', 'Terms approved — on to Deals & Projects.'); };
  const approveCustom = async () => {
    setBusy('approve');
    try {
      const plans = computePlans(Number(total)).filter(p => offered?.[p.key]);
      // Generate the base agreement + NDA now (with a payment-schedule placeholder);
      // the client's plan choice fills in the concrete schedule at signing.
      let doc = {};
      try { doc = await generateAgreement(client.id, `Build value $${Number(total)}. The client selects a custom payment plan in their portal.`, null, 'custom'); }
      catch (e) { /* still save the plan options; doc can be regenerated */ }
      await setupCustomAgreement(client.id, { total: Number(total), maintenance: Number(maint) || 0, plan_options: plans, agreement_markdown: doc.agreement_markdown || null, nda_markdown: doc.nda_markdown || null });
      onApprove({ total: Number(total), custom: true });
      toast('success', 'Payment-plan options saved — the client picks one in their portal.');
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const offeredCount = offered ? Object.values(offered).filter(Boolean).length : 0;
  const canApprove = allow ? (Number(total) > 0 && offeredCount > 0) : !!draft;
  useStepFooter(setFooter, {
    label: busy === 'approve' ? 'Approving…' : 'Approve',
    disabled: !canApprove || busy === 'approve',
    busy: busy === 'approve',
    onClick: allow ? approveCustom : approveFixed,
  });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading terms…</div>;

  const plans = allow && Number(total) > 0 ? computePlans(Number(total)) : [];

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Structure the terms</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Priced from this client's notes. Choose whether to let them pick a payment plan, then approve.</div>
      </div>

      {/* Payment-plan toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 16, background: allow ? 'rgba(37,99,235,0.06)' : 'var(--surface)', border: `1px solid ${allow ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 10 }}>
        <button onClick={() => setPaymentMode(allow ? 'fixed' : 'custom')} title="Toggle payment-plan mode"
          style={{ width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', background: allow ? 'var(--orange)' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
          <span style={{ position: 'absolute', top: 2, left: allow ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Allow the client to choose a payment plan</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{allow ? 'They pick from the plans you offer, then sign in their portal. Agreement + Stripe steps move to the portal.' : 'Off — you set a fixed contract here, review it, and send it to sign.'}</div>
        </div>
      </div>

      {allow ? (
        /* ── Custom payment-plan mode ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '200px 200px minmax(0,1fr)', gap: 16, alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Build value ($)</label>
              <input className="form-input" type="number" min="0" step="100" value={total} onChange={e => { setTotal(e.target.value); setOffered(null); }} placeholder="e.g. 5000" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Maintenance ($/mo)</label>
              <input className="form-input" type="number" min="0" step="10" value={maint} onChange={e => setMaint(e.target.value)} placeholder="e.g. 199" />
            </div>
            <button className="btn-ghost" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 7 }} disabled={busy === 'analyze'} onClick={runAnalyze}>
              {busy === 'analyze' ? <><Spinner /> Estimating…</> : <><Sparkles size={14} /> Estimate from notes</>}
            </button>
          </div>
          {Number(maint) > 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -6 }}>{money(Number(maint))}/mo maintenance applies to every plan, starting the month after the last plan payment.</div>}

          {plans.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Plans to offer the client</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plans.map(p => {
                  const on = !!offered?.[p.key];
                  return (
                    <div key={p.key} onClick={() => setOffered(o => ({ ...o, [p.key]: !o?.[p.key] }))}
                      style={{ cursor: 'pointer', background: 'var(--surface)', border: `1px solid ${on ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {on ? <CheckCircle2 size={18} style={{ color: 'var(--orange)' }} /> : <Circle size={18} style={{ color: 'var(--muted)' }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{p.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{p.summary}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>{money(p.deposit)} <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: 12 }}>today</span></div>
                          {p.installments.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>then {p.installments.length === 1 ? money(p.installments[0].amount) : `${p.installments.length} × ${money(p.installments[0].amount)}`}</div>}
                        </div>
                      </div>
                      {p.finance_charge ? <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, paddingLeft: 28 }}>Includes {money(p.finance_charge)} financing · total {money(p.grand_total)}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>Set the build value above (or estimate it) to see the plans you can offer.</div>
          )}
        </div>
      ) : (
        /* ── Fixed contract mode ── */
        <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: draft ? 'minmax(0,1fr) 340px' : '1fr', gap: 20, alignItems: 'start' }}>
          <div>
            {draft ? (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Proposed agreement · total {money(draft.total)}</div>
                  {draft.nda_markdown && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-ghost" style={{ padding: '5px 12px', fontWeight: docTab === 'agreement' ? 800 : 500 }} onClick={() => setDocTab('agreement')}>Agreement</button>
                      <button className="btn-ghost" style={{ padding: '5px 12px', fontWeight: docTab === 'nda' ? 800 : 500 }} onClick={() => setDocTab('nda')}>NDA</button>
                    </div>
                  )}
                </div>
                <div style={{ padding: '14px 24px 24px', color: 'var(--text)', fontSize: 13, maxHeight: 560, overflow: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: mdToDocHtml(docTab === 'nda' ? draft.nda_markdown : draft.agreement_markdown) }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {!analysis && (
                  <button className="btn-primary" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7 }} disabled={busy === 'analyze'} onClick={runAnalyze}>
                    {busy === 'analyze' ? <><Spinner /> Analyzing…</> : <><Sparkles size={15} /> Analyze deal with AI</>}
                  </button>
                )}
                {(analysis?.flags || []).length > 0 && (
                  <div style={{ padding: '14px 16px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>Worth a look before you price it</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 13, lineHeight: 1.7 }}>
                      {analysis.flags.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Billing terms</label>
                  <textarea className="form-input" rows={8} value={terms} onChange={e => setTerms(e.target.value)} placeholder="e.g. $1,000 up front to start, then $800/mo for 5 months. $199/mo maintenance begins month 7." style={{ resize: 'vertical' }} />
                </div>
                <button className="btn-primary" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7 }} disabled={busy === 'generate'} onClick={() => runGenerate(false)}>
                  {busy === 'generate' ? <><Spinner /> Drafting…</> : <><FileSignature size={15} /> Generate terms</>}
                </button>
              </div>
            )}
          </div>

          {draft && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Request changes</label>
                <textarea className="form-input" rows={5} value={changes} onChange={e => setChanges(e.target.value)} placeholder="e.g. Add a $500 rush fee. Change maintenance to $249/mo. Include a 2-week revision window." style={{ resize: 'vertical' }} />
              </div>
              <button className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} disabled={busy === 'generate'} onClick={() => runGenerate(true)}>
                {busy === 'generate' ? <><Spinner /> Regenerating…</> : 'Regenerate'}
              </button>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>Approve (bottom-right) locks these terms. The agreement is previewed and created at the Agreement step.</div>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setDraft(null); setAnalysis(null); }}>Start terms over</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Step 2 — Deals & Projects: turn the approved terms into a billable deal +
// project line items (one-time and monthly), so invoicing/Stripe can bill them.
function DealsStep({ client, termsDraft, savedDealId, onCreated, setFooter }) {
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState(null); // an existing deal for this client, if any
  const [name, setName] = useState(`${client.business_name || 'Client'} — Service Agreement`);
  const [items, setItems] = useState([]);
  const [seeding, setSeeding] = useState(false); // AI building the line items
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const deals = await getDeals(client.id);
        if (deals && deals.length) setDeal(deals[0]);
      } catch (e) { /* none yet */ }
      finally { setLoading(false); }
    })();
  }, [client.id]);

  // The crude fallback: one build line (sum of installments) + a maintenance line.
  const fallbackSeed = () => {
    const seed = [];
    const buildTotal = Array.isArray(termsDraft?.installments)
      ? termsDraft.installments.reduce((s, i) => s + Number(i.amount || 0), 0)
      : (termsDraft?.total || 0);
    if (buildTotal > 0) seed.push({ name: 'Custom CRM Build', scope: '', value: buildTotal, recurring: 0 });
    const maint = Array.isArray(termsDraft?.monthly) ? termsDraft.monthly[0] : null;
    if (maint?.amount) seed.push({ name: maint.item || 'Maintenance & Support', scope: '', value: 0, recurring: Number(maint.amount) });
    return seed.length ? seed : [{ name: '', scope: '', value: 0, recurring: 0 }];
  };

  // Auto-fill the line items from the agreement (AI) once the builder is showing
  // (no deal, or an existing deal that has no projects yet). Ray just reviews.
  useEffect(() => {
    if (loading || items.length || seeded) return;
    if (deal && (deal.projects || []).length > 0) return;
    if (deal?.name) setName(deal.name);
    setSeeded(true);
    setSeeding(true);
    (async () => {
      try {
        const r = await suggestProjects(client.id);
        const ps = (r.projects || []).filter(p => p.name).map(p => ({
          name: p.name, scope: p.scope || '', value: Number(p.value) || 0, recurring: Number(p.recurring) || 0,
        }));
        setItems(ps.length ? ps : fallbackSeed());
      } catch (e) {
        setItems(fallbackSeed());
      } finally { setSeeding(false); }
    })();
  }, [loading, deal]);

  const setItem = (idx, patch) => setItems(xs => xs.map((x, i) => i === idx ? { ...x, ...patch } : x));
  const addItem = () => setItems(xs => [...xs, { name: '', scope: '', value: 0, recurring: 0 }]);
  const removeItem = (idx) => setItems(xs => xs.filter((_, i) => i !== idx));

  const oneTimeTotal = items.reduce((s, i) => s + Number(i.value || 0), 0);
  const monthlyTotal = items.reduce((s, i) => s + Number(i.recurring || 0), 0);

  const billingType = (it) => (Number(it.value) > 0 && Number(it.recurring) > 0) ? 'both' : (Number(it.recurring) > 0 ? 'monthly' : 'one_time');

  const create = async () => {
    const valid = items.filter(i => i.name.trim() && (Number(i.value) > 0 || Number(i.recurring) > 0));
    if (!valid.length) { toast('error', 'Add at least one project line with a name and an amount.'); return; }
    setBusy(true);
    try {
      // Reuse an existing (empty) deal if there is one; otherwise create it.
      const dealId = deal?.id || (await createDeal({ client_id: client.id, name: name.trim() })).id;
      const created = [];
      for (const it of valid) {
        const p = await createProject({
          client_id: client.id, deal_id: dealId, name: it.name.trim(), scope: (it.scope || '').trim() || null,
          value: Number(it.value) || 0, recurring_amount: Number(it.recurring) || 0,
          billing_type: billingType(it), plan_status: 'none', status: 'active',
        });
        created.push(Array.isArray(p) ? p[0] : p);
      }
      // Attach the new projects to the deal (and sync the name if it changed).
      const ids = created.map(p => p?.id).filter(Boolean);
      if (ids.length) await updateDeal(dealId, { project_ids: ids, ...(deal && name.trim() && name.trim() !== deal.name ? { name: name.trim() } : {}) }).catch(() => {});
      toast('success', deal ? 'Projects added to the deal.' : 'Deal & projects created.');
      onCreated(dealId);
    } catch (e) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const hasProjects = deal && (deal.projects || []).length > 0;
  useStepFooter(setFooter, hasProjects
    ? { label: 'Continue', onClick: () => onCreated(deal.id) }
    : { label: deal ? 'Add projects to deal' : 'Create deal & projects', disabled: loading || busy || seeding, busy, onClick: create });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;

  // Already has projects — show it read-only and let Ray continue.
  if (hasProjects) {
    const ps = deal.projects || [];
    return (
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Deal &amp; projects</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>A deal already exists for this client. Review it below, then continue.</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Briefcase size={16} style={{ color: 'var(--orange)' }} />
            <span style={{ fontWeight: 800, color: 'var(--text)', flex: 1 }}>{deal.name}</span>
          </div>
          {ps.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No projects on this deal yet.</div>}
          {ps.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ flex: 1, color: 'var(--text)', fontSize: 13.5 }}>{p.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{p.billing_type !== 'monthly' && p.value ? money(p.value) : ''}{p.recurring_amount ? ` · ${money(p.recurring_amount)}/mo` : ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>{deal ? 'Add projects to the deal' : 'Create the deal & projects'}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        {deal ? 'These line items were built from the agreement and attach to the existing deal. Review and adjust, then save.' : 'These line items were built from the agreement. Review and adjust, then create the deal.'}
      </div>

      <div className="form-group">
        <label className="form-label">Deal name</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project line items</span>
        {seeding && <span style={{ fontSize: 11.5, color: 'var(--orange)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner /> Building from the agreement…</span>}
      </div>

      {seeding ? (
        <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Spinner /> Reading the agreement and drafting the line items…</div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, idx) => (
          <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 120px 32px', gap: 8, alignItems: 'center' }}>
              <input className="form-input" placeholder="Project name" value={it.name} onChange={e => setItem(idx, { name: e.target.value })} />
              <input className="form-input" type="number" min="0" step="100" placeholder="One-time $" value={it.value || ''} onChange={e => setItem(idx, { value: e.target.value })} />
              <input className="form-input" type="number" min="0" step="10" placeholder="$/mo" value={it.recurring || ''} onChange={e => setItem(idx, { recurring: e.target.value })} />
              <button className="btn-ghost" style={{ padding: '7px 8px', color: '#ff5c5c' }} onClick={() => removeItem(idx)} title="Remove"><X size={14} /></button>
            </div>
            <textarea className="form-input" rows={2} placeholder="Scope / what's included" value={it.scope || ''} onChange={e => setItem(idx, { scope: e.target.value })} style={{ marginTop: 8, resize: 'vertical', fontSize: 12.5 }} />
          </div>
        ))}
      </div>
      )}
      <button className="btn-ghost" style={{ marginTop: 8 }} onClick={addItem}><Plus size={14} /> Add line item</button>

      <div style={{ display: 'flex', gap: 20, margin: '18px 0', fontSize: 13, color: 'var(--text)' }}>
        <div><span style={{ color: 'var(--muted)' }}>One-time total: </span><strong>{money(oneTimeTotal)}</strong></div>
        {monthlyTotal > 0 && <div><span style={{ color: 'var(--muted)' }}>Recurring: </span><strong>{money(monthlyTotal)}/mo</strong></div>}
      </div>
    </div>
  );
}

// Step 3 — Agreement: persist the approved terms into a real agreement doc,
// preview it exactly as the client will see it (gate), then approve to lock.
function AgreementStep({ client, termsDraft, onApproved, setFooter }) {
  const [loading, setLoading] = useState(true);
  const [ag, setAg] = useState(null);       // persisted agreement row (or {id})
  const [previewed, setPreviewed] = useState(false);
  const [docTab, setDocTab] = useState('agreement');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await getAgreements(client.id);
        if (d.agreements && d.agreements.length) { setAg(d.agreements[0]); }
      } catch (e) { /* none yet */ }
      finally { setLoading(false); }
    })();
  }, [client.id]);

  // The document we render: the saved agreement's terms if it actually has a
  // document, otherwise the fresh terms draft (a stale/custom placeholder row
  // has empty terms and should not blank out the preview).
  const agHasDoc = !!ag?.terms?.agreement_markdown;
  const doc = agHasDoc ? ag.terms : (termsDraft || ag?.terms || {});

  const ensureAgreement = async () => {
    if (ag?.id && agHasDoc) return ag;
    if (!termsDraft?.agreement_markdown) { toast('error', 'Approve the terms first (Terms step).'); return null; }
    const r = await approveAgreement(client.id, termsDraft);
    const d = await getAgreements(client.id);
    const row = (d.agreements || []).find(x => x.id === r.agreement_id) || (d.agreements || [])[0];
    setAg(row);
    return row;
  };

  const onPreview = async () => {
    // Open the tab synchronously (in the click gesture) so the browser doesn't
    // block the popup after our awaits and hijack the current CRM tab.
    const w = window.open('', '_blank');
    setBusy('preview');
    try {
      const row = await ensureAgreement();
      if (!row) { if (w) w.close(); return; }
      const { token } = await previewAgreementToken(row.id);
      const url = `/sign?token=${token}&preview=1`;
      if (w) w.location.href = url; else window.open(url, '_blank');
      setPreviewed(true);
    } catch (e) { if (w) w.close(); toast('error', e.message); }
    finally { setBusy(''); }
  };

  const onApprove = async () => {
    setBusy('approve');
    try {
      const row = await ensureAgreement();
      if (!row) return;
      toast('success', 'Agreement approved.');
      onApproved(row.id);
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const alreadyApproved = ag && (ag.status === 'approved' || ag.status === 'sent' || ag.status === 'signed');
  const canApprove = previewed || alreadyApproved;
  useStepFooter(setFooter, {
    label: busy === 'approve' ? 'Approving…' : 'Approve',
    disabled: loading || (!termsDraft && !ag) || !canApprove || busy === 'approve',
    busy: busy === 'approve',
    onClick: onApprove,
  });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;

  if (!termsDraft && !ag) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', color: 'var(--muted)' }}>
        <FileSignature size={28} style={{ opacity: 0.4 }} />
        <div style={{ marginTop: 12, fontSize: 14 }}>Approve the terms first — head back to the <strong>Terms</strong> step.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Review the agreement</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>This is the document {client.business_name || 'the client'} will sign. Preview it in the signing view, then approve.</div>
        </div>
        {alreadyApproved && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#16a34a', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', padding: '4px 12px', borderRadius: 999, textTransform: 'capitalize' }}>{ag.status}</span>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Service Agreement · total {money(doc.total || ag?.total_amount)}</div>
          {doc.nda_markdown && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn-ghost" style={{ padding: '5px 12px', fontWeight: docTab === 'agreement' ? 800 : 500 }} onClick={() => setDocTab('agreement')}>Agreement</button>
              <button className="btn-ghost" style={{ padding: '5px 12px', fontWeight: docTab === 'nda' ? 800 : 500 }} onClick={() => setDocTab('nda')}>NDA</button>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px 24px', color: 'var(--text)', fontSize: 13, maxHeight: 540, overflow: 'auto' }}
          dangerouslySetInnerHTML={{ __html: mdToDocHtml(docTab === 'nda' ? doc.nda_markdown : doc.agreement_markdown) }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn-ghost" disabled={busy === 'preview'} onClick={onPreview}>
          <Eye size={15} /> {busy === 'preview' ? 'Opening…' : previewed ? 'Preview again' : 'Preview in signing view'}
        </button>
        {!canApprove && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Preview the signing view to unlock Approve (bottom-right).</span>}
      </div>
    </div>
  );
}

// Compute the standard VTM payment-plan menu from a build total. The client
// picks one in their portal; the chosen plan's deposit + installments drive the
// agreement schedule and Stripe. (Maintenance is separate and unaffected.)
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function computePlans(total, financePct = 10) {
  total = Number(total) || 0;
  if (!total) return [];
  const dep20 = round2(total * 0.2);
  const fin = round2(total - dep20);               // 80% financed portion
  const m3 = round2(fin / 3);
  const inst3 = [m3, m3, round2(fin - m3 * 2)].map((a, i) => ({ label: `Month ${i + 1}`, amount: a, trigger: `Month ${i + 1}` }));
  const fin6 = round2(fin * (1 + financePct / 100));
  const m6 = round2(fin6 / 6);
  const inst6 = Array.from({ length: 6 }, (_, i) => (i < 5 ? m6 : round2(fin6 - m6 * 5))).map((a, i) => ({ label: `Month ${i + 1}`, amount: a, trigger: `Month ${i + 1}` }));
  const half = round2(total * 0.5);
  return [
    { key: 'full', label: 'Pay in full', summary: '100% today', deposit: total, installments: [], grand_total: total },
    { key: '50_50', label: '50% now, 50% on completion', summary: 'Half today, half on delivery', deposit: half, installments: [{ label: '50% on completion', amount: round2(total - half), trigger: 'On completion' }], grand_total: total },
    { key: '20_3', label: '20% down + 3 months', summary: '20% today, remainder over 3 monthly payments', deposit: dep20, installments: inst3, grand_total: total },
    { key: '20_6', label: '20% down + 6 months', summary: `20% today, remainder + ${financePct}% financing over 6 monthly payments`, deposit: dep20, installments: inst6, grand_total: round2(dep20 + fin6), finance_charge: round2(fin6 - fin) },
  ];
}

// Step 5 — Payment: choose which of the standard plans to offer this client.
// Step (fixed mode only) — Payment: confirm the fixed billing schedule that
// auto-sets-up on signing. (Custom-plan clients skip this — they pick in portal.)
function PaymentStep({ client, onDone, setFooter }) {
  const [loading, setLoading] = useState(true);
  const [ag, setAg] = useState(null);

  useEffect(() => {
    (async () => {
      try { const d = await getAgreements(client.id); setAg((d.agreements || [])[0] || null); }
      catch (e) { toast('error', e.message); }
      finally { setLoading(false); }
    })();
  }, [client.id]);

  useStepFooter(setFooter, { label: 'Confirm plan', disabled: loading || !ag, onClick: onDone });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;
  if (!ag) return (
    <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', color: 'var(--muted)' }}>
      <DollarSign size={28} style={{ opacity: 0.4 }} />
      <div style={{ marginTop: 12, fontSize: 14 }}>Approve the agreement first — go to the <strong>Agreement</strong> step.</div>
    </div>
  );

  const terms = ag.terms || {};
  const installments = Array.isArray(terms.installments) ? terms.installments : [];
  const monthly = Array.isArray(terms.monthly) ? terms.monthly : [];
  const deposit = installments[0];
  const buildRest = installments.slice(1);
  const maint = monthly[0];

  const Line = ({ label, value, sub }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Billing plan</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>This is what Stripe sets up automatically the moment {client.business_name || 'the client'} signs. Nothing is charged until then.</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 18px 14px' }}>
        {deposit && <Line label="Deposit — charged at signing" sub="Stripe Checkout on the card the client enters" value={money(deposit.amount)} />}
        {buildRest.length > 0 && (
          <Line label={`Build installments — ${buildRest.length} × ${money(buildRest[0].amount)}`} sub="Auto-charged monthly on the same card, starting the month after the deposit" value={money(buildRest.reduce((s, i) => s + Number(i.amount || 0), 0))} />
        )}
        {maint?.amount && <Line label={maint.item || 'Maintenance & Support'} sub="Recurring subscription, begins right after the build" value={`${money(maint.amount)}/mo`} />}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 0 2px', borderTop: '2px solid var(--border)', marginTop: 4 }}>
          <div style={{ flex: 1, color: 'var(--text)', fontSize: 13.5, fontWeight: 800 }}>Build total</div>
          <div style={{ color: 'var(--text)', fontSize: 15, fontWeight: 800 }}>{money(ag.total_amount)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '12px 14px', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 10 }}>
        <ShieldCheck size={16} style={{ color: 'var(--orange)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55 }}>
          On signing, VTM charges the deposit via Stripe Checkout and sets the recurring plan up on that same card automatically. No separate invoice needed — it's wired into the signature.
        </div>
      </div>
    </div>
  );
}

// Step 5 — Platforms & Access: a checklist of tools the client must grant VTM
// access to, each with copy-ready instructions. Persisted as client tasks.
const ACCESS_SEED = [
  { title: 'Website & hosting login', description: 'Add ray@vernontm.com as an Administrator on your website host. WordPress: Users → Add New → role Administrator. Squarespace/Shopify/Wix: Settings → Permissions → invite as admin. This lets us build and connect the CRM to your site.' },
  { title: 'Domain / DNS (registrar)', description: 'Grant delegate access at your domain registrar (GoDaddy, Namecheap, Google Domains) or share DNS management. GoDaddy: Account Settings → Delegate Access → invite ray@vernontm.com. We need this to point records for email and the CRM.' },
  { title: 'Google Workspace / email admin', description: 'Add ray@vernontm.com as a delegated admin, or provide a temporary admin login, so we can configure email routing and the AI email assistant.' },
  { title: 'Stripe', description: 'In Stripe: Settings → Team → invite ray@vernontm.com as Admin. This wires up checkout, subscriptions, and invoicing for your bookings.' },
  { title: 'Existing CRM export (Keap / Monday.com)', description: 'Export your contacts, pipelines, and bookings as CSV — or add ray@vernontm.com as a user — so we can migrate your data into the new CRM with no loss.' },
  { title: 'Booking & calendar', description: 'Share your booking tool and calendar (Calendly, Acuity, Google Calendar) so we can integrate scheduling and prevent double-booking.' },
  { title: 'Social & ad accounts', description: 'Add VTM as a partner/admin on Meta Business Suite and any ad accounts, so we can set up retargeting and lower your lead cost.' },
];

function AccessStep({ client, onDone, setFooter }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);   // { id, title, description } currently being edited
  const [editBusy, setEditBusy] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '' });
  const [addBusy, setAddBusy] = useState('');

  const load = async () => {
    try {
      let rows = (await getClientTasks(client.id)).filter(t => t.category === 'access');
      if (rows.length === 0) {
        await Promise.all(ACCESS_SEED.map(s => createClientTask({ client_id: client.id, category: 'access', title: s.title, description: s.description, status: 'todo', assigned_to: 'Client' })));
        rows = (await getClientTasks(client.id)).filter(t => t.category === 'access');
      }
      setItems(rows);
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  const toggle = async (t) => {
    const status = t.status === 'done' ? 'todo' : 'done';
    setItems(xs => xs.map(x => x.id === t.id ? { ...x, status } : x));
    try { await updateClientTask(t.id, { status }); } catch (e) { toast('error', e.message); }
  };
  const remove = async (t) => { setItems(xs => xs.filter(x => x.id !== t.id)); if (edit?.id === t.id) setEdit(null); try { await deleteClientTask(t.id); } catch (e) { toast('error', e.message); } };

  // Regenerate the instructions for the item being edited — the AI picks up
  // whatever Ray has typed in the box and rewrites from it.
  const regen = async () => {
    if (!edit) return;
    setEditBusy('regen');
    try {
      const r = await generateAccessInstructions(edit.title, edit.description);
      setEdit(e => ({ ...e, description: r.description || e.description }));
    } catch (e) { toast('error', e.message); }
    finally { setEditBusy(''); }
  };
  const saveEdit = async () => {
    if (!edit) return;
    setEditBusy('save');
    try {
      await updateClientTask(edit.id, { title: edit.title.trim() || 'Access item', description: edit.description });
      setItems(xs => xs.map(x => x.id === edit.id ? { ...x, title: edit.title.trim() || x.title, description: edit.description } : x));
      setEdit(null);
    } catch (e) { toast('error', e.message); }
    finally { setEditBusy(''); }
  };

  const genForDraft = async () => {
    if (!draft.title.trim()) { toast('error', 'Enter what you need access to first.'); return; }
    setAddBusy('gen');
    try { const r = await generateAccessInstructions(draft.title, draft.description); setDraft(d => ({ ...d, description: r.description || d.description })); }
    catch (e) { toast('error', e.message); }
    finally { setAddBusy(''); }
  };
  const addItem = async () => {
    if (!draft.title.trim()) { toast('error', 'Enter what you need access to.'); return; }
    try {
      const t = await createClientTask({ client_id: client.id, category: 'access', title: draft.title.trim(), description: draft.description || null, status: 'todo', assigned_to: 'Client' });
      setItems(xs => [...xs, t]);
      setAdding(false); setDraft({ title: '', description: '' });
    } catch (e) { toast('error', e.message); }
  };

  const copyRequest = () => {
    const pending = items.filter(i => i.status !== 'done');
    const list = (pending.length ? pending : items).map(i => `• ${i.title}${i.description ? `\n   ${i.description}` : ''}`).join('\n\n');
    const msg = `Hi ${client.owner_name || 'there'},\n\nTo get your build started, we'll need access to a few things. Here's what we need and how to grant it:\n\n${list}\n\nSend ray@vernontm.com over as the invite email wherever it's needed. Let me know if anything's unclear!\n\n— Ray, Vernon Tech & Media`;
    navigator.clipboard?.writeText(msg).then(() => toast('success', 'Access request copied — paste into an email or text.'), () => toast('error', 'Could not copy'));
  };

  useStepFooter(setFooter, { label: 'Continue', disabled: loading, onClick: onDone });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;

  const doneCount = items.filter(i => i.status === 'done').length;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Platforms &amp; access</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>What you'll need access to before the build. Check items off as they come in; each has copy-ready instructions to send the client.</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap', marginTop: 4 }}>{doneCount}/{items.length} granted</span>
      </div>

      <button className="btn-ghost" style={{ marginBottom: 12 }} onClick={copyRequest}><Copy size={14} /> Copy access request for client</button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(t => {
          const editing = edit?.id === t.id;
          return (
          <div key={t.id} style={{ background: 'var(--surface)', border: `1px solid ${editing ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
              <button onClick={() => toggle(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: t.status === 'done' ? '#16a34a' : 'var(--muted)' }}>
                {t.status === 'done' ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </button>
              <button onClick={() => editing ? setEdit(null) : setEdit({ id: t.id, title: t.title, description: t.description || '' })}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.6 : 1 }} title="Click to edit">
                {t.title}
              </button>
              <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => editing ? setEdit(null) : setEdit({ id: t.id, title: t.title, description: t.description || '' })}>
                <Pencil size={13} /> {editing ? 'Close' : 'Edit'}
              </button>
              <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => remove(t)} title="Remove"><X size={14} /></button>
            </div>

            {editing ? (
              <div style={{ padding: '0 14px 14px 42px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input className="form-input" value={edit.title} onChange={e => setEdit(x => ({ ...x, title: e.target.value }))} placeholder="What access is needed" />
                <textarea className="form-input" rows={4} value={edit.description} onChange={e => setEdit(x => ({ ...x, description: e.target.value }))} placeholder="Instructions for the client (edit, then Regenerate to have AI polish it)" style={{ resize: 'vertical', fontSize: 12.5, lineHeight: 1.6 }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} disabled={editBusy === 'regen'} onClick={regen}>{editBusy === 'regen' ? <><Spinner /> Regenerating…</> : <><Sparkles size={14} /> Regenerate</>}</button>
                  <button className="btn-primary" disabled={editBusy === 'save'} onClick={saveEdit}>{editBusy === 'save' ? 'Saving…' : 'Save'}</button>
                  <button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
                  {edit.description && <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => navigator.clipboard?.writeText(edit.description).then(() => toast('success', 'Copied'))}><Copy size={13} /> Copy</button>}
                </div>
              </div>
            ) : t.description ? (
              <div style={{ padding: '0 14px 12px 42px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{t.description}</div>
            ) : null}
          </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn-ghost" onClick={() => { setDraft({ title: '', description: '' }); setAdding(true); }}><Plus size={14} /> Add access item</button>
      </div>

      {adding && (
        <Modal title="Add access item" onClose={() => setAdding(false)} onSubmit={addItem} submitLabel="Add item" disabled={!draft.title.trim()}>
          <div className="form-group">
            <label className="form-label">What do you need access to?</label>
            <input className="form-input" autoFocus value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder='e.g. "Instagram login"' />
          </div>
          <div className="form-group">
            <label className="form-label">Instructions for the client (optional)</label>
            <textarea className="form-input" rows={4} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Write it yourself, or let AI draft it from the name above." style={{ resize: 'vertical', fontSize: 12.5, lineHeight: 1.6 }} />
          </div>
          <button type="button" className="btn-ghost" disabled={addBusy === 'gen'} onClick={genForDraft}><Sparkles size={14} /> {addBusy === 'gen' ? 'Drafting…' : 'Generate instructions with AI'}</button>
        </Modal>
      )}
    </div>
  );
}

// Step 7 — Proposal: draft the cover email to the client (what was sent + their
// portal link), in a chosen style. Held in the pipeline for the Send step to fire.
function ProposalStep({ client, emailDraft, setEmailDraft, tone, setTone, onDone, setFooter }) {
  const [ag, setAg] = useState(null);
  const [busy, setBusy] = useState('');
  useStepFooter(setFooter, { label: 'Continue to send', disabled: !emailDraft, onClick: onDone });

  useEffect(() => {
    (async () => {
      try {
        const d = await getAgreements(client.id);
        const a = (d.agreements || [])[0] || null;
        // Mint (or reuse) the client's personal sign token now, so the drafted
        // email can carry their real signing link.
        if (a) { try { const { token } = await previewAgreementToken(a.id); a.sign_token = token; } catch (e) { /* ok */ } }
        setAg(a);
      } catch (e) { /* ok */ }
    })();
  }, [client.id]);

  const signUrl = ag?.sign_token ? `${window.location.origin}/sign?token=${ag.sign_token}` : null;

  const gen = async (nextTone) => {
    const useTone = nextTone || tone;
    if (!signUrl) { toast('error', 'Approve the agreement first so the sign link exists.'); return; }
    setBusy('gen');
    try { const r = await draftClientEmail(client.id, useTone, null, signUrl); setEmailDraft({ subject: r.subject || '', body: r.body || '' }); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };
  const saveGmailDraft = async () => {
    if (!client.contact_email) { toast('error', 'No email on file (add it in Business Details).'); return; }
    if (!emailDraft?.body?.trim()) { toast('error', 'Draft the email first.'); return; }
    setBusy('draft');
    try { await sendClientEmail({ to: client.contact_email, subject: emailDraft.subject, body: emailDraft.body, mode: 'draft' }); toast('success', 'Saved as a Gmail draft.'); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  // Auto-draft (gain-focused by default) as soon as we land here — no click needed.
  const autoTried = useRef(false);
  useEffect(() => {
    if (ag?.sign_token && !emailDraft && !autoTried.current) { autoTried.current = true; gen(tone); }
  }, [ag, emailDraft]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Proposal email</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        A cover note letting {client.owner_name || 'them'} know what you're sending, with their personal link to review &amp; sign — auto-drafted from your notes, terms, and the plan. Switch the style anytime.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[{ k: 'gain', label: 'Gain-focused' }, { k: 'professional', label: 'Professional' }, { k: 'friendly', label: 'Friendly' }].map(o => (
          <button key={o.k} onClick={() => { setTone(o.k); gen(o.k); }} disabled={busy === 'gen'}
            style={{ padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)', border: `1px solid ${tone === o.k ? 'var(--orange)' : 'var(--border)'}`, background: tone === o.k ? 'rgba(37,99,235,0.10)' : 'var(--surface)', color: tone === o.k ? 'var(--orange)' : 'var(--muted)' }}>
            {o.label}
          </button>
        ))}
        {busy === 'gen' && <span style={{ fontSize: 12, color: 'var(--orange)', alignSelf: 'center', display: 'inline-flex', gap: 6, alignItems: 'center' }}><Spinner /> Drafting…</span>}
      </div>

      {!emailDraft && busy === 'gen' && (
        <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Spinner /> Writing the proposal…</div>
      )}
      {!emailDraft && busy !== 'gen' && (
        <button className="btn-primary" onClick={() => gen()}><Sparkles size={15} /> Draft the email</button>
      )}

      {emailDraft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="form-label">Subject</label>
            <input className="form-input" value={emailDraft.subject} onChange={e => setEmailDraft(m => ({ ...m, subject: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Message</label>
            <textarea className="form-input" rows={13} value={emailDraft.body} onChange={e => setEmailDraft(m => ({ ...m, body: e.target.value }))} style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.6 }} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>To: {client.contact_email || <span style={{ color: '#ff5c5c' }}>no email on file — add one in Business Details</span>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-ghost" disabled={busy === 'draft' || !client.contact_email} onClick={saveGmailDraft}>{busy === 'draft' ? 'Saving…' : 'Save as Gmail draft'}</button>
            <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(`${emailDraft.subject}\n\n${emailDraft.body}`).then(() => toast('success', 'Copied'))}><Copy size={13} /> Copy</button>
            <button className="btn-ghost" disabled={busy === 'gen'} onClick={() => gen()}><Sparkles size={13} /> Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Step 8 — Send: final gate. Sends the agreement to sign + the proposal email,
// then shows live status (sent → opened → signed).
function SendStep({ client, emailDraft, onSent, paymentMode }) {
  const custom = paymentMode === 'custom';
  const [loading, setLoading] = useState(true);
  const [ag, setAg] = useState(null);
  const [deals, setDeals] = useState([]);
  const [busy, setBusy] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const load = async () => {
    try {
      const d = await getAgreements(client.id);
      setAg((d.agreements || [])[0] || null);
      setDeals(await getDeals(client.id).catch(() => []));
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  const send = async () => {
    if (!ag) return;
    setBusy('send');
    try {
      await sendAgreementForSignature(ag.id);
      toast('success', ag.sent_at ? 'Re-sent to client.' : 'Sent to client to sign.');
      onSent && onSent();
      setLoading(true); load();
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const sendProposal = async () => {
    if (!client.contact_email) { toast('error', 'No email on file (add it in Business Details).'); return; }
    if (!emailDraft?.body?.trim()) { toast('error', 'Draft the proposal on the previous step first.'); return; }
    setBusy('email');
    try {
      // Make the agreement signable (status=sent) so the link in the email works,
      // without firing the plain system email — the proposal email IS the delivery.
      if (ag && ag.status !== 'signed') { try { await markAgreementSent(ag.id); } catch (e) { /* non-fatal */ } }
      await sendClientEmail({ to: client.contact_email, subject: emailDraft.subject, body: emailDraft.body, mode: 'send' });
      setEmailSent(true);
      toast('success', `Sent to ${client.contact_email} — they can review & sign from the link.`);
      onSent && onSent();
      setLoading(true); load();
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;
  if (!ag) return (
    <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', color: 'var(--muted)' }}>
      <FileSignature size={28} style={{ opacity: 0.4 }} />
      <div style={{ marginTop: 12, fontSize: 14 }}>Nothing to send yet — complete the <strong>Terms</strong> step first.</div>
    </div>
  );

  const plansOffered = Array.isArray(ag.plan_options) && ag.plan_options.length > 0;
  const approved = ag.status === 'approved' || ag.status === 'sent' || ag.status === 'signed';
  const signLink = ag.sign_token ? `${window.location.origin}/sign?token=${ag.sign_token}` : null;
  const Check = ({ ok, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ok ? 'var(--text)' : 'var(--muted)' }}>
      {ok ? <CheckCircle2 size={16} style={{ color: '#16a34a' }} /> : <Circle size={16} />} {label}
    </div>
  );

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>{custom ? 'Send to the client' : 'Send for signature'}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
        {custom
          ? 'The client opens their portal, picks a payment plan, then signs and pays there — the agreement and Stripe checkout are built from their choice.'
          : 'Nothing goes out until you send. On signing, the deposit is charged and the plan is set up automatically.'}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ready to send</div>
        {custom
          ? <Check ok={plansOffered} label={`Payment plans offered${plansOffered ? ` — ${ag.plan_options.length}` : ''}`} />
          : <Check ok={approved} label="Agreement approved" />}
        <Check ok={deals.length > 0} label="Deal & projects created" />
        <Check ok={!!ag.total_amount} label={`Build value set — ${money(ag.total_amount)}`} />
        <Check ok={!!emailDraft?.body} label="Proposal email drafted" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {emailDraft?.body ? (
          <button className="btn-primary" disabled={busy === 'email' || !client.contact_email} onClick={sendProposal}>
            <Mail size={15} /> {busy === 'email' ? 'Sending…' : emailSent ? 'Resend to client' : 'Send to client'}
          </button>
        ) : !custom && ag.status !== 'signed' ? (
          <button className="btn-primary" disabled={!approved || busy === 'send'} onClick={send}>
            <FileSignature size={15} /> {busy === 'send' ? 'Sending…' : ag.sent_at ? 'Resend plain link' : 'Send agreement to sign'}
          </button>
        ) : null}
      </div>
      {!emailDraft?.body && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Draft the proposal on the previous step to send a personalized email with their sign link (or use the plain send above).</div>}

      {ag.sent_at && (
        <div style={{ marginTop: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Signature status</div>
            <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy === 'refresh'} onClick={() => { setBusy('refresh'); load().finally(() => setBusy('')); }}>Refresh</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Check ok={!!ag.sent_at} label={`Sent ${ag.sent_at ? new Date(ag.sent_at).toLocaleString() : ''}`} />
            <Check ok={!!ag.opened_at} label={ag.opened_at ? `Client opened the signature page ${new Date(ag.opened_at).toLocaleString()}` : 'Not opened yet'} />
            <Check ok={!!ag.signed_at} label={ag.signed_at ? `Signed ${new Date(ag.signed_at).toLocaleString()} by ${ag.signer_name || 'client'}` : 'Not signed yet'} />
          </div>
          {signLink && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signLink}</span>
              <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(signLink).then(() => toast('success', 'Sign link copied'))}><Copy size={13} /> Copy link</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LeadDetail({ client, onBack, onDelete, onPatch }) {
  const [step, setStep] = useState(0);
  const [view, setView] = useState('pipeline'); // 'pipeline' | 'details'
  const [termsDraft, setTermsDraft] = useState(null);
  const [dealId, setDealId] = useState(null);
  const [agreementId, setAgreementId] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const [emailTone, setEmailTone] = useState('gain');
  const [paymentMode, setPaymentMode] = useState('fixed'); // 'fixed' | 'custom'
  const [footer, setFooter] = useState(null); // { label, onClick, disabled, busy } set by the active step
  const saveField = async (field, value) => {
    onPatch({ [field]: value });
    try { await updateClient(client.id, { [field]: value }); } catch (e) { toast('error', e.message); }
  };
  const stage = stageOf(client.stage);
  const steps = useMemo(() => stepsFor(paymentMode), [paymentMode]);
  const stepIdx = Math.min(step, steps.length - 1);
  const cur = steps[stepIdx];
  const advance = () => setStep(() => Math.min(steps.length - 1, stepIdx + 1));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '7px 9px', flexShrink: 0 }}><ArrowLeft size={16} /></button>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {client.logo_url ? <img src={client.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={20} style={{ color: 'var(--muted)' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>{client.business_name}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{client.owner_name || 'No owner set'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <select className="form-input" style={{ width: 'auto', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: stage.color, background: `${stage.color}14`, border: `1px solid ${stage.color}40`, borderRadius: 999 }}
            value={client.stage || 'lead'} onChange={e => saveField('stage', e.target.value)}>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn-ghost" style={{ padding: '7px 9px', color: '#ff5c5c' }} onClick={onDelete} title="Delete lead"><Trash2 size={15} /></button>
        </div>
      </div>

      {/* Tabs: Pipeline | Business Details */}
      <div style={{ display: 'flex', gap: 4, padding: '0 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {[{ k: 'pipeline', label: 'Onboarding Pipeline' }, { k: 'details', label: 'Business Details' }].map(t => (
          <button key={t.k} onClick={() => setView(t.k)} style={{ padding: '11px 14px', background: 'none', border: 'none', borderBottom: view === t.k ? '2px solid var(--orange)' : '2px solid transparent', cursor: 'pointer', color: view === t.k ? 'var(--text)' : 'var(--muted)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{t.label}</button>
        ))}
      </div>

      {view === 'details' ? (
        <div style={{ flex: 1, padding: 24 }}>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start', maxWidth: 940 }}>
            <Card title="Business details">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <Field label="Business Name" value={client.business_name} onSave={v => saveField('business_name', v)} placeholder="Business" />
                <Field label="Contact" value={client.owner_name} onSave={v => saveField('owner_name', v)} placeholder="Contact name" />
                <Field label="Phone" value={client.contact_phone} onSave={v => saveField('contact_phone', v)} placeholder="(000) 000-0000" />
                <Field label="Email" value={client.contact_email} onSave={v => saveField('contact_email', v)} placeholder="you@business.com" />
                <Field label="Website" value={client.website_url} onSave={v => saveField('website_url', v)} placeholder="https://…" />
                <Field label="Industry" value={client.industry} onSave={v => saveField('industry', v)} placeholder="Industry" />
                <Field label="Source" value={client.source} onSave={v => saveField('source', v)} placeholder="Where they came from" />
              </div>
            </Card>
            <Card title="Lead">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Temperature</span>
                  <PillSelect value={client.lead_temperature || 'warm'} options={TEMPERATURES} onChange={v => saveField('lead_temperature', v)} />
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Rank</span>
                  <PillSelect value={client.lead_rank || 'medium'} options={RANKS} onChange={v => saveField('lead_rank', v)} />
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Potential revenue ($)</span>
                  <input className="form-input" type="number" min="0" step="100" defaultValue={client.potential_value ?? ''}
                    onBlur={e => saveField('potential_value', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 5000" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
      <>
      {/* Pipeline stepper */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', overflowX: 'auto' }}>
        {steps.map((s, i) => {
          const done = i < stepIdx, on = i === stepIdx;
          return (
            <button key={s.key} onClick={() => setStep(i)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)', border: `1px solid ${on ? 'var(--orange)' : 'var(--border)'}`, background: on ? 'rgba(37,99,235,0.10)' : (done ? 'rgba(22,163,74,0.08)' : 'var(--surface)'), color: on ? 'var(--orange)' : (done ? '#16a34a' : 'var(--muted)') }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: on ? 'var(--orange)' : (done ? '#16a34a' : 'var(--surface-2)'), color: (on || done) ? '#fff' : 'var(--muted)' }}>{done ? '✓' : i + 1}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div style={{ flex: 1, padding: 24 }}>
        {cur.key === 'overview' ? (
          <LeadActivity client={client} />
        ) : cur.key === 'terms' ? (
          <TermsStep client={client} savedDraft={termsDraft} setFooter={setFooter} paymentMode={paymentMode} setPaymentMode={setPaymentMode}
            onApprove={(d) => { setTermsDraft(d); advance(); }} />
        ) : cur.key === 'deals' ? (
          <DealsStep client={client} termsDraft={termsDraft} savedDealId={dealId} setFooter={setFooter} onCreated={(id) => { setDealId(id); advance(); }} />
        ) : cur.key === 'agreement' ? (
          <AgreementStep client={client} termsDraft={termsDraft} setFooter={setFooter} onApproved={(id) => { setAgreementId(id); advance(); }} />
        ) : cur.key === 'payment' ? (
          <PaymentStep client={client} setFooter={setFooter} onDone={advance} />
        ) : cur.key === 'access' ? (
          <AccessStep client={client} setFooter={setFooter} onDone={advance} />
        ) : cur.key === 'proposal' ? (
          <ProposalStep client={client} emailDraft={emailDraft} setEmailDraft={setEmailDraft} tone={emailTone} setTone={setEmailTone} setFooter={setFooter} onDone={advance} />
        ) : cur.key === 'send' ? (
          <SendStep client={client} emailDraft={emailDraft} paymentMode={paymentMode} />
        ) : null}
      </div>

      {/* Sticky bottom nav — the active step's approve/commit action lives here */}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', zIndex: 20 }}>
        <button className="btn-ghost" disabled={stepIdx === 0} onClick={() => setStep(s => Math.max(0, s - 1))}><ChevronLeft size={15} /> Previous</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)' }}>Step {stepIdx + 1} of {steps.length}</span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}> · {cur.label}</span>
        </div>
        {footer ? (
          <button className="btn-primary" disabled={footer.disabled || footer.busy} onClick={footer.onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {footer.busy && <Spinner />}{footer.label} {!footer.busy && <ChevronRight size={15} />}
          </button>
        ) : (
          <button className="btn-primary" disabled={stepIdx === steps.length - 1} onClick={advance}>Next <ChevronRight size={15} /></button>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function LeadActivity({ client }) {
  const clientId = client.id;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('Call');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(todayStr());
  const [file, setFile] = useState(null);        // { url, name } after upload
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summaryPrompt, setSummaryPrompt] = useState(null); // { text, title }
  const [summarizing, setSummarizing] = useState(false);
  const [expanded, setExpanded] = useState({}); // activity id -> forced open/closed

  const load = async () => {
    try { const rows = await getClientActivity(clientId); setItems((rows || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]);

  const resetForm = () => { setCat('Call'); setBody(''); setDate(todayStr()); setFile(null); };
  const openAdd = () => { resetForm(); setAdding(true); };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setUploading(true);
    try { const { url } = await uploadFile(f); setFile({ url, name: f.name }); }
    catch (err) { toast('error', err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!body.trim() && !file) return;
    setSaving(true);
    try {
      const created_at = new Date(`${date}T12:00:00`).toISOString();
      await createClientActivity({ client_id: clientId, type: 'note', tag: cat, body: body.trim(), attachment_url: file?.url || null, attachment_name: file?.name || null, created_at });
      const src = body.trim();
      setAdding(false); resetForm(); await load();
      if (src.split(/\s+/).filter(Boolean).length >= 15) setSummaryPrompt({ text: src, title: cat });
    } catch (e) { toast('error', e.message); }
    finally { setSaving(false); }
  };

  const runSummary = async () => {
    setSummarizing(true);
    try { await generateClientSummary({ client_id: clientId, text: summaryPrompt.text, title: summaryPrompt.title }); toast('success', 'Summary saved to the file'); setSummaryPrompt(null); await load(); }
    catch (e) { toast('error', e.message); }
    finally { setSummarizing(false); }
  };

  const remove = async (a) => { setItems(x => x.filter(i => i.id !== a.id)); try { await deleteClientActivity(a.id); } catch (e) { toast('error', e.message); } };
  const toggleTask = async (a) => { const status = a.status === 'done' ? 'todo' : 'done'; setItems(x => x.map(i => i.id === a.id ? { ...i, status } : i)); try { await updateClientActivity(a.id, { status }); } catch (e) { toast('error', e.message); } };

  const inp = { width: '100%' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Activity</span>
        {!adding && <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}><Plus size={14} /> New</button>}
      </div>

      {adding && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Category */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ACT_CATS.map(c => {
              const on = cat === c.key;
              return (
                <button key={c.key} type="button" onClick={() => setCat(c.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${on ? c.color : 'var(--border)'}`, background: on ? c.color + '18' : 'var(--surface)', color: on ? c.color : 'var(--muted)' }}>
                  <c.icon size={13} /> {c.key}
                </button>
              );
            })}
          </div>
          {/* Note */}
          <textarea className="form-input" rows={3} autoFocus placeholder="What happened? Add details…" value={body} onChange={e => setBody(e.target.value)} style={{ resize: 'vertical' }} />
          {/* Date + document */}
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Date</span>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Document</span>
              {file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <Download size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{file.name}</span>
                  <button className="btn-ghost" style={{ padding: '2px 5px' }} onClick={() => setFile(null)}><X size={12} /></button>
                </div>
              ) : (
                <label className="btn-ghost" style={{ cursor: uploading ? 'default' : 'pointer', width: '100%', justifyContent: 'center' }}>
                  {uploading ? 'Uploading…' : <><Plus size={13} /> Upload document</>}
                  <input type="file" hidden disabled={uploading} onChange={onPickFile} />
                </label>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={save} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div>
        : items.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: '10px 0' }}>No activity yet. Click <b>New</b> to log a call, note, or meeting.</div>
        : items.map(a => {
          if (a.type === 'task') return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: 'var(--shadow-sm)' }}>
              <button onClick={() => toggleTask(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>{a.status === 'done' ? <CheckCircle2 size={19} style={{ color: '#22c55e' }} /> : <Circle size={19} style={{ color: 'var(--muted)' }} />}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: a.status === 'done' ? 'var(--muted)' : 'var(--text)', textDecoration: a.status === 'done' ? 'line-through' : 'none', fontWeight: 600 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{a.assigned_to ? a.assigned_to + ' · ' : ''}{a.due_date ? 'due ' + a.due_date : actTimeAgo(a.created_at)}</div>
              </div>
              <button className="btn-ghost" style={{ padding: '3px 5px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
            </div>
          );
          if (a.type === 'call') return (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '13px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.direction === 'inbound' ? <PhoneIncoming size={14} style={{ color: '#22c55e' }} /> : <PhoneOutgoing size={14} style={{ color: 'var(--orange)' }} />}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{a.direction} call</span>
                  {a.outcome && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', background: 'rgba(37,99,235,0.1)', borderRadius: 999, padding: '1px 9px' }}>{a.outcome}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{actTimeAgo(a.created_at)}</span>
                  <button className="btn-ghost" style={{ padding: '3px 5px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
                </div>
                {a.body && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.body}</div>}
              </div>
            </div>
          );
          const summary = isSummary(a);
          const c = catOf(a.tag);
          const chipColor = summary ? 'var(--orange)' : (c?.color || NOTE_TAGS[a.tag] || 'var(--muted)');
          const Icon = summary ? Sparkles : (c?.icon || (a.type === 'meeting' ? Calendar : a.type === 'email' ? Mail : StickyNote));
          // Long notes collapse by default; summaries always start expanded.
          const long = (a.body || '').length > 280;
          const open = expanded[a.id] ?? (summary || !long);
          return (
            <div key={a.id} style={{ padding: '14px 16px', background: summary ? 'rgba(37,99,235,0.05)' : 'var(--surface)', border: `1px solid ${summary ? 'rgba(37,99,235,0.3)' : 'var(--border)'}`, borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon size={14} style={{ color: chipColor, flexShrink: 0 }} />
                {a.tag && <span style={{ fontSize: 10.5, fontWeight: 700, color: chipColor, background: chipColor === 'var(--muted)' ? 'var(--surface-2)' : chipColor + '18', border: `1px solid ${chipColor === 'var(--muted)' ? 'var(--border)' : chipColor + '40'}`, borderRadius: 999, padding: '2px 9px' }}>{a.tag}</span>}
                {a.title && !summary && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{a.title}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{actDate(a.created_at)} · {a.author || 'Ray'}</span>
                {long && (
                  <button className="btn-ghost" style={{ padding: '3px 6px' }} title={open ? 'Collapse' : 'Expand'} onClick={() => setExpanded(e => ({ ...e, [a.id]: !open }))}>
                    <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>
                )}
                <button className="btn-ghost" style={{ padding: '3px 5px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
              </div>
              {a.body && <div style={{ fontSize: 13.5, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>{a.body}</div>}
              {long && !open && (
                <button onClick={() => setExpanded(e => ({ ...e, [a.id]: true }))} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--link)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'var(--font-display)' }}>Show more</button>
              )}
              {a.attachment_url && (
                <a href={a.attachment_url} target="_blank" rel="noreferrer" style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--link)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                  <Download size={13} /> {a.attachment_name || 'Document'}
                </a>
              )}
            </div>
          );
        })}

      {summaryPrompt && (
        <Modal title="Generate summary?" onClose={() => setSummaryPrompt(null)} onSubmit={runSummary} submitLabel={summarizing ? 'Generating…' : 'Yes, generate'}>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }}>Have AI summarize this into a clean recap (key points + action items) and save it to <strong style={{ color: 'var(--text)' }}>{client.business_name}</strong>'s file?</p>
        </Modal>
      )}
    </div>
  );
}

function Card({ title, children, style }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', ...style }}>
      {title && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
          {title}
        </div>
      )}
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onSave, placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <div style={{ fontSize: 14, color: 'var(--text)' }}>
        <InlineEdit value={value} onSave={onSave} placeholder={placeholder} />
      </div>
    </div>
  );
}

function OverviewTab({ client, saveField }) {
  return (
    <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        <Card title="Business details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            <Field label="Business Name" value={client.business_name} onSave={v => saveField('business_name', v)} placeholder="Business" />
            <Field label="Contact" value={client.owner_name} onSave={v => saveField('owner_name', v)} placeholder="Contact name" />
            <Field label="Phone" value={client.contact_phone} onSave={v => saveField('contact_phone', v)} placeholder="(000) 000-0000" />
            <Field label="Email" value={client.contact_email} onSave={v => saveField('contact_email', v)} placeholder="you@business.com" />
            <Field label="Website" value={client.website_url} onSave={v => saveField('website_url', v)} placeholder="https://…" />
            <Field label="Instagram" value={client.instagram} onSave={v => saveField('instagram', v)} placeholder="@handle" />
            {client.stage === 'lead' && (
              <Field
                label="Potential Revenue ($)"
                value={client.potential_value != null ? String(client.potential_value) : ''}
                onSave={v => { const n = (v === '' || v == null) ? null : Number(v); saveField('potential_value', Number.isNaN(n) ? null : n); }}
                placeholder="e.g. 5000"
              />
            )}
          </div>
        </Card>

        <Card title="What we're doing / notes">
          <textarea className="form-input" rows={7} defaultValue={client.notes || ''} onBlur={e => saveField('notes', e.target.value)} placeholder="Scope, goals, what VTM is delivering for this client…" style={{ resize: 'vertical', width: '100%' }} />
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card title="Quick info">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stage</span>
              <div><StageBadge stage={client.stage} /></div>
            </div>
            <Field label="Source" value={client.source} onSave={v => saveField('source', v)} placeholder="Walk-in / Referral…" />
            <Field label="Industry" value={client.industry} onSave={v => saveField('industry', v)} placeholder="Industry" />
            {client.created_at && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client since</span>
                <span style={{ fontSize: 14, color: 'var(--text)' }}>{new Date(client.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Platforms & Access tab ─────────────────────────────────────────────────────
function AccessTab({ clientId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ platform_name: '', access_type: 'admin_invite', invite_email: '' });

  const load = async () => {
    try { setRows(await getClientPlatforms(clientId)); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]);

  const add = async () => {
    if (!draft.platform_name.trim()) return;
    try {
      await createClientPlatform({ client_id: clientId, ...draft });
      setDraft({ platform_name: '', access_type: 'admin_invite', invite_email: '' });
      setAdding(false); load();
    } catch (e) { toast('error', e.message); }
  };
  const setStatus = async (row, status) => {
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, access_status: status } : r));
    try { await updateClientPlatform(row.id, { access_status: status }); } catch (e) { toast('error', e.message); }
  };
  const remove = async (row) => {
    setRows(rs => rs.filter(r => r.id !== row.id));
    try { await deleteClientPlatform(row.id); } catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.length === 0 && !adding && (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>No platforms tracked yet. Add the tools this client uses and the access you need.</div>
      )}

      {rows.map(row => {
        const st = ACCESS_STATUS[row.access_status] || ACCESS_STATUS.needed;
        return (
          <div key={row.id} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShieldCheck size={16} style={{ color: st.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>{row.platform_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {(row.access_type || 'access').replace(/_/g, ' ')}{row.invite_email ? ` · ${row.invite_email}` : ''}
                </div>
              </div>
              <select className="form-input" style={{ width: 'auto', padding: '5px 8px', fontSize: 12 }} value={row.access_status || 'needed'} onChange={e => setStatus(row, e.target.value)}>
                {Object.entries(ACCESS_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => remove(row)}><Trash2 size={14} /></button>
            </div>
            {row.access_process && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {row.access_process}
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="form-input" placeholder="Platform (e.g. Notion, Shopify)" value={draft.platform_name} onChange={e => setDraft(d => ({ ...d, platform_name: e.target.value }))} autoFocus />
            <select className="form-input" value={draft.access_type} onChange={e => setDraft(d => ({ ...d, access_type: e.target.value }))}>
              <option value="admin_invite">Admin invite</option>
              <option value="api_key">API key</option>
              <option value="login_share">Login share</option>
              <option value="oauth">OAuth connect</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input className="form-input" placeholder="Invite email (optional)" value={draft.invite_email} onChange={e => setDraft(d => ({ ...d, invite_email: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={add}>Add Platform</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Plus size={14} /> Add Platform</button>
      )}
    </div>
  );
}

// ── Onboarding Tasks tab ───────────────────────────────────────────────────────
function TasksTab({ clientId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');

  const load = async () => {
    try { setRows(await getClientTasks(clientId)); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]);

  const add = async () => {
    if (!newTitle.trim()) return;
    try { await createClientTask({ client_id: clientId, title: newTitle.trim() }); setNewTitle(''); load(); }
    catch (e) { toast('error', e.message); }
  };
  const toggle = async (row) => {
    const status = row.status === 'done' ? 'todo' : 'done';
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, status } : r));
    try { await updateClientTask(row.id, { status }); } catch (e) { toast('error', e.message); }
  };
  const remove = async (row) => {
    setRows(rs => rs.filter(r => r.id !== row.id));
    try { await deleteClientTask(row.id); } catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  const done = rows.filter(r => r.status === 'done').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{done}/{rows.length} complete</div>
      )}
      {rows.map(row => (
        <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
          <button onClick={() => toggle(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            {row.status === 'done'
              ? <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
              : <Circle size={18} style={{ color: 'var(--muted)' }} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: row.status === 'done' ? 'var(--muted)' : 'var(--text)', textDecoration: row.status === 'done' ? 'line-through' : 'none', fontSize: 14 }}>{row.title}</div>
            {row.description && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{row.description}</div>}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{row.assigned_to}</span>
          <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => remove(row)}><Trash2 size={13} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="Add an onboarding / access task…" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn-primary" onClick={add}><Plus size={14} /></button>
      </div>
    </div>
  );
}

// ── Projects tab ───────────────────────────────────────────────────────────────
const PLAN_STATUS = {
  none:         { label: 'No plan',       color: '#8a8a8a' },
  draft:        { label: 'Draft',         color: '#f5a623' },
  needs_review: { label: 'Needs review',  color: '#3b82f6' },
  approved:     { label: 'Approved',      color: '#22c55e' },
};

// ── Vault tab (per-client credentials, secrets encrypted at rest) ───────────────
const CRED_CATS = [
  { key: 'login',    label: 'Login' },
  { key: 'api_key',  label: 'API key' },
  { key: 'database', label: 'Database' },
  { key: 'card',     label: 'Card / billing' },
  { key: 'note',     label: 'Secure note' },
  { key: 'other',    label: 'Other' },
];
const EMPTY_CRED = { label: '', category: 'login', username: '', url: '', secret: '', notes: '' };

function copyToClipboard(value, what) {
  if (!value) return;
  try { navigator.clipboard.writeText(value); toast('success', `${what} copied`); }
  catch { toast('error', 'Copy failed'); }
}

function VaultTab({ clientId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState(EMPTY_CRED);
  const [reveal, setReveal] = useState({}); // id -> bool

  const load = async () => {
    try { setRows(await getClientCredentials(clientId)); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]);

  const filtered = useMemo(() => rows.filter(r => !q ||
    [r.label, r.username, r.url, r.category, r.notes].some(v => (v || '').toLowerCase().includes(q.toLowerCase()))
  ), [rows, q]);

  const startNew = () => { setForm(EMPTY_CRED); setEditing('new'); };
  const startEdit = (r) => {
    // secret intentionally left blank → blank means "leave unchanged" on save
    setForm({ label: r.label, category: r.category || 'login', username: r.username || '', url: r.url || '', secret: '', notes: r.notes || '' });
    setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setForm(EMPTY_CRED); };

  const save = async () => {
    if (!form.label.trim()) return;
    try {
      if (editing === 'new') {
        await createClientCredential({ client_id: clientId, ...form });
      } else {
        const patch = { client_id: clientId, label: form.label, category: form.category, username: form.username, url: form.url, notes: form.notes };
        // Only send secret if the user typed a new one (blank = keep existing)
        if (form.secret !== '') patch.secret = form.secret;
        await updateClientCredential(editing, patch);
      }
      cancel(); setLoading(true); load();
    } catch (e) { toast('error', e.message); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete "${r.label}"? This cannot be undone.`)) return;
    setRows(rs => rs.filter(x => x.id !== r.id));
    try { await deleteClientCredential(r.id); } catch (e) { toast('error', e.message); }
  };

  const CredForm = (
    <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <input className="form-input" placeholder="Label (e.g. Shopify admin)" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} autoFocus />
        <select className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {CRED_CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input className="form-input" placeholder="Username / email" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        <input className="form-input" placeholder="URL (optional)" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
      </div>
      <input className="form-input" type="text" autoComplete="off"
        placeholder={editing !== 'new' ? 'Password / secret (leave blank to keep current)' : 'Password / secret'}
        value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} />
      <textarea className="form-input" rows={2} placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={save}>{editing === 'new' ? 'Save Credential' : 'Update'}</button>
        <button className="btn-ghost" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search vault…" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 30, width: '100%' }} />
        </div>
        {editing !== 'new' && <button className="btn-primary" onClick={startNew}><Plus size={14} /> Add</button>}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lock size={12} /> Secrets are encrypted at rest and only decrypted for you.
      </div>

      {editing === 'new' && CredForm}

      {filtered.length === 0 && editing !== 'new' && (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>No credentials saved yet.</div>
      )}

      {filtered.map(r => (
        editing === r.id ? <div key={r.id}>{CredForm}</div> : (
          <div key={r.id} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <KeyRound size={15} style={{ color: 'var(--orange)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{(r.category || 'login').replace('_', ' ')}</div>
              </div>
              {r.url && (
                <a href={r.url.startsWith('http') ? r.url : `https://${r.url}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '5px 7px' }} title="Open site"><ExternalLink size={14} /></a>
              )}
              <button className="btn-ghost" style={{ padding: '5px 7px' }} onClick={() => startEdit(r)} title="Edit"><Pencil size={14} /></button>
              <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => remove(r)} title="Delete"><Trash2 size={14} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 12 }}>
              {r.username && (
                <VaultField label="Username" value={r.username} onCopy={() => copyToClipboard(r.username, 'Username')} />
              )}
              {r.secret != null && r.secret !== '' && (
                <VaultField
                  label="Secret"
                  value={reveal[r.id] ? r.secret : '••••••••••••'}
                  mono
                  onCopy={() => copyToClipboard(r.secret, 'Secret')}
                  onToggle={() => setReveal(s => ({ ...s, [r.id]: !s[r.id] }))}
                  revealed={!!reveal[r.id]}
                />
              )}
            </div>
            {r.notes && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.notes}</div>}
          </div>
        )
      ))}
    </div>
  );
}

function VaultField({ label, value, onCopy, onToggle, revealed, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', borderRadius: 8, padding: '6px 8px' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--text)', fontFamily: mono ? 'ui-monospace, monospace' : undefined }}>{value}</span>
        {onToggle && (
          <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={onToggle} title={revealed ? 'Hide' : 'Reveal'}>
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={onCopy} title="Copy"><Copy size={13} /></button>
      </div>
    </div>
  );
}

// ── Agreement tab (AI builder: analyze -> answer -> draft -> review -> approve) ──
const money = (n) => `$${Number(n || 0).toLocaleString()}`;
const Spinner = () => <span className="spinner" aria-label="loading" />;
const PAY_BADGE = { paid: { label: 'Paid', color: '#22c55e' }, pending: { label: 'Pending', color: '#f5a623' } };

function PaymentRows({ payments, onToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {payments.map(p => {
        const b = PAY_BADGE[p.status] || PAY_BADGE.pending;
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
            <DollarSign size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{money(p.amount)} · {p.label}</div>
              {p.due_condition && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.due_condition}</div>}
            </div>
            {p.stripe_invoice_url && <a href={p.stripe_invoice_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '4px 6px' }} title="Stripe invoice"><ExternalLink size={13} /></a>}
            <button onClick={() => onToggle && onToggle(p)} style={{ fontSize: 11, fontWeight: 700, color: b.color, background: `${b.color}18`, border: `1px solid ${b.color}40`, borderRadius: 999, padding: '2px 10px', cursor: onToggle ? 'pointer' : 'default' }}>{b.label}</button>
          </div>
        );
      })}
    </div>
  );
}

function AgreementTab({ client }) {
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState([]);
  const [payments, setPayments] = useState([]);
  const [busy, setBusy] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [terms, setTerms] = useState('');
  const [draft, setDraft] = useState(null);
  const [showText, setShowText] = useState('agreement');

  const load = async () => {
    try { const d = await getAgreements(client.id); setAgreements(d.agreements || []); setPayments(d.payments || []); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  const togglePay = async (p) => {
    const status = p.status === 'paid' ? 'pending' : 'paid';
    setPayments(ps => ps.map(x => x.id === p.id ? { ...x, status } : x));
    try { await updatePayment(p.id, status); } catch (e) { toast('error', e.message); }
  };

  const runAnalyze = async () => {
    setBusy('analyze');
    try {
      const a = await analyzeDeal(client.id);
      setAnalysis(a);
      const seed = (a.suggested_installments || []).map(i => `- ${money(i.amount)} ${i.trigger ? '(' + i.trigger + ')' : ''}`).join('\n');
      const monthly = (a.suggested_monthly || []).map(m => `- ${money(m.amount)}/mo ${m.item}`).join('\n');
      setTerms(`${a.suggested_structure || ''}\n\nInstallments:\n${seed}${monthly ? '\n\nMonthly:\n' + monthly : ''}`.trim());
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const runGenerate = async () => {
    setBusy('generate');
    try { setDraft(await generateAgreement(client.id, terms)); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const runApprove = async () => {
    setBusy('approve');
    try { await approveAgreement(client.id, draft); setDraft(null); setAnalysis(null); setTerms(''); setLoading(true); load(); toast('success', 'Agreement saved'); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const viewPdf = async (ag) => {
    try { const { url } = await getAgreementFileUrl(ag.id); window.open(url, '_blank'); }
    catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  // ── Existing agreement view ──
  if (agreements.length > 0) {
    const ag = agreements[0];
    const md = ag.terms || {};
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <FileSignature size={18} style={{ color: 'var(--orange)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{ag.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {money(ag.total_amount)} · <span style={{ textTransform: 'capitalize' }}>{ag.status}</span>
              {ag.signed_at ? ` · signed ${new Date(ag.signed_at).toLocaleDateString()} by ${ag.signer_name || 'client'}` : (ag.sent_at ? ` · sent ${new Date(ag.sent_at).toLocaleDateString()}` : '')}
            </div>
          </div>
          {ag.status === 'draft' && (
            <button className="btn-primary" disabled={busy === 'approve'} onClick={async () => {
              setBusy('approve');
              try { const r = await approveAgreementRow(ag.id); toast('success', 'Approved — deal & payment schedule created. Review the document, then Send.'); load(); }
              catch (e) { toast('error', e.message); } finally { setBusy(''); }
            }}>
              <CheckCircle2 size={14} /> {busy === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          )}
          {ag.terms?.agreement_markdown && (
            <button className="btn-ghost" disabled={busy === 'preview'} onClick={async () => {
              setBusy('preview');
              try { const { token } = await previewAgreementToken(ag.id); window.open(`/sign?token=${token}&preview=1`, '_blank'); }
              catch (e) { toast('error', e.message); } finally { setBusy(''); }
            }}>
              <Eye size={14} /> {busy === 'preview' ? 'Opening…' : 'Preview'}
            </button>
          )}
          {(ag.status === 'approved' || ag.status === 'sent') && (ag.terms?.agreement_markdown) && (
            <button className="btn-primary" disabled={busy === 'send'} onClick={async () => {
              setBusy('send');
              try { await sendAgreementForSignature(ag.id); toast('success', ag.sent_at ? 'Re-sent to client' : 'Sent to client to sign'); load(); }
              catch (e) { toast('error', e.message); } finally { setBusy(''); }
            }}>
              <FileSignature size={14} /> {busy === 'send' ? 'Sending…' : ag.sent_at ? 'Resend' : 'Send to sign'}
            </button>
          )}
          {ag.file_url && <button className="btn-ghost" onClick={() => viewPdf(ag)}><Download size={14} /> PDF</button>}
        </div>
        {ag.status === 'signed' && ag.signer_ip && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -8 }}>
            Signed electronically · {ag.signature_method === 'draw' ? 'drawn signature' : 'typed signature'} · IP {ag.signer_ip} · {ag.signed_at ? new Date(ag.signed_at).toLocaleString() : ''}
          </div>
        )}

        {payments.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Payment schedule</div>
            <PaymentRows payments={payments} onToggle={togglePay} />
          </div>
        )}

        {/* Manual maintenance start — for pay-in-full / 50-50 plans that have no build schedule to trail. */}
        {ag.status === 'signed' && Number(md.maintenance) > 0 && (md.plan_key === 'full' || md.plan_key === '50_50') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <DollarSign size={18} style={{ color: ag.maintenance_started_at ? '#16a34a' : 'var(--orange)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5 }}>Maintenance &amp; Support — {money(md.maintenance)}/mo</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {ag.maintenance_started_at ? `Active since ${new Date(ag.maintenance_started_at).toLocaleDateString()}` : 'Start this when the project is delivered — it bills monthly on the card on file.'}
              </div>
            </div>
            {!ag.maintenance_started_at && (
              <button className="btn-primary" disabled={busy === 'maint'} onClick={async () => {
                if (!window.confirm(`Start ${money(md.maintenance)}/mo maintenance now? The first charge posts today to the client's saved card.`)) return;
                setBusy('maint');
                try { await startMaintenance(ag.id); toast('success', 'Maintenance started.'); load(); }
                catch (e) { toast('error', e.message); } finally { setBusy(''); }
              }}>{busy === 'maint' ? 'Starting…' : 'Start maintenance'}</button>
            )}
          </div>
        )}

        {(md.agreement_markdown || md.nda_markdown) && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {md.agreement_markdown && <button className="btn-ghost" style={{ fontWeight: showText === 'agreement' ? 700 : 400 }} onClick={() => setShowText('agreement')}>Agreement</button>}
              {md.nda_markdown && <button className="btn-ghost" style={{ fontWeight: showText === 'nda' ? 700 : 400 }} onClick={() => setShowText('nda')}>NDA</button>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', maxHeight: 460, overflow: 'auto' }}>
              {showText === 'nda' ? md.nda_markdown : md.agreement_markdown}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Builder ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>Build a service agreement from this client's projects and discovery notes. AI proposes the billing, flags what you might be leaving out, then drafts it for your review.</div>

      {!analysis && (
        <button className="btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy === 'analyze'} onClick={runAnalyze}>
          <Sparkles size={15} /> {busy === 'analyze' ? 'Analyzing…' : 'Analyze deal with AI'}
        </button>
      )}

      {analysis && (
        <>
          {(analysis.flags || []).length > 0 && (
            <div style={{ padding: '14px 16px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>Worth a look before you price it</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 13, lineHeight: 1.7 }}>
                {analysis.flags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          {(analysis.questions || []).length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)' }}>AI wants to know:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{analysis.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Your billing terms (edit freely)</label>
            <textarea className="form-input" rows={7} value={terms} onChange={e => setTerms(e.target.value)} placeholder="e.g. $2,500 upfront to start, then $1,000 on completion of each of the other two projects. $29/mo hosting after launch." style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={busy === 'generate'} onClick={runGenerate}><FileSignature size={15} /> {busy === 'generate' ? 'Drafting…' : draft ? 'Regenerate draft' : 'Generate agreement'}</button>
            <button className="btn-ghost" onClick={() => { setAnalysis(null); setDraft(null); setTerms(''); }}>Reset</button>
          </div>
        </>
      )}

      {draft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          <div style={{ height: 1, background: 'var(--border)' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Draft for review · total {money(draft.total)}</div>
          {Array.isArray(draft.installments) && draft.installments.length > 0 && (
            <PaymentRows payments={draft.installments.map((i, idx) => ({ id: 'd' + idx, ...i, due_condition: i.trigger }))} />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" style={{ fontWeight: showText === 'agreement' ? 700 : 400 }} onClick={() => setShowText('agreement')}>Agreement</button>
            <button className="btn-ghost" style={{ fontWeight: showText === 'nda' ? 700 : 400 }} onClick={() => setShowText('nda')}>NDA</button>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', maxHeight: 460, overflow: 'auto' }}>
            {showText === 'nda' ? draft.nda_markdown : draft.agreement_markdown}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={busy === 'approve'} onClick={runApprove}><CheckCircle2 size={15} /> {busy === 'approve' ? 'Saving…' : 'Approve & save'}</button>
            <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Saves the agreement + payment schedule. (Send-to-sign comes next.)</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Activity tab (Notes / Calls / Tasks) ───────────────────────────────────────
const ACT_SUBS = [
  { key: 'note', label: 'Notes', icon: StickyNote },
  { key: 'call', label: 'Calls', icon: Phone },
  { key: 'task', label: 'Tasks', icon: CheckSquare },
];
function actTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function ActivityTab({ clientId }) {
  const [sub, setSub] = useState('note');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({});

  const load = async () => {
    try { setItems(await getClientActivity(clientId, sub)); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); setAdding(false); load(); }, [clientId, sub]);

  const openAdd = () => {
    setDraft(sub === 'note' ? { tag: 'Important', body: '' }
      : sub === 'call' ? { direction: 'outbound', outcome: 'Connected', body: '' }
      : { title: '', priority: 'medium', assigned_to: 'Ray', due_date: '' });
    setAdding(true);
  };
  const save = async () => {
    if (sub === 'task' ? !draft.title?.trim() : !draft.body?.trim()) return;
    try {
      await createClientActivity({ client_id: clientId, type: sub, ...draft, due_date: draft.due_date || null });
      setAdding(false); setLoading(true); load();
    } catch (e) { toast('error', e.message); }
  };
  const remove = async (a) => { setItems(x => x.filter(i => i.id !== a.id)); try { await deleteClientActivity(a.id); } catch (e) { toast('error', e.message); } };
  const toggleTask = async (a) => {
    const status = a.status === 'done' ? 'todo' : 'done';
    setItems(x => x.map(i => i.id === a.id ? { ...i, status } : i));
    try { await updateClientActivity(a.id, { status }); } catch (e) { toast('error', e.message); }
  };

  const label = ACT_SUBS.find(s => s.key === sub).label.replace(/s$/, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2 }}>
          {ACT_SUBS.map(s => {
            const on = sub === s.key;
            return (
              <button key={s.key} onClick={() => setSub(s.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>
                <s.icon size={14} /> {s.label}
              </button>
            );
          })}
        </div>
        {!adding && <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}><Plus size={14} /> New {label}</button>}
      </div>

      {adding && (
        <div style={{ padding: '16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sub === 'note' && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.keys(NOTE_TAGS).map(t => (
                  <button key={t} type="button" onClick={() => setDraft(d => ({ ...d, tag: t }))} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${draft.tag === t ? NOTE_TAGS[t] : 'var(--border)'}`, background: draft.tag === t ? NOTE_TAGS[t] + '18' : 'var(--surface)', color: draft.tag === t ? NOTE_TAGS[t] : 'var(--muted)' }}>{t}</button>
                ))}
              </div>
              <textarea className="form-input" rows={3} autoFocus placeholder="Write a note…" value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} style={{ resize: 'vertical' }} />
            </>
          )}
          {sub === 'call' && (
            <>
              <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select className="form-input" value={draft.direction} onChange={e => setDraft(d => ({ ...d, direction: e.target.value }))}>
                  <option value="outbound">Outbound</option><option value="inbound">Inbound</option>
                </select>
                <select className="form-input" value={draft.outcome} onChange={e => setDraft(d => ({ ...d, outcome: e.target.value }))}>
                  {CALL_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <textarea className="form-input" rows={2} autoFocus placeholder="Call notes…" value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} style={{ resize: 'vertical' }} />
            </>
          )}
          {sub === 'task' && (
            <>
              <input className="form-input" autoFocus placeholder="Task title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
              <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <select className="form-input" value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))}>
                  {Object.keys(TASK_PRIORITY).map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </select>
                <input className="form-input" placeholder="Assignee" value={draft.assigned_to} onChange={e => setDraft(d => ({ ...d, assigned_to: e.target.value }))} />
                <input className="form-input" type="date" value={draft.due_date} onChange={e => setDraft(d => ({ ...d, due_date: e.target.value }))} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={save}>Save {label}</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div>
        : items.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>No {sub === 'task' ? 'tasks' : sub + 's'} yet.</div>
        : items.map(a => (
          sub === 'note' ? (
            <div key={a.id} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {a.tag && <span style={{ fontSize: 10.5, fontWeight: 700, color: NOTE_TAGS[a.tag] || 'var(--muted)', background: (NOTE_TAGS[a.tag] || '#888') + '18', border: `1px solid ${(NOTE_TAGS[a.tag] || '#888')}40`, borderRadius: 999, padding: '2px 9px' }}>{a.tag}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{a.author || 'Ray'} · {actTimeAgo(a.created_at)}</span>
                <button className="btn-ghost" style={{ padding: '3px 5px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{a.body}</div>
            </div>
          ) : sub === 'call' ? (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '13px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {a.direction === 'inbound' ? <PhoneIncoming size={14} style={{ color: '#22c55e' }} /> : <PhoneOutgoing size={14} style={{ color: 'var(--orange)' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{a.direction} call</span>
                  {a.outcome && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', background: 'rgba(59,130,246,0.1)', borderRadius: 999, padding: '1px 9px' }}>{a.outcome}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{actTimeAgo(a.created_at)}</span>
                  <button className="btn-ghost" style={{ padding: '3px 5px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
                </div>
                {a.body && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{a.body}</div>}
              </div>
            </div>
          ) : (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: 'var(--shadow-sm)' }}>
              <button onClick={() => toggleTask(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                {a.status === 'done' ? <CheckCircle2 size={19} style={{ color: '#22c55e' }} /> : <Circle size={19} style={{ color: 'var(--muted)' }} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: a.status === 'done' ? 'var(--muted)' : 'var(--text)', textDecoration: a.status === 'done' ? 'line-through' : 'none', fontWeight: 600 }}>{a.title}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 2, fontSize: 11.5, color: 'var(--muted)' }}>
                  {a.assigned_to && <span>{a.assigned_to}</span>}
                  {a.due_date && <span>due {new Date(a.due_date).toLocaleDateString()}</span>}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: TASK_PRIORITY[a.priority] || '#888', textTransform: 'capitalize' }}><Flag size={11} /> {a.priority}</span>
              <button className="btn-ghost" style={{ padding: '4px 6px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
            </div>
          )
        ))}
    </div>
  );
}

// ── Deals tab ───────────────────────────────────────────────────────────────
// A Deal groups this client's projects into one agreement + one combined
// invoice. One client can have several deals; each bills as a single invoice
// with a line item per project — so multiple projects never split into
// separate bills.
const fmtMoney = (v) => `$${Number(v || 0).toLocaleString()}`;
const dealTotals = (deal) => {
  const ps = deal.projects || [];
  const oneTime = ps.filter(p => p.billing_type !== 'monthly').reduce((s, p) => s + Number(p.value || 0), 0);
  const monthly = ps.filter(p => p.billing_type !== 'one_time').reduce((s, p) => s + Number(p.recurring_amount || 0), 0);
  return { oneTime, monthly };
};

function DealCard({ deal, clientProjects, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState(new Set((deal.projects || []).map(p => p.id)));
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const { oneTime, monthly } = dealTotals(deal);

  const saveMembership = async () => {
    setBusy(true);
    try { await updateDeal(deal.id, { project_ids: [...picked] }); setEditing(false); onChanged(); }
    catch (e) { toast('error', e.message); } finally { setBusy(false); }
  };
  const sendInvoice = async () => {
    if (!window.confirm(`Create & send ONE combined Stripe invoice for "${deal.name}" (${(deal.projects || []).length} project${(deal.projects || []).length === 1 ? '' : 's'})?`)) return;
    setBusy(true);
    try { await createDealInvoice(deal.id, { email: email.trim(), name: deal.name }); toast('success', 'Combined invoice sent via Stripe.'); onChanged(); }
    catch (e) { toast('error', e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the deal "${deal.name}"? Its projects stay, just ungrouped.`)) return;
    try { await deleteDeal(deal.id); onChanged(); } catch (e) { toast('error', e.message); }
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <DollarSign size={16} style={{ color: 'var(--orange)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{deal.name || 'Untitled deal'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {fmtMoney(oneTime)}{monthly > 0 ? ` + ${fmtMoney(monthly)}/mo` : ''} · {(deal.projects || []).length} project{(deal.projects || []).length === 1 ? '' : 's'}
          </div>
        </div>
        {deal.invoice_status === 'sent' && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#16a34a18', border: '1px solid #16a34a40', borderRadius: 999, padding: '2px 10px' }}>Invoiced</span>
        )}
        <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={remove} title="Delete deal"><Trash2 size={13} /></button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Line items (projects) */}
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Projects in this deal</div>
            {clientProjects.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>This client has no projects yet — create them on the Projects page.</div>}
            {clientProjects.map(p => {
              const on = picked.has(p.id);
              const inOther = p.deal_id && p.deal_id !== deal.id;
              return (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => setPicked(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} style={{ accentColor: 'var(--orange)' }} />
                  <span style={{ flex: 1 }}>{p.name}{inOther ? ' (in another deal)' : ''}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{p.billing_type !== 'monthly' && p.value ? fmtMoney(p.value) : ''}{p.recurring_amount ? ` ${fmtMoney(p.recurring_amount)}/mo` : ''}</span>
                </label>
              );
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn-primary" onClick={saveMembership} disabled={busy} style={{ padding: '7px 14px' }}>{busy ? 'Saving…' : 'Save projects'}</button>
              <button className="btn-ghost" onClick={() => { setPicked(new Set((deal.projects || []).map(p => p.id))); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(deal.projects || []).length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No projects in this deal yet.</div>
            ) : (deal.projects || []).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{p.name}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {p.billing_type !== 'monthly' && p.value ? fmtMoney(p.value) : ''}{p.recurring_amount ? ` ${fmtMoney(p.recurring_amount)}/mo` : ''}
                </span>
              </div>
            ))}
            <button className="btn-ghost" onClick={() => setEditing(true)} style={{ alignSelf: 'flex-start', marginTop: 4, padding: '5px 10px' }}><Pencil size={12} /> Edit projects</button>
          </div>
        )}

        {/* Combined invoice */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {deal.invoice_status === 'sent' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#16a34a', fontWeight: 700 }}>
              <CheckCircle2 size={15} /> Combined invoice sent
              {deal.stripe_invoice_url && <a href={deal.stripe_invoice_url} target="_blank" rel="noreferrer" style={{ color: 'var(--orange)', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>View <ExternalLink size={12} /></a>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Billing email (defaults to the client's)" />
              <button className="btn-primary" onClick={sendInvoice} disabled={busy || (deal.projects || []).length === 0} style={{ justifyContent: 'center' }}>
                {busy ? 'Sending…' : <><DollarSign size={14} /> Create & send combined invoice</>}
              </button>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>One Stripe invoice with a line item per project. Monthly projects roll into one subscription.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DealsTab({ client }) {
  const [deals, setDeals] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPicked, setNewPicked] = useState(new Set());

  const load = async () => {
    try {
      const [d, all] = await Promise.all([getDeals(client.id), getProjects()]);
      setDeals(d || []);
      setProjects((all || []).filter(p => p.client_id === client.id || (!p.client_id && p.client === client.business_name)));
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  const createNew = async () => {
    if (!newName.trim()) return;
    try {
      await createDeal({ client_id: client.id, name: newName.trim(), project_ids: [...newPicked] });
      setNewName(''); setNewPicked(new Set()); setCreating(false); load();
    } catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1, lineHeight: 1.5 }}>
          A deal bundles this client's projects into one agreement + one combined invoice.
        </div>
        {!creating && <button className="btn-primary" onClick={() => setCreating(true)} style={{ padding: '8px 14px' }}><Plus size={14} /> New Deal</button>}
      </div>

      {creating && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Deal name</label>
            <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Veteran Nexus — CRM + 2 sites" autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Include projects</div>
            {projects.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>This client has no projects yet — create them on the Projects page, then group them here.</div>
            ) : projects.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '3px 0' }}>
                <input type="checkbox" checked={newPicked.has(p.id)} onChange={() => setNewPicked(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} style={{ accentColor: 'var(--orange)' }} />
                <span style={{ flex: 1 }}>{p.name}{p.deal_id ? ' (in another deal)' : ''}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{p.billing_type !== 'monthly' && p.value ? fmtMoney(p.value) : ''}{p.recurring_amount ? ` ${fmtMoney(p.recurring_amount)}/mo` : ''}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={createNew} disabled={!newName.trim()} style={{ padding: '8px 14px' }}>Create deal</button>
            <button className="btn-ghost" onClick={() => { setCreating(false); setNewName(''); setNewPicked(new Set()); }}>Cancel</button>
          </div>
        </div>
      )}

      {deals.length === 0 && !creating && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No deals yet. Create one to bundle this client's projects into a single agreement + invoice.</div>}
      {deals.map(d => <DealCard key={d.id} deal={d} clientProjects={projects} onChanged={load} />)}
    </div>
  );
}

function ProjectsTab({ client }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const all = await getProjects();
      setRows(all.filter(p => p.client_id === client.id || (!p.client_id && p.client === client.business_name)));
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No projects linked to this client yet. Create one from the Projects page.</div>}
      {rows.map(p => {
        const ps = PLAN_STATUS[p.plan_status] || PLAN_STATUS.none;
        return (
          <div key={p.id} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Briefcase size={15} style={{ color: 'var(--orange)' }} />
              <span style={{ fontWeight: 700, color: 'var(--text)', flex: 1 }}>{p.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: ps.color, background: `${ps.color}18`, border: `1px solid ${ps.color}40`, padding: '2px 10px', borderRadius: 999 }}>{ps.label}</span>
            </div>
            {p.scope && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>{p.scope}</div>}
          </div>
        );
      })}
    </div>
  );
}
