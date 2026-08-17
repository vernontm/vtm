// Rotating follow-up copy for a "contract sent, not yet signed" client.
// Each angle is grounded in a marketing framework (value reminder, momentum,
// risk reversal, social proof, gentle check-in) and always includes the portal
// sign link as a markdown hyperlink the send path turns into a real link.
// House style: no em dashes, a blank line between sentences.

const SIGN_BASE = 'https://vernontm.com/sign?token=';
const LINK_TEXT = 'log into your portal here';

// Max touches in the whole sequence, INCLUDING the first personalized email
// (seq 1). Once seq reaches this, the sequence stops on its own so we never
// pester a lead forever. Ray can always keep nudging manually.
const MAX_FOLLOWUPS = 8;

function firstName(client) {
  const n = (client.owner_name || client.lead_name || '').trim();
  const f = n ? n.split(/\s+/)[0] : 'there';
  return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
}

// The automated angles used from seq 2 onward. seq 1 is the hand-written first
// touch, so angle index = (seq - 2) mod angles.length.
function angles(name, biz, link) {
  return [
    {
      subject: `Quick nudge on the ${biz} agreement`,
      body:
`Hi ${name},

Just circling back on the agreement.

No pressure at all, I only want to make sure it did not slip through the cracks.

Whenever you are ready, you can ${link} to review and sign.

If anything is holding you up or you have a question, just reply here and I will take care of it.

Ray
Vernon Tech & Media`,
    },
    {
      subject: `What the first week looks like once we start`,
      body:
`Hi ${name},

I know things get busy, so here is a quick picture of what happens once we begin.

Week one is where we lay the foundation, and every week after that builds on it.

The sooner we start, the sooner you see it working.

You can ${link} to review and sign whenever the timing feels right.

Ray
Vernon Tech & Media`,
    },
    {
      subject: `Making this an easy yes`,
      body:
`Hi ${name},

I want this to be a simple decision for you, so here is the short version.

Everything we scoped is spelled out in the agreement, and nothing starts until you are comfortable.

If there is a line you want to adjust, tell me and I will update it.

Otherwise you can ${link} to review and sign.

Ray
Vernon Tech & Media`,
    },
    {
      subject: `Still saving your spot`,
      body:
`Hi ${name},

Your spot is still held on my end, and I would love to get ${biz} moving.

I have been thinking about the plan we talked through, and I am confident it is going to do real work for you.

When you are ready, you can ${link} to review and sign.

Ray
Vernon Tech & Media`,
    },
    {
      subject: `Anything I can clear up?`,
      body:
`Hi ${name},

Checking in one more time on the agreement.

If something is unclear or the timing is off, I would genuinely rather know so I can help.

And if you are ready, you can ${link} to review and sign here.

Either way, just reply and let me know where your head is at.

Ray
Vernon Tech & Media`,
    },
  ];
}

// Build the next automated follow-up for a client. `seq` is the touch number
// being created (2 = first automated follow-up). Returns { subject, body }.
function buildContractFollowup(client, signToken, seq) {
  const name = firstName(client);
  const biz = (client.business_name || 'your project').trim();
  const link = `[${LINK_TEXT}](${SIGN_BASE}${signToken})`;
  const list = angles(name, biz, link);
  const angle = list[(seq - 2) % list.length];
  return { subject: angle.subject, body: angle.body };
}

// Days until the next follow-up: alternate 2 and 3 days so it lands in the
// "every two to three days" window without being metronomic.
function nextIntervalDays(seq) {
  return seq % 2 === 0 ? 3 : 2;
}

module.exports = { buildContractFollowup, nextIntervalDays, MAX_FOLLOWUPS, SIGN_BASE, LINK_TEXT };
