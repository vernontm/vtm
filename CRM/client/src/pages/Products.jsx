import React, { useState } from 'react';
import { Package, Globe, Film, Rocket, Check, ChevronDown, ChevronRight, AlertCircle, Lightbulb, Users } from 'lucide-react';

const PACKAGES = [
  {
    key: 'digital',
    name: 'Digital Presence',
    icon: Globe,
    accent: '#4a6cf7',
    tagline: 'Get found. Get clicked. Get clients.',
    oneLiner: 'A complete professional online presence — website, SEO, Google Business, and lead capture — so customers can actually find and book with you.',
    whoItsFor: [
      'Local service businesses with no website or an outdated one',
      'Businesses relying on word-of-mouth who want consistent online leads',
      'Anyone losing customers because they don\'t show up in Google search',
      'Businesses using only Google Calendar or Facebook for bookings',
    ],
    whatsIncluded: [
      { name: 'Custom website or web app', detail: 'Built to match their brand, optimized for conversions, not just a template.' },
      { name: 'Professional domain setup', detail: 'We handle the domain purchase, DNS, and connect it. They get theirbusiness.com instead of theirbusiness.wixsite.com.' },
      { name: 'Mobile-optimized design', detail: '70%+ of local searches happen on mobile. The site looks great and loads fast on phones.' },
      { name: 'On-page SEO', detail: 'Titles, meta descriptions, schema markup, local keywords — so they rank when people search for their service in their area.' },
      { name: 'Google Business Profile setup / optimization', detail: 'The most important free marketing tool for local businesses. We claim it, optimize it, and tie it to the site.' },
      { name: 'Contact forms & booking integration', detail: 'Leads get captured and emailed/texted directly. Can connect to Calendly, Google Calendar, or a custom booking flow.' },
      { name: 'Ongoing support', detail: 'They can reach out with tweaks, updates, or content changes — not left high and dry after launch.' },
    ],
    painPoints: [
      { point: 'No website at all', pitch: '"We noticed you don\'t have a website — that means every customer searching for a [industry] in your area is landing on your competitors instead of you. We\'d build you a proper site that captures those searches."' },
      { point: 'Outdated / Wix / Square site', pitch: '"I saw your current site — it\'s not really set up to convert visitors or rank in search. We\'d rebuild it cleaner, faster, mobile-friendly, and actually optimized to pull in leads."' },
      { point: 'Broken or not-working site', pitch: '"Your site link isn\'t loading right now — which means anyone googling you is either leaving or going to a competitor. That\'s a fast fix we can knock out in a few days."' },
      { point: 'Uses only Google Calendar/Facebook', pitch: '"Running bookings off Google Calendar or a Facebook page works at the start, but it\'s capping how many new customers find you. A real site makes you bookable 24/7 by strangers."' },
    ],
    objections: [
      { q: '"How much does it cost?"', a: 'Great question — that\'s actually another reason to hop on the 15-min call, we\'ll walk through exactly what you need and find a fit.' },
      { q: '"I have a site already."', a: 'Understood — when\'s the last time it brought you a new customer? Sometimes sites sit there looking fine but aren\'t actually pulling in leads. We can audit it on the call.' },
      { q: '"I don\'t need a website."', a: 'Totally get that — but when people search for your service in your area, they\'re finding someone. A website just makes sure it\'s you they\'re calling.' },
      { q: '"I\'m too busy."', a: 'That\'s actually the whole point — we build it for you, you barely lift a finger. 15 minutes to talk through it?' },
    ],
    talkingAngles: [
      'Local SEO = showing up in Google Maps when people search "car detailing near me"',
      'A demo website shows them what\'s possible before they pay a dime',
      'Mobile-first — 70%+ of their customers are on phones',
      'Lead capture forms mean they never miss a potential client who visits at 2am',
    ],
  },
  {
    key: 'content',
    name: 'Content Engine',
    icon: Film,
    accent: '#d97706',
    tagline: 'Stop posting. Start performing.',
    oneLiner: 'A done-for-you content system — AI-written scripts, branded intros/outros, faceless reels, captions, and a calendar — so their social channels pull in leads without them doing the work.',
    whoItsFor: [
      'Businesses with empty or inconsistent social accounts',
      'Owners who know they need content but have no time to create it',
      'Businesses tired of boring "we\'re open!" posts that don\'t drive bookings',
      'Anyone who wants organic reach without paying for ads every month',
    ],
    whatsIncluded: [
      { name: 'AI-generated short-form scripts', detail: 'Written for their specific niche and voice — not generic. Scripts for Reels, TikTok, Shorts that are designed to hook and convert.' },
      { name: 'Custom branded intro & outro', detail: 'Same 2-5 sec open and close on every video so viewers recognize the brand instantly. Built once, reused forever.' },
      { name: 'Faceless content production', detail: 'B-roll, stock, text overlays, animated visuals — polished content without them needing to film themselves.' },
      { name: 'On-camera editing', detail: 'If they do want to film, we edit it — cuts, captions, transitions, music. Professional without the learning curve.' },
      { name: 'Content calendar & strategy', detail: 'What to post, when to post, and why. So they\'re not guessing what works.' },
      { name: 'Captions, hashtags & posting', detail: 'We can post directly to their accounts on a schedule. Captions written for their audience. Hashtags researched.' },
    ],
    painPoints: [
      { point: 'Not posting / inactive accounts', pitch: '"I looked at [company]\'s social and you guys haven\'t posted in a while — which means you\'re missing out on leads coming from organic discovery. We built a quick sample to show what we\'d do for you."' },
      { point: 'Posting but not getting reach', pitch: '"You\'re posting, which is great, but the reach isn\'t there. Our content system uses scripts and hooks that are built specifically to perform on the algorithm."' },
      { point: 'Tried content but quit', pitch: '"A lot of business owners try content and burn out because it\'s hard to keep up. That\'s literally what we fix — we run it for you."' },
      { point: 'Won\'t go on camera', pitch: '"You don\'t have to be on camera — we do faceless content that performs just as well. Most of our top-performing reels don\'t show a face."' },
    ],
    objections: [
      { q: '"How much is it?"', a: 'That\'s another reason to jump on the call — we\'ll walk through exactly what you need and match the pricing to your scope.' },
      { q: '"I already have someone doing it."', a: 'Got it — how are the results? If they\'re crushing it, keep them. If it\'s just checkmarks, that\'s where we come in.' },
      { q: '"Social media doesn\'t work for my business."', a: 'Fair — I\'d love to show you what we\'ve done for a [industry] business similar to yours. 15 mins and you can judge for yourself.' },
      { q: '"Will this work on TikTok?"', a: 'Yep — TikTok, Instagram Reels, YouTube Shorts, Threads. Same content, cross-posted. We handle all of it.' },
    ],
    talkingAngles: [
      'Organic reach = free leads. No ad spend required.',
      'Consistency beats perfection — we solve the consistency problem.',
      'Faceless reels remove the #1 excuse (being on camera)',
      'A 15-30 sec reel can pull in leads for months after it\'s posted',
    ],
  },
  {
    key: 'growth',
    name: 'Growth System',
    icon: Rocket,
    accent: '#059669',
    tagline: 'Sales on autopilot.',
    oneLiner: 'The full infrastructure — CRM, automated email sequences, AutoDM flows, lead capture pages, hosting, analytics — all wired together so leads never slip through the cracks.',
    whoItsFor: [
      'Businesses getting leads but losing them to slow/no follow-up',
      'Owners drowning in manual outreach and spreadsheets',
      'Businesses ready to scale who need real infrastructure',
      'Anyone wanting their pipeline to work while they sleep',
    ],
    whatsIncluded: [
      { name: 'CRM setup', detail: 'Every lead, contact, and deal tracked in one place. Custom pipeline stages, segments, reminders. No more spreadsheets.' },
      { name: 'Automated email sequences', detail: 'Welcome flows, follow-ups, nurture sequences, re-engagement campaigns. Triggered automatically when leads do certain things.' },
      { name: 'AutoDM & social flows', detail: 'When someone comments on a post or messages on Instagram/TikTok, they get an automatic DM with the right info — drives them to book.' },
      { name: 'Lead capture pages', detail: 'Landing pages built to convert — for ads, social bios, QR codes. Each one tracks where leads come from.' },
      { name: 'Website & app hosting', detail: 'We host the sites/apps, handle updates, SSL, uptime monitoring. They never have to think about it.' },
      { name: 'Analytics & reporting', detail: 'Dashboards showing what\'s working — which campaigns pull in leads, which sources convert, where the money comes from.' },
    ],
    painPoints: [
      { point: 'Manual follow-ups', pitch: '"You\'re probably spending hours a week texting leads back and trying to remember who you already talked to — we replace all of that with automation."' },
      { point: 'Leads going cold', pitch: '"Most businesses lose leads because they don\'t follow up fast enough. Our automation hits them within 60 seconds, every single time."' },
      { point: 'No system at all', pitch: '"If you\'re running [company] off your head and a notes app, growth is going to cap hard. We install the actual infrastructure so you can scale."' },
      { point: 'Has a CRM but not using it', pitch: '"Having a CRM and using one right are two different things. We set up the automations, templates, and flows that actually make it do work for you."' },
    ],
    objections: [
      { q: '"What does it cost?"', a: 'Great question — that\'s actually why we save pricing for the call. It depends on what you actually need, and we don\'t want to quote you something that doesn\'t fit.' },
      { q: '"I use [HubSpot/Salesforce/etc]."', a: 'Cool — we can work with what you have or replace it, whatever makes sense. The goal is the automation layer on top, not just the tool.' },
      { q: '"This sounds complicated."', a: 'It\'s not for you — we handle the setup and training. By the end, you just see leads coming in and getting handled. That\'s it.' },
      { q: '"I don\'t have enough leads for this."', a: 'Totally — that\'s actually why the growth system includes lead capture pages. We help you generate leads AND manage them, not just one or the other.' },
    ],
    talkingAngles: [
      'Automation = hours back in their week',
      '60-second response time doubles conversion rates',
      'Everything tied together = visibility on what actually makes money',
      'Hosting is included = one less vendor, one less password, one less bill',
    ],
  },
];

