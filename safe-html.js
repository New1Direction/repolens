// safe-html.js — the single source of truth for HTML escaping, plus an
// injection-safe tagged-template primitive for building DOM strings.
//
// Why this exists: escaping had drifted into several near-duplicate `esc()`
// copies, some of which covered only & < > yet were interpolated into attribute
// contexts. One canonical escaper (& < > " ') means a future attribute sink
// can't silently reintroduce a hole, and `html`` makes new DOM safe by
// construction — every interpolation is escaped unless explicitly marked raw().

const ENTITIES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/**
 * Escape a value for safe insertion into HTML text or a quoted attribute.
 * Covers & < > " ' so the same helper is correct in every context.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** Pre-trusted HTML that html`` interpolates verbatim (never re-escaped). */
class RawHtml {
  /** @param {unknown} value */
  constructor(value) {
    this.value = String(value ?? '');
  }
  toString() {
    return this.value;
  }
}

/**
 * Mark an already-safe HTML string so it passes through html`` un-escaped.
 * Use ONLY for strings you built with html`` or known-static markup.
 * @param {string | RawHtml} value
 * @returns {RawHtml}
 */
export function raw(value) {
  return value instanceof RawHtml ? value : new RawHtml(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function interpolate(value) {
  if (value == null || value === false) return '';
  if (value instanceof RawHtml) return value.value;
  if (Array.isArray(value)) return value.map(interpolate).join('');
  return escapeHtml(value);
}

/**
 * Tagged template that auto-escapes every interpolation (arrays are flattened
 * and joined; raw()/nested html`` values pass through). Safe by construction in
 * both text and attribute contexts — `html`<a title="${t}">${t}</a>`` cannot be
 * broken out of. Returns a RawHtml so nested html`` composes without
 * double-escaping; coerce with String(...) or assign straight to innerHTML.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {RawHtml}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += interpolate(values[i]) + strings[i + 1];
  }
  return new RawHtml(out);
}
