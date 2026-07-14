import React, { useState, useEffect, useCallback } from 'react';
import { X, Inbox, ExternalLink, RefreshCw, Loader, MessageSquare, ChevronRight } from 'lucide-react';
import { getGmailInbox } from '../api';

function relativeDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1)  return 'just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  <  7)  return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function stripEmail(from) {
  // Extract just the display name if present: "Name <email@>" → "Name"
  const match = from?.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : (from || '');
}

export default function GmailInboxModal({ onClose, labelName = 'VernonTM' }) {
  const [threads, setThreads]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [nextPageToken, setNextPage]  = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resultCount, setResultCount] = useState(0);

  const load = useCallback(async (pageToken = null) => {
    const isFirstPage = !pageToken;
    if (isFirstPage) setLoading(true);
    else             setLoadingMore(true);
    setError('');
    try {
      const params = { maxResults: 30, labelName };
      if (pageToken) params.pageToken = pageToken;
      const data = await getGmailInbox(params);
      if (isFirstPage) {
        setThreads(data.threads || []);
      } else {
        setThreads(prev => [...prev, ...(data.threads || [])]);
      }
      setNextPage(data.nextPageToken || null);
      setResultCount(prev => isFirstPage ? (data.resultCount || 0) : prev + (data.resultCount || 0));
    } catch (e) {
      setError(e.message || 'Failed to load inbox. Make sure Gmail is connected in Settings.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [labelName]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 8000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        width: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Inbox size={16} color="#2563eb" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df' }}>
              Gmail Inbox
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: '#2563eb20', color: '#2563eb', border: '1px solid #2563eb40',
            }}>{labelName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => load()}
              disabled={loading}
              title="Refresh"
              style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4, opacity: loading ? 0.5 : 1 }}
            >
              <RefreshCw size={14} style={{ animation: loading ? 'spin 0.7s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 4 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--muted)', fontSize: 13 }}>
              <Loader size={16} style={{ animation: 'spin 0.7s linear infinite' }} />
              Loading threads from Gmail…
            </div>
          )}

          {error && !loading && (
            <div style={{ margin: 20, padding: '12px 16px', borderRadius: 8, background: '#ff5c5c15', border: '1px solid #ff5c5c40', color: '#ff5c5c', fontSize: 13 }}>
              {error}
            </div>
          )}

          {!loading && !error && threads.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontSize: 13 }}>
              No threads found in <strong style={{ color: 'var(--muted)' }}>{labelName}</strong>.<br />
              <span style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                Threads appear here automatically once you send or draft an email via the CRM.
              </span>
            </div>
          )}

          {threads.map((t, i) => (
            <a
              key={t.threadId}
              href={t.gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 20px', textDecoration: 'none',
                borderBottom: '1px solid var(--border)',
                background: 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e8ecf4'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Left: reply indicator dot */}
              <div style={{ paddingTop: 3, flexShrink: 0 }}>
                {t.hasReply
                  ? <MessageSquare size={14} color="#2563eb" title="Has reply" />
                  : <ChevronRight  size={14} color="#4a4845" title="Sent only" />}
              </div>

              {/* Centre: thread info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Row 1: from + date */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: t.hasReply ? 700 : 500, color: t.hasReply ? '#fff' : '#8e8ea0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stripEmail(t.from) || stripEmail(t.to) || '(unknown)'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                    {relativeDate(t.date)}
                  </span>
                </div>

                {/* Row 2: subject */}
                <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                  {t.subject}
                  {t.messageCount > 1 && (
                    <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>({t.messageCount})</span>
                  )}
                </div>

                {/* Row 3: snippet */}
                {t.snippet && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.snippet}
                  </div>
                )}
              </div>

              {/* Right: open in Gmail icon */}
              <div style={{ paddingTop: 2, flexShrink: 0, color: 'var(--border-light)' }}>
                <ExternalLink size={12} />
              </div>
            </a>
          ))}

          {/* Load more */}
          {nextPageToken && !loading && (
            <div style={{ padding: '12px 20px', textAlign: 'center' }}>
              <button
                onClick={() => load(nextPageToken)}
                disabled={loadingMore}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 18px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  background: '#e8ecf4', border: '1px solid var(--border)', color: 'var(--muted)',
                  opacity: loadingMore ? 0.7 : 1,
                }}
              >
                {loadingMore
                  ? <Loader size={12} style={{ animation: 'spin 0.7s linear infinite' }} />
                  : null}
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && threads.length > 0 && (
          <div style={{
            padding: '10px 20px', borderTop: '1px solid var(--border)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {threads.length} thread{threads.length !== 1 ? 's' : ''} shown
              {threads.some(t => t.hasReply) && (
                <span style={{ marginLeft: 10, color: '#2563eb' }}>
                  <MessageSquare size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  {threads.filter(t => t.hasReply).length} with replies
                </span>
              )}
            </span>
            <a
              href={`https://mail.google.com/mail/u/0/#label/${encodeURIComponent(labelName)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#2563eb', textDecoration: 'none' }}
            >
              Open in Gmail <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
