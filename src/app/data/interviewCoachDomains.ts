/**
 * Routing index only. It tells the coach what to inspect, but deliberately does
 * not pretend to be a complete factual reference. Add reviewed, versioned
 * domain packs here as the product expands.
 */
export const STUDENT_DOMAIN_ROUTING_INDEX = `
Available starter domains:

- academic_research
  Inspect: research question, prior work, method choice, validity, evidence, limitations, reproducibility, and personal contribution.
- software_engineering
  Inspect: requirements, architecture, implementation ownership, testing, debugging, trade-offs, reliability, and measurable outcomes.
- data_ai
  Inspect: problem framing, data source and leakage, baseline, metric choice, validation design, error analysis, deployment constraints, and limitations.
- general_project
  Inspect: goal, stakeholders, constraints, role, action, decision, outcome, setback, and learning.

Boundary: these are question maps, not authoritative facts. If correctness depends on a specialized field, standard, paper, law, medical claim, or current technology version and no reviewed reference is supplied, mark that claim as pending verification.
`;
