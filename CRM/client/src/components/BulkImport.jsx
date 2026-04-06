import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Upload, Link, X, Check, AlertCircle, ChevronDown } from 'lucide-react';
import { bulkImportLeads } from '../api';

const LEAD_FIELDS = [
  // Core
  { key: 'name',               label: 'Name',               required: true },
  { key: 'email',              label: 'Email' },
  { key: 'phone',              label: 'Phone' },
  { key: 'lead_source',        label: 'Lead Source / Traffic' },
  { key: 'status',             label: 'Status' },
  // Survey fields
  { key: 'submission_date',    label: 'Submission Date' },
  { key: 'budget',             label: 'Budget' },
  { key: 'time_available',     label: 'Time Available' },
  { key: 'location',           label: 'Location' },
  { key: 'tiktok_handle',      label: 'TikTok Handle' },
  { key: 'has_business',       label: 'Has Business?' },
  { key: 'website',            label: 'Website URL' },
  { key: 'social_media',       label: 'Social Media Handles' },
  { key: 'current_situation',  label: 'Current Situation' },
  { key: 'financial_goal',     label: 'Financial Goal' },
  { key: 'why_now',            label: 'Why Now?' },
  { key: 'skills_story',       label: 'Skills & Story' },
  { key: 'previous_attempts',  label: 'Previous Attempts' },
  { key: 'biggest_fear',       label: 'Biggest Fear' },
  { key: 'tech_comfort',       label: 'Tech Comfort' },
  { key: 'content_preference', label: 'Content Preference' },
  { key: 'work_style',         label: 'Work Style' },
  { key: 'biggest_wish',       label: 'Biggest Wish' },
  { key: 'notes',              label: 'Additional Info / Notes' },
];

const PATTERNS = {
  name:               ['name', 'full name', 'fullname', 'lead name', 'contact name'],
  email:              ['email', 'email address', 'e-mail', 'mail'],
  phone:              ['phone', 'phone number', 'mobile', 'cell', 'tel'],
  lead_source:        ['source', 'lead source', 'traffic source', 'channel', 'how did you hear'],
  status:             ['status', 'lead status', 'stage'],
  submission_date:    ['submission date', 'date', 'submitted', 'timestamp'],
  budget:             ['budget', 'spend', 'monthly budget'],
  time_available:     ['time available', 'hours', 'availability', 'time per week'],
  location:           ['location', 'city', 'state', 'country', 'region'],
  tiktok_handle:      ['tiktok', 'tiktok handle', 'tik tok'],
  has_business:       ['has business', 'business', 'established'],
  website:            ['website', 'website url', 'url', 'site', 'web'],
  social_media:       ['social media', 'social media handles', 'instagram', 'facebook', 'handles'],
  current_situation:  ['current situation', 'situation', 'current challenge'],
  financial_goal:     ['financial goal', 'goal', 'income goal', 'revenue goal'],
  why_now:            ['why now', 'why', 'reason'],
  skills_story:       ['skills', 'story', 'skills & story', 'background'],
  previous_attempts:  ['previous attempts', 'previous', 'tried before', 'attempts'],
  biggest_fear:       ['biggest fear', 'fear', 'concern', 'worry'],
  tech_comfort:       ['tech comfort', 'tech', 'technology', 'technical'],
  content_preference: ['content preference', 'content', 'content type'],
  work_style:         ['work style', 'working style', 'style'],
  biggest_wish:       ['biggest wish', 'wish', 'desire', 'outcome'],
  notes:              ['additional info', 'notes', 'note', 'comments', 'description'],
};

function autoMap(headers) {
  const mapping = {};
  headers.forEach((h, i) => {
    const lower = (h || '').toLowerCase().trim();
    for (const [field, terms] of Object.entries(PATTERNS)) {
      if (!mapping[field] && terms.some(t => lower.includes(t))) {
        mapping[field] = String(i);
      }
    }
  });
  return mapping;
}

