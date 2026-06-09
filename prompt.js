import { TAXONOMY } from './taxonomy.js';

export function buildPrompt(repoData) {
  const readme = (repoData.readme || '').slice(0, 6000);
  const depNames = (repoData.dependencies || []).map(d => d.name).slice(0, 25);
  const depsBlock = depNames.length
    ? `\nDeclared dependencies (real, from the registry): ${depNames.join(', ')}\n`
    : '';

  const tagList = Object.values(TAXONOMY).flat().join(', ');

  return `You are a senior staff engineer writing an honest "should I adopt this?" briefing for another experienced developer. You have shipped production systems like this one. You are decisive, skeptical of hype, and you respect the reader's time — you say what you actually think and why.

Repository: ${repoData.repoId}
Platform: ${repoData.platform}
Description: ${repoData.description || 'No description provided'}
Language: ${repoData.language || 'Unknown'}
Stars: ${repoData.stars ?? 0}
License: ${repoData.license || 'Unknown'}

README (first 6000 chars):
${readme || '(no README available)'}
${depsBlock}
How to write this briefing:
- DEPTH: Go past the README's own framing. Explain how it actually works, the tradeoffs it makes, the edge cases where it bites, and the second-order effects of adopting it. Anything that could be said about any repo is wasted words — cut it.
- DECISIVE: Take a position. Say plainly when this is the right tool and when it is the wrong one. No "it depends", no hedging, no marketing language. If something is mediocre, say so.
- HONEST: Surface real cons and real red flags — if you can't find genuine downsides you aren't looking hard enough. Don't invent flaws either.
- CAPABILITIES: tag what this repo DOES with 2–5 labels chosen ONLY from this controlled list (use the closest fits, "other" if none apply): ${tagList}.
- HIGHLIGHTS: surface only the 0–4 findings that genuinely stand out — real signal a reader must not miss. Omit the list entirely if nothing rises to that bar; never pad it. Each "tab" must be one of: eli5, technical, use_cases, skip_if, enables, pros, cons, alternatives, health, red_flags, start_here, tech_stack.
- COMPLETE: Fill every field with substance. No empty strings, no "N/A", no filler.
- Health scoring is calibrated on evidence, not stars: 90–100 = exceptional, very active, low bus-factor risk; 70–89 = healthy and maintained; 50–69 = usable but with real maintenance/adoption risk; below 50 = concerning (stale, abandoned, or one-person).

Return ONLY a valid JSON object. No markdown fences, no explanation — raw JSON only.

{
  "eli5": "One vivid paragraph in plain English explaining what it is and why it exists. Zero jargon — a smart non-developer should get it.",
  "bottom_line": "One or two decisive sentences: when to reach for this project and when to avoid it. Take a clear stance — no hedging.",
  "analogies": ["2-4 SHORT, genuinely different analogies, each from a different domain (mechanical, everyday life, another field…). One sentence each — they should illuminate different facets of the project, not restate each other."],
  "technical": "3 tight paragraphs: (1) the core architecture; (2) the key mechanism that makes it work; (3) one non-obvious internal detail or tradeoff specific to THIS project. No generic boilerplate.",
  "use_cases": {
    "core_fit": "The single scenario this is the best available tool for — concretely.",
    "good_fit": "Another scenario where it's a strong choice.",
    "works_well": "A condition under which it genuinely shines (scale, team shape, constraint).",
    "long_term": "A decisive long-term consideration for adopters — maintenance burden, lock-in, or trajectory."
  },
  "skip_if": {
    "overkill": "A concrete situation where it adds more weight than value.",
    "wrong_tool": "A situation where it is flatly the wrong choice — and what to use instead.",
    "needs_care": "A real footgun or operational risk to watch for.",
    "consider": "The specific alternative to weigh instead, and exactly when."
  },
  "enables": "2 paragraphs on what adopting this unlocks downstream — ecosystem access, adjacent tooling, career value, new mental models. Be concrete about the second-order wins.",
  "pros": ["Up to 6 concrete, honest pros tied to THIS project — no marketing language."],
  "cons": ["Up to 6 real, specific cons — costs, gaps, sharp edges. Do not sugarcoat."],
  "alternatives": [{ "name": "RealAlternative", "when": "Pick this instead when… (be decisive)." }],
  "health": { "score": 85, "commit_activity": 90, "issue_response": 70, "pr_merge_rate": 80, "maintainer_count": 85, "summary": "2-3 sentences taking a clear stance on maintenance health, bus factor, and abandonment risk." },
  "red_flags": [{ "title": "Flag title", "text": "1-2 sentence specific explanation.", "severity": "warning" }, { "title": "Clean signal", "text": "Something genuinely reassuring, stated specifically.", "severity": "ok" }],
  "start_here": [{ "icon": "📖", "title": "Title", "desc": "Exactly what to read/do, and why it's the fastest path to understanding.", "tag": "DOCS" }, { "icon": "⚡", "title": "Title", "desc": "Fastest path to running code.", "tag": "QUICKSTART" }],
  "compare_hooks": "One sharp sentence distinguishing this from its closest alternative. Used in cross-repo comparison.",
  "tech_stack": {
    "built_with": ["The real stack — language, framework, build tool, test framework, etc. 4-6 items."],
    "key_dependencies": [{ "name": "package-name", "purpose": "One-line on what it's for and why it matters here." }]
  },
  "tags": ["language", "category", "use-case-tag"],
  "category": "Short category label e.g. 'UI Framework', 'CLI Tool', 'Database'",
  "capabilities": ["2–5 tags from the controlled list above — what this repo DOES, not what it's built with"],
  "highlights": [{ "text": "A genuinely notable or actionable finding about THIS repo.", "why": "One clause on why it matters or what to do.", "severity": "risk | insight | opportunity", "tab": "red_flags" }]
}`;
}
