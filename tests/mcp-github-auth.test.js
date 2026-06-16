import { describe, it, expect, afterEach } from 'vitest';
import { ghOpts } from '../mcp/github-auth.js';

describe('ghOpts', () => {
  const original = process.env.GITHUB_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = original;
  });

  it('returns empty opts when GITHUB_TOKEN is unset (anonymous, like the extension)', () => {
    delete process.env.GITHUB_TOKEN;
    expect(ghOpts()).toEqual({});
  });

  it('returns the token when GITHUB_TOKEN is set', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    expect(ghOpts()).toEqual({ githubToken: 'ghp_test123' });
  });
});
