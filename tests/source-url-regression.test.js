import { describe, it, expect } from 'vitest';
import { repoMarkdownLink, sourceUrl } from '../src/library-data.js';

describe('source URL regressions', () => {
  it('uses the row platform when opening a source URL', () => {
    const row = { platform: 'pypi', repoId: 'requests' };
    expect(sourceUrl(row.platform || '', row.repoId)).toBe('https://pypi.org/project/requests/');
  });

  it('uses platform-aware URLs in markdown export links', () => {
    expect(repoMarkdownLink({ platform: 'gitlab', repoId: 'inkscape/inkscape' })).toBe(
      '[inkscape/inkscape](https://gitlab.com/inkscape/inkscape)'
    );
    expect(repoMarkdownLink({ platform: 'npm', repoId: '@scope/pkg' })).toBe(
      '[@scope/pkg](https://www.npmjs.com/package/@scope/pkg)'
    );
    expect(repoMarkdownLink({ platform: 'pypi', repoId: 'requests' })).toBe(
      '[requests](https://pypi.org/project/requests/)'
    );
  });
});
