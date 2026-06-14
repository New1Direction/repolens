import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // next/core-web-vitals bundles the React, react-hooks, and jsx-a11y plugins;
  // next/typescript adds the typescript-eslint recommended rules.
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Generated / build output — never our code to lint.
    ignores: [
      '.next/**',
      'out/**',
      '.source/**',
      'node_modules/**',
      'next-env.d.ts',
    ],
  },
];

export default eslintConfig;
