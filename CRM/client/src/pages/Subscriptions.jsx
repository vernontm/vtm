import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, RefreshCw, Search, Plus, X, Trash2, Edit3, Scan, Check,
  DollarSign, Calendar, Tag,
} from 'lucide-react';
import {
  getSubscriptions, createSubscription, updateSubscription, deleteSubscription, scanSubscriptions,
} from '../api';

const CATEGORIES = ['software','hosting','marketing','productivity','communication','storage','security','entertainment','finance','other'];
const CYCLE_OPTIONS = ['monthly','yearly','quarterly','weekly'];
const STATUS_OPTIONS = ['active','paused','cancelled'];

const CATEGORY_COLORS = {
  software:'#4a6cf7', hosting:'#22c55e', marketing:'#f5a623', productivity:'#784bd1',
  communication:'#00b8d4', storage:'#6e8efb', security:'#ff5c5c', entertainment:'#e91e8c',
  finance:'#ff6b35', other:'#8e8ea0',
};

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); } catch { return iso; }
}

function fmtAmount(amt) {
  if (!amt && amt !== 0) return '—';
  return `$${Number(amt).toFixed(2)}`;
}

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [scanResult, setScanResult] = useState(null);

  // Form state
  const [form, setForm] = useState({ service:'', amount:'', billing_cycle:'monthly', next_renewal:'', category:'software', status:'active', notes:'' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await getSubscriptions(); setSubs(Array.isArray(data) ? data : []); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleScan = async () => {
    setScanning(true); setScanResult(null);
    try {
      const result = await scanSubscriptions();
      setScanResult(result);
      // Auto-save found subscriptions
      if (result?.subscriptions?.length) {
        for (const sub of result.subscriptions) {
          try {
            await createSubscription({
              service: sub.service,
              amount: sub.amount,
              billing_cycle: sub.billing_cycle,
              next_renewal: sub.next_renewal,
              gmail_message_id: sub.gmail_message_id,
              category: sub.category || 'other',
              status: 'active',
            });
          } catch {}
        }
        await load();
      }
    } catch (e) { alert('Scan failed: ' + e.message); }
    setScanning(false);
  };

  const handleSave = async () => {
    if (!form.service.trim()) return;
    try {
      const data = { ...form, amount: form.amount ? parseFloat(form.amount) : null };
      if (editing) {
        await updateSubscription(editing, data);
      } else {
        await createSubscription(data);
      }
      setShowAdd(false); setEditing(null);
      setForm({ service:'', amount:'', billing_cycle:'monthly', next_renewal:'', category:'software', status:'active', notes:'' });
      await load();
    } catch (e) { alert('Save failed: ' + e.message); }
  };

  const handleEdit = (sub) => {
    setForm({
      service: sub.service || '',
      amount: sub.amount || '',
      billing_cycle: sub.billing_cycle || 'monthly',
      next_renewal: sub.next_renewal ? sub.next_renewal.split('T')[0] : '',
      category: sub.category || 'other',
      status: sub.status || 'active',
      notes: sub.notes || '',
    });
    setEditing(sub.id);
    setShowAdd(true);
  };

  const handleDelete = async (id) => {
    try { await deleteSubscription(id); await load(); } catch (e) { alert('Delete failed: ' + e.message); }
  };

  // Filter and search
  let filtered = subs;
  if (filter !== 'all') filtered = filtered.filter(s => s.status === filter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(s => (s.service||'').toLowerCase().includes(q) || (s.category||'').toLowerCase().includes(q));
  }

  // Stats
  const activeSubs = subs.filter(s => s.status === 'active');
  const monthlyTotal = activeSubs.reduce((sum, s) => {
    if (!s.amount) return sum;
    if (s.billing_cycle === 'yearly') return sum + s.amount / 12;
    if (s.billing_cycle === 'quarterly') return sum + s.amount / 3;
    if (s.billing_cycle === 'weekly') return sum + s.amount * 4.33;
    return sum + s.amount;
  }, 0);
  const yearlyTotal = monthlyTotal * 12;

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'#f5f7fa', fontFamily:'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ padding:'20px 28px 16px', background:'#fff', borderBottom:'1px solid #e5e7ef' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <CreditCard size={22} color="#4a6cf7" />
          <h1 style={{ fontSize:20, fontWeight:700, color:'#1a1a2e', margin:0, flex:1 }}>Subscriptions</h1>
          <button onClick={handleScan} disabled={scanning}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, cursor:scanning?'wait':'pointer', background:scanning?'#f5f7fa':'#fff', border:'1px solid #e5e7ef', color:scanning?'#b0b0c0':'#4a6cf7', fontSize:12, fontWeight:600 }}>
            <Scan size={13} style={{ animation:scanning?'spin 1s linear infinite':'none' }} /> {scanning ? 'Scanning emails...' : 'Scan Gmail'}
          </button>
          <button onClick={() => { setShowAdd(true); setEditing(null); setForm({ service:'', amount:'', billing_cycle:'monthly', next_renewal:'', category:'software', status:'active', notes:'' }); }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, cursor:'pointer', background:'linear-gradient(135deg,#4a6cf7,#6e8efb)', border:'none', color:'#fff', fontSize:12, fontWeight:600 }}>
            <Plus size={13} /> Add Subscription
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid-4" style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12 }}>
          <div style={{ padding:'14px 18px', background:'#f8f9fc', borderRadius:10, border:'1px solid #e5e7ef' }}>
            <div style={{ fontSize:10, color:'#8e8ea0', fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>Active</div>
            <div style={{ fontSize:22, fontWeight:700, color:'#1a1a2e' }}>{activeSubs.length}</div>
          </div>
          <div style={{ flex:1, padding:'14px 18px', background:'#f8f9fc', borderRadius:10, border:'1px solid #e5e7ef' }}>
            <div style={{ fontSize:10, color:'#8e8ea0', fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>Monthly Cost</div>
            <div className="private-value" style={{ fontSize:22, fontWeight:700, color:'#4a6cf7' }}>${monthlyTotal.toFixed(2)}</div>
          </div>
          <div style={{ flex:1, padding:'14px 18px', background:'#f8f9fc', borderRadius:10, border:'1px solid #e5e7ef' }}>
            <div style={{ fontSize:10, color:'#8e8ea0', fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>Yearly Cost</div>
            <div className="private-value" style={{ fontSize:22, fontWeight:700, color:'#1a1a2e' }}>${yearlyTotal.toFixed(2)}</div>
          </div>
          <div style={{ flex:1, padding:'14px 18px', background:'#f8f9fc', borderRadius:10, border:'1px solid #e5e7ef' }}>
            <div style={{ fontSize:10, color:'#8e8ea0', fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>Total Subs</div>
            <div style={{ fontSize:22, fontWeight:700, color:'#1a1a2e' }}>{subs.length}</div>
          </div>
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div style={{ padding:'10px 28px', background:scanResult.subscriptions?.length ? 'rgba(34,197,94,0.06)' : 'rgba(74,108,247,0.04)', borderBottom:'1px solid #e5e7ef', display:'flex', alignItems:'center', gap:8 }}>
          <Check size={14} color={scanResult.subscriptions?.length ? '#22c55e' : '#4a6cf7'} />
          <span style={{ fontSize:12, color:'#5a5a6e', flex:1 }}>
            {scanResult.subscriptions?.length
              ? `Found and saved ${scanResult.subscriptions.length} subscription${scanResult.subscriptions.length!==1?'s':''} from ${scanResult.emailsScanned || 0} emails`
              : scanResult.message || 'No new subscriptions found'}
          </span>
          <button onClick={() => setScanResult(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#8e8ea0', display:'flex' }}><X size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div style={{ padding:'12px 28px', display:'flex', alignItems:'center', gap:10, background:'#fff', borderBottom:'1px solid #e5e7ef' }}>
        <div style={{ position:'relative', flex:1, maxWidth:300 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#b0b0c0' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subscriptions..."
            style={{ width:'100%', padding:'8px 10px 8px 30px', borderRadius:8, fontSize:12, background:'#f5f7fa', border:'1px solid #e5e7ef', color:'#1a1a2e', outline:'none' }} />
        </div>
        {['all','active','paused','cancelled'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'6px 14px', borderRadius:6, fontSize:11, fontWeight:600, cursor:'pointer', border:'1px solid', textTransform:'capitalize',
              background: filter===f ? '#4a6cf710' : '#fff', color: filter===f ? '#4a6cf7' : '#8e8ea0', borderColor: filter===f ? '#4a6cf730' : '#e5e7ef' }}>
            {f}
          </button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:12, color:'#8e8ea0' }}>{filtered.length} subscription{filtered.length!==1?'s':''}</span>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflow:'auto', padding:'0 28px 28px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#8e8ea0', fontSize:13 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:80 }}>
            <CreditCard size={40} style={{ color:'#e5e7ef', margin:'0 auto 12px' }} />
            <div style={{ color:'#8e8ea0', fontSize:14, fontWeight:600 }}>No subscriptions</div>
            <div style={{ color:'#b0b0c0', fontSize:12, marginTop:4 }}>Click "Scan Gmail" to auto-detect or add manually</div>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:16 }}>
            <thead>
              <tr style={{ borderBottom:'2px solid #e5e7ef' }}>
                {['Service','Amount','Cycle','Next Renewal','Category','Status',''].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'10px 12px', fontSize:10, fontWeight:700, color:'#8e8ea0', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(sub => (
                <tr key={sub.id} style={{ borderBottom:'1px solid #f0f2f8' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8f9fc'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                  <td style={{ padding:'12px', fontSize:13, fontWeight:600, color:'#1a1a2e' }}>
                    {sub.service}
                    {sub.notes && <div style={{ fontSize:11, color:'#8e8ea0', fontWeight:400 }}>{sub.notes}</div>}
                  </td>
                  <td className="private-value" style={{ padding:'12px', fontSize:13, fontWeight:600, color:'#4a6cf7' }}>{fmtAmount(sub.amount)}</td>
                  <td style={{ padding:'12px', fontSize:12, color:'#5a5a6e', textTransform:'capitalize' }}>{sub.billing_cycle || '—'}</td>
                  <td style={{ padding:'12px', fontSize:12, color:'#5a5a6e' }}>{fmtDate(sub.next_renewal)}</td>
                  <td style={{ padding:'12px' }}>
                    <span style={{ fontSize:10, padding:'3px 8px', borderRadius:4, fontWeight:600,
                      background:(CATEGORY_COLORS[sub.category]||'#8e8ea0')+'15', color:CATEGORY_COLORS[sub.category]||'#8e8ea0' }}>
                      {sub.category || 'other'}
                    </span>
                  </td>
                  <td style={{ padding:'12px' }}>
                    <span style={{ fontSize:10, padding:'3px 8px', borderRadius:4, fontWeight:600,
                      background: sub.status==='active'?'#22c55e15':sub.status==='paused'?'#f5a62315':'#ff5c5c15',
                      color: sub.status==='active'?'#22c55e':sub.status==='paused'?'#f5a623':'#ff5c5c' }}>
                      {sub.status}
                    </span>
                  </td>
                  <td style={{ padding:'12px', display:'flex', gap:4 }}>
                    <button onClick={() => handleEdit(sub)} style={{ background:'none', border:'none', cursor:'pointer', color:'#8e8ea0', display:'flex', padding:4 }}
                      onMouseEnter={e => e.currentTarget.style.color='#4a6cf7'} onMouseLeave={e => e.currentTarget.style.color='#8e8ea0'}>
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => handleDelete(sub.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#8e8ea0', display:'flex', padding:4 }}
                      onMouseEnter={e => e.currentTarget.style.color='#ff5c5c'} onMouseLeave={e => e.currentTarget.style.color='#8e8ea0'}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if(e.target===e.currentTarget){ setShowAdd(false); setEditing(null); } }}>
          <div style={{ background:'#fff', borderRadius:14, width:440, boxShadow:'0 16px 48px rgba(0,0,0,0.15)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid #e5e7ef' }}>
              <span style={{ fontSize:15, fontWeight:700, color:'#1a1a2e', flex:1 }}>{editing ? 'Edit' : 'Add'} Subscription</span>
              <button onClick={() => { setShowAdd(false); setEditing(null); }} style={{ background:'none', border:'none', cursor:'pointer', color:'#8e8ea0', display:'flex' }}><X size={18} /></button>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#8e8ea0', display:'block', marginBottom:4 }}>Service Name *</label>
                <input value={form.service} onChange={e => setForm({...form, service:e.target.value})} placeholder="e.g., Vercel, GitHub, Figma"
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7ef', fontSize:13, color:'#1a1a2e', outline:'none' }} />
              </div>
              <div style={{ display:'flex', gap:12 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'#8e8ea0', display:'block', marginBottom:4 }}>Amount ($)</label>
                  <input type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} placeholder="0.00" step="0.01"
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7ef', fontSize:13, color:'#1a1a2e', outline:'none' }} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'#8e8ea0', display:'block', marginBottom:4 }}>Billing Cycle</label>
                  <select value={form.billing_cycle} onChange={e => setForm({...form, billing_cycle:e.target.value})}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7ef', fontSize:13, color:'#1a1a2e', outline:'none', background:'#fff' }}>
                    {CYCLE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:12 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'#8e8ea0', display:'block', marginBottom:4 }}>Next Renewal</label>
                  <input type="date" value={form.next_renewal} onChange={e => setForm({...form, next_renewal:e.target.value})}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7ef', fontSize:13, color:'#1a1a2e', outline:'none' }} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'#8e8ea0', display:'block', marginBottom:4 }}>Category</label>
                  <select value={form.category} onChange={e => setForm({...form, category:e.target.value})}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7ef', fontSize:13, color:'#1a1a2e', outline:'none', background:'#fff' }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#8e8ea0', display:'block', marginBottom:4 }}>Status</label>
                <div style={{ display:'flex', gap:8 }}>
                  {STATUS_OPTIONS.map(s => (
                    <button key={s} onClick={() => setForm({...form, status:s})}
                      style={{ flex:1, padding:'8px 0', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600, textTransform:'capitalize',
                        background: form.status===s ? (s==='active'?'#22c55e15':s==='paused'?'#f5a62315':'#ff5c5c15') : '#f5f7fa',
                        color: form.status===s ? (s==='active'?'#22c55e':s==='paused'?'#f5a623':'#ff5c5c') : '#8e8ea0',
                        border: form.status===s ? `1px solid ${s==='active'?'#22c55e30':s==='paused'?'#f5a62330':'#ff5c5c30'}` : '1px solid #e5e7ef' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#8e8ea0', display:'block', marginBottom:4 }}>Notes</label>
                <input value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Optional notes..."
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e5e7ef', fontSize:13, color:'#1a1a2e', outline:'none' }} />
              </div>
            </div>
            <div style={{ padding:'12px 20px', borderTop:'1px solid #e5e7ef', display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => { setShowAdd(false); setEditing(null); }}
                style={{ padding:'9px 18px', borderRadius:8, cursor:'pointer', background:'#fff', border:'1px solid #e5e7ef', color:'#8e8ea0', fontSize:13, fontWeight:500 }}>Cancel</button>
              <button onClick={handleSave}
                style={{ padding:'9px 18px', borderRadius:8, cursor:'pointer', background:'linear-gradient(135deg,#4a6cf7,#6e8efb)', border:'none', color:'#fff', fontSize:13, fontWeight:600 }}>
                {editing ? 'Update' : 'Add'} Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