function parseGoogleSheetsId(url) {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

export default function BulkImport({ onClose, onImported }) {
  const [tab, setTab] = useState('file');          // 'file' | 'gsheets'
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [sheetUrl, setSheetUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const fileRef = useRef();

  // ── Parse CSV text into headers + rows ──────────────────────────────────
  function applyCSV(text) {
    const result = Papa.parse(text, { skipEmptyLines: true });
    if (!result.data || result.data.length < 2) { setError('File appears empty or unreadable.'); return; }
    const hdrs = result.data[0].map(String);
    const dataRows = result.data.slice(1);
    setHeaders(hdrs);
    setRows(dataRows);
    setMapping(autoMap(hdrs));
    setError('');
  }

  // ── File upload handler ───────────────────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = ev => applyCSV(ev.target.result);
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = ev => {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        applyCSV(csv);
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError('Unsupported file type. Use .csv or .xlsx');
    }
  }

  // ── Google Sheets fetch ───────────────────────────────────────────────────
  async function handleFetchSheet() {
    const id = parseGoogleSheetsId(sheetUrl);
    if (!id) { setError('Could not find a spreadsheet ID in that URL.'); return; }
    setFetching(true); setError('');
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
      const resp = await fetch(`/api/proxy-csv?url=${encodeURIComponent(csvUrl)}`);
      if (!resp.ok) throw new Error('Could not fetch sheet. Make sure it is publicly shared.');
      const text = await resp.text();
      applyCSV(text);
    } catch (err) {
      setError(err.message);
    } finally { setFetching(false); }
  }

  // ── Build leads from mapping + rows ──────────────────────────────────────
  function buildLeads() {
    return rows.map(row => {
      const lead = {};
      LEAD_FIELDS.forEach(({ key }) => {
        const colIdx = mapping[key];
        if (colIdx !== undefined && colIdx !== '') {
          lead[key] = String(row[Number(colIdx)] || '').trim();
        }
      });
      return lead;
    }).filter(l => l.name);
  }

  // ── Dedup within the file: merge rows with same email (or name fallback) ──
  function deduplicateLeads(leads) {
    const seen = new Map(); // key -> index in result
    const result = [];
    let mergedCount = 0;
    leads.forEach(lead => {
      const key = (lead.email || '').toLowerCase() || (lead.name || '').toLowerCase();
      if (seen.has(key)) {
        mergedCount++;
        const existing = result[seen.get(key)];
        // Fill in any blank fields from this duplicate
        LEAD_FIELDS.forEach(({ key: f }) => {
          if (lead[f] && !existing[f]) existing[f] = lead[f];
        });
      } else {
        seen.set(key, result.length);
        result.push({ ...lead });
      }
    });
    return { deduped: result, mergedCount };
  }

  const { deduped: dedupedLeads, mergedCount } = deduplicateLeads(buildLeads());

  // ── Import ────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (dedupedLeads.length === 0) { setError('No valid leads found (Name column required).'); return; }
    setImporting(true); setError('');
    try {
      const result = await bulkImportLeads(dedupedLeads);
      setDone(result);
      onImported();
    } catch (err) {
      setError(err.message);
    } finally { setImporting(false); }
  }

  const preview = dedupedLeads.slice(0, 5);

  // ── Success screen ───────────────────────────────────────────────────────
  if (done !== null) {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <div style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#c8f13522', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Check size={30} style={{ color: '#c8f135' }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#e8e6df', marginBottom: 16 }}>Import Complete!</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {done.created > 0 && (
                <div style={{ background: '#c8f13515', border: '1px solid #c8f13540', borderRadius: 8, padding: '8px 16px', color: '#c8f135', fontSize: 14 }}>
                  ✓ {done.created} new lead{done.created !== 1 ? 's' : ''} added
                </div>
              )}
              {done.updated > 0 && (
                <div style={{ background: '#c8f13515', border: '1px solid #c8f13540', borderRadius: 8, padding: '8px 16px', color: '#c8f135', fontSize: 14 }}>
                  ↑ {done.updated} existing lead{done.updated !== 1 ? 's' : ''} updated with missing info
                </div>
              )}
              {done.skipped > 0 && (
                <div style={{ background: '#4a484515', border: '1px solid #4a484540', borderRadius: 8, padding: '8px 16px', color: '#4a4845', fontSize: 14 }}>
                  — {done.skipped} duplicate{done.skipped !== 1 ? 's' : ''} skipped (no new info)
                </div>
              )}
              {mergedCount > 0 && (
                <div style={{ background: '#fdab3d15', border: '1px solid #fdab3d40', borderRadius: 8, padding: '8px 16px', color: '#fdab3d', fontSize: 14 }}>
                  ⊕ {mergedCount} duplicate row{mergedCount !== 1 ? 's' : ''} merged within file
                </div>
              )}
            </div>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 620 }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #252523', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#e8e6df' }}>Bulk Import Leads</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#161830', borderRadius: 8, padding: 4 }}>
            {[['file', '📄 Upload File (CSV / XLSX)'], ['gsheets', '📊 Google Sheets URL']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: tab === id ? '#111110' : 'transparent',
                color: tab === id ? '#fff' : '#4a4845', fontSize: 13, fontWeight: tab === id ? 600 : 400,
              }}>{label}</button>
            ))}
          </div>

          {/* File upload */}
          {tab === 'file' && (
            <div
              style={{ border: '2px dashed #252523', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
              onClick={() => fileRef.current.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { fileRef.current.files = e.dataTransfer.files; handleFile({ target: { files: [f] } }); } }}
            >
              <Upload size={28} style={{ color: '#c8f135', marginBottom: 10 }} />
              <div style={{ color: '#e8e6df', fontWeight: 600, marginBottom: 4 }}>Drop a file or click to browse</div>
              <div style={{ color: '#4a4845', fontSize: 13 }}>Supports .csv, .xlsx, .xls</div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
            </div>
          )}

          {/* Google Sheets */}
          {tab === 'gsheets' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#7a7870', fontSize: 13, marginBottom: 8 }}>
                Paste a Google Sheets link (sheet must be <strong style={{ color: '#c8f135' }}>publicly viewable</strong>)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={e => setSheetUrl(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" onClick={handleFetchSheet} disabled={fetching || !sheetUrl}>
                  {fetching ? '...' : 'Load'}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ff5c5c22', border: '1px solid #ff5c5c44', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <AlertCircle size={15} style={{ color: '#ff5c5c', flexShrink: 0 }} />
              <span style={{ color: '#ff5c5c', fontSize: 13 }}>{error}</span>
            </div>
          )}

          {/* Column mapping */}
          {headers.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6df', marginBottom: 10 }}>
                Map columns <span style={{ color: '#4a4845', fontWeight: 400 }}>({rows.length} rows detected)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {LEAD_FIELDS.map(({ key, label, required }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: required ? '#fdab3d' : '#7a7870', width: 80, flexShrink: 0 }}>
                      {label}{required ? ' *' : ''}
                    </span>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <select
                        value={mapping[key] ?? ''}
                        onChange={e => setMapping(m => ({ ...m, [key]: e.target.value }))}
                        className="form-select"
                        style={{ width: '100%', fontSize: 12, paddingRight: 24 }}
                      >
                        <option value="">— skip —</option>
                        {headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: '#4a4845', marginBottom: 8 }}>Preview (first {preview.length})</div>
                  <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>{LEAD_FIELDS.filter(f => mapping[f.key] !== undefined && mapping[f.key] !== '').map(f => (
                          <th key={f.key} style={{ textAlign: 'left', padding: '4px 8px', color: '#4a4845', borderBottom: '1px solid #252523' }}>{f.label}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i}>
                            {LEAD_FIELDS.filter(f => mapping[f.key] !== undefined && mapping[f.key] !== '').map(f => (
                              <td key={f.key} style={{ padding: '4px 8px', color: '#7a7870', borderBottom: '1px solid #111110' }}>
                                {row[f.key] || <span style={{ color: '#555' }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #252523' }}>
          {mergedCount > 0 && (
            <div style={{ marginBottom: 10, fontSize: 12, color: '#fdab3d', background: '#fdab3d12', border: '1px solid #fdab3d30', borderRadius: 6, padding: '6px 10px' }}>
              ⊕ {mergedCount} duplicate row{mergedCount !== 1 ? 's' : ''} in file merged — info consolidated
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#4a4845', fontSize: 13 }}>
              {rows.length > 0 ? `${dedupedLeads.length} leads ready to import` : 'Upload a file to get started'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={importing || dedupedLeads.length === 0}
              >
                {importing ? 'Importing...' : `Import ${dedupedLeads.length > 0 ? dedupedLeads.length : ''} Leads`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 2000,
};
const modalStyle = {
  background: '#161614', border: '1px solid #252523', borderRadius: 14,
  width: '90vw', maxHeight: '90vh', overflow: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
