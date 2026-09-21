// Starting phases and steps for a new project board, keyed off
// crm_projects.project_kind. Same idea as STAGE_CHECKLISTS in delivery-board.js:
// seeding gives you the standard shape in one click, and everything it creates
// is an ordinary editable row afterwards. Nothing here is binding.
//
// client_visible: false marks the steps that are VTM's internal plumbing. A
// client watching the board sees progress, not our access credentials or our
// margin work. The default is visible, so anything not marked stays public.

const TEMPLATES = {
  build: {
    label: 'Build project',
    phases: [
      { name: 'Discovery and scoping', steps: [
        { name: 'Kickoff call held' },
        { name: 'Goals and success measures agreed' },
        { name: 'Scope written and confirmed with client' },
        { name: 'Brand assets and copy collected' },
        { name: 'Access and credentials received', client_visible: false },
      ] },
      { name: 'Design', steps: [
        { name: 'Sitemap or structure agreed' },
        { name: 'First design pass shared' },
        { name: 'Client feedback collected' },
        { name: 'Design signed off' },
      ] },
      { name: 'Build', steps: [
        { name: 'Environment and repo set up', client_visible: false },
        { name: 'Core pages or screens built' },
        { name: 'Integrations wired up' },
        { name: 'Content loaded' },
        { name: 'Mobile and responsive pass' },
      ] },
      { name: 'Review and QA', steps: [
        { name: 'Internal QA pass', client_visible: false },
        { name: 'Client review round' },
        { name: 'Revisions applied' },
        { name: 'Final approval received' },
      ] },
      { name: 'Launch', steps: [
        { name: 'Domain and DNS configured' },
        { name: 'Analytics and tracking live' },
        { name: 'Launched to production' },
        { name: 'Post-launch checks done' },
      ] },
      { name: 'Handover', steps: [
        { name: 'Walkthrough recorded or delivered' },
        { name: 'Documentation handed over' },
        { name: 'Support arrangement confirmed' },
      ] },
    ],
  },

  retainer: {
    label: 'Monthly retainer',
    phases: [
      { name: 'Planning', steps: [
        { name: 'Monthly goals agreed' },
        { name: 'Content calendar drafted' },
        { name: 'Calendar approved by client' },
      ] },
      { name: 'Production', steps: [
        { name: 'Shoot or asset creation scheduled' },
        { name: 'Content captured' },
        { name: 'Editing and post complete' },
        { name: 'Client approval on assets' },
      ] },
      { name: 'Publishing', steps: [
        { name: 'Posts scheduled' },
        { name: 'Published across platforms' },
        { name: 'Community management and replies' },
      ] },
      { name: 'Reporting', steps: [
        { name: 'Performance pulled' },
        { name: 'Monthly report sent' },
        { name: 'Next month agreed on review call' },
      ] },
    ],
  },
};

const DEFAULT_KIND = 'build';

function templateFor(projectKind) {
  return TEMPLATES[projectKind] || TEMPLATES[DEFAULT_KIND];
}

// Flatten a template into rows ready for crm_project_items. Phases come back
// first with a stable position, then their steps carry parent_key so the caller
// can wire parent_id once the phases have real ids.
function templateRows(projectKind) {
  const tpl = templateFor(projectKind);
  const phases = [];
  const steps = [];
  tpl.phases.forEach((phase, pi) => {
    const key = `p${pi}`;
    phases.push({ key, name: phase.name, position: pi });
    (phase.steps || []).forEach((step, si) => {
      steps.push({
        parent_key: key,
        name: step.name,
        position: si,
        client_visible: step.client_visible !== false,
      });
    });
  });
  return { label: tpl.label, phases, steps };
}

module.exports = { TEMPLATES, templateFor, templateRows };
