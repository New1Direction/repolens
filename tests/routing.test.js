import { describe, it, expect } from 'vitest';
import { buildAttemptPlan, isConnected, modelFor, CHAIN, DEFAULT_MODELS } from '../routing.js';

// All five providers connected, each on its default model.
const allKeys = {
  nousKey: 'n', googleKey: 'g', openrouterKey: 'o', xaiKey: 'x', anthropicKey: 'a',
};
const ids = (plan) => plan.map((p) => p.provider);

describe('isConnected', () => {
  it('treats xai refresh token as connected', () => {
    expect(isConnected('xai', { xaiRefresh: 'r' })).toBe(true);
    expect(isConnected('xai', {})).toBe(false);
  });
});

describe('modelFor', () => {
  it('uses the configured model, else the default', () => {
    expect(modelFor('anthropic', { anthropicModel: 'claude-opus-4-8' })).toBe('claude-opus-4-8');
    expect(modelFor('anthropic', {})).toBe(DEFAULT_MODELS.anthropic);
  });
});

describe('buildAttemptPlan', () => {
  it('absent routing → full chain order, only connected providers', () => {
    const plan = buildAttemptPlan({ keys: allKeys });
    expect(ids(plan)).toEqual(CHAIN);
  });

  it("a part set to 'default' → plain chain", () => {
    const plan = buildAttemptPlan({ routing: { core: 'default' }, part: 'core', keys: allKeys });
    expect(ids(plan)).toEqual(CHAIN);
  });

  it('override with a connected provider is tried first, then the chain (de-duped)', () => {
    const plan = buildAttemptPlan({ routing: { core: 'anthropic:claude-opus-4-8' }, part: 'core', keys: allKeys });
    expect(plan[0]).toEqual({ provider: 'anthropic', model: 'claude-opus-4-8' });
    // anthropic default (sonnet) still appears once later as fallback; opus not duplicated
    expect(plan.filter((p) => p.provider === 'anthropic')).toEqual([
      { provider: 'anthropic', model: 'claude-opus-4-8' },
      { provider: 'anthropic', model: DEFAULT_MODELS.anthropic },
    ]);
    expect(plan).toHaveLength(CHAIN.length + 1); // chain + the extra opus attempt
  });

  it('override identical to the chain entry is not duplicated', () => {
    const plan = buildAttemptPlan({ routing: { core: 'anthropic:claude-sonnet-4-6' }, part: 'core', keys: allKeys });
    expect(plan.filter((p) => p.provider === 'anthropic')).toHaveLength(1);
    expect(plan[0]).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
  });

  it('override pointing at an unconnected provider is ignored', () => {
    const onlyGoogle = { googleKey: 'g' };
    const plan = buildAttemptPlan({ routing: { core: 'anthropic:claude-opus-4-8' }, part: 'core', keys: onlyGoogle });
    expect(ids(plan)).toEqual(['google']);
  });

  it('nothing connected → empty plan', () => {
    expect(buildAttemptPlan({ routing: { core: 'anthropic:x' }, part: 'core', keys: {} })).toEqual([]);
  });

  it('garbled override (no colon) is treated as default', () => {
    const plan = buildAttemptPlan({ routing: { core: 'garbage' }, part: 'core', keys: allKeys });
    expect(ids(plan)).toEqual(CHAIN);
  });

  it('respects a connected provider on a non-default configured model in the chain', () => {
    const plan = buildAttemptPlan({ keys: { ...allKeys, googleModel: 'gemini-2.5-pro' } });
    const g = plan.find((p) => p.provider === 'google');
    expect(g.model).toBe('gemini-2.5-pro');
  });
});
