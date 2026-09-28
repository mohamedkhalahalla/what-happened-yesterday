import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Names of `Date` accessors that read or write the *browser-local* time zone.
 * Every date in this app is Asia/Riyadh (fixed UTC+3), so these are banned in
 * src/ and the equivalent UTC-based helpers in src/lib/time/riyadh.ts are used
 * instead. riyadh.ts itself is the single place allowed to touch `Date`, and it
 * only uses `Date.UTC` / `getUTC*`, which are not on this list.
 */
const LOCAL_DATE_ACCESSORS = [
  'getHours',
  'getDay',
  'getDate',
  'getMonth',
  'getFullYear',
  'setHours',
]

const LOCAL_DATE_MESSAGE =
  'Use src/lib/time/riyadh.ts — dates must be Asia/Riyadh, not browser-local.'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Guardrail: no browser-local date access anywhere under src/.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...LOCAL_DATE_ACCESSORS.map((property) => ({
          property,
          message: LOCAL_DATE_MESSAGE,
        })),
      ],
      // `no-restricted-properties` only sees static member access, so also
      // catch `d['getHours']()`, `toLocaleDateString()` without a timeZone,
      // and bare identifier references such as `const f = d.getDay`.
      'no-restricted-syntax': [
        'error',
        ...LOCAL_DATE_ACCESSORS.map((property) => ({
          selector: `MemberExpression[computed=true] > Literal[value=${JSON.stringify(property)}]`,
          message: LOCAL_DATE_MESSAGE,
        })),
        {
          selector:
            'CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][arguments.length<2]',
          message: LOCAL_DATE_MESSAGE,
        },
      ],
    },
  },
  prettier,
)
