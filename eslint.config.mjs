import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Bridge for legacy `.eslintrc.json` rule overrides (enterprise standards)
const compat = new FlatCompat({ baseDirectory: __dirname })

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  ...compat.config({
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      // Hydration from localStorage is intentional for the POC auth/shell providers
      'react-hooks/set-state-in-effect': 'off',
      'react/no-unescaped-entities': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  }),
  {
    files: ['prisma/seed.ts', 'scripts/migrate-legacy-data.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'scripts/generate-atlas-schema.js',
    ],
  },
]

export default eslintConfig
