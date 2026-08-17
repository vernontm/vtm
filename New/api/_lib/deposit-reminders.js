// Rotating reminder copy for a client who SIGNED but hasn't paid their deposit
// yet. Each reminder carries a durable "pay your deposit here" link (the
// token-gated /pay-deposit endpoint). House style: no em dashes, a blank line
// between sentences.

const PAY_BASE = 'https://vernontm.com/api/crm/pay-deposit?token=';
const LINK_TEXT = 'pay your deposit here';

// Max reminders in the whole sequence (starting at seq 1 = same-day nudge).
const MAX_REMINDERS = 6;

function firstName(client) {
  const n = (client.owner_name || client.lead_name || '').trim();
  const f = n ? n.split(/\s+/)[0] : 'there';
  return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
}

function angles(name, biz, link) {
  return [
    {
      subject: `One quick step to kick off ${biz}`,
      body:
`Hi ${name},

Congrats on signing, I am excited to get started.

There is one last step before we begin: the deposit.

You can ${link} and we will start right away.

Ray
Vernon Tech & Media`,
    },
    {
      subject: `Ready to start the moment your deposit is in`,
      body:
`Hi ${name},

Just a friendly nudge, your agreement is signed and everything is set on my end.

The only thing holding up the start is the deposit.

Whenever you are ready, you can ${link}.

Ray
Vernon Tech & Media`,
    },
    {
      subject: `Did the deposit link give you any trouble?`,
      body:
`Hi ${name},

Checking in to make sure the deposit step went through okay.

If the link gave you any trouble, just reply here and I will sort it out.

Otherwise you can ${link} whenever it is convenient.

Ray
Vernon Tech & Media`,
    },
    {
      subject: `Still holding your spot for ${biz}`,
      body:
`Hi ${name},

Your spot is still held and I am ready to begin.

Once the deposit is in, I start the same week.

You can ${link} when the timing works.

Ray
Vernon Tech & Media`,
    },
    {
      subject: `Anything I can do to make this easier?`,
      body:
`Hi ${name},

One more check-in on the deposit for ${biz}.

If timing or anything else is in the way, I would genuinely rather know so I can help.

And if you are ready, you can ${link}.

Ray
Vernon Tech & Media`,
    },
  ];
}

// seq 1 is the same-day nudge; angle index = (seq - 1) mod angles.length.
function buildDepositReminder(client, signToken, seq) {
  const name = firstName(client);
  const biz = (client.business_name || 'your project').trim();
  const link = `[${LINK_TEXT}](${PAY_BASE}${signToken})`;
  const list = angles(name, biz, link);
  const angle = list[(seq - 1) % list.length];
  return { subject: angle.subject, body: angle.body };
}

// Days until the next reminder: alternate 2 and 3 days.
function nextIntervalDays(seq) {
  return seq % 2 === 0 ? 3 : 2;
}

module.exports = { buildDepositReminder, nextIntervalDays, MAX_REMINDERS, PAY_BASE, LINK_TEXT };
