import { normalizeCapabilities, deriveCapabilities } from './taxonomy.js';

const HL_SEVERITIES = new Set(['risk', 'insight', 'opportunity']);
const REC_ACTIONS = new Set(['adopt', 'trial', 'compare', 'hold', 'avoid']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);
const EVIDENCE_TYPES = new Set(['strength', 'risk', 'fit', 'health']);
const MODEL_KINDS = new Set([
  'framework',
  'library',
  'protocol',
  'platform',
  'app',
  'cli',
  'service',
  'data-store',
  'other',
]);
const RISK_LEVELS = new Set(['low', 'medium', 'high']);
const HL_SECTIONS = new Set([
  'eli5',
  'technical',
  'use_cases',
  'skip_if',
  'enables',
  'pros',
  'cons',
  'alternatives',
  'health',
  'red_flags',
  'start_here',
  'tech_stack',
]);

function normalizeHighlights(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof h === 'object' && String(h.text || '').trim())
    .slice(0, 4)
    .map((h) => ({
      text: String(h.text),
      why: String(h.why ?? ''),
      severity: HL_SEVERITIES.has(h.severity) ? h.severity : 'insight',
      tab: HL_SECTIONS.has(h.tab) ? h.tab : '',
    }));
}

function normalizeRecommendation(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    action: REC_ACTIONS.has(r.action) ? r.action : '',
    title: String(r.title ?? ''),
    rationale: String(r.rationale ?? ''),
    next: String(r.next ?? ''),
  };
}

function normalizeConfidence(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    level: CONFIDENCE_LEVELS.has(c.level) ? c.level : '',
    reason: String(c.reason ?? ''),
  };
}

function normalizeEvidence(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === 'object' && String(e.claim || '').trim())
    .slice(0, 5)
    .map((e) => ({
      claim: String(e.claim),
      why: String(e.why ?? ''),
      type: EVIDENCE_TYPES.has(e.type) ? e.type : 'fit',
    }));
}

const strings = (xs, max) =>
  Array.isArray(xs)
    ? xs
        .map(String)
        .filter((s) => s.trim())
        .slice(0, max)
    : [];

function normalizeActionPlan(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const steps = Array.isArray(p.steps)
    ? p.steps
        .filter((s) => s && typeof s === 'object' && String(s.title || s.action || '').trim())
        .slice(0, 5)
        .map((s) => ({
          time: String(s.time ?? ''),
          title: String(s.title ?? ''),
          action: String(s.action ?? ''),
          success: String(s.success ?? ''),
        }))
    : [];
  return {
    goal: String(p.goal ?? ''),
    steps,
    validation_checklist: strings(p.validation_checklist, 6),
    questions: strings(p.questions, 5),
  };
}

function normalizeMentalModel(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  return {
    kind: MODEL_KINDS.has(m.kind) ? m.kind : '',
    stack_role: String(m.stack_role ?? ''),
    inputs: strings(m.inputs, 5),
    outputs: strings(m.outputs, 5),
    core_abstractions: strings(m.core_abstractions, 6),
    extension_points: strings(m.extension_points, 6),
    hidden_assumptions: strings(m.hidden_assumptions, 6),
    failure_boundaries: strings(m.failure_boundaries, 6),
  };
}

function normalizeRiskRegister(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === 'object' && String(r.risk || '').trim())
    .slice(0, 6)
    .map((r) => ({
      risk: String(r.risk),
      probability: RISK_LEVELS.has(r.probability) ? r.probability : 'medium',
      impact: RISK_LEVELS.has(r.impact) ? r.impact : 'medium',
      evidence: String(r.evidence ?? ''),
      mitigation: String(r.mitigation ?? ''),
      validate: String(r.validate ?? ''),
    }));
}

function normalizeAdoptionSimulation(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    day_1: String(s.day_1 ?? ''),
    week_1: String(s.week_1 ?? ''),
    month_1: String(s.month_1 ?? ''),
    exit_cost: String(s.exit_cost ?? ''),
  };
}

function normalizeLearningPath(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object' && String(x.concept || '').trim())
    .slice(0, 6)
    .map((x) => ({
      concept: String(x.concept),
      why: String(x.why ?? ''),
      exercise: String(x.exercise ?? ''),
    }));
}

export function parseClaudeResponse(rawText) {
  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in Claude response');
  text = text.slice(start, end + 1);
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse Claude response: ${e.message}\nRaw: ${text.slice(0, 200)}`);
  }
  return {
    eli5: data.eli5 ?? '',
    analogies: Array.isArray(data.analogies) ? data.analogies.map(String) : [],
    recommendation: normalizeRecommendation(data.recommendation),
    confidence: normalizeConfidence(data.confidence),
    evidence: normalizeEvidence(data.evidence),
    action_plan: normalizeActionPlan(data.action_plan),
    mental_model: normalizeMentalModel(data.mental_model),
    risk_register: normalizeRiskRegister(data.risk_register),
    adoption_simulation: normalizeAdoptionSimulation(data.adoption_simulation),
    learning_path: normalizeLearningPath(data.learning_path),
    technical: data.technical ?? '',
    use_cases: data.use_cases ?? { core_fit: '', good_fit: '', works_well: '', long_term: '' },
    skip_if: data.skip_if ?? { overkill: '', wrong_tool: '', needs_care: '', consider: '' },
    enables: data.enables ?? '',
    pros: data.pros ?? [],
    cons: data.cons ?? [],
    alternatives: data.alternatives ?? [],
    health: data.health ?? {
      score: 0,
      commit_activity: 0,
      issue_response: 0,
      pr_merge_rate: 0,
      maintainer_count: 0,
      summary: '',
    },
    red_flags: data.red_flags ?? [],
    start_here: data.start_here ?? [],
    compare_hooks: data.compare_hooks ?? '',
    bottom_line: String(data.bottom_line ?? ''),
    tech_stack: {
      built_with: Array.isArray(data.tech_stack?.built_with) ? data.tech_stack.built_with : [],
      key_dependencies: Array.isArray(data.tech_stack?.key_dependencies)
        ? data.tech_stack.key_dependencies.map((d) => ({ name: d?.name ?? '', purpose: d?.purpose ?? '' }))
        : [],
    },
    tags: data.tags ?? [],
    category: data.category ?? '',
    capabilities: (() => {
      const norm = normalizeCapabilities(data.capabilities);
      return norm.length
        ? norm
        : deriveCapabilities({
            category: data.category,
            tech_stack: data.tech_stack,
            tags: data.tags,
            eli5: data.eli5,
          });
    })(),
    highlights: normalizeHighlights(data.highlights),
  };
}
