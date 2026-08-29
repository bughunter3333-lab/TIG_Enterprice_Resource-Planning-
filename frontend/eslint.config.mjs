/**
 * Deliberately narrow.
 *
 * The rules here are the ones that catch bugs the rest of the toolchain
 * misses. `npm run build` does not resolve identifiers — esbuild happily emits
 * a reference to a name that was never imported — and no test imports
 * TotalImageERP.jsx deeply enough to evaluate its render paths. That gap is not
 * theoretical: a change shipped in this repo calling two functions that did not
 * exist, and the build passed.
 *
 * What is NOT turned on matters as much. There is no stylistic layer, no
 * import-order rule, no design-system plugin. The app carries ~1,990 raw colour
 * utilities and a 9,800-line component; a config that flagged all of that would
 * emit hundreds of warnings nobody can clear in one sitting, and the only thing
 * that teaches is to ignore lint output. Formatting is Prettier's job and is
 * kept out of here entirely.
 *
 * Rules earn their place by having caught something real. Add one when it does.
 */
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'playwright-report/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Compile-time constant substituted by Vite (see vite.config.js `define`).
        __BUILD_ID__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The rule this config exists for.
      'no-undef': 'error',

      // Hook order bugs are silent and produce wrong state rather than an
      // error, which makes them expensive to find by hand.
      'react-hooks/rules-of-hooks': 'error',

      // Real, but noisy on a codebase this size and often a deliberate choice.
      // Warn so it informs without blocking.
      'react-hooks/exhaustive-deps': 'warn',

      // Catches the orphans a refactor leaves behind — the import that is no
      // longer used once a block moves to its own module. Useful precisely
      // because the monolith is being carved up. Args are excluded: unused
      // callback parameters are normal in React.
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],

      // `catch {}` on a real failure is how a bug becomes invisible.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    // Test files run under vitest globals and may legitimately hold unused
    // scaffolding while a test is being written.
    files: ['**/__tests__/**', '**/*.test.{js,jsx}', 'src/test/**', 'src/test-setup.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['*.config.{js,mjs,cjs}', 'vite.config.js', 'playwright.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
