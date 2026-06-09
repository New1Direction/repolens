import Link from 'next/link';

const COLORS = {
  bg: '#060a10',
  panel: '#0e1722',
  border: '#1c2b3e',
  border2: '#284c68',
  text: '#e8eff7',
  sub: '#a3b6cc',
  muted: '#64768c',
  cyan: '#38bdf8',
  cyanDeep: '#0c2434',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};

const FEATURES = [
  { icon: '⚖️', title: 'Verdict-first', body: 'A fit call — strong / solid / care / risky — plus a one-line bottom line, before anything else.' },
  { icon: '🧠', title: 'Deep Dive', body: 'Atoms → lineage → a Feynman-style explanation. Optionally grounded in measured facts.' },
  { icon: '📚', title: 'Your library', body: 'Every repo you have scanned, as a sortable, filterable triage grid with fit chips.' },
  { icon: '🕸️', title: 'Connections', body: 'A walkable semantic graph of how your repos relate to one another.' },
  { icon: '🎛️', title: 'Your models', body: 'Bring your own keys. Route each part of a scan to a different model, with smart fallback.' },
  { icon: '💾', title: 'No server', body: 'The whole library lives in your browser. Nothing to install. Web-Store-ready.' },
];

export default function HomePage() {
  return (
    <main
      style={{
        background:
          'radial-gradient(1100px 600px at 78% -10%, #11283f 0%, transparent 58%), ' +
          'radial-gradient(900px 480px at 6% 2%, #0c1b2b 0%, transparent 50%), ' +
          COLORS.bg,
        color: COLORS.text,
        minHeight: '100%',
      }}
    >
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '96px 24px 40px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            font: `700 11px/1 ${COLORS.mono}`,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: COLORS.cyan,
            marginBottom: 22,
          }}
        >
          Chrome Extension · Manifest V3
        </div>
        <h1
          style={{
            fontSize: 'clamp(2.4rem, 1rem + 6vw, 4.6rem)',
            lineHeight: 1.02,
            letterSpacing: '-0.035em',
            fontWeight: 800,
            margin: '0 0 20px',
          }}
        >
          Read code before
          <br />
          you <span style={{ color: COLORS.cyan }}>trust it.</span>
        </h1>
        <p style={{ fontSize: 'clamp(1rem, 0.9rem + 0.6vw, 1.3rem)', color: COLORS.sub, maxWidth: '58ch', margin: '0 auto 32px' }}>
          One click turns any GitHub, GitLab, npm, or PyPI page into a plain-English briefing — what it is,
          whether it&apos;s a good fit, and how it&apos;s actually built. Not the README&apos;s marketing. The real shape of the thing.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/docs"
            style={{
              background: COLORS.cyan,
              color: '#04202f',
              fontWeight: 700,
              fontSize: 15,
              padding: '13px 22px',
              borderRadius: 11,
              textDecoration: 'none',
            }}
          >
            Read the docs →
          </Link>
          <a
            href="https://github.com/New1Direction/repolens"
            style={{
              background: 'transparent',
              color: COLORS.sub,
              fontWeight: 600,
              fontSize: 15,
              padding: '13px 22px',
              borderRadius: 11,
              border: `1px solid ${COLORS.border2}`,
              textDecoration: 'none',
            }}
          >
            GitHub
          </a>
        </div>
      </section>

      <section
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: '24px 24px 110px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {FEATURES.map((f) => (
          <div
            key={f.title}
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 14,
              padding: '20px 19px',
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 12 }}>{f.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 7 }}>{f.title}</div>
            <div style={{ fontSize: 13.5, color: COLORS.sub, lineHeight: 1.5 }}>{f.body}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
