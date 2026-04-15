import { useState, useEffect, useRef } from 'react';
import {
  getContacts,
  getClients, getClientByContact, createClient, updateClient, deleteClient,
  getClientLeads, createClientLead, updateClientLead, deleteClientLead,
  getOutreachQueue, updateOutreachItem, deleteOutreachItem, sendApprovedEmails, clearOutreachQueue, clearClientLeads,
  scanBrand, researchLeads, generateOutreach, outreachChat, rewriteEmail
} from '../api';
import {
  Search, Plus, Building2, Globe, Instagram, MapPin, Palette,
  Users, Target, Mic, Send, ChevronDown, ChevronUp, Edit3,
  Trash2, Check, X, Mail, Eye, RefreshCw, Loader, CheckCircle,
  Clock, AlertCircle, ArrowRight, Sparkles, Zap, Paperclip, FileIcon, Image, FileText
} from 'lucide-react';

const RETAINER_STATUSES = ['active', 'paused', 'completed'];
const TONE_OPTIONS = ['formal', 'casual', 'friendly'];

// Status colors for email pipeline
const STATUS_COLORS = {
  new: { bg: '#e8ecf4', text: '#4a6cf7' },
  draft: { bg: '#fff3e0', text: '#f59e0b' },
  pending_review: { bg: '#fff3e0', text: '#f59e0b' },
  approved: { bg: '#e8f5e9', text: '#22c55e' },
  sent: { bg: '#e8f5e9', text: '#22c55e' },
  opened: { bg: '#e0f2fe', text: '#0ea5e9' },
  replied: { bg: '#f3e8ff', text: '#a855f7' },
  error: { bg: '#fee2e2', text: '#ef4444' },
  no_response: { bg: '#f5f5f5', text: '#8e8ea0' },
};

function StatusPill({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.new;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: colors.bg, color: colors.text, textTransform: 'capitalize',
    }}>
      {(status || 'new').replace(/_/g, ' ')}
    </span>
  );
}

