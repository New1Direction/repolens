import { describe, it, expect } from 'vitest';
import { parseRepoInput } from '../mcp/repo-input.js';

describe('parseRepoInput', () => {
  it('parses owner/name', () => {
    expect(parseRepoInput('honojs/hono')).toEqual({ platform: 'github', repoId: 'honojs/hono' });
  });

  it('parses a full GitHub URL', () => {
    expect(parseRepoInput('https://github.com/honojs/hono')).toEqual({
      platform: 'github',
      repoId: 'honojs/hono',
    });
  });

  it('parses a URL with extra path / query / trailing slash', () => {
    expect(parseRepoInput('https://github.com/honojs/hono/tree/main?tab=readme')).toEqual({
      platform: 'github',
      repoId: 'honojs/hono',
    });
  });

  it('strips a trailing .git', () => {
    expect(parseRepoInput('git@github.com:honojs/hono.git')).toEqual({
      platform: 'github',
      repoId: 'honojs/hono',
    });
    expect(parseRepoInput('honojs/hono.git')).toEqual({ platform: 'github', repoId: 'honojs/hono' });
  });

  it('throws on empty or non-string input', () => {
    expect(() => parseRepoInput('')).toThrow(/required/);
    expect(() => parseRepoInput(null)).toThrow(/required/);
  });

  it('throws on an unparseable reference', () => {
    expect(() => parseRepoInput('not a repo')).toThrow(/owner\/name/);
    expect(() => parseRepoInput('justaword')).toThrow(/owner\/name/);
  });
});
