import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link as LinkIcon, Image as ImageIcon,
  Heading1, Heading2, Type, Code2, Eye, Loader, Upload,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { uploadEmailImage } from '../api';

// Sanitize HTML before assigning to innerHTML / dangerouslySetInnerHTML.
// Emails from Gmail can contain arbitrary senders' HTML (XSS vector).
function sanitize(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    // Email-friendly: allow images, links, basic tables; strip scripts/iframes/event handlers.
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'style', 'class', 'width', 'height', 'align', 'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
    ADD_ATTR: ['target'],
  });
}

// Broadcast-style rich text editor with image upload.
// Emits HTML via onChange(html). Accepts initial `value` (HTML string).
// Passes clientId for scoping uploaded images in storage.
const EmailEditor = forwardRef(function EmailEditor({ value, onChange, clientId, placeholder, height = 360 }, ref) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState('rich'); // 'rich' | 'html' | 'preview'
  const [htmlSource, setHtmlSource] = useState(value || '');
  const lastPropValue = useRef(value);

  // Sync initial value into editor without wiping user edits mid-stream
  useEffect(() => {
    if (value !== lastPropValue.current) {
      lastPropValue.current = value;
      const clean = sanitize(value || '');
      setHtmlSource(clean);
      if (editorRef.current && mode === 'rich' && editorRef.current.innerHTML !== clean) {
        editorRef.current.innerHTML = clean;
      }
    }
  }, [value, mode]);

  // On first mount — hydrate contentEditable
  useEffect(() => {
    if (editorRef.current && mode === 'rich' && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = sanitize(value || '');
    }
  }, [mode]);

  function exec(cmd, arg = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    flush();
  }

  function flush() {
    const html = editorRef.current?.innerHTML || '';
    setHtmlSource(html);
    onChange?.(html);
  }

  // Expose imperative API for parent to insert HTML at the caret position.
  useImperativeHandle(ref, () => ({
    insertHtml(html) {
      if (!editorRef.current) return;
      editorRef.current.focus();
      // If the current selection is outside the editor, place caret at end
      const sel = window.getSelection();
      if (!sel || !editorRef.current.contains(sel.anchorNode)) {
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      document.execCommand('insertHTML', false, html);
      flush();
    },
    focus() { editorRef.current?.focus(); },
  }));

  function applyHeading(tag) {
    exec('formatBlock', tag);
  }

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
      // Insert image into editor
      editorRef.current?.focus();
      const imgHtml = `<img src="${url}" alt="" style="max-width:100%;height:auto;display:block;margin:12px 0;border-radius:4px;" />`;
      document.execCommand('insertHTML', false, imgHtml);
      flush();
    } catch (e) {
      alert('Upload failed: ' + e.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function triggerUpload() {
    fileRef.current?.click();
  }

  function onHtmlSourceChange(e) {
    setHtmlSource(e.target.value);
    onChange?.(e.target.value);
  }

  function onPaste(e) {
    // Strip formatting on paste by default — convert to plain text paragraphs
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      e.preventDefault();
      document.execCommand('insertText', false, text);
      flush();
    }
  }

  // Toolbar button style
  const tbStyle = {
    width: 30, height: 30, borderRadius: 6, border: 'none',
    background: 'transparent', color: '#5a5a6e', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.12s',
  };
  const tbDivider = { width: 1, height: 20, background: '#e5e7ef', margin: '0 4px' };
  const tbGroup = { display: 'inline-flex', alignItems: 'center', gap: 1 };

  const Btn = ({ onClick, title, children, active }) => (
    <button type="button" onClick={onClick} title={title}
      style={{ ...tbStyle, background: active ? '#e8ebff' : 'transparent', color: active ? '#4a6cf7' : '#5a5a6e' }}
      onMouseEnter={e => !active && (e.currentTarget.style.background = '#f0f0f5')}
      onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}>
      {children}
    </button>
  );

  return (
    <div style={{ border: '1px solid #e5e7ef', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 8px',
        borderBottom: '1px solid #e5e7ef', background: '#fafbfd',
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <Btn onClick={() => setMode('rich')} title="Rich editor" active={mode === 'rich'}><Type size={14} /></Btn>
          <Btn onClick={() => { setMode('html'); setHtmlSource(editorRef.current?.innerHTML || htmlSource); }} title="HTML source" active={mode === 'html'}><Code2 size={14} /></Btn>
          <Btn onClick={() => setMode('preview')} title="Preview" active={mode === 'preview'}><Eye size={14} /></Btn>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={e => handleImageUpload(e.target.files?.[0])}
      />

      {/* Editor body */}
      {mode === 'rich' && (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={flush}
          onBlur={flush}
          onPaste={onPaste}
          data-placeholder={placeholder || 'Write your email…'}
          style={{
            minHeight: height,
            padding: '18px 24px',
            fontSize: 15,
            lineHeight: 1.6,
            color: '#1a1a2e',
            outline: 'none',
            overflowY: 'auto',
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
            width: '100%',
            minHeight: height,
            padding: '18px 24px',
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            lineHeight: 1.5,
            color: '#1a1a2e',
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
            background: '#fafbfd',
          }}
        />
      )}
      {mode === 'preview' && (
        <div
          style={{ minHeight: height, padding: 24, background: '#f5f7fa', overflowY: 'auto' }}
        >
          <div
            style={{ maxWidth: 600, margin: '0 auto', background: '#fff', padding: '32px 28px', borderRadius: 12, boxShadow: '0 2px 8px rgba(10,20,40,0.06)' }}
            dangerouslySetInnerHTML={{ __html: sanitize(htmlSource) || '<p style="color:#b0b0c0">Nothing to preview yet.</p>' }}
          />
        </div>
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
        [contentEditable=true] a { color: #4a6cf7; text-decoration: underline; }
        [contentEditable=true] img { max-width: 100%; height: auto; border-radius: 4px; }
        [contentEditable=true] .merge-tag {
          display: inline-block;
          background: #eff6ff;
          border: 1px solid #60a5fa;
          color: #1d4ed8;
          padding: 1px 7px;
          border-radius: 5px;
          font-size: 0.92em;
          font-weight: 600;
          line-height: 1.4;
          margin: 0 1px;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
});

export default EmailEditor;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
