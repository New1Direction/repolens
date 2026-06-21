// Parse a user-supplied package/repo reference into { platform, repoId }.
// Accepts owner/name, platform-prefixed refs (github:, gitlab:, npm:, pypi:),
// and GitHub/GitLab/npm/PyPI URLs.

function stripGit(name) {
  return name.replace(/\.git$/i, '');
}

function stripSlashes(value) {
  return value.replace(/^\/+|\/+$/g, '');
}

/**
 * @param {string} input - owner/name, platform:name, or supported URL.
 * @returns {{ platform: 'github'|'gitlab'|'npm'|'pypi', repoId: string }}
 * @throws if the input can't be parsed.
 */
export function parseRepoInput(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('repo is required — pass owner/name or a GitHub URL');
  }
  const s = input.trim();

  const sshGithub = s.match(/^git@github\.com:([^/\s]+)\/([^/\s#?]+)$/i);
  if (sshGithub) return { platform: 'github', repoId: `${sshGithub[1]}/${stripGit(sshGithub[2])}` };

  const sshGitlab = s.match(/^git@gitlab\.com:([^/\s]+)\/([^/\s#?]+)$/i);
  if (sshGitlab) return { platform: 'gitlab', repoId: `${sshGitlab[1]}/${stripGit(sshGitlab[2])}` };

  const prefixed = s.match(/^(github|gitlab|npm|pypi):(.+)$/i);
  if (prefixed) {
    const platform = prefixed[1].toLowerCase();
    const id = stripSlashes(stripGit(prefixed[2].trim()));
    if (id) return { platform, repoId: id };
  }

  let u = null;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    /* fall through to slug parsing */
  }
  if (u) {
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'github.com' && parts.length >= 2) {
      return { platform: 'github', repoId: `${parts[0]}/${stripGit(parts[1])}` };
    }
    if (host === 'gitlab.com' && parts.length >= 2) {
      return { platform: 'gitlab', repoId: `${parts[0]}/${stripGit(parts[1])}` };
    }
    if (host === 'www.npmjs.com' && parts[0] === 'package') {
      const name = parts[1]?.startsWith('@') && parts[2] ? `${parts[1]}/${parts[2]}` : parts[1];
      if (name) return { platform: 'npm', repoId: name };
    }
    if (host === 'pypi.org' && parts[0] === 'project' && parts[1]) {
      return { platform: 'pypi', repoId: parts[1] };
    }
  }

  // Bare slug: owner/name defaults to GitHub.
  const slug = s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slug) return { platform: 'github', repoId: `${slug[1]}/${stripGit(slug[2])}` };

  throw new Error(
    `Could not parse repo "${input}" — use owner/name, github:owner/name, gitlab:owner/name, npm:pkg, pypi:pkg, or a supported URL`
  );
}
