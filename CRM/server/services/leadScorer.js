/**
 * leadScorer.js
 * Pure utility — no DB access. Accepts a lead object, returns { score, segment }.
 */

function scoreLead(lead) {
  let score = 0;

  // ── Budget (max 4 pts) ──────────────────────────────────────────────────────
  const budget = (lead.budget || '').toLowerCase();
  if (budget.includes('150'))       score += 4;
  else if (budget.includes('50'))   score += 2;
  else if (budget.includes('20'))   score += 1;
  // $0 → 0

  // ── Time available (max 3 pts) ──────────────────────────────────────────────
  const time = (lead.time_available || '').toLowerCase();
  if (time.includes('15+') || time.includes('15 +'))     score += 3;
  else if (time.includes('8') && time.includes('15'))    score += 2;
  else if (time.includes('4') || time.includes('7'))     score += 1;
  // 1-3 hrs → 0

  // ── Business status (max 3 pts) ─────────────────────────────────────────────
  const biz = (lead.has_business || '').toLowerCase();
  if (biz.includes('established'))       score += 3;
  else if (biz.includes('just starting') || biz.includes('just started')) score += 2;
  else if (biz.includes('planning'))     score += 1;
  // No business → 0

  // ── Recency bonus (max 2 pts) ───────────────────────────────────────────────
  const rawDate = lead.submission_date || lead.created_at;
  if (rawDate) {
    const daysSince = Math.floor((Date.now() - new Date(rawDate)) / 86400000);
    if (daysSince < 30)       score += 2;
    else if (daysSince < 90)  score += 1;
  }

  // ── Completeness bonuses (max 2 pts) ────────────────────────────────────────
  if (lead.financial_goal    && lead.financial_goal.length    > 10) score += 1;
  if (lead.current_situation && lead.current_situation.length > 20) score += 1;

  // ── Positive modifiers ──────────────────────────────────────────────────────
  if (lead.previous_attempts && lead.previous_attempts.length > 50) score += 1;
  if (lead.biggest_fear && lead.biggest_fear.length > 20 &&
      !/^(none|n\/a|no|nothing)$/i.test(lead.biggest_fear.trim()))   score += 1;
  if (lead.why_now && /urgent|now|asap|immediately|ready|today|need/i.test(lead.why_now)) score += 1;

  // ── Negative modifier ───────────────────────────────────────────────────────
  if (lead.work_style && /need.*proof|proof.*first|see.*proof/i.test(lead.work_style)) score -= 1;

  // ── Clamp 1-10 ──────────────────────────────────────────────────────────────
  score = Math.max(1, Math.min(10, score));

  const segment = score >= 8 ? 'hot' : score >= 5 ? 'warm' : 'cold';
  return { score, segment };
}

module.exports = { scoreLead };