export default function Outreach() {
  // Contacts + Client state
  const [contacts, setContacts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [client, setClient] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [clientDraft, setClientDraft] = useState({});
  const [scanning, setScanning] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);

  // Leads + Queue
  const [leads, setLeads] = useState([]);
  const [queue, setQueue] = useState([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', instagram: '', tiktok: '', youtube: '', niche: '', follower_count: '', notes: '' });
  const [savingLead, setSavingLead] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Loading states
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [generatingEmails, setGeneratingEmails] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [editingQueueId, setEditingQueueId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  // Load contacts
  useEffect(() => {
    getContacts().then(c => setContacts(c.filter(x => !x.archived))).catch(console.error);
  }, []);

  // When a contact is selected, load or create their client profile
  useEffect(() => {
    if (!selectedContactId) { setSelectedContact(null); setClient(null); setLeads([]); setQueue([]); return; }
    const contact = contacts.find(c => c.id === selectedContactId);
    setSelectedContact(contact || null);
    if (!contact) return;

    setLoadingClient(true);
    (async () => {
      try {
        let clientData = await getClientByContact(selectedContactId);
        if (!clientData || (Array.isArray(clientData) && clientData.length === 0) || clientData.error) {
          clientData = await createClient({
            contact_id: selectedContactId,
            business_name: contact.company || contact.name,
            owner_name: contact.name,
          });
        }
        setClient(clientData);
        setShowProfile(false);
        await loadClientData(clientData.id);
      } catch (err) { console.error(err); }
      setLoadingClient(false);
    })();
  }, [selectedContactId, contacts]);

  async function loadClientData(cid) {
    try {
      const [l, q] = await Promise.all([
        getClientLeads(cid),
        getOutreachQueue(cid),
      ]);
      setLeads(l || []);
      setQueue(q || []);
    } catch (err) { console.error(err); }
  }

  // Chat scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Speech-to-text setup
  const listeningRef = useRef(false);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      let finalTranscript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setChatInput(prev => (prev ? prev + ' ' : '') + finalTranscript);
      }
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        // Delay restart to avoid rapid cycling
        setTimeout(() => {
          if (listeningRef.current) {
            try { recognition.start(); } catch (e) { /* already started */ }
          }
        }, 300);
      }
    };

    recognition.onerror = (e) => {
      console.log('Speech recognition error:', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        listeningRef.current = false;
        setIsListening(false);
        alert('Microphone access denied. Please allow microphone permission.');
      } else if (e.error === 'no-speech' || e.error === 'network' || e.error === 'audio-capture') {
        // Network/audio glitch — auto-retry after a short delay
        if (listeningRef.current) {
          setTimeout(() => {
            if (listeningRef.current) {
              try { recognition.start(); } catch (err) { /* already running */ }
            }
          }, 1000);
        }
      } else if (e.error !== 'aborted') {
        listeningRef.current = false;
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
  }, []);

  async function toggleMic() {
    if (!recognitionRef.current) return;
    if (listeningRef.current) {
      listeningRef.current = false;
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      // Request microphone permission first
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        alert('Microphone access denied. Please allow microphone permission in your browser settings.');
        return;
      }
      listeningRef.current = true;
      setIsListening(true);
      try { recognitionRef.current.start(); } catch (e) { /* already started */ }
    }
  }

  function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach(file => {
      const reader = new FileReader();
      const isImage = file.type.startsWith('image/');

      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        setAttachments(prev => [...prev, {
          file,
          name: file.name,
          type: file.type,
          isImage,
          base64,
          preview: isImage ? reader.result : null,
          size: file.size,
        }]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  }

  function removeAttachment(index) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  async function handleScanBrand() {
    if (!client) return;
    setScanning(true);
    try {
      const data = await scanBrand({
        website_url: client.website_url || clientDraft.website_url,
        business_name: client.business_name || clientDraft.business_name,
        instagram: client.instagram || clientDraft.instagram,
        facebook: client.facebook || clientDraft.facebook,
        tiktok: client.tiktok || clientDraft.tiktok,
        youtube: client.youtube || clientDraft.youtube,
        linkedin: client.linkedin || clientDraft.linkedin,
      });
      const merged = { ...client };
      Object.entries(data).forEach(([k, v]) => {
        if (v && (typeof v === 'string' ? v.length > 0 : true)) {
          if (!merged[k] || (typeof merged[k] === 'string' && merged[k].length === 0)) {
            merged[k] = v;
          }
        }
      });
      const updated = await updateClient(client.id, merged);
      setClient(updated);
    } catch (err) { console.error('Brand scan failed:', err); }
    setScanning(false);
  }

  async function handleSaveClient() {
    try {
      const updated = await updateClient(client.id, clientDraft);
      setClient({ ...client, ...updated });
      setEditingClient(false);
    } catch (err) { console.error(err); }
  }

  async function handleDeleteClient() {
    if (!confirm('Delete this client profile and all their outreach leads?')) return;
    try {
      await deleteClient(client.id);
      setClient(null);
      setSelectedContactId('');
    } catch (err) { console.error(err); }
  }

  async function sendChatMessage() {
    const text = chatInput.trim();
    if ((!text && attachments.length === 0) || chatLoading) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }

    const currentAttachments = [...attachments];
    const userMsg = { role: 'user', content: text, attachments: currentAttachments.length > 0 ? currentAttachments : undefined };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setAttachments([]);
    setChatLoading(true);

    try {
      const apiMessages = [...chatMessages, userMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => {
          if (m.attachments?.length > 0) {
            const content = [];
            m.attachments.forEach(att => {
              if (att.isImage) {
                content.push({ type: 'image', source: { type: 'base64', media_type: att.type, data: att.base64 } });
              } else {
                try {
                  const textContent = atob(att.base64);
                  content.push({ type: 'text', text: `[Attached file: ${att.name}]\n${textContent.substring(0, 5000)}` });
                } catch (e) {
                  content.push({ type: 'text', text: `[Attached file: ${att.name} (binary, cannot read)]` });
                }
              }
            });
            content.push({ type: 'text', text: m.content });
            return { role: m.role, content };
          }
          return { role: m.role, content: m.content };
        });

      const { reply, action } = await outreachChat({
        messages: apiMessages,
        client,
      });

      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      if (action?.type === 'research' && client) {
        setChatMessages(prev => [...prev, { role: 'system', content: '🔍 Searching for leads...' }]);
        setLoadingLeads(true);
        try {
          const result = await researchLeads({ command: text, client });
          await loadClientData(client.id);
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Found ${result.count} leads and added them to the lead list. Switch to the Leads tab to review.` }]);
        } catch (err) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Research failed: ${err.message}` }]);
        }
        setLoadingLeads(false);
      }

      if (action?.type === 'generate_emails' && client) {
        const targetLeads = selectedLeads.size > 0
          ? leads.filter(l => selectedLeads.has(l.id))
          : leads.filter(l => l.email && l.email_status === 'new');
        if (targetLeads.length === 0) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'No leads with emails to generate outreach for. Research leads first or select leads from the Leads tab.' }]);
        } else {
          setGeneratingEmails(true);
          setChatMessages(prev => [...prev, { role: 'system', content: `✉️ Generating emails for ${targetLeads.length} leads...` }]);
          try {
            const result = await generateOutreach({ client, leads: targetLeads });
            await loadClientData(client.id);
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Generated ${result.queued} outreach emails. Check the Approval Queue tab to review and approve.` }]);
            setActiveTab('queue');
          } catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Email generation failed: ${err.message}` }]);
          }
          setGeneratingEmails(false);
        }
      }

      if (action?.type === 'send_approved' && client) {
        const approved = queue.filter(q => q.status === 'approved');
        if (approved.length === 0) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'No approved emails in the queue. Approve some emails first.' }]);
        } else {
          setSendingEmails(true);
          setChatMessages(prev => [...prev, { role: 'system', content: `📤 Sending ${approved.length} emails with randomized delays...` }]);
          try {
            const result = await sendApprovedEmails(client.id);
            await loadClientData(client.id);
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Sent ${result.sent} of ${result.total} emails.${result.errors?.length ? ` ${result.errors.length} errors.` : ''}` }]);
          } catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Send failed: ${err.message}` }]);
          }
          setSendingEmails(false);
        }
      }

      if (action?.type === 'edit_all_emails' && client && action.instructions) {
        const pending = queue.filter(q => q.status === 'pending_review' || q.status === 'draft');
        if (pending.length === 0) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'No emails in the queue to edit.' }]);
        } else {
          setChatMessages(prev => [...prev, { role: 'system', content: `✏️ Rewriting ${pending.length} emails...` }]);
          let updated = 0;
          for (const item of pending) {
            try {
              const rewritten = await rewriteEmail({
                current_subject: item.subject,
                current_body: item.body,
                to_name: item.to_name,
                instructions: action.instructions,
                client_name: client.business_name,
              });
              await updateOutreachItem(item.id, { subject: rewritten.subject, body: rewritten.body });
              updated++;
            } catch (err) { console.error(`Failed to rewrite email to ${item.to_name}:`, err); }
          }
          await loadClientData(client.id);
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Updated ${updated} of ${pending.length} emails. Check the Approval Queue to review.` }]);
        }
      }

      if (action?.type === 'edit_email' && client && action.name) {
        const match = queue.find(q => q.to_name?.toLowerCase().includes(action.name.toLowerCase()));
        if (match) {
          try {
            let updates = {};
            if (action.subject && action.subject !== 'null') {
              updates.subject = action.subject;
            }
            if (action.instructions) {
              setChatMessages(prev => [...prev, { role: 'system', content: `✏️ Rewriting email to ${match.to_name}...` }]);
              const rewritten = await rewriteEmail({
                current_subject: match.subject,
                current_body: match.body,
                to_name: match.to_name,
                instructions: action.instructions,
                client_name: client.business_name,
              });
              updates.subject = rewritten.subject || updates.subject || match.subject;
              updates.body = rewritten.body;
            } else if (action.body && action.body !== 'null') {
              updates.body = action.body;
            }
            if (Object.keys(updates).length > 0) {
              await updateOutreachItem(match.id, updates);
              await loadClientData(client.id);
              setChatMessages(prev => [...prev, { role: 'assistant', content: `Updated email to ${match.to_name}. Check the Approval Queue to review.` }]);
            }
          } catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed to edit: ${err.message}` }]);
          }
        } else {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Couldn't find a queued email for "${action.name}".` }]);
        }
      }

      if (action?.type === 'clear_queue' && client) {
        try {
          await clearOutreachQueue(client.id);
          await loadClientData(client.id);
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'Email queue cleared.' }]);
        } catch (err) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed to clear queue: ${err.message}` }]);
        }
      }

      if (action?.type === 'clear_leads' && client) {
        try {
          await clearClientLeads(client.id);
          await loadClientData(client.id);
          setSelectedLeads(new Set());
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'All leads cleared.' }]);
        } catch (err) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed to clear leads: ${err.message}` }]);
        }
      }

      if (action?.type === 'remove_lead' && client && action.name) {
        const match = leads.find(l => l.name.toLowerCase().includes(action.name.toLowerCase()));
        if (match) {
          try {
            await deleteClientLead(match.id);
            await loadClientData(client.id);
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Removed lead: ${match.name}` }]);
          } catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed: ${err.message}` }]);
          }
        } else {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Couldn't find a lead matching "${action.name}".` }]);
        }
      }

      if (action?.type === 'remove_email' && client && action.name) {
        const match = queue.find(q => q.to_name?.toLowerCase().includes(action.name.toLowerCase()));
        if (match) {
          try {
            await deleteOutreachItem(match.id);
            await loadClientData(client.id);
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Removed email to: ${match.to_name}` }]);
          } catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed: ${err.message}` }]);
          }
        } else {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Couldn't find a queued email for "${action.name}".` }]);
        }
      }

      if (action?.type === 'add_lead' && client && action.name) {
        try {
          await createClientLead({
            client_id: client.id,
            name: action.name,
            email: action.email || null,
            instagram: action.instagram || null,
            tiktok: action.tiktok || null,
            youtube: action.youtube || null,
            niche: action.niche || null,
            follower_count: action.follower_count ? parseInt(action.follower_count) || null : null,
            notes: action.notes || null,
            email_status: 'new',
          });
          await loadClientData(client.id);
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Added lead: ${action.name}` }]);
        } catch (err) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed to add lead: ${err.message}` }]);
        }
      }

      if (action?.type === 'approve_all' && client) {
        const pending = queue.filter(q => q.status === 'pending_review' || q.status === 'draft');
        if (pending.length === 0) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'No pending emails to approve.' }]);
        } else {
          try {
            for (const item of pending) {
              await updateOutreachItem(item.id, { status: 'approved' });
            }
            await loadClientData(client.id);
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Approved ${pending.length} emails. They're ready to send.` }]);
          } catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed to approve: ${err.message}` }]);
          }
        }
      }

      if (action?.type === 'approve_email' && client && action.name) {
        const match = queue.find(q => q.to_name?.toLowerCase().includes(action.name.toLowerCase()) && (q.status === 'pending_review' || q.status === 'draft'));
        if (match) {
          try {
            await updateOutreachItem(match.id, { status: 'approved' });
            await loadClientData(client.id);
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Approved email to ${match.to_name}.` }]);
          } catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed to approve: ${err.message}` }]);
          }
        } else {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Couldn't find a pending email for "${action.name}".` }]);
        }
      }

      if (action?.type === 'approve_and_send' && client) {
        const pending = queue.filter(q => q.status === 'pending_review' || q.status === 'draft');
        if (pending.length === 0 && !queue.some(q => q.status === 'approved')) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'No emails to approve or send.' }]);
        } else {
          try {
            if (pending.length > 0) {
              for (const item of pending) {
                await updateOutreachItem(item.id, { status: 'approved' });
              }
              setChatMessages(prev => [...prev, { role: 'system', content: `✅ Approved ${pending.length} emails. Now sending...` }]);
            }
            setSendingEmails(true);
            const result = await sendApprovedEmails(client.id);
            await loadClientData(client.id);
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Sent ${result.sent} of ${result.total} emails.${result.errors?.length ? ` ${result.errors.length} errors.` : ''}` }]);
          } catch (err) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed: ${err.message}` }]);
          }
          setSendingEmails(false);
        }
      }

      if (action?.type === 'clear_all' && client) {
        try {
          await clearOutreachQueue(client.id);
          await clearClientLeads(client.id);
          await loadClientData(client.id);
          setSelectedLeads(new Set());
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'All leads and queued emails cleared.' }]);
        } catch (err) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `Failed to clear: ${err.message}` }]);
        }
      }

    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Check the console.' }]);
      console.error(err);
    }
    setChatLoading(false);
  }

  async function approveItem(id) {
    const updated = await updateOutreachItem(id, { status: 'approved' });
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...updated } : q));
  }

  async function rejectItem(id) {
    await deleteOutreachItem(id);
    setQueue(prev => prev.filter(q => q.id !== id));
  }

  async function saveQueueEdit(id) {
    const updated = await updateOutreachItem(id, editDraft);
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...updated } : q));
    setEditingQueueId(null);
    setEditDraft({});
  }

  function toggleLeadSelect(id) {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllLeads() {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)));
    }
  }

  async function deleteSelectedLeads() {
    if (!confirm(`Delete ${selectedLeads.size} leads?`)) return;
    for (const id of selectedLeads) {
      await deleteClientLead(id);
    }
    setSelectedLeads(new Set());
    loadClientData(client.id);
  }

  async function saveNewLead() {
    if (!newLead.name.trim()) return;
    setSavingLead(true);
    try {
      await createClientLead({
        client_id: client.id,
        name: newLead.name.trim(),
        email: newLead.email.trim() || null,
        instagram: newLead.instagram.trim() || null,
        tiktok: newLead.tiktok.trim() || null,
        youtube: newLead.youtube.trim() || null,
        niche: newLead.niche.trim() || null,
        follower_count: newLead.follower_count ? parseInt(newLead.follower_count) : null,
        notes: newLead.notes.trim() || null,
        email_status: 'new',
      });
      setNewLead({ name: '', email: '', instagram: '', tiktok: '', youtube: '', niche: '', follower_count: '', notes: '' });
      setShowAddLead(false);
      loadClientData(client.id);
    } catch (err) { console.error(err); }
    setSavingLead(false);
  }

  function getQuickReplies() {
    const hasLeads = leads.length > 0;
    const hasQueue = queue.length > 0;
    const hasApproved = queue.some(q => q.status === 'approved');
    const hasPending = queue.some(q => q.status === 'pending_review' || q.status === 'draft');
    const hasNewLeads = leads.some(l => l.email && l.email_status === 'new');
    const hasBrand = client?.brand_bible;
    const lastMsg = chatMessages.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';

    if (lastMsg.includes('leads and added them') || lastMsg.includes('Added lead')) {
      return [
        hasNewLeads ? '✉️ Generate outreach emails' : '🔍 Research more leads',
        '➕ Add a lead manually',
        '📋 Show me the lead list',
      ];
    }
    if (lastMsg.includes('outreach emails') && lastMsg.includes('Approval Queue')) {
      return [
        '✅ Approve all emails',
        '✏️ Make all emails more casual',
        '👀 Show me the queue',
      ];
    }
    if (lastMsg.includes('Sent ')) {
      return [
        '🔍 Research more leads',
        '📊 How did the campaign go?',
        '🧹 Clear everything',
      ];
    }
    if (lastMsg.includes('cleared')) {
      return [
        '🔍 Find new leads',
        '➕ Add a lead manually',
        '📖 Scan their brand',
      ];
    }
    if (hasApproved) {
      return [
        `📤 Send ${queue.filter(q => q.status === 'approved').length} approved emails`,
        hasPending ? '✅ Approve all emails' : '✏️ Edit the emails',
        '🧹 Clear the email queue',
      ];
    }
    if (hasPending) {
      return [
        '✅ Approve all emails',
        '✏️ Make the emails shorter',
        '🗑️ Clear the email queue',
      ];
    }
    if (hasLeads && hasNewLeads) {
      return [
        '✉️ Generate outreach emails',
        '🔍 Find more leads',
        '➕ Add a lead',
      ];
    }
    if (hasLeads && !hasNewLeads) {
      return [
        '🔍 Research more leads',
        '➕ Add a lead',
        hasQueue ? '👀 Check the queue' : '🧹 Clear all leads',
      ];
    }
    if (!hasBrand) {
      return [
        '📖 Scan their brand',
        '🔍 Find leads for this client',
        '➕ Add a lead',
      ];
    }
    return [
      '🔍 Find leads for this client',
      '➕ Add a lead',
      '📖 Rescan their brand',
    ];
  }

  // ── Styles ──

  const cardStyle = {
    background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 14,
    padding: 20, marginBottom: 16,
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid #e5e7ef', background: '#f8f9fc', fontSize: 14,
    color: '#1a1a2e', outline: 'none', fontFamily: 'inherit',
  };

  const btnPrimary = {
    padding: '10px 20px', background: '#4a6cf7', color: '#fff', border: 'none',
    borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  const btnGhost = {
    padding: '8px 14px', background: 'transparent', color: '#8e8ea0', border: '1px solid #e5e7ef',
    borderRadius: 8, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4,
  };

  const sidebarTabStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
    fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer',
    color: active ? '#4a6cf7' : '#8e8ea0', background: active ? 'rgba(74,108,247,0.08)' : 'transparent',
    borderLeft: active ? '3px solid #4a6cf7' : '3px solid transparent',
    borderRight: 'none', borderTop: 'none', borderBottom: 'none',
    width: '100%', textAlign: 'left', transition: 'all 0.15s',
    fontFamily: 'inherit',
  });

  const sidebarClientStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
    color: active ? '#1a1a2e' : '#555', background: active ? 'rgba(74,108,247,0.08)' : 'transparent',
    borderLeft: active ? '3px solid #4a6cf7' : '3px solid transparent',
    transition: 'all 0.15s', overflow: 'hidden',
  });

  // ── Render ──

  return (
    <div className="outreach-page" style={{ height: '100%', display: 'flex' }}>
      {/* LEFT SIDEBAR */}
      <div className="outreach-sidebar" style={{
        width: 220, background: '#fff', borderRight: '1px solid #e5e7ef',
        display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%',
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid #e5e7ef' }}>
          <h1 style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>Outreach</h1>
          <span style={{ fontSize: 11, color: '#8e8ea0' }}>{contacts.length} contacts</span>
        </div>

        {/* Client list */}
        <div className="outreach-client-list" style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {loadingClient && (
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, color: '#8e8ea0', fontSize: 12 }}>
              <Loader size={13} className="spin" /> Loading...
            </div>
          )}
          {contacts.map(c => (
            <div
              key={c.id}
              style={sidebarClientStyle(selectedContactId === c.id)}
              onClick={() => setSelectedContactId(c.id)}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                background: selectedContactId === c.id ? '#4a6cf7' : '#e8ecf4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: selectedContactId === c.id ? '#fff' : '#4a6cf7',
                fontWeight: 700, fontSize: 11,
              }}>
                {(c.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <div className="private-value" style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontSize: 12, lineHeight: 1.3,
                }}>
                  {c.name}
                </div>
                {c.company && (
                  <div style={{
                    fontSize: 10, color: '#8e8ea0', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.company}
                  </div>
                )}
              </div>
            </div>
          ))}
          {contacts.length === 0 && !loadingClient && (
            <div style={{ padding: '20px 14px', textAlign: 'center', color: '#8e8ea0', fontSize: 12 }}>
              No contacts found
            </div>
          )}
        </div>

        {/* Add Client button */}
        <div style={{ borderTop: '1px solid #e5e7ef', padding: '10px 12px' }}>
          <button
            style={{
              width: '100%', padding: '7px 0', background: 'rgba(74,108,247,0.06)',
              border: '1px solid rgba(74,108,247,0.2)', borderRadius: 8,
              color: '#4a6cf7', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontFamily: 'inherit',
            }}
            onClick={() => { setSelectedContactId(''); }}
          >
            <Plus size={13} /> Add Client
          </button>
        </div>
      </div>

      {/* SECTIONS SIDEBAR */}
      {client && (
        <div className="outreach-sections" style={{
          width: 56, background: '#fafbfd', borderRight: '1px solid #e5e7ef',
          display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
          paddingTop: 16, gap: 4,
        }}>
          {[
            { key: 'chat', icon: <Zap size={18} />, label: 'Chat', count: 0 },
            { key: 'leads', icon: <Users size={18} />, label: 'Leads', count: leads.length },
            { key: 'queue', icon: <Mail size={18} />, label: 'Queue', count: queue.filter(q => q.status === 'pending_review').length },
            { key: 'docs', icon: <FileText size={18} />, label: 'Docs', count: 0 },
          ].map(({ key, icon, label, count }) => (
            <button key={key} onClick={() => setActiveTab(key)} title={label}
              style={{
                width: 42, height: 42, borderRadius: 10, border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                background: activeTab === key ? 'rgba(74,108,247,0.12)' : 'transparent',
                color: activeTab === key ? '#4a6cf7' : '#8e8ea0',
                position: 'relative', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}>
              {icon}
              <span style={{ fontSize: 9, fontWeight: 600 }}>{label}</span>
              {count > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 2, background: '#4a6cf7', color: '#fff',
                  borderRadius: 8, padding: '0 4px', fontSize: 9, fontWeight: 700, minWidth: 14, textAlign: 'center',
                }}>{count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* RIGHT MAIN AREA */}
      <div className="outreach-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        {/* No client selected */}
        {!client && !loadingClient && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8ea0' }}>
            <div style={{ textAlign: 'center' }}>
              <Building2 size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p>Select a client from the sidebar to get started</p>
            </div>
          </div>
        )}

        {client && (
          <>
            {/* Top bar */}
            <div className="outreach-topbar" style={{
              padding: '12px 20px', borderBottom: '1px solid #e5e7ef', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
              gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {client.logo_url ? (
                  <img src={client.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: '#e8ecf4', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#4a6cf7', fontWeight: 700, fontSize: 14,
                  }}>
                    {(client.business_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {client.business_name}
                    </h2>
                    <span style={{
                      padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: client.retainer_status === 'active' ? '#e8f5e9' : '#fff3e0',
                      color: client.retainer_status === 'active' ? '#22c55e' : '#f59e0b',
                      textTransform: 'capitalize', flexShrink: 0,
                    }}>
                      {client.retainer_status}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: '#8e8ea0' }}>
                    {[client.industry, client.location_city, client.location_state].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
              <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  style={{ ...btnGhost, background: scanning ? '#f0f0ff' : undefined }}
                  onClick={handleScanBrand}
                  disabled={scanning}
                >
                  {scanning ? <Loader size={13} className="spin" /> : <Sparkles size={13} />}
                  {scanning ? 'Scanning...' : 'Auto-Scan'}
                </button>
                <button style={btnGhost} onClick={() => { setEditingClient(true); setClientDraft(client); setShowProfile(true); }}>
                  <Edit3 size={13} /> Edit
                </button>
                <button style={{ ...btnGhost, color: '#ef4444' }} onClick={handleDeleteClient}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Scrollable content area */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Client Profile (collapsible, starts minimized) */}
                <div style={{ ...cardStyle, marginBottom: 16 }}>
                  <div
                    className="profile-header"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => setShowProfile(!showProfile)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>
                      <Building2 size={15} style={{ color: '#8e8ea0' }} />
                      Client Profile
                      <span style={{ fontSize: 11, color: '#8e8ea0', fontWeight: 400 }}>
                        {showProfile ? '(click to collapse)' : '(click to expand)'}
                      </span>
                    </div>
                    {showProfile ? <ChevronUp size={16} color="#8e8ea0" /> : <ChevronDown size={16} color="#8e8ea0" />}
                  </div>

                  {showProfile && !editingClient && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f8f9fc', borderRadius: 10 }}>
                        <span style={{ fontSize: 11, color: '#8e8ea0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Websites & Social Media</span>
                        <div className="profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 10 }}>
                          {[
                            { label: 'Website', value: client.website_url, icon: '🌐', link: true },
                            { label: 'Instagram', value: client.instagram, icon: '📸', prefix: 'https://instagram.com/' },
                            { label: 'TikTok', value: client.tiktok, icon: '🎵', prefix: 'https://tiktok.com/@' },
                            { label: 'Facebook', value: client.facebook, icon: '📘', link: true },
                            { label: 'YouTube', value: client.youtube, icon: '🎬', prefix: 'https://youtube.com/' },
                            { label: 'LinkedIn', value: client.linkedin, icon: '💼', link: true },
                          ].map(({ label, value, icon, link, prefix }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                              <span>{icon}</span>
                              {value ? (
                                <a
                                  href={link ? (value.startsWith('http') ? value : `https://${value}`) : `${prefix}${value.replace('@', '')}`}
                                  target="_blank" rel="noopener"
                                  style={{ color: '#4a6cf7', textDecoration: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                  {value}
                                </a>
                              ) : (
                                <span style={{ color: '#ccc', fontStyle: 'italic', fontSize: 12 }}>Not set</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {client.brand_bible && (
                        <div style={{ marginBottom: 16, padding: '14px 16px', background: '#faf8ff', border: '1px solid #ede8ff', borderRadius: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <Sparkles size={14} style={{ color: '#a855f7' }} />
                            <span style={{ fontSize: 11, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brand Bible</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#1a1a2e', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                            {client.brand_bible}
                          </div>
                        </div>
                      )}

                      <div className="profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                        <ProfileField label="Owner" value={client.owner_name} />
                        <ProfileField label="Type" value={client.business_type} />
                        <ProfileField label="Location" value={[client.location_address, client.location_city, client.location_state].filter(Boolean).join(', ')} />
                        <ProfileField label="Target Audience" value={client.target_audience} full />
                        <ProfileField label="Services" value={client.services} full />
                        <ProfileField label="USPs" value={client.unique_selling_points} full />
                        <ProfileField label="Campaign Goals" value={client.campaign_goals} full />
                        <ProfileField label="Budget Range" value={client.budget_range} />
                        <ProfileField label="Tone" value={client.outreach_tone} />
                        {client.brand_colors?.length > 0 && (
                          <div style={{ gridColumn: 'span 1' }}>
                            <span style={{ fontSize: 11, color: '#8e8ea0', fontWeight: 600 }}>Brand Colors</span>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              {client.brand_colors.map((c, i) => (
                                <div key={i} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: '1px solid #e5e7ef' }} title={c} />
                              ))}
                            </div>
                          </div>
                        )}
                        {client.brand_fonts?.length > 0 && (
                          <ProfileField label="Fonts" value={client.brand_fonts.join(', ')} />
                        )}
                        {client.notes && <ProfileField label="Notes" value={client.notes} full />}
                      </div>
                    </div>
                  )}

                  {showProfile && editingClient && (
                    <div style={{ marginTop: 16 }}>
                      <div className="edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                          ['business_name', 'Business Name'], ['owner_name', 'Owner Name'],
                          ['business_type', 'Business Type'], ['industry', 'Industry'],
                          ['website_url', 'Website URL'], ['location_address', 'Address'],
                          ['location_city', 'City'], ['location_state', 'State'],
                          ['instagram', 'Instagram'], ['tiktok', 'TikTok'],
                          ['facebook', 'Facebook'], ['youtube', 'YouTube'],
                          ['linkedin', 'LinkedIn'], ['budget_range', 'Budget Range'],
                        ].map(([key, label]) => (
                          <input key={key} style={inputStyle} placeholder={label} value={clientDraft[key] || ''}
                            onChange={e => setClientDraft(p => ({ ...p, [key]: e.target.value }))} />
                        ))}
                      </div>
                      <div className="edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                        {[
                          ['target_audience', 'Target Audience'], ['services', 'Services'],
                          ['unique_selling_points', 'Unique Selling Points'], ['campaign_goals', 'Campaign Goals'],
                        ].map(([key, label]) => (
                          <textarea key={key} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder={label}
                            value={clientDraft[key] || ''} onChange={e => setClientDraft(p => ({ ...p, [key]: e.target.value }))} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                        <select style={inputStyle} value={clientDraft.outreach_tone || 'friendly'}
                          onChange={e => setClientDraft(p => ({ ...p, outreach_tone: e.target.value }))}>
                          {TONE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select style={inputStyle} value={clientDraft.retainer_status || 'active'}
                          onChange={e => setClientDraft(p => ({ ...p, retainer_status: e.target.value }))}>
                          {RETAINER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <textarea style={{ ...inputStyle, marginTop: 10, minHeight: 100, fontFamily: 'inherit', lineHeight: 1.6 }} placeholder="Brand Bible (auto-generated by scan or edit manually)"
                        value={clientDraft.brand_bible || ''} onChange={e => setClientDraft(p => ({ ...p, brand_bible: e.target.value }))} />
                      <textarea style={{ ...inputStyle, marginTop: 10, minHeight: 50 }} placeholder="Notes / Instructions"
                        value={clientDraft.notes || ''} onChange={e => setClientDraft(p => ({ ...p, notes: e.target.value }))} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                        <button style={btnGhost} onClick={() => { setEditingClient(false); setClientDraft({}); }}>Cancel</button>
                        <button style={btnPrimary} onClick={handleSaveClient}>Save</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Active tab content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Chat Tab */}
                  {activeTab === 'chat' && (
                    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', border: '1px solid #e5e7ef', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{
                        minHeight: 300, maxHeight: 450, overflowY: 'auto', padding: '20px 24px',
                        display: 'flex', flexDirection: 'column', gap: 0,
                      }}>
                        {chatMessages.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8e8ea0' }}>
                            <Sparkles size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                            <p style={{ fontSize: 14, marginBottom: 8 }}>What would you like to do for <strong style={{ color: '#1a1a2e' }}>{client.business_name}</strong>?</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                              {[
                                `Find ${client.location_city || 'local'} influencers for ${client.business_name}`,
                                'Generate outreach emails for all leads',
                                'Send approved emails',
                              ].map((suggestion, i) => (
                                <button key={i} style={{
                                  padding: '8px 16px', background: 'rgba(74,108,247,0.06)', border: '1px solid rgba(74,108,247,0.2)',
                                  borderRadius: 20, color: '#4a6cf7', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                }} onClick={() => { setChatInput(suggestion); }}>
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {chatMessages.map((msg, i) => (
                          <div key={i} style={{
                            display: 'flex', gap: 12, padding: '12px 0',
                            borderTop: i > 0 ? '1px solid #f0f0f5' : 'none',
                          }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex',
                              alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                              background: msg.role === 'user' ? 'rgba(74,108,247,0.12)' : msg.role === 'system' ? '#f8f9fc' : '#f0f0f5',
                              color: msg.role === 'user' ? '#4a6cf7' : '#8e8ea0',
                            }}>
                              {msg.role === 'user' ? 'R' : msg.role === 'system' ? '⚡' : '✦'}
                            </div>
                            <div style={{
                              flex: 1, fontSize: 14, lineHeight: 1.6, paddingTop: 4,
                              color: msg.role === 'system' ? '#8e8ea0' : '#1a1a2e',
                              fontStyle: msg.role === 'system' ? 'italic' : 'normal',
                            }}>
                              {msg.attachments?.length > 0 && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                  {msg.attachments.map((att, ai) => (
                                    <div key={ai} style={{
                                      borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7ef',
                                      background: '#f8f9fc',
                                    }}>
                                      {att.isImage ? (
                                        <img src={att.preview} alt={att.name} style={{ maxWidth: 180, maxHeight: 120, display: 'block', objectFit: 'cover' }} />
                                      ) : (
                                        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8e8ea0' }}>
                                          <FileIcon size={14} /> {att.name}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {msg.content}
                            </div>
                          </div>
                        ))}
                        {chatLoading && (
                          <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: '1px solid #f0f0f5' }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f0f0f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8ea0', fontSize: 13 }}>✦</div>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', paddingTop: 8 }}>
                              {[0, 1, 2].map(j => (
                                <span key={j} style={{
                                  width: 6, height: 6, borderRadius: '50%', background: '#ccc',
                                  animation: 'blink 1.2s ease infinite', animationDelay: `${j * 0.2}s`,
                                }} />
                              ))}
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>

                      {!chatLoading && (
                        <div style={{ borderTop: '1px solid #e5e7ef', padding: '10px 20px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {getQuickReplies().map((text, i) => (
                            <button key={i} onClick={() => { setChatInput(text.replace(/^[^\w]*\s/, '')); setTimeout(() => inputRef.current?.focus(), 50); }}
                              style={{
                                padding: '6px 14px', borderRadius: 20, border: '1px solid #e5e7ef',
                                background: '#f8f9fc', color: '#4a6cf7', fontSize: 12, fontWeight: 500,
                                cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={e => { e.target.style.background = 'rgba(74,108,247,0.08)'; e.target.style.borderColor = '#4a6cf7'; }}
                              onMouseLeave={e => { e.target.style.background = '#f8f9fc'; e.target.style.borderColor = '#e5e7ef'; }}
                            >
                              {text}
                            </button>
                          ))}
                        </div>
                      )}

                      {attachments.length > 0 && (
                        <div style={{ borderTop: '1px solid #e5e7ef', padding: '10px 20px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {attachments.map((att, i) => (
                            <div key={i} style={{
                              position: 'relative', borderRadius: 10, overflow: 'hidden',
                              border: '1px solid #e5e7ef', background: '#f8f9fc',
                            }}>
                              {att.isImage ? (
                                <img src={att.preview} alt={att.name} style={{ height: 60, maxWidth: 100, display: 'block', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8e8ea0' }}>
                                  <FileIcon size={12} /> {att.name.length > 20 ? att.name.slice(0, 18) + '...' : att.name}
                                </div>
                              )}
                              <button onClick={() => removeAttachment(i)} style={{
                                position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                                background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', fontSize: 10,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ borderTop: '1px solid #e5e7ef', padding: '14px 20px', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.pdf,.txt,.csv,.doc,.docx"
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            width: 36, height: 36, borderRadius: 10, border: '1px solid #e5e7ef',
                            background: attachments.length > 0 ? 'rgba(74,108,247,0.08)' : '#f8f9fc',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: attachments.length > 0 ? '#4a6cf7' : '#8e8ea0',
                            flexShrink: 0, transition: 'all 0.2s',
                          }}
                          title="Attach files"
                        >
                          <Paperclip size={16} />
                        </button>
                        <textarea
                          ref={inputRef}
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                          placeholder={`Tell me what to do for ${client.business_name}...`}
                          style={{
                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                            color: '#1a1a2e', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6,
                            resize: 'none', minHeight: 40, maxHeight: 120,
                          }}
                          rows={1}
                        />
                        <button
                          onClick={toggleMic}
                          style={{
                            width: 36, height: 36, borderRadius: 10, border: '1px solid #e5e7ef',
                            background: isListening ? 'rgba(255,60,60,0.1)' : '#f8f9fc',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isListening ? '#ef4444' : '#8e8ea0', flexShrink: 0,
                          }}
                        >
                          <Mic size={16} />
                        </button>
                        <button
                          onClick={sendChatMessage}
                          disabled={chatLoading || (!chatInput.trim() && attachments.length === 0)}
                          style={{
                            width: 36, height: 36, borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #4a6cf7, #3b5de7)',
                            cursor: chatLoading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: chatLoading || (!chatInput.trim() && attachments.length === 0) ? 0.4 : 1,
                            flexShrink: 0,
                          }}
                        >
                          <Send size={15} style={{ color: '#fff' }} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Leads Tab */}
                  {activeTab === 'leads' && (
                    <div style={cardStyle}>
                      <div className="leads-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <label style={{ fontSize: 12, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <input type="checkbox" checked={leads.length > 0 && selectedLeads.size === leads.length}
                              onChange={selectAllLeads} style={{ accentColor: '#4a6cf7' }} />
                            Select All
                          </label>
                          {selectedLeads.size > 0 && (
                            <>
                              <span style={{ fontSize: 12, color: '#4a6cf7', fontWeight: 600 }}>{selectedLeads.size} selected</span>
                              <button style={{ ...btnGhost, fontSize: 11, color: '#ef4444' }} onClick={deleteSelectedLeads}>
                                <Trash2 size={12} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={{ ...btnPrimary, fontSize: 12, padding: '6px 14px' }} onClick={() => setShowAddLead(!showAddLead)}>
                            <Plus size={13} /> Add Lead
                          </button>
                          <button style={btnGhost} onClick={() => loadClientData(client.id)}>
                            <RefreshCw size={12} /> Refresh
                          </button>
                        </div>
                      </div>

                      {showAddLead && (
                        <div style={{ background: '#f8f9fc', border: '1px solid #e5e7ef', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                          <div className="add-lead-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <input style={inputStyle} placeholder="Name *" value={newLead.name}
                              onChange={e => setNewLead({ ...newLead, name: e.target.value })} />
                            <input style={inputStyle} placeholder="Email" value={newLead.email}
                              onChange={e => setNewLead({ ...newLead, email: e.target.value })} />
                            <input style={inputStyle} placeholder="Instagram handle" value={newLead.instagram}
                              onChange={e => setNewLead({ ...newLead, instagram: e.target.value })} />
                            <input style={inputStyle} placeholder="TikTok handle" value={newLead.tiktok}
                              onChange={e => setNewLead({ ...newLead, tiktok: e.target.value })} />
                            <input style={inputStyle} placeholder="YouTube channel" value={newLead.youtube}
                              onChange={e => setNewLead({ ...newLead, youtube: e.target.value })} />
                            <input style={inputStyle} placeholder="Niche" value={newLead.niche}
                              onChange={e => setNewLead({ ...newLead, niche: e.target.value })} />
                            <input style={inputStyle} placeholder="Follower count" type="number" value={newLead.follower_count}
                              onChange={e => setNewLead({ ...newLead, follower_count: e.target.value })} />
                            <input style={inputStyle} placeholder="Notes" value={newLead.notes}
                              onChange={e => setNewLead({ ...newLead, notes: e.target.value })} />
                          </div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button style={btnGhost} onClick={() => { setShowAddLead(false); setNewLead({ name: '', email: '', instagram: '', tiktok: '', youtube: '', niche: '', follower_count: '', notes: '' }); }}>
                              Cancel
                            </button>
                            <button style={{ ...btnPrimary, fontSize: 12, padding: '6px 16px', opacity: !newLead.name.trim() || savingLead ? 0.5 : 1 }}
                              onClick={saveNewLead} disabled={!newLead.name.trim() || savingLead}>
                              {savingLead ? <Loader size={13} className="spin" /> : <Check size={13} />} Save Lead
                            </button>
                          </div>
                        </div>
                      )}

                      {leads.length === 0 && !showAddLead ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8e8ea0', fontSize: 13 }}>
                          No leads yet. Use the Command Center to research leads or add them manually.
                        </div>
                      ) : (
                        <div className="leads-table-wrap" style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e5e7ef' }}>
                                <th style={{ padding: '8px 10px', textAlign: 'left', width: 30 }}></th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600 }}>Name</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600 }}>Email</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600 }}>Socials</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600 }}>Followers</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600 }}>Niche</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600 }}>Score</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600 }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {leads.map(lead => (
                                <tr key={lead.id} style={{ borderBottom: '1px solid #f5f5f8' }}>
                                  <td style={{ padding: '10px' }}>
                                    <input type="checkbox" checked={selectedLeads.has(lead.id)}
                                      onChange={() => toggleLeadSelect(lead.id)} style={{ accentColor: '#4a6cf7' }} />
                                  </td>
                                  <td className="private-value" style={{ padding: '10px', fontWeight: 600, color: '#1a1a2e' }}>{lead.name}</td>
                                  <td className="private-value" style={{ padding: '10px', color: '#4a6cf7', fontSize: 12 }}>{lead.email}</td>
                                  <td style={{ padding: '10px' }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      {lead.instagram && <span style={{ fontSize: 11, color: '#E1306C' }} title={lead.instagram}>IG</span>}
                                      {lead.tiktok && <span style={{ fontSize: 11, color: '#000' }} title={lead.tiktok}>TT</span>}
                                      {lead.youtube && <span style={{ fontSize: 11, color: '#FF0000' }} title={lead.youtube}>YT</span>}
                                    </div>
                                  </td>
                                  <td style={{ padding: '10px', fontSize: 12, color: '#8e8ea0' }}>
                                    {lead.follower_count ? lead.follower_count.toLocaleString() : '-'}
                                  </td>
                                  <td style={{ padding: '10px', fontSize: 12, color: '#8e8ea0' }}>{lead.niche}</td>
                                  <td style={{ padding: '10px' }}>
                                    {lead.relevance_score > 0 && (
                                      <span style={{
                                        fontSize: 11, fontWeight: 700,
                                        color: lead.relevance_score >= 80 ? '#22c55e' : lead.relevance_score >= 50 ? '#f59e0b' : '#8e8ea0',
                                      }}>
                                        {lead.relevance_score}%
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: '10px' }}>
                                    <StatusPill status={lead.email_status} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Quick Command */}
                      <div style={{ marginTop: 16, borderTop: '1px solid #e5e7ef', paddingTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: '#f8f9fc', borderRadius: 12, padding: '10px 14px', border: '1px solid #e5e7ef' }}>
                          <textarea
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                            placeholder="Ask agent: find leads, add lead, clear leads..."
                            rows={1}
                            style={{
                              flex: 1, background: 'transparent', border: 'none', outline: 'none',
                              color: '#1a1a2e', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5,
                              resize: 'none', minHeight: 20, maxHeight: 80,
                            }}
                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'; }}
                          />
                          <button
                            onClick={sendChatMessage}
                            disabled={chatLoading || !chatInput.trim()}
                            style={{
                              width: 32, height: 32, borderRadius: 8, border: 'none',
                              background: 'linear-gradient(135deg, #4a6cf7, #3b5de7)',
                              cursor: chatLoading ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: chatLoading || !chatInput.trim() ? 0.4 : 1,
                              flexShrink: 0,
                            }}
                          >
                            <Send size={14} style={{ color: '#fff' }} />
                          </button>
                        </div>
                        {chatLoading && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#4a6cf7' }}>
                            <Loader size={12} className="spin" /> Processing...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Approval Queue Tab */}
                  {activeTab === 'queue' && (
                    <div>
                      {queue.filter(q => q.status === 'approved').length > 0 && (
                        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            style={{ ...btnPrimary, background: sendingEmails ? '#8e8ea0' : '#22c55e' }}
                            onClick={async () => {
                              setSendingEmails(true);
                              try {
                                await sendApprovedEmails(client.id);
                                await loadClientData(client.id);
                              } catch (err) { console.error(err); }
                              setSendingEmails(false);
                            }}
                            disabled={sendingEmails}
                          >
                            {sendingEmails ? <Loader size={14} className="spin" /> : <Send size={14} />}
                            {sendingEmails ? 'Sending...' : `Send ${queue.filter(q => q.status === 'approved').length} Approved`}
                          </button>
                        </div>
                      )}

                      {queue.length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 20px', color: '#8e8ea0', fontSize: 13 }}>
                          No emails in the queue. Generate outreach emails from the Command Center.
                        </div>
                      ) : (
                        queue.map(item => (
                          <div key={item.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div className="queue-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div className="queue-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                  <span className="private-value" style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e' }}>{item.to_name}</span>
                                  <span className="private-value" style={{ fontSize: 12, color: '#4a6cf7' }}>{item.to_email}</span>
                                  <StatusPill status={item.status} />
                                </div>
                                {editingQueueId === item.id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                                    <input
                                      style={inputStyle} placeholder="Subject" value={editDraft.subject || ''}
                                      onChange={e => setEditDraft(p => ({ ...p, subject: e.target.value }))}
                                    />
                                    <textarea
                                      style={{ ...inputStyle, minHeight: 120, fontFamily: 'inherit', lineHeight: 1.6 }}
                                      value={editDraft.body || ''}
                                      onChange={e => setEditDraft(p => ({ ...p, body: e.target.value }))}
                                    />
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                      <button style={btnGhost} onClick={() => { setEditingQueueId(null); setEditDraft({}); }}>Cancel</button>
                                      <button style={btnPrimary} onClick={() => saveQueueEdit(item.id)}>Save</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginTop: 6 }}>
                                      Subject: {item.subject}
                                    </div>
                                    <div style={{
                                      fontSize: 13, color: '#555', lineHeight: 1.7, marginTop: 6,
                                      padding: '12px 16px', background: '#f8f9fc', borderRadius: 10,
                                      whiteSpace: 'pre-wrap',
                                    }}>
                                      {item.body}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            {editingQueueId !== item.id && item.status === 'pending_review' && (
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button style={{ ...btnGhost, color: '#ef4444' }} onClick={() => rejectItem(item.id)}>
                                  <X size={13} /> Reject
                                </button>
                                <button style={btnGhost} onClick={() => { setEditingQueueId(item.id); setEditDraft({ subject: item.subject, body: item.body }); }}>
                                  <Edit3 size={13} /> Edit
                                </button>
                                <button style={{ ...btnPrimary, background: '#22c55e' }} onClick={() => approveItem(item.id)}>
                                  <Check size={14} /> Approve
                                </button>
                              </div>
                            )}
                            {item.sent_at && (
                              <div style={{ fontSize: 11, color: '#8e8ea0' }}>
                                Sent: {new Date(item.sent_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ))
                      )}

                      {/* Quick Command */}
                      <div style={{ marginTop: 16, borderTop: '1px solid #e5e7ef', paddingTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: '#f8f9fc', borderRadius: 12, padding: '10px 14px', border: '1px solid #e5e7ef' }}>
                          <textarea
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                            placeholder="Ask agent: generate emails, approve all, send approved..."
                            rows={1}
                            style={{
                              flex: 1, background: 'transparent', border: 'none', outline: 'none',
                              color: '#1a1a2e', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5,
                              resize: 'none', minHeight: 20, maxHeight: 80,
                            }}
                            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'; }}
                          />
                          <button
                            onClick={sendChatMessage}
                            disabled={chatLoading || !chatInput.trim()}
                            style={{
                              width: 32, height: 32, borderRadius: 8, border: 'none',
                              background: 'linear-gradient(135deg, #4a6cf7, #3b5de7)',
                              cursor: chatLoading ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: chatLoading || !chatInput.trim() ? 0.4 : 1,
                              flexShrink: 0,
                            }}
                          >
                            <Send size={14} style={{ color: '#fff' }} />
                          </button>
                        </div>
                        {chatLoading && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#4a6cf7' }}>
                            <Loader size={12} className="spin" /> Processing...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'docs' && (
                    <div style={cardStyle}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 16px' }}>Agent Commands</h3>
                      <p style={{ fontSize: 13, color: '#8e8ea0', marginBottom: 20, lineHeight: 1.6 }}>
                        Use the chat in any tab to give commands. The agent can manage leads, emails, and outreach automatically.
                      </p>

                      {[
                        {
                          category: 'Lead Research',
                          commands: [
                            { cmd: 'Find [city] [niche] for [client]', desc: 'Search for leads matching criteria' },
                            { cmd: 'Research more leads', desc: 'Find additional leads for current client' },
                            { cmd: 'Find Houston food reviewers', desc: 'Search by location and niche' },
                          ],
                        },
                        {
                          category: 'Lead Management',
                          commands: [
                            { cmd: 'Add a lead named [name] with email [email]', desc: 'Manually add a lead' },
                            { cmd: 'Add lead [name], instagram @[handle], niche: [niche]', desc: 'Add lead with social info' },
                            { cmd: 'Remove lead [name]', desc: 'Delete a specific lead' },
                            { cmd: 'Clear all leads', desc: 'Remove all leads for this client' },
                          ],
                        },
                        {
                          category: 'Email Generation',
                          commands: [
                            { cmd: 'Generate outreach emails', desc: 'Create emails for leads with email addresses' },
                            { cmd: 'Generate outreach emails for selected leads', desc: 'Only for checked leads' },
                          ],
                        },
                        {
                          category: 'Email Editing',
                          commands: [
                            { cmd: 'Make all emails more casual', desc: 'Rewrite all queued emails with new tone' },
                            { cmd: 'Update all emails to include [link]', desc: 'Add info to all emails' },
                            { cmd: 'Change the email to [name] to mention [topic]', desc: 'Edit a specific email' },
                            { cmd: 'Edit the subject for [name]\'s email', desc: 'Modify specific email subject' },
                          ],
                        },
                        {
                          category: 'Email Approval & Sending',
                          commands: [
                            { cmd: 'Approve all emails', desc: 'Approve all pending/draft emails' },
                            { cmd: 'Approve the email to [name]', desc: 'Approve a specific email' },
                            { cmd: 'Send approved emails', desc: 'Send all approved emails' },
                            { cmd: 'Approve all and send', desc: 'Approve then send everything' },
                          ],
                        },
                        {
                          category: 'Cleanup',
                          commands: [
                            { cmd: 'Clear the email queue', desc: 'Remove all queued emails' },
                            { cmd: 'Remove the email to [name]', desc: 'Delete a specific queued email' },
                            { cmd: 'Clear everything', desc: 'Remove all leads and emails' },
                          ],
                        },
                      ].map(({ category, commands }) => (
                        <div key={category} style={{ marginBottom: 20 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 700, color: '#4a6cf7', textTransform: 'uppercase',
                            letterSpacing: '0.05em', marginBottom: 8, paddingBottom: 6,
                            borderBottom: '1px solid #f0f0f5',
                          }}>
                            {category}
                          </div>
                          {commands.map(({ cmd, desc }) => (
                            <div key={cmd} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                              padding: '8px 0', borderBottom: '1px solid #fafafa', gap: 12,
                            }}>
                              <code style={{
                                fontSize: 12, color: '#1a1a2e', background: '#f8f9fc',
                                padding: '3px 8px', borderRadius: 6, fontFamily: 'monospace',
                                whiteSpace: 'nowrap', flexShrink: 0,
                              }}>
                                {cmd}
                              </code>
                              <span style={{ fontSize: 12, color: '#8e8ea0', textAlign: 'right' }}>{desc}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        .spin { animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 768px) {
          .outreach-page { flex-direction: column !important; height: auto !important; }

          .outreach-sidebar {
            width: 100% !important;
            height: auto !important;
            flex-direction: row !important;
            flex-wrap: wrap;
            border-right: none !important;
            border-bottom: 1px solid #e5e7ef;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .outreach-sidebar > div:first-child {
            padding: 10px 12px !important;
            border-bottom: none !important;
            flex-shrink: 0;
          }
          .outreach-sidebar h1 { font-size: 14px !important; }

          .outreach-client-list {
            flex-direction: row !important;
            display: flex !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding: 4px 8px !important;
            gap: 4px;
            flex: none !important;
          }
          .outreach-client-list > div {
            flex-shrink: 0;
            min-width: 120px;
            border-left: none !important;
            border-bottom: 3px solid transparent;
            padding: 6px 10px !important;
          }

          .outreach-sidebar > div:nth-last-child(2) {
            display: flex !important;
            flex-direction: row !important;
            border-top: none !important;
            border-left: 1px solid #e5e7ef;
            padding: 0 !important;
          }
          .outreach-sidebar > div:nth-last-child(2) button {
            border-left: none !important;
            border-bottom: 3px solid transparent !important;
            white-space: nowrap;
            font-size: 12px !important;
            padding: 8px 10px !important;
          }

          .outreach-sidebar > div:last-child { display: none !important; }

          .outreach-main { min-height: 0; }

          .outreach-topbar { flex-wrap: wrap; padding: 10px 12px !important; }
          .topbar-actions { flex-wrap: wrap; gap: 6px !important; }
          .topbar-actions button { font-size: 11px !important; padding: 6px 10px !important; }

          .outreach-page .profile-grid { grid-template-columns: 1fr !important; }
          .outreach-page .profile-header { flex-direction: column; align-items: flex-start !important; gap: 10px !important; }

          .outreach-page .edit-grid { grid-template-columns: 1fr !important; }

          .outreach-page .leads-toolbar { flex-direction: column; gap: 8px !important; align-items: flex-start !important; }
          .outreach-page .leads-toolbar > div { width: 100%; justify-content: space-between; }

          .outreach-page .add-lead-grid { grid-template-columns: 1fr !important; }

          .outreach-page .leads-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .outreach-page .leads-table-wrap table { min-width: 600px; }

          .outreach-page .queue-header { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; }
          .outreach-page .queue-header .queue-meta { flex-wrap: wrap; gap: 4px !important; }
        }
      `}</style>
    </div>
  );
}

function ProfileField({ label, value, full, link }) {
  if (!value) return null;
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11, color: '#8e8ea0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
      <div style={{ fontSize: 13, color: '#1a1a2e', marginTop: 2, lineHeight: 1.5 }}>
        {link ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener" style={{ color: '#4a6cf7' }}>{value}</a> : value}
      </div>
    </div>
  );
}
