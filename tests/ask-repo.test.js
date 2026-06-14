import { describe, it, expect } from 'vitest';
import { buildAskRepoPrompt, parseAskRepoAnswer } from '../ask-repo.js';

const base = {
  repoId: 'facebook/react',
  description: 'The library for web and native UIs',
  language: 'JavaScript',
  license: 'MIT',
  stars: 230000,
  eli5: 'React is a UI library that lets you build interfaces from small reusable pieces called components.',
  technical: 'Virtual DOM diffing; reconciler; hooks-based state; JSX transpilation.',
  pros: ['Huge ecosystem', 'Component reuse'],
  cons: ['Boilerplate', 'JSX learning curve'],
  red_flags: [{ text: 'No SSR story out of the box', severity: 'warn' }],
  capabilities: ['UI rendering', 'State management'],
  health: { score: 92 },
  alternatives: [{ name: 'vue' }, { name: 'solid' }],
};

describe('buildAskRepoPrompt', () => {
  it('returns empty string for missing question', () => {
    expect(buildAskRepoPrompt('', base)).toBe('');
  });

  it('returns empty string for missing repoId', () => {
    expect(buildAskRepoPrompt('What is this?', {})).toBe('');
  });

  it('includes repoId and question', () => {
    const p = buildAskRepoPrompt('Is this good for SSR?', base);
    expect(p).toContain('facebook/react');
    expect(p).toContain('Is this good for SSR?');
  });

  it('includes key analysis fields', () => {
    const p = buildAskRepoPrompt('Tell me about pros', base);
    expect(p).toContain('Huge ecosystem');
    expect(p).toContain('Health score: 92');
    expect(p).toContain('JavaScript');
    expect(p).toContain('MIT');
  });

  it('includes red flag text from object shape', () => {
    const p = buildAskRepoPrompt('What should I watch out for?', base);
    expect(p).toContain('No SSR story out of the box');
  });

  it('handles red flags as plain strings', () => {
    const p = buildAskRepoPrompt('risks?', { ...base, red_flags: ['Security concern', 'No tests'] });
    expect(p).toContain('Security concern');
  });

  it('includes alternatives', () => {
    const p = buildAskRepoPrompt('what else?', base);
    expect(p).toContain('vue');
  });

  it('works with minimal analysis (only repoId)', () => {
    const p = buildAskRepoPrompt('What is this?', { repoId: 'x/y' });
    expect(p).toContain('x/y');
    expect(p).toContain('What is this?');
  });

  it('includes prior conversation history when provided', () => {
    const history = [
      { question: 'Does it support TypeScript?', answer: 'Yes, full TypeScript support.' },
      { question: 'What about testing?', answer: 'It includes a built-in test runner.' },
    ];
    const p = buildAskRepoPrompt('Any other features?', base, history);
    expect(p).toContain('Prior conversation');
    expect(p).toContain('Does it support TypeScript?');
    expect(p).toContain('Yes, full TypeScript support.');
    expect(p).toContain('What about testing?');
  });

  it('omits history section when history is empty', () => {
    const p = buildAskRepoPrompt('What is this?', base, []);
    expect(p).not.toContain('Prior conversation');
  });
});

describe('parseAskRepoAnswer', () => {
  it('trims whitespace', () => {
    expect(parseAskRepoAnswer('  hello  ')).toBe('hello');
  });

  it('returns empty string for null', () => {
    expect(parseAskRepoAnswer(null)).toBe('');
  });
});
