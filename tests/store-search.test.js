import { describe, it, expect } from 'vitest';
import { rankRepos, tokens } from '../src/store/search.js';

const repo = (repoId, extra = {}) => ({ repoId, ...extra });

describe('tokens', () => {
  it('lowercases, splits, drops stopwords, keeps + # .', () => {
    expect(tokens('A Rust CLI for the C++ node.js')).toEqual(['rust', 'cli', 'c++', 'node.js']);
  });
});

describe('rankRepos', () => {
  const rows = [
    repo('a/rust-cli', { language: 'Rust', category: 'CLI', tags: ['terminal'] }),
    repo('b/rust-web', { language: 'Rust', category: 'web framework' }),
    repo('c/js-cli', { language: 'JavaScript', category: 'CLI' }),
  ];

  it('orders by token overlap, best first', () => {
    // query overlaps a/rust-cli on both "rust" and "cli" (2), b on "rust" (1), c on "cli" (1)
    const out = rankRepos(rows, 'Rust CLI', { topK: 3 });
    expect(out[0].repoId).toBe('a/rust-cli');
    expect(out).toHaveLength(3);
  });

  it('excludes the given repoId (self)', () => {
    const out = rankRepos(rows, 'Rust CLI', { excludeId: 'a/rust-cli', topK: 3 });
    expect(out.map((r) => r.repoId)).not.toContain('a/rust-cli');
  });

  it('caps results at topK', () => {
    expect(rankRepos(rows, 'Rust CLI', { topK: 1 })).toHaveLength(1);
  });

  it('returns [] for an empty query and for zero matches', () => {
    expect(rankRepos(rows, '', {})).toEqual([]);
    expect(rankRepos(rows, 'haskell quantum', {})).toEqual([]);
  });

  it('ignores malformed rows (no repoId)', () => {
    expect(rankRepos([{ language: 'Rust' }, null], 'Rust', {})).toEqual([]);
  });

  it('BM25: a rare query term outranks a common one (idf weighting)', () => {
    // "web" is in 2 of 3 docs (common); "compiler" is in 1 (rare). The doc that
    // matches only the rare term should beat the docs that match only the common one.
    const idfRows = [
      { repoId: 'o/aaa', category: 'web' },
      { repoId: 'o/bbb', category: 'web' },
      { repoId: 'o/ccc', category: 'compiler' },
    ];
    const out = rankRepos(idfRows, 'web compiler', { topK: 3 });
    expect(out[0].repoId).toBe('o/ccc');
  });

  it('BM25: a hit in a high-signal field outranks a buried mention', () => {
    const fieldRows = [
      { repoId: 'o/x', category: 'database' }, // "database" in the category (weight 3)
      { repoId: 'o/y', eli5: 'this tool mentions database once' }, // buried in eli5 (weight 1)
    ];
    const out = rankRepos(fieldRows, 'database', { topK: 2 });
    expect(out[0].repoId).toBe('o/x');
  });
});
