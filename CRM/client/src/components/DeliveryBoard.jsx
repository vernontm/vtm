import React, { useEffect, useState } from 'react';
import { RefreshCw, FileText, Loader, Plus, ChevronDown, ChevronUp, DollarSign, AlertTriangle } from 'lucide-react';
import { getDeliveryBoard, moveDeliveryCard, setContentQuota, bumpContentProgress, generateSocialReport, updateClientTask } from '../api';
import { toast } from './Toast';

// Trello-style delivery board: every client in delivery as a card, columns are
// the delivery phases. Drag a card to move it; the backend seeds that phase's
// checklist automatically.

const money = (v) => `$${(Number(v) || 0).toLocaleString('en-US')}`;

const daysIn = (iso) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
};

function Bar({ done, total, color = 'var(--orange)' }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ height: 5, borderRadius: 4, background: 'var(--surface-3)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pct >= 100 ? '#22c55e' : color, transition: 'width 0.25s' }} />
    </div>
  );
}

export default function DeliveryBoard({ onOpen }) {
  const [stages, setStages] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [openChecklist, setOpenChecklist] = useState(null);   // card id with expanded checklist
  const [busyReport, setBusyReport] = useState(null);
  const [quotaFor, setQuotaFor] = useState(null);             // card id editing quota
  const [qPosts, setQPosts] = useState(0);
  const [qReels, setQReels] = useState(0);

  // Sequence guard: only the LATEST load may apply its result, so a slow
  // refetch can never clobber newer optimistic state (moves, ticks, bumps).
  const loadSeq = React.useRef(0);
  const load = async (quiet = false) => {
    const seq = ++loadSeq.current;
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const d = await getDeliveryBoard();
      if (seq !== loadSeq.current) return;   // a newer load or action superseded us
      setStages(d.stages || []);
      setCards(d.cards || []);
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  const moveCard = async (id, stageKey) => {
    loadSeq.current++;   // invalidate any in-flight refetch
    setCards(cs => cs.map(c => c.id === id ? { ...c, stage: stageKey, since: new Date().toISOString() } : c));
    try {
      await moveDeliveryCard(id, stageKey);
      load(true);   // pick up the freshly seeded checklist
    } catch (e) {
      toast('error', e.message);
      load(true);   // resync from the server instead of restoring a stale snapshot
    }
  };

  const toggleItem = async (card, item) => {
    setCards(cs => cs.map(c => c.id !== card.id ? c : {
      ...c,
      checklist: {
        ...c.checklist,
        done: c.checklist.done + (item.done ? -1 : 1),
        items: c.checklist.items.map(i => i.id === item.id ? { ...i, done: !i.done } : i),
      },
    }));
    try { await updateClientTask(item.id, { status: item.done ? 'todo' : 'done' }); }
    catch (e) { toast('error', e.message); load(true); }
  };

  const runReport = async (card) => {
    setBusyReport(card.id);
    try {
      await generateSocialReport(card.id);
      toast('success', `Report saved to ${card.name}'s Documents.`);
      load(true);
    } catch (e) { toast('error', e.message); }
    finally { setBusyReport(null); }
  };

  const saveQuota = async (card) => {
    try {
      await setContentQuota(card.id, { posts: qPosts, reels: qReels });
      setQuotaFor(null);
      load(true);
    } catch (e) { toast('error', e.message); }
  };

  const bump = async (card, kind) => {
    try {
      await bumpContentProgress(card.id, kind, 1);
      setCards(cs => cs.map(c => c.id === card.id ? { ...c, progress: { ...c.progress, [kind]: (c.progress[kind] || 0) + 1 } } : c));
    } catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading the board…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn-ghost" onClick={() => load(true)} disabled={refreshing} style={{ fontSize: 12 }}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 16 }}>
        {stages.map(col => {
          const colCards = cards.filter(c => c.stage === col.key);
          const isOver = overCol === col.key;
          return (
            <div key={col.key}
              onDragOver={e => { e.preventDefault(); setOverCol(col.key); }}
              onDragLeave={() => setOverCol(o => o === col.key ? null : o)}
              onDrop={e => { e.preventDefault(); if (dragId && cards.find(c => c.id === dragId)?.stage !== col.key) moveCard(dragId, col.key); setDragId(null); setOverCol(null); }}
              style={{ minWidth: 265, width: 265, flexShrink: 0, background: isOver ? 'rgba(37,99,235,0.06)' : 'var(--surface)', border: `1px solid ${isOver ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 14, padding: 10, transition: 'border-color 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 10px' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', flex: 1 }}>{col.label}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 9px' }}>{colCards.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
                {colCards.map(card => {
                  const q = card.quota || {};
                  const showQuota = (col.key === 'content_launch' || col.key === 'ongoing') && (q.posts > 0 || q.reels > 0);
                  const expanded = openChecklist === card.id;
                  return (
                    <div key={card.id} draggable
                      onDragStart={e => { e.dataTransfer.setData('text/plain', String(card.id)); e.dataTransfer.effectAllowed = 'move'; setDragId(card.id); }}
                      onDragEnd={() => setDragId(null)}
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px', cursor: 'grab', opacity: dragId === card.id ? 0.5 : 1 }}>
                      {/* Name + $/mo */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="pii-name" onClick={() => onOpen?.(card.id)} title="Open client"
                          style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {card.name}
                        </span>
                        {card.monthly > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', whiteSpace: 'nowrap' }}>{money(card.monthly)}/mo</span>}
                      </div>
                      {/* status chips */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface-3)', borderRadius: 999, padding: '2px 8px' }}>{daysIn(card.since)}d in stage</span>
                        {!card.paid && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#dc2626', background: 'rgba(220,38,38,0.10)', borderRadius: 999, padding: '2px 8px' }}>Unpaid</span>}
                        {card.report_due && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#d97706', background: 'rgba(245,158,11,0.12)', borderRadius: 999, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={10} /> Report due</span>}
                      </div>

                      {/* checklist */}
                      {card.checklist.total > 0 && (
                        <div style={{ marginTop: 9 }}>
                          <div onClick={() => setOpenChecklist(expanded ? null : card.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', flex: 1 }}>Checklist {card.checklist.done}/{card.checklist.total}</span>
                            {expanded ? <ChevronUp size={12} color="var(--muted)" /> : <ChevronDown size={12} color="var(--muted)" />}
                          </div>
                          <Bar done={card.checklist.done} total={card.checklist.total} />
                          {expanded && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {card.checklist.items.map(item => (
                                <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: item.done ? 'var(--muted)' : 'var(--text)', cursor: 'pointer', lineHeight: 1.35 }}>
                                  <input type="checkbox" checked={item.done} onChange={() => toggleItem(card, item)} style={{ marginTop: 1, accentColor: 'var(--orange)' }} />
                                  <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>{item.title}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* content quota */}
                      {showQuota && (
                        <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {q.posts > 0 && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 3 }}>
                                <span style={{ flex: 1 }}>Posts {card.progress.posts}/{q.posts}</span>
                                {card.progress.source === 'manual' && <button onClick={() => bump(card, 'posts')} title="+1 post" style={{ border: 'none', background: 'var(--surface-3)', color: 'var(--text)', borderRadius: 5, cursor: 'pointer', padding: '1px 6px', fontSize: 11 }}>+1</button>}
                              </div>
                              <Bar done={card.progress.posts} total={q.posts} color="var(--blue)" />
                            </div>
                          )}
                          {q.reels > 0 && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 3 }}>
                                <span style={{ flex: 1 }}>Reels {card.progress.reels}/{q.reels}</span>
                                {card.progress.source === 'manual' && <button onClick={() => bump(card, 'reels')} title="+1 reel" style={{ border: 'none', background: 'var(--surface-3)', color: 'var(--text)', borderRadius: 5, cursor: 'pointer', padding: '1px 6px', fontSize: 11 }}>+1</button>}
                              </div>
                              <Bar done={card.progress.reels} total={q.reels} color="#a78bfa" />
                            </div>
                          )}
                          {card.progress.source === 'upload-post' && <div style={{ fontSize: 10, color: 'var(--muted)' }}>Auto-counted from upload-post ({card.upload_post_user})</div>}
                        </div>
                      )}

                      {/* quota editor */}
                      {(col.key === 'content_launch' || col.key === 'ongoing') && (
                        quotaFor === card.id ? (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input type="number" min="0" value={qPosts} onChange={e => setQPosts(parseInt(e.target.value, 10) || 0)} title="Posts per month" style={{ width: 52, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '4px 6px' }} />
                            <input type="number" min="0" value={qReels} onChange={e => setQReels(parseInt(e.target.value, 10) || 0)} title="Reels per month" style={{ width: 52, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '4px 6px' }} />
                            <button onClick={() => saveQuota(card)} style={{ border: 'none', background: 'var(--orange)', color: '#fff', borderRadius: 6, cursor: 'pointer', padding: '4px 10px', fontSize: 11.5, fontWeight: 700 }}>Set</button>
                            <button onClick={() => setQuotaFor(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11.5 }}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                            <button onClick={() => { setQuotaFor(card.id); setQPosts(q.posts || 0); setQReels(q.reels || 0); }}
                              style={{ flex: 1, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', borderRadius: 7, cursor: 'pointer', padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>
                              {q.posts > 0 || q.reels > 0 ? 'Edit quota' : 'Set content quota'}
                            </button>
                            {col.key === 'ongoing' && (
                              <button onClick={() => runReport(card)} disabled={busyReport === card.id}
                                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, border: '1px solid rgba(37,99,235,0.35)', background: 'rgba(37,99,235,0.08)', color: 'var(--orange)', borderRadius: 7, cursor: 'pointer', padding: '4px 8px', fontSize: 11, fontWeight: 700 }}>
                                {busyReport === card.id ? <Loader size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> : <FileText size={11} />}
                                {busyReport === card.id ? 'Building…' : 'Report'}
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
                {colCards.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', padding: '14px 0' }}>Drop a client here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
