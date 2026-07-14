import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Trash2, ArrowLeft, Building2,
  KeyRound, CheckCircle2, Circle, Clock, ShieldCheck, ListChecks,
  Briefcase, Lock, Eye, EyeOff, Copy, Pencil, ExternalLink,
  FileSignature, Sparkles, DollarSign, Download,
  StickyNote, Phone, CheckSquare, PhoneIncoming, PhoneOutgoing, Flag, Activity,
} from 'lucide-react';
import { usePageActions } from '../context/UiContext';
import {
  getClients, createClient, updateClient, deleteClient,
  getClientPlatforms, createClientPlatform, updateClientPlatform, deleteClientPlatform,
  getClientTasks, createClientTask, updateClientTask, deleteClientTask,
  getClientCredentials, createClientCredential, updateClientCredential, deleteClientCredential,
  getClientActivity, createClientActivity, updateClientActivity, deleteClientActivity,
  getProjects,
  getAgreements, getAgreementFileUrl, updatePayment, sendAgreementForSignature,
  analyzeDeal, generateAgreement, approveAgreement,
} from '../api';
import Modal from '../components/Modal';
import InlineEdit from '../components/InlineEdit';
import { toast } from '../components/Toast';

// ── Journey stages ────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'lead',            label: 'Lead',            color: '#8a8a8a' },
  { key: 'onboarding',      label: 'Onboarding Call', color: '#f5a623' },
  { key: 'awaiting_access', label: 'Awaiting Access', color: '#ff9b26' },
  { key: 'scoping',         label: 'Scoping',         color: '#784bd1' },
  { key: 'plan_review',     label: 'Plan Review',     color: '#3b82f6' },
  { key: 'in_build',        label: 'In Build',        color: '#22c55e' },
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

const EMPTY_CLIENT = { business_name: '', owner_name: '', contact_phone: '', contact_email: '', industry: '', website_url: '', source: 'Walk-in', client_type: [], notes: '', stage: 'lead', firstNote: '' };

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
  const [searchParams, setSearchParams] = useSearchParams();

  const load = async () => {
    setLoadError('');
    try { setClients(await getClients()); }
    catch (e) { console.error(e); setLoadError(e?.message || 'Failed to load clients'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // Reset the open detail view when switching between /leads and /clients.
  useEffect(() => { setSelected(null); }, [kind]);

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

  const filtered = useMemo(() =>
    clients
      .filter(c => isLeadView ? c.stage === 'lead' : c.stage !== 'lead')
      .filter(c => !search ||
        (c.business_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.owner_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.industry || '').toLowerCase().includes(search.toLowerCase())),
    [clients, search, isLeadView]
  );

  const openAdd = () => { setForm({ ...EMPTY_CLIENT, stage: isLeadView ? 'lead' : 'onboarding' }); setModal('add'); };
  const handleCreate = async () => {
    if (!form.business_name.trim()) return;
    try {
      const { firstNote, ...payload } = form;
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
    return (
      <>
        <ClientDetail
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder={`Search ${isLeadView ? 'leads' : 'clients'}…`} value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
      </div>

      {loadError && (
        <div style={{ margin: '12px 20px', padding: '12px 16px', background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 8, fontSize: 13, color: '#ff5c5c', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>Couldn't load clients: {loadError}</span>
          <button onClick={load} style={{ padding: '6px 14px', borderRadius: 6, background: '#ff5c5c', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      <div className="table-container desktop-table">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Business</th>
              <th style={{ minWidth: 160 }}>Owner</th>
              <th style={{ minWidth: 150 }}>Stage</th>
              <th style={{ minWidth: 130 }}>Source</th>
              <th style={{ minWidth: 150 }}>Type</th>
              <th style={{ minWidth: 120 }}>Added</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No {isLeadView ? 'leads' : 'clients'} yet.</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(c)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      {c.logo_url ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={15} style={{ color: 'var(--muted)' }} />}
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.business_name || '—'}</span>
                  </div>
                </td>
                <td style={{ color: 'var(--muted)' }}>{c.owner_name || '—'}</td>
                <td><StageBadge stage={c.stage} /></td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.source || '—'}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{(c.client_type || []).join(', ') || '—'}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                <td onClick={e => e.stopPropagation()}>
                  <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => setDeleteTarget(c)} title="Delete client"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mobile-cards">
        {!loading && filtered.map(c => (
          <div key={c.id} className="mobile-card" onClick={() => setSelected(c)} style={{ cursor: 'pointer', position: 'relative' }}>
            <div className="mobile-card-row primary">
              <Building2 size={14} style={{ color: 'var(--orange)' }} />
              <span>{c.business_name || '—'}</span>
            </div>
            <div className="mobile-card-row"><StageBadge stage={c.stage} /></div>
            {c.owner_name && <div className="mobile-card-row">{c.owner_name}</div>}
            <button
              className="btn-ghost"
              style={{ position: 'absolute', top: 10, right: 10, padding: '5px 7px', color: '#ff5c5c' }}
              onClick={e => { e.stopPropagation(); setDeleteTarget(c); }}
              title="Delete client"
            ><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {deleteModal}

      {modal === 'add' && (
        <Modal title="New Lead / Client" onClose={() => setModal(null)} onSubmit={handleCreate} submitLabel="Create">
          <div className="form-group">
            <label className="form-label">Business Name *</label>
            <input className="form-input" value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} placeholder="e.g. Harbor & Vine" required autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Contact Name</label>
              <input className="form-input" value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Jane Doe" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="tel" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="(000) 000-0000" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          <div className="form-group">
            <label className="form-label">Interested in</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CLIENT_TYPES.map(t => {
                const on = (form.client_type || []).includes(t);
                return (
                  <button type="button" key={t} onClick={() => setForm(f => ({ ...f, client_type: on ? f.client_type.filter(x => x !== t) : [...(f.client_type || []), t] }))}
                    style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: on ? '1.5px solid var(--orange)' : '1.5px solid var(--border)', background: on ? 'rgba(255,155,38,0.12)' : 'var(--surface)', color: on ? 'var(--orange)' : 'var(--text)' }}>{t}</button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              <span key={t} style={{ fontSize: 10, fontWeight: 700, color: 'var(--orange)', background: 'rgba(255,155,38,0.12)', border: '1px solid rgba(255,155,38,0.3)', borderRadius: 999, padding: '1px 8px' }}>{t}</span>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        <Card title="Business details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            <Field label="Business Name" value={client.business_name} onSave={v => saveField('business_name', v)} placeholder="Business" />
            <Field label="Contact" value={client.owner_name} onSave={v => saveField('owner_name', v)} placeholder="Contact name" />
            <Field label="Phone" value={client.contact_phone} onSave={v => saveField('contact_phone', v)} placeholder="(000) 000-0000" />
            <Field label="Email" value={client.contact_email} onSave={v => saveField('contact_email', v)} placeholder="you@business.com" />
            <Field label="Website" value={client.website_url} onSave={v => saveField('website_url', v)} placeholder="https://…" />
            <Field label="Instagram" value={client.instagram} onSave={v => saveField('instagram', v)} placeholder="@handle" />
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <input className="form-input" placeholder="Label (e.g. Shopify admin)" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} autoFocus />
        <select className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {CRED_CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
          {ag.status !== 'signed' && (ag.terms?.agreement_markdown) && (
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
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