function PackageCard({ pkg }) {
  const [open, setOpen] = useState(pkg.key === 'digital');
  const Icon = pkg.icon;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '18px 22px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, borderBottom: open ? '1px solid #e5e7ef' : 'none', background: open ? '#f9fafb' : '#fff' }}
      >
        <div style={{ width: 48, height: 48, borderRadius: 12, background: pkg.accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: pkg.accent, flexShrink: 0 }}>
          <Icon size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>{pkg.name}</div>
          <div style={{ fontSize: 12, color: pkg.accent, fontWeight: 600 }}>{pkg.tagline}</div>
        </div>
        <div style={{ color: 'var(--muted)' }}>
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </div>

      {open && (
        <div style={{ padding: '20px 24px 28px' }}>
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, margin: '0 0 20px' }}>{pkg.oneLiner}</p>

          {/* Who it's for */}
          <Section icon={Users} title="Who it's for" accent={pkg.accent}>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: 13, lineHeight: 1.8 }}>
              {pkg.whoItsFor.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </Section>

          {/* What's included */}
          <Section icon={Check} title="What's included" accent={pkg.accent}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pkg.whatsIncluded.map((item, i) => (
                <div key={i} style={{ borderLeft: `3px solid ${pkg.accent}40`, paddingLeft: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13, marginBottom: 2 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{item.detail}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Pain points */}
          <Section icon={AlertCircle} title="Common pain points — what to say" accent={pkg.accent}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pkg.painPoints.map((p, i) => (
                <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: pkg.accent, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>If they have: {p.point}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic' }}>{p.pitch}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Objections */}
          <Section icon={AlertCircle} title="Handling objections" accent={pkg.accent}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pkg.objections.map((o, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, alignItems: 'start' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{o.q}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{o.a}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Talking angles */}
          <Section icon={Lightbulb} title="Key talking angles" accent={pkg.accent}>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: 13, lineHeight: 1.8 }}>
              {pkg.talkingAngles.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, accent, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon size={14} color={accent} />
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function Products() {
  return (
    <div style={{ padding: 24, minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Package size={24} color="#4a6cf7" />
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>Products & Services</div>
        </div>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 0, marginBottom: 24, lineHeight: 1.6 }}>
          Everything we offer, who it's for, what's included, and how to talk about it on calls.
          Use this to train yourself before a cold call so you can confidently speak about any service without second-guessing.
        </p>

        {/* Intro / What we do */}
        <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #2d2d54)', color: '#fff', borderRadius: 12, padding: '22px 26px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ff9b26', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Vernon Tech & Media — What We Do</div>
          <div style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 12 }}>
            We're a creative technology studio. We build websites, apps, AI content systems, and marketing automation for small businesses and creators who want to stand out.
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: '#b0b0c0' }}>
            Our 3 packages below are bundled for how most clients actually buy. If a lead needs just one piece, we can do that too — but the packages are designed to cover the full problem, not just a symptom.
          </div>
        </div>

        {/* Packages */}
        {PACKAGES.map(pkg => <PackageCard key={pkg.key} pkg={pkg} />)}

        {/* Universal rules */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertCircle size={16} color="#ff5c5c" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ff5c5c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Golden Rules for Every Cold Call</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text)', fontSize: 13, lineHeight: 1.9 }}>
            <li><strong>Always book the 15-minute call.</strong> That's the ONE goal. Not a demo. Not a pitch. Just 15 minutes.</li>
            <li><strong>Never discuss pricing on the cold call.</strong> If they ask, say: "Great question — that's actually another reason to hop on the call, we'll walk through everything and find what fits."</li>
            <li><strong>Reference something specific.</strong> Their company name, their industry, something from their notes. Generic = ignored.</li>
            <li><strong>Lead with what we already built.</strong> "We created a free demo website for you to check out" is stronger than "we could build you one."</li>
            <li><strong>Keep it short.</strong> 3-5 sentences before asking for the 15 min. Don't lecture, don't list 10 features.</li>
            <li><strong>Handle "not interested" with a soft ask.</strong> "Mind if I send it over anyway? You\'ll have it if anything changes."</li>
          </ul>
        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
