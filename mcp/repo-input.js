// Parse a user-supplied repo reference into { platform, repoId }.
// v1 is GitHub-only. Accepts "owner/name" or a github.com URL (with or without
// scheme, trailing slash, .git, or extra path segments).

function stripGit(name) {
  return name.replace(/\.git$/i, '');
}

/**
 * @param {string} input - "owner/name" or a GitHub URL.
 * @returns {{ platform: 'github', repoId: string }}
 * @throws if the input can't be parsed into owner/name.
 */
export function parseRepoInput(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('repo is required — pass owner/name or a GitHub URL');
  }
  const s = input.trim();

  // URL form: grabs the first two path segments after github.com.
  const url = s.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i);
  if (url) {
    return { platform: 'github', repoId: `${url[1]}/${stripGit(url[2])}` };
  }

  // Bare slug: owner/name (exactly two non-empty segments).
  const slug = s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slug) {
    return { platform: 'github', repoId: `${slug[1]}/${stripGit(slug[2])}` };
  }

  throw new Error(`Could not parse repo "${input}" — use owner/name or a GitHub URL`);
}
