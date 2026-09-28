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

const FORMATTING_MESSAGE = 'Format through src/lib/format.ts (explicit locale + Asia/Riyadh)'

/**
 * Formatting that silently adopts the host's locale and time zone. Banned
 * everywhere except `src/lib/format.ts`, which pins both explicitly.
 *
 * `toLocaleString` is included with no argument-count escape hatch: passing a
 * locale still leaves the time zone to the host, and the number cases have no
 * time zone to get wrong but do have digits — `toLocaleString()` in an Arabic
 * locale yields ٤٢ rather than the Western digits this app uses throughout.
 */
const FORMATTING_VIOLATIONS = [
  {
    selector: 'CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]',
    message: FORMATTING_MESSAGE,
  },
  {
    selector: 'MemberExpression[computed=true] > Literal[value=/^toLocale(Date|Time)?String$/]',
    message: FORMATTING_MESSAGE,
  },
  {
    selector: 'NewExpression[callee.object.name="Intl"]',
    message: FORMATTING_MESSAGE,
  },
  {
    selector: 'MemberExpression[object.name="Intl"]',
    message: FORMATTING_MESSAGE,
  },
]

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
    // Guardrail: no browser-local date access in any of our own code.
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...LOCAL_DATE_ACCESSORS.map((property) => ({
          property,
          message: LOCAL_DATE_MESSAGE,
        })),
      ],
      // `no-restricted-properties` only sees static member access, so also
      // catch `d['getHours']()` and bare identifier references such as
      // `const f = d.getDay`.
      'no-restricted-syntax': [
        'error',
        ...LOCAL_DATE_ACCESSORS.map((property) => ({
          selector: `MemberExpression[computed=true] > Literal[value=${JSON.stringify(property)}]`,
          message: LOCAL_DATE_MESSAGE,
        })),
        // Unlocalized formatting. `toLocaleString()` and friends take the
        // host's locale *and* time zone, which is two wrong answers at once;
        // a bare `new Intl.*` is the same mistake spelled out. Both are
        // allowed only in format.ts, which is configured below.
        ...FORMATTING_VIOLATIONS,
      ],
    },
  },
  {
    // Two exemptions from the formatting ban, both deliberate and named
    // individually rather than by a blanket "tests may do anything":
    //
    // - format.ts is the one module that may construct formatters. It is where
    //   the explicit locale and Asia/Riyadh time zone are applied.
    // - riyadh.test.ts cross-checks our own integer date maths against Intl's
    //   tz database (with an explicit timeZone). Verifying the thing the rule
    //   protects requires reaching past the rule.
    //
    // Adding a file here should feel like a decision, which is the point.
    files: ['src/lib/format.ts', 'src/lib/time/riyadh.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...LOCAL_DATE_ACCESSORS.map((property) => ({
          selector: `MemberExpression[computed=true] > Literal[value=${JSON.stringify(property)}]`,
          message: LOCAL_DATE_MESSAGE,
        })),
      ],
    },
  },
  {
    // `src/engine/reference.ts` is the slow oracle the engine is tested
    // against. It is ~100x slower than the real thing, so it must never be
    // reachable from shipped code — only from tests.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/engine/reference', './reference', '../engine/reference'],
              message:
                'reference.ts is the test-only oracle for the engine — import src/engine/aggregate.ts instead.',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
