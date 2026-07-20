// Maps CRM statuses / stages to the pill styles defined in global.css.
const MAP = {
  New: 'pill-blue',
  Contacted: 'pill-orange',
  Qualified: 'pill-purple',
  Proposal: 'pill-orange',
  Negotiation: 'pill-blue',
  Won: 'pill-success',
  Lost: 'pill-warning',
}

export default function Badge({ value }) {
  return <span className={`pill ${MAP[value] || 'pill-muted'}`}>{value}</span>
}
