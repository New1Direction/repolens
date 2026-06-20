import { Icon, type IconName } from '@/components/site/Icon';

type Feature = {
  icon: IconName;
  title: string;
  body: string;
  tags: string[];
  span: 'wide' | 'tall' | 'normal';
};

const FEATURES: Feature[] = [
  {
    icon: 'verdict',
    title: 'Scan the dependency page',
    body: 'Open a GitHub, GitLab, npm, or PyPI page and get a verdict-first briefing: fit, risk, maintenance, license, and the bottom line.',
    tags: ['scan', 'verdict', 'risk'],
    span: 'wide',
  },
  {
    icon: 'layers',
    title: 'Read the evidence',
    body: 'Deep Dive explains the actual shape of the project — files, dependency graph, tests, lineage, and plain-English reasoning.',
    tags: ['evidence', 'deep dive'],
    span: 'wide',
  },
  {
    icon: 'rows',
    title: 'Triage the shortlist',
    body: 'Every scan lands in a sortable library with boards, evaluations, drift alerts, and keyboard-first decisions.',
    tags: ['library', 'boards'],
    span: 'normal',
  },
  {
    icon: 'bars',
    title: 'Compare alternatives',
    body: 'Put candidates side-by-side, search GitHub for peers, and export the reasoning to CSV or Markdown.',
    tags: ['compare', 'export'],
    span: 'normal',
  },
  {
    icon: 'sliders',
    title: 'Keep it local/private',
    body: 'Bring your own keys, route scans across 20+ providers, or run local Ollama. No server account required.',
    tags: ['local', 'byo keys'],
    span: 'normal',
  },
];

export function FeatureBento() {
  return (
    <section className="section feature-section reveal" aria-labelledby="features-heading">
      <div className="container">
        <span className="eyebrow">The case file</span>
        <h2 id="features-heading" className="section-title">
          The dependency decision workflow.
        </h2>
        <p className="section-note">
          Fewer moving parts up front: scan a package, read the evidence, compare alternatives,
          and keep the whole evaluation local/private.
        </p>

        <div className="bento">
          {FEATURES.map((f) => (
            <article key={f.title} className={`feat feat-${f.span}`}>
              <div className="feat-ic" aria-hidden="true">
                <Icon name={f.icon} size={26} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className="feat-tags">
                {f.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
