import React, { useState, useEffect } from 'react';
import {
  X, Calendar, Tag, HelpCircle, Trash2, Plus, Grid3x3, Film,
  Image as ImageIcon, Smile, AtSign, Hash, Code, Sparkles,
  Instagram, MapPin, ChevronDown, Save,
} from 'lucide-react';
import CoverFramePicker from './CoverFramePicker';
import { toast } from './Toast';

/**
 * Publer-style Edit Post modal.
 * Left: Media grid + caption + Instagram Options (Post/Story/Reel + First Comment + Location).
 * Right: Live Instagram-style preview.
 */
export default function EditPostModal({ post, client, onClose, onSave, onDelete }) {
  const [caption, setCaption] = useState(post?.caption || '');
  const [hashtags, setHashtags] = useState(post?.hashtags || '');
  const [firstComment, setFirstComment] = useState(post?.first_comment || '');
  const [location, setLocation] = useState(post?.location || '');
  const [postType, setPostType] = useState(post?.post_type || 'post');
  const [scheduledAt, setScheduledAt] = useState(post?.scheduled_datetime ? toLocalInput(post.scheduled_datetime) : '');
  const [mediaUrls, setMediaUrls] = useState(post?.media_urls || []);
  const [coverTimestamp, setCoverTimestamp] = useState(post?.cover_timestamp ?? null);
  const [igOpen, setIgOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCaption(post?.caption || '');
    setHashtags(post?.hashtags || '');
    setFirstComment(post?.first_comment || '');
    setLocation(post?.location || '');
    setPostType(post?.post_type || 'post');
    setScheduledAt(post?.scheduled_datetime ? toLocalInput(post.scheduled_datetime) : '');
    setMediaUrls(post?.media_urls || []);
    setCoverTimestamp(post?.cover_timestamp ?? null);
  }, [post?.id]);

  if (!post) return null;

  function toLocalInput(iso) {
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return ''; }
  }

  function fromLocalInput(s) {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        caption,
        hashtags,
        first_comment: firstComment,
        location: location || null,
        post_type: postType,
        scheduled_datetime: fromLocalInput(scheduledAt),
        media_urls: mediaUrls,
        cover_timestamp: coverTimestamp,
      });
      onClose();
    } catch (e) {
      toast('error', 'Save failed: ' + e.message);
    }
    setSaving(false);
  };

  const charCount = firstComment.length;
  const captionCharCount = caption.length;
  const firstMedia = mediaUrls[0];
  const isVideo = post?.media_type === 'video';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(10,20,40,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '94vw', maxWidth: 1200, height: '92vh', maxHeight: 820,
        background: 'var(--surface)', borderRadius: 14, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 30px 80px rgba(10,20,40,0.35)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #eef0f5',
          background: 'linear-gradient(180deg,#fff,#fafbfe)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Edit Post</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button style={btnIcon} title="Tags"><Tag size={14} /> Tags</button>
            <button style={btnIcon} title="Help"><HelpCircle size={14} /></button>
            <button onClick={onClose} style={{ ...btnIcon, padding: 6 }}><X size={16} /></button>
          </div>
        </div>

        {/* Body: two columns */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* LEFT — editor */}
          <div style={{ flex: 1.35, overflowY: 'auto', padding: '18px 22px', background: 'var(--surface-2)' }}>
            {/* Media grid */}
            <Section title="Media" right={
              <button style={btnGhostSm} title="Remove all"
                onClick={() => { if (confirm('Remove all media?')) setMediaUrls([]); }}>
                <Trash2 size={13} />
              </button>
            }>
              <div style={{
                display: 'flex', gap: 10, flexWrap: 'wrap',
                padding: 14, background: 'var(--surface)', borderRadius: 10, border: '1px solid #eef0f5',
              }}>
                {mediaUrls.length === 0 && (
                  <div style={{ color: 'var(--muted)', fontSize: 12, padding: 20 }}>No media yet.</div>
                )}
                {mediaUrls.map((url, i) => (
                  <div key={i} style={{
                    width: 88, height: 108, borderRadius: 8, overflow: 'hidden', position: 'relative',
                    border: '1px solid #eef0f5', background: '#000',
                  }}>
                    {isVideo && i === 0 ? (
                      <video
                        src={coverTimestamp != null ? `${url}#t=${(coverTimestamp / 1000).toFixed(2)}` : url}
                        preload="metadata"
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <button
                      onClick={() => setMediaUrls(mediaUrls.filter((_, k) => k !== i))}
                      title="Remove"
                      style={{
                        position: 'absolute', top: 4, right: 4, width: 18, height: 18,
                        borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none',
                        color: '#fff', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                    >
                      <X size={10} />
                    </button>
                    <div style={{
                      position: 'absolute', bottom: 4, left: 4,
                      background: 'rgba(0,0,0,0.6)', color: '#fff',
                      fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 600,
                    }}>ALT</div>
                  </div>
                ))}
              </div>
              {/* Tiny toolbar under media */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingLeft: 4 }}>
                <IconBtn title="Upload"><ImageIcon size={14} /></IconBtn>
                <IconBtn title="Drive"><Grid3x3 size={14} /></IconBtn>
                <IconBtn title="History"><Film size={14} /></IconBtn>
                <IconBtn title="More">···</IconBtn>
              </div>
            </Section>

            {/* Cover Frame (videos only) */}
            {isVideo && firstMedia && (
              <Section title="Cover Frame">
                <div style={{ padding: 14, background: 'var(--surface)', borderRadius: 10, border: '1px solid #eef0f5' }}>
                  <CoverFramePicker
                    videoUrl={firstMedia}
                    initialMs={coverTimestamp}
                    onChange={p => setCoverTimestamp(p?.ms ?? null)}
                  />
                </div>
              </Section>
            )}

            {/* Caption */}
            <Section title="Caption">
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Write your caption..."
                style={{
                  width: '100%', minHeight: 180, maxHeight: 260,
                  padding: '14px 16px', borderRadius: 10, border: '1px solid #eef0f5',
                  fontSize: 13, lineHeight: 1.55, resize: 'vertical', outline: 'none',
                  fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingLeft: 4 }}>
                <div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}>
                  <IconBtn title="Emoji"><Smile size={14} /></IconBtn>
                  <IconBtn title="Mention"><AtSign size={14} /></IconBtn>
                  <IconBtn title="Hashtag"><Hash size={14} /></IconBtn>
                  <IconBtn title="Snippet"><Code size={14} /></IconBtn>
                  <IconBtn title="AI"><Sparkles size={14} /></IconBtn>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{captionCharCount}</div>
              </div>
              {hashtags && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--orange)', paddingLeft: 4 }}>{hashtags}</div>
              )}
            </Section>

            {/* Instagram Options */}
            <div style={cardBox}>
              <button
                onClick={() => setIgOpen(!igOpen)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                  borderBottom: igOpen ? '1px solid #eef0f5' : 'none',
                }}
              >
                <ChevronDown size={16} style={{ transform: igOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', color: 'var(--muted)' }} />
                <Instagram size={16} color="#E1306C" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Instagram Options</span>
              </button>
              {igOpen && (
                <div style={{ padding: 16 }}>
                  {/* Post / Story / Reel tabs */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2,
                    background: 'var(--surface-2)', borderRadius: 10, padding: 3, marginBottom: 18,
                  }}>
                    {[
                      { k: 'post', label: 'Post', Icon: Grid3x3 },
                      { k: 'story', label: 'Story', Icon: ImageIcon },
                      { k: 'reel', label: 'Reel', Icon: Film },
                    ].map(t => (
                      <button key={t.k}
                        onClick={() => setPostType(t.k)}
                        style={{
                          padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          background: postType === t.k ? '#fff' : 'transparent',
                          color: postType === t.k ? 'var(--orange)' : '#8e8ea0',
                          fontSize: 12, fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          boxShadow: postType === t.k ? '0 1px 3px rgba(10,20,40,0.1)' : 'none',
                        }}
                      >
                        <t.Icon size={14} /> {t.label}
                      </button>
                    ))}
                  </div>

                  {/* First Comment */}
                  <label style={lblStyle}>First Comment</label>
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={firstComment}
                      onChange={e => setFirstComment(e.target.value)}
                      placeholder="Add a comment that posts automatically after publishing..."
                      style={{
                        width: '100%', minHeight: 90, padding: '12px 14px',
                        borderRadius: 10, border: '1px solid #eef0f5',
                        fontSize: 12, lineHeight: 1.5, resize: 'vertical', outline: 'none',
                        background: 'var(--surface-2)', fontFamily: 'inherit',
                      }}
                    />
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 4px 0',
                    }}>
                      <div style={{ display: 'flex', gap: 8, color: 'var(--muted)' }}>
                        <IconBtn title="Emoji"><Smile size={13} /></IconBtn>
                        <IconBtn title="Mention"><AtSign size={13} /></IconBtn>
                        <IconBtn title="Hashtag"><Hash size={13} /></IconBtn>
                        <IconBtn title="Snippet"><Code size={13} /></IconBtn>
                        <IconBtn title="AI"><Sparkles size={13} /></IconBtn>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{charCount}</div>
                    </div>
                  </div>

                  {/* Location */}
                  <label style={{ ...lblStyle, marginTop: 14 }}>Location</label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                    <input
                      type="text"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="Search location"
                      style={{
                        width: '100%', padding: '10px 12px 10px 34px',
                        borderRadius: 10, border: '1px solid #eef0f5',
                        fontSize: 12, outline: 'none', background: 'var(--surface-2)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — preview */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '22px 24px',
            background: 'var(--surface)', borderLeft: '1px solid #eef0f5',
          }}>
            <div style={{
              maxWidth: 400, margin: '0 auto',
              border: '1px solid #eef0f5', borderRadius: 10, overflow: 'hidden',
              background: 'var(--surface)', fontFamily: 'system-ui, sans-serif',
            }}>
              {/* IG header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div className="private-value" style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: 'var(--text)',
                  }}>
                    {(client?.instagram_handle || client?.business_name || 'IG').slice(0, 1).toUpperCase()}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="private-value" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {client?.instagram_handle || client?.business_name || 'your_account'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Now{location ? ` · ${location}` : ''}</div>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 18 }}>···</div>
              </div>

              {/* Media */}
              <div style={{
                width: '100%', aspectRatio: postType === 'story' || postType === 'reel' ? '9 / 16' : '1 / 1',
                background: '#000', position: 'relative',
              }}>
                {firstMedia ? (
                  isVideo ? (
                    <video
                      src={coverTimestamp != null ? `${firstMedia}#t=${(coverTimestamp / 1000).toFixed(2)}` : firstMedia}
                      controls
                      preload="metadata"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <img src={firstMedia} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 13 }}>
                    No media yet
                  </div>
                )}
                {mediaUrls.length > 1 && (
                  <div style={{
                    position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)',
                    color: '#fff', padding: '3px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                  }}>1 / {mediaUrls.length}</div>
                )}
              </div>

              {/* IG action icons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 4px', color: 'var(--text)' }}>
                <span style={{ fontSize: 18 }}>♡</span>
                <span style={{ fontSize: 18 }}>💬</span>
                <span style={{ fontSize: 18 }}>▷</span>
                <span style={{ marginLeft: 'auto', fontSize: 18 }}>⌘</span>
              </div>

              {/* Caption preview */}
              <div style={{ padding: '4px 12px 12px', fontSize: 12, lineHeight: 1.5, color: 'var(--text)' }}>
                <strong>{client?.instagram_handle || 'your_account'}</strong>{' '}
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {(caption || 'Your caption will appear here.').slice(0, 140)}
                  {caption.length > 140 ? <span style={{ color: 'var(--muted)' }}>... See more</span> : null}
                </span>
              </div>

              {/* First comment preview */}
              {firstComment && (
                <div style={{
                  padding: '8px 12px', borderTop: '1px solid #f4f6fb',
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: 'var(--surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: 'var(--muted)', flexShrink: 0,
                  }}>@</div>
                  <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.45 }}>
                    <strong>{client?.instagram_handle || 'your_account'}</strong> {firstComment}
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Now · Like · Reply</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderTop: '1px solid #eef0f5', background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} color="var(--orange)" />
              Scheduled for:
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 8, border: '1px solid #eef0f5',
                fontSize: 12, outline: 'none', background: 'var(--surface-2)', fontFamily: 'inherit',
              }}
            />
            {onDelete && (
              <button
                onClick={() => { if (confirm('Delete this post?')) { onDelete(); onClose(); } }}
                style={{
                  ...btnIcon, color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.1)',
                  marginLeft: 8,
                }}
                title="Delete post"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnIcon}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 22px', borderRadius: 8, border: 'none', cursor: saving ? 'wait' : 'pointer',
                background: saving ? 'var(--surface-3)' : 'linear-gradient(135deg,var(--orange),#ee7c1a)', color: '#fff',
                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Save size={13} /> {saving ? 'Saving...' : 'Update'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── small helpers ───────────────────────────────────────────── */
function Section({ title, right, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function IconBtn({ children, title }) {
  return (
    <button title={title} style={{
      width: 26, height: 26, borderRadius: 6, border: 'none',
      background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 600,
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

const btnIcon = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid #eef0f5',
  background: 'var(--surface)', color: '#5a5a6e', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
};

const btnGhostSm = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid #eef0f5',
  background: 'var(--surface)', color: 'var(--muted)', fontSize: 11, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
};

const cardBox = {
  background: 'var(--surface)', borderRadius: 10, border: '1px solid #eef0f5',
  marginBottom: 12,
};

const lblStyle = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text)',
  marginBottom: 6, letterSpacing: 0.1,
};
