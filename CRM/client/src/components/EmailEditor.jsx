import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link as LinkIcon, Image as ImageIcon,
  Heading1, Heading2, Type, Code2, Eye, Loader, Upload,
  MousePointerClick, Youtube, Trash2, X,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { uploadEmailImage } from '../api';

// Sanitize HTML before assigning to innerHTML / dangerouslySetInnerHTML.
function sanitize(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'style', 'class', 'width', 'height', 'align', 'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
    ADD_ATTR: ['target'],
  });
}

// Full-document sanitize — permits <style>, <link>, <html>, <head>, <body>
// so we can render complete email templates inside the visual iframe without
// stripping their design system.
function sanitizeFullDoc(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ADD_TAGS: ['style', 'link', 'meta', 'html', 'head', 'body', 'title'],
    ADD_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'style', 'class', 'width', 'height', 'align', 'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'name', 'content', 'charset', 'http-equiv', 'media', 'property'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
  });
}

function isFullDocument(html) {
  if (!html) return false;
  return /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html) || /<!doctype/i.test(html);
}

// Extract YouTube video ID from a URL or paste (handles youtu.be, youtube.com/watch, /embed, /shorts)
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

const EmailEditor = forwardRef(function EmailEditor({ value, onChange, onSelectionChange, clientId, placeholder, height = 480 }, ref) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const iframeRef = useRef(null);
  const refCounter = useRef(0);
  const [uploading, setUploading] = useState(false);
  // Always default to visual — this is the click-to-edit "pretty" editor.
  const [mode, setMode] = useState('visual');
  const [htmlSource, setHtmlSource] = useState(value || '');
  const [selectedInfo, setSelectedInfo] = useState(null); // { type: 'link'|'image', rect, href?, src?, alt? }
  const lastPropValue = useRef(value);

  // Sync initial value into rich editor
  useEffect(() => {
    if (value !== lastPropValue.current) {
      lastPropValue.current = value;
      setHtmlSource(value || '');
      if (editorRef.current && mode === 'rich') {
        const clean = sanitize(value || '');
        if (editorRef.current.innerHTML !== clean) editorRef.current.innerHTML = clean;
      }
      // Visual iframe will re-render via its own effect below
    }
  }, [value, mode]);

  useEffect(() => {
    if (editorRef.current && mode === 'rich' && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = sanitize(value || '');
    }
  }, [mode]);

  function exec(cmd, arg = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    flushRich();
  }

  function flushRich() {
    const html = editorRef.current?.innerHTML || '';
    setHtmlSource(html);
    onChange?.(html);
  }

  useImperativeHandle(ref, () => ({
    insertHtml(html) {
      if (mode === 'rich' && editorRef.current) {
        editorRef.current.focus();
        const sel = window.getSelection();
        if (!sel || !editorRef.current.contains(sel.anchorNode)) {
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        document.execCommand('insertHTML', false, html);
        flushRich();
      }
    },
    focus() { editorRef.current?.focus(); },
    // Replace the entire document with new HTML (used by AI agent)
    setHtml(newHtml) {
      setHtmlSource(newHtml || '');
      onChange?.(newHtml || '');
      if (mode === 'visual') renderVisualDoc(newHtml);
      else if (mode === 'rich' && editorRef.current) {
        editorRef.current.innerHTML = sanitize(newHtml || '');
      }
    },
    // Get the element tagged with a particular vtm-ref
    getElementHtml(refId) {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return null;
      const el = doc.querySelector(`[data-vtm-ref="${refId}"]`);
      return el ? el.outerHTML : null;
    },
    getMode() { return mode; },
  }));

  function applyHeading(tag) { exec('formatBlock', tag); }

  function insertLink() {
    const url = prompt('Link URL:');
    if (url) exec('createLink', url);
  }

  async function handleImageUpload(file) {
    if (!file || !clientId) return;
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      const { url } = await uploadEmailImage({
        client_id: clientId,
        filename: file.name,
        content_type: file.type,
        data_base64: b64,
      });
      if (mode === 'rich') {
        editorRef.current?.focus();
        const imgHtml = `<img src="${url}" alt="" style="max-width:100%;height:auto;display:block;margin:12px 0;border-radius:4px;" />`;
        document.execCommand('insertHTML', false, imgHtml);
        flushRich();
      } else if (mode === 'visual' && selectedInfo?.type === 'image' && selectedInfo.el) {
        selectedInfo.el.setAttribute('src', url);
        flushVisual();
      }
    } catch (e) {
      alert('Upload failed: ' + e.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function triggerUpload() { fileRef.current?.click(); }

  function onHtmlSourceChange(e) {
    setHtmlSource(e.target.value);
    onChange?.(e.target.value);
  }

  function onPaste(e) {
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      e.preventDefault();
      document.execCommand('insertText', false, text);
      flushRich();
    }
  }

  // ───── VISUAL MODE (iframe WYSIWYG) ─────

  function renderVisualDoc(src) {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const content = isFullDocument(src)
      ? sanitizeFullDoc(src || '')
      : `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:20px;color:#333;margin:0}</style></head><body>${sanitize(src || '')}</body></html>`;
    doc.open();
    doc.write(content);
    doc.close();
    setTimeout(() => installVisualEditing(iframe), 20);
  }

  // (Re)load iframe when entering visual mode
  useEffect(() => {
    if (mode !== 'visual') return;
    renderVisualDoc(htmlSource || '');
  }, [mode]);

  // When parent pushes a new value, re-render iframe
  useEffect(() => {
    if (mode !== 'visual') return;
    if (value === lastPropValue.current) return;
    renderVisualDoc(value || '');
  }, [value, mode]);

  function flushVisual() {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    // Serialize the current iframe document (minus our injected editing chrome)
    const clone = iframe.contentDocument.documentElement.cloneNode(true);
    // Strip editing artifacts
    clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    clone.querySelectorAll('[data-vtm-hover]').forEach(el => el.removeAttribute('data-vtm-hover'));
    clone.querySelectorAll('style[data-vtm-chrome]').forEach(el => el.remove());
    // Keep data-vtm-ref so AI agent can target elements; they'll be stripped at save time.
    const html = '<!doctype html>\n' + clone.outerHTML;
    setHtmlSource(html);
    onChange?.(html);
  }

  // Install click/hover handlers inside the iframe body
  function installVisualEditing(iframe) {
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;

    // Chrome style — hover outline + toolbar button styling
    if (!doc.head.querySelector('style[data-vtm-chrome]')) {
      const s = doc.createElement('style');
      s.setAttribute('data-vtm-chrome', '1');
      s.textContent = `
        [data-vtm-hover="1"] { outline: 2px dashed #ff9b26 !important; outline-offset: 2px; cursor: text; }
        [contenteditable="true"]:focus { outline: 2px solid #ff9b26 !important; outline-offset: 2px; }
        a[data-vtm-hover="1"], img[data-vtm-hover="1"] { cursor: pointer !important; }
      `;
      doc.head.appendChild(s);
    }

    // Make text blocks editable + assign stable refs for AI tagging
    const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'LI', 'TD', 'DIV', 'A', 'STRONG', 'EM', 'B', 'I'];
    doc.body.querySelectorAll('*').forEach(el => {
      if (textTags.includes(el.tagName) && el.children.length === 0 && el.textContent.trim()) {
        el.setAttribute('contenteditable', 'true');
      }
      if ((textTags.includes(el.tagName) || el.tagName === 'IMG') && !el.getAttribute('data-vtm-ref')) {
        refCounter.current += 1;
        el.setAttribute('data-vtm-ref', `ref-${refCounter.current}`);
      }
    });

    // Hover outline on block elements
    doc.body.addEventListener('mouseover', onHover);
    doc.body.addEventListener('mouseout', onUnhover);
    doc.body.addEventListener('click', onVisualClick, true);
    doc.body.addEventListener('input', onVisualInput, true);
    doc.body.addEventListener('focusin', onFocusIn, true);

    function onFocusIn(e) {
      const el = e.target;
      if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
        const refId = el.getAttribute('data-vtm-ref');
        if (refId && onSelectionChange) {
          const text = (el.textContent || '').trim().slice(0, 120);
          onSelectionChange({ refId, text, tag: el.tagName.toLowerCase() });
        }
      }
    }

    function onHover(e) {
      const el = e.target;
      if (el.closest('a') || el.tagName === 'IMG' || el.getAttribute('contenteditable') === 'true') {
        const target = el.closest('a') || el;
        target.setAttribute('data-vtm-hover', '1');
      }
    }
    function onUnhover(e) {
      const el = e.target;
      const target = el.closest('a') || el;
      target.removeAttribute('data-vtm-hover');
    }
    function onVisualClick(e) {
      const linkEl = e.target.closest('a');
      const imgEl = e.target.tagName === 'IMG' ? e.target : null;
      if (linkEl && !e.target.closest('[contenteditable="true"]:not(a)')) {
        // Link click — show popover for href editing. Prevent navigation.
        e.preventDefault();
        const rect = linkEl.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();
        setSelectedInfo({
          type: 'link',
          el: linkEl,
          href: linkEl.getAttribute('href') || '',
          rect: {
            top: iframeRect.top + rect.top + rect.height + window.scrollY,
            left: iframeRect.left + rect.left + window.scrollX,
            width: rect.width,
          },
          // Find a nested image (common YouTube card pattern: <a><img></a>)
          nestedImg: linkEl.querySelector('img'),
        });
      } else if (imgEl) {
        e.preventDefault();
        const rect = imgEl.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();
        setSelectedInfo({
          type: 'image',
          el: imgEl,
          src: imgEl.getAttribute('src') || '',
          alt: imgEl.getAttribute('alt') || '',
          rect: {
            top: iframeRect.top + rect.top + rect.height + window.scrollY,
            left: iframeRect.left + rect.left + window.scrollX,
            width: rect.width,
          },
        });
      }
    }
    function onVisualInput() { flushVisual(); }
  }

  function closePopover() { setSelectedInfo(null); }

  function savePopoverLink(href) {
    if (!selectedInfo?.el) return;
    selectedInfo.el.setAttribute('href', href);
    // YouTube auto-thumbnail: if href is a YouTube URL and link contains an img, swap src to thumbnail
    const vid = extractYouTubeId(href);
    if (vid && selectedInfo.nestedImg) {
      selectedInfo.nestedImg.setAttribute('src', `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`);
    }
    flushVisual();
    closePopover();
  }
  function savePopoverImage(src, alt) {
    if (!selectedInfo?.el) return;
    selectedInfo.el.setAttribute('src', src);
    selectedInfo.el.setAttribute('alt', alt || '');
    flushVisual();
    closePopover();
  }
  function deleteSelectedBlock() {
    if (!selectedInfo?.el) return;
    // Walk up to a reasonable "section" — card, container, top-level child of body
    let target = selectedInfo.el;
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      while (target.parentElement && target.parentElement !== doc.body && !/(card|container|section|box|strip)/i.test(target.className || '')) {
        target = target.parentElement;
      }
    }
    target.remove();
    flushVisual();
    closePopover();
  }

  // ───── UI ─────

  const tbStyle = {
    width: 30, height: 30, borderRadius: 6, border: 'none',
    background: 'transparent', color: '#5a5a6e', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.12s',
  };
  const tbDivider = { width: 1, height: 20, background: 'var(--surface-3)', margin: '0 4px' };
  const tbGroup = { display: 'inline-flex', alignItems: 'center', gap: 1 };

  const Btn = ({ onClick, title, children, active }) => (
    <button type="button" onClick={onClick} title={title}
      style={{ ...tbStyle, background: active ? 'rgba(255,155,38,0.15)' : 'transparent', color: active ? 'var(--orange)' : '#5a5a6e' }}
      onMouseEnter={e => !active && (e.currentTarget.style.background = '#f0f0f5')}
      onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}>
      {children}
    </button>
  );

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'visible', background: 'var(--surface)', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 8px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
        flexWrap: 'wrap', gap: 2,
      }}>
        {mode === 'rich' && (
          <>
            <div style={tbGroup}>
              <Btn onClick={() => exec('bold')} title="Bold"><Bold size={14} /></Btn>
              <Btn onClick={() => exec('italic')} title="Italic"><Italic size={14} /></Btn>
              <Btn onClick={() => exec('underline')} title="Underline"><Underline size={14} /></Btn>
              <Btn onClick={() => exec('strikeThrough')} title="Strike"><Strikethrough size={14} /></Btn>
            </div>
            <div style={tbDivider} />
            <div style={tbGroup}>
              <Btn onClick={() => applyHeading('H1')} title="Heading 1"><Heading1 size={14} /></Btn>
              <Btn onClick={() => applyHeading('H2')} title="Heading 2"><Heading2 size={14} /></Btn>
              <Btn onClick={() => applyHeading('P')} title="Paragraph"><Type size={14} /></Btn>
            </div>
            <div style={tbDivider} />
            <div style={tbGroup}>
              <Btn onClick={() => exec('justifyLeft')} title="Align left"><AlignLeft size={14} /></Btn>
              <Btn onClick={() => exec('justifyCenter')} title="Align center"><AlignCenter size={14} /></Btn>
              <Btn onClick={() => exec('justifyRight')} title="Align right"><AlignRight size={14} /></Btn>
            </div>
            <div style={tbDivider} />
            <div style={tbGroup}>
              <Btn onClick={() => exec('insertUnorderedList')} title="Bullet list"><List size={14} /></Btn>
              <Btn onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered size={14} /></Btn>
            </div>
            <div style={tbDivider} />
            <div style={tbGroup}>
              <Btn onClick={insertLink} title="Insert link"><LinkIcon size={14} /></Btn>
              <Btn onClick={triggerUpload} title="Upload image">
                {uploading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ImageIcon size={14} />}
              </Btn>
            </div>
          </>
        )}
        {mode === 'visual' && (
          <div style={{ fontSize: 12, color: '#5a5a6e', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MousePointerClick size={14} /> Click any text to edit. Click a link or image to change it.
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <Btn onClick={() => setMode('visual')} title="Visual editor" active={mode === 'visual'}><MousePointerClick size={14} /></Btn>
          <Btn onClick={() => setMode('rich')} title="Rich editor" active={mode === 'rich'}><Type size={14} /></Btn>
          <Btn onClick={() => { setMode('html'); setHtmlSource(editorRef.current?.innerHTML || htmlSource); }} title="HTML source" active={mode === 'html'}><Code2 size={14} /></Btn>
          <Btn onClick={() => setMode('preview')} title="Preview" active={mode === 'preview'}><Eye size={14} /></Btn>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={e => handleImageUpload(e.target.files?.[0])}
      />

      {mode === 'visual' && (
        <div style={{ background: '#e9e9ef', padding: 16, minHeight: height, overflowY: 'auto' }}>
          <iframe
            ref={iframeRef}
            title="Visual email editor"
            style={{
              width: '100%', maxWidth: 680, height: Math.max(height, 600),
              border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
              display: 'block', margin: '0 auto',
            }}
            sandbox="allow-same-origin"
          />
        </div>
      )}

      {mode === 'rich' && (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={flushRich}
          onBlur={flushRich}
          onPaste={onPaste}
          data-placeholder={placeholder || 'Write your email…'}
          style={{
            minHeight: height, padding: '18px 24px', fontSize: 15, lineHeight: 1.6,
            color: 'var(--text)', outline: 'none', overflowY: 'auto',
          }}
        />
      )}
      {mode === 'html' && (
        <textarea
          value={htmlSource}
          onChange={onHtmlSourceChange}
          placeholder="Paste or edit raw HTML here..."
          spellCheck={false}
          style={{
            width: '100%', minHeight: height, padding: '18px 24px', fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.5,
            color: 'var(--text)', border: 'none', outline: 'none', resize: 'vertical',
            boxSizing: 'border-box', background: 'var(--surface-2)',
          }}
        />
      )}
      {mode === 'preview' && (
        <div style={{ minHeight: height, padding: 24, background: 'var(--bg)', overflowY: 'auto' }}>
          {isFullDocument(htmlSource) ? (
            <iframe
              title="Preview"
              srcDoc={sanitizeFullDoc(htmlSource)}
              style={{ width: '100%', maxWidth: 680, height: Math.max(height, 600), border: 'none', margin: '0 auto', display: 'block', background: '#fff', borderRadius: 8 }}
            />
          ) : (
            <div
              style={{ maxWidth: 600, margin: '0 auto', background: 'var(--surface)', padding: '32px 28px', borderRadius: 12, boxShadow: '0 2px 8px rgba(10,20,40,0.06)' }}
              dangerouslySetInnerHTML={{ __html: sanitize(htmlSource) || '<p style="color:#b0b0c0">Nothing to preview yet.</p>' }}
            />
          )}
        </div>
      )}

      {/* Floating popover for link / image editing in visual mode */}
      {mode === 'visual' && selectedInfo && (
        <PopoverEditor
          info={selectedInfo}
          onClose={closePopover}
          onSaveLink={savePopoverLink}
          onSaveImage={savePopoverImage}
          onDelete={deleteSelectedBlock}
          onUploadImage={() => triggerUpload()}
          uploading={uploading}
        />
      )}

      <style>{`
        [contentEditable=true]:empty:before {
          content: attr(data-placeholder);
          color: #b0b0c0;
          pointer-events: none;
        }
        [contentEditable=true] h1 { font-size: 28px; font-weight: 700; margin: 16px 0 8px; }
        [contentEditable=true] h2 { font-size: 22px; font-weight: 700; margin: 14px 0 6px; }
        [contentEditable=true] p { margin: 0 0 12px 0; }
        [contentEditable=true] ul, [contentEditable=true] ol { margin: 0 0 12px 20px; }
        [contentEditable=true] a { color: var(--orange); text-decoration: underline; }
        [contentEditable=true] img { max-width: 100%; height: auto; border-radius: 4px; }
      `}</style>
    </div>
  );
});

export default EmailEditor;

// Strip internal editor attributes from serialized HTML (use before save)
export function stripEditorRefs(html) {
  if (!html) return html;
  return html.replace(/\s*data-vtm-ref="[^"]*"/g, '');
}

// Floating popover UI for link / image editing. Rendered in parent document
// at fixed position aligned below the clicked element (position computed
// when the iframe click handler fires).
function PopoverEditor({ info, onClose, onSaveLink, onSaveImage, onDelete, onUploadImage, uploading }) {
  const [href, setHref] = useState(info.href || '');
  const [src, setSrc] = useState(info.src || '');
  const [alt, setAlt] = useState(info.alt || '');

  useEffect(() => {
    setHref(info.href || '');
    setSrc(info.src || '');
    setAlt(info.alt || '');
  }, [info]);

  const isLink = info.type === 'link';
  const isYouTube = isLink && extractYouTubeId(href);

  const top = info.rect?.top ?? 100;
  const left = Math.min(info.rect?.left ?? 100, window.innerWidth - 380);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'transparent' }}
      />
      <div style={{
        position: 'fixed', top: top + 8, left, zIndex: 999, width: 360,
        background: '#fff', border: '1px solid #e3e3ea', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(10,20,40,0.18)', padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#333', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isLink ? <><LinkIcon size={14} /> Edit link {isYouTube ? '(YouTube)' : ''}</> : <><ImageIcon size={14} /> Edit image</>}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#888' }}>
            <X size={16} />
          </button>
        </div>

        {isLink && (
          <>
            <label style={{ fontSize: 12, color: '#5a5a6e', display: 'block', marginBottom: 4 }}>URL</label>
            <input
              value={href}
              onChange={e => setHref(e.target.value)}
              placeholder="https://…"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d9d9e3', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' }}
            />
            {isYouTube && info.nestedImg && (
              <div style={{ fontSize: 11, color: '#ff9b26', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Youtube size={12} /> Thumbnail will auto-update to this video
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button
                onClick={onDelete}
                style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #e6a4a4', background: '#fff6f6', color: '#c44', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Trash2 size={12} /> Delete
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={onClose} style={{ padding: '7px 12px', fontSize: 12, border: '1px solid #d9d9e3', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => onSaveLink(href)} style={{ padding: '7px 14px', fontSize: 12, border: 'none', background: 'var(--orange, #ff9b26)', color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Save</button>
              </div>
            </div>
          </>
        )}

        {!isLink && (
          <>
            <label style={{ fontSize: 12, color: '#5a5a6e', display: 'block', marginBottom: 4 }}>Image URL</label>
            <input
              value={src}
              onChange={e => setSrc(e.target.value)}
              placeholder="https://…"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d9d9e3', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' }}
            />
            <label style={{ fontSize: 12, color: '#5a5a6e', display: 'block', marginBottom: 4 }}>Alt text</label>
            <input
              value={alt}
              onChange={e => setAlt(e.target.value)}
              placeholder="Describe the image"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d9d9e3', borderRadius: 6, marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button onClick={onUploadImage} disabled={uploading} style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #d9d9e3', background: '#fff', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {uploading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />}
                Upload
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={onDelete} style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #e6a4a4', background: '#fff6f6', color: '#c44', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Trash2 size={12} />
                </button>
                <button onClick={onClose} style={{ padding: '7px 12px', fontSize: 12, border: '1px solid #d9d9e3', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => onSaveImage(src, alt)} style={{ padding: '7px 14px', fontSize: 12, border: 'none', background: 'var(--orange, #ff9b26)', color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Save</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
