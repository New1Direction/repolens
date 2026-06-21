import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cover the pure source modules; DOM/service-worker entry points and the
      // website are out of scope for unit coverage.
      include: ['src/**/*.js'],
      exclude: [
        'tests/**',
        'website/**',
        '*.config.js',
        'src/background.js',
        'src/content_script.js',
        'src/output-tab.js',
        'src/options.js',
        'src/library.js',
      ],
    },
  },
});
