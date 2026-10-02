// Lint for real mistakes and leftovers (undefined names, unreachable code, unused variables and
// imports), not style. Run with `npm run lint`; it should report nothing.
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'blender/', 'assets/'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-else-if': 'error',
      'no-self-assign': 'error',
      'no-redeclare': 'error',
      'no-duplicate-imports': 'error',
      'no-cond-assign': 'error',
      'no-fallthrough': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-unsafe-negation': 'error',
      'no-loss-of-precision': 'error',
    },
  },
  // Browser checks run code in the page, where the dev build exposes the game as __quarry (and
  // some checks leave their own probes on window). They're throwaway scripts that share
  // copy-pasted helpers, so unused ones are fine there.
  {
    files: ['docs/handover/**'],
    languageOptions: { globals: { __quarry: 'readonly', hudProof: 'writable' } },
    rules: { 'no-unused-vars': 'off' },
  },
];
