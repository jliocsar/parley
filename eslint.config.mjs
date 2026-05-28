import effectPlugin from '@effect/eslint-plugin'
import disableConflictRules from '@effect/eslint-plugin/configs/disable-conflict-rules'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

const barrelPackages = [
  'effect',
  '@effect/cli',
  '@effect/experimental',
  '@effect/opentelemetry',
  '@effect/platform',
  '@effect/platform-bun',
]

const dprintConfig = {
  lineWidth: 100,
  indentWidth: 2,
  useTabs: false,
  semiColons: 'asi',
  quoteStyle: 'alwaysSingle',
  jsx: { quoteStyle: 'preferDouble' },
  trailingCommas: 'onlyMultiLine',
  arrowFunction: { useParentheses: 'force' },
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      'tmp/**',
      '**/*.d.ts',
      'scripts/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', 'tmp/*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...disableConflictRules,
  {
    plugins: { '@effect': effectPlugin },
    rules: {
      '@effect/dprint': ['error', { config: dprintConfig }],
      '@effect/no-import-from-barrel-package': ['error', { packageNames: barrelPackages }],

      curly: ['error', 'all'],
      'no-nested-ternary': 'error',
      'prefer-template': 'error',
      complexity: ['error', 15],
      // 200 instead of 70: Effect.fn passes a generator with a linear chain of
      // `yield* x` steps as the function body. The "split into smaller helpers"
      // intent of this rule doesn't translate — each step is already its own
      // composable Effect. 200 still catches genuinely large bodies.
      'max-lines-per-function': [
        'error',
        { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      // Effect.fn wraps a generator function; the body may have zero `yield*`
      // when wrapping pure sync logic via Effect.sync. Rule misfires.
      'require-yield': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],

      '@typescript-eslint/array-type': ['error', { default: 'array', readonly: 'array' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
    },
  },
  {
    files: ['eslint.config.mjs', 'tmp/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      '@typescript-eslint/no-deprecated': 'off',
    },
  },
)
