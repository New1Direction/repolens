// Per-framework run state for a multi-framework lens (Systems / Ideate / Prioritize / Kill).
// Pure + immutable: every function returns a new object and never mutates its input.
// Shape: { active: '<framework key>', runs: { [framework]: { status, result, error } } }

export function emptyLens() {
  return { active: '', runs: {} };
}

export function withRun(lens, framework, patch) {
  const base = lens || emptyLens();
  const prev = base.runs[framework] || {};
  return {
    ...base,
    runs: { ...base.runs, [framework]: { ...prev, ...patch } },
  };
}

export function setActive(lens, framework) {
  const base = lens || emptyLens();
  return { ...base, active: framework };
}

export function runOf(lens, framework) {
  return (lens && lens.runs && lens.runs[framework]) || null;
}

export function ranFrameworks(lens) {
  return lens && lens.runs ? Object.keys(lens.runs) : [];
}
