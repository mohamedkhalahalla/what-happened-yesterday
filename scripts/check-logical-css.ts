/**
 * Fails the build on physical left/right CSS.
 *
 * This dashboard is Arabic-first and must mirror completely when the language
 * flips. `ml-4` is a promise that the gap is on the left in every language;
 * `ms-4` is a promise that it is on the *start* side, which is what layout
 * actually means. Physical directions are the single most common way an RTL
 * layout half-mirrors and looks broken.
 *
 * ESLint does not see Tailwind class strings or inline style keys, so this is
 * a separate scanner. Run via `npm run lint:css`, which `npm run lint` chains.
 *
 * SVG chart code may opt out per line with a trailing
 * `// logical-css-ignore: <reason>` — charts mirror by flipping their own
 * scale direction, not by CSS, so a physical x/left there is often correct.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SCAN_DIR = join(ROOT, 'src')
const EXTENSIONS = ['.ts', '.tsx', '.css']

const IGNORE_MARKER = 'logical-css-ignore:'

type Rule = {
  /** Matches the offending token. */
  pattern: RegExp
  /** What to write instead. */
  replacement: string
}

/**
 * Tailwind utilities with a physical direction, and their logical twins.
 *
 * Each pattern requires a class boundary before the token (start of string,
 * whitespace, quote, backtick or `:` from a variant like `hover:`) so that
 * `overflow-x-auto` and `border-r` inside a word are not confused, and an
 * optional leading `-` for negative utilities.
 */
const CLASS_RULES: Rule[] = [
  { pattern: /(?<=^|[\s"'`:(])-?ml-/g, replacement: 'ms-' },
  { pattern: /(?<=^|[\s"'`:(])-?mr-/g, replacement: 'me-' },
  { pattern: /(?<=^|[\s"'`:(])-?pl-/g, replacement: 'ps-' },
  { pattern: /(?<=^|[\s"'`:(])-?pr-/g, replacement: 'pe-' },
  { pattern: /(?<=^|[\s"'`:(])-?left-/g, replacement: 'start-' },
  { pattern: /(?<=^|[\s"'`:(])-?right-/g, replacement: 'end-' },
  { pattern: /(?<=^|[\s"'`:(])text-left\b/g, replacement: 'text-start' },
  { pattern: /(?<=^|[\s"'`:(])text-right\b/g, replacement: 'text-end' },
  { pattern: /(?<=^|[\s"'`:(])border-l\b/g, replacement: 'border-s' },
  { pattern: /(?<=^|[\s"'`:(])border-r\b/g, replacement: 'border-e' },
  { pattern: /(?<=^|[\s"'`:(])border-l-/g, replacement: 'border-s-' },
  { pattern: /(?<=^|[\s"'`:(])border-r-/g, replacement: 'border-e-' },
  { pattern: /(?<=^|[\s"'`:(])rounded-l\b/g, replacement: 'rounded-s' },
  { pattern: /(?<=^|[\s"'`:(])rounded-r\b/g, replacement: 'rounded-e' },
  { pattern: /(?<=^|[\s"'`:(])rounded-l-/g, replacement: 'rounded-s-' },
  { pattern: /(?<=^|[\s"'`:(])rounded-r-/g, replacement: 'rounded-e-' },
  { pattern: /(?<=^|[\s"'`:(])rounded-tl\b/g, replacement: 'rounded-ss' },
  { pattern: /(?<=^|[\s"'`:(])rounded-tr\b/g, replacement: 'rounded-se' },
  { pattern: /(?<=^|[\s"'`:(])rounded-bl\b/g, replacement: 'rounded-es' },
  { pattern: /(?<=^|[\s"'`:(])rounded-br\b/g, replacement: 'rounded-ee' },
  { pattern: /(?<=^|[\s"'`:(])rounded-tl-/g, replacement: 'rounded-ss-' },
  { pattern: /(?<=^|[\s"'`:(])rounded-tr-/g, replacement: 'rounded-se-' },
  { pattern: /(?<=^|[\s"'`:(])rounded-bl-/g, replacement: 'rounded-es-' },
  { pattern: /(?<=^|[\s"'`:(])rounded-br-/g, replacement: 'rounded-ee-' },
  { pattern: /(?<=^|[\s"'`:(])float-left\b/g, replacement: 'float-start' },
  { pattern: /(?<=^|[\s"'`:(])float-right\b/g, replacement: 'float-end' },
  { pattern: /(?<=^|[\s"'`:(])scroll-ml-/g, replacement: 'scroll-ms-' },
  { pattern: /(?<=^|[\s"'`:(])scroll-mr-/g, replacement: 'scroll-me-' },
  { pattern: /(?<=^|[\s"'`:(])scroll-pl-/g, replacement: 'scroll-ps-' },
  { pattern: /(?<=^|[\s"'`:(])scroll-pr-/g, replacement: 'scroll-pe-' },
]

/** Inline `style={{ … }}` keys with a physical direction. */
const STYLE_RULES: Rule[] = [
  { pattern: /\bmarginLeft\s*:/g, replacement: 'marginInlineStart' },
  { pattern: /\bmarginRight\s*:/g, replacement: 'marginInlineEnd' },
  { pattern: /\bpaddingLeft\s*:/g, replacement: 'paddingInlineStart' },
  { pattern: /\bpaddingRight\s*:/g, replacement: 'paddingInlineEnd' },
  { pattern: /\bleft\s*:/g, replacement: 'insetInlineStart' },
  { pattern: /\bright\s*:/g, replacement: 'insetInlineEnd' },
]

type Finding = {
  file: string
  line: number
  found: string
  replacement: string
}

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) files.push(full)
  }
  return files
}

/**
 * Blank out comments before scanning.
 *
 * Prose legitimately says "right-to-left", and a doc comment explaining why a
 * chart keeps a physical x is not itself a violation. Replacing comment bodies
 * with spaces rather than deleting them keeps column numbers honest.
 */
function stripComments(lines: readonly string[]): string[] {
  let inBlock = false

  return lines.map((line) => {
    let out = ''
    let i = 0

    while (i < line.length) {
      if (inBlock) {
        if (line.startsWith('*/', i)) {
          inBlock = false
          out += '  '
          i += 2
        } else {
          out += ' '
          i += 1
        }
        continue
      }
      if (line.startsWith('/*', i)) {
        inBlock = true
        out += '  '
        i += 2
        continue
      }
      // Line comment: blank the rest of the line. `://` inside a URL is not
      // preceded by whitespace or a line start, so it survives.
      if (line.startsWith('//', i) && (i === 0 || !/[:\w]/.test(line[i - 1] ?? ''))) {
        out += ' '.repeat(line.length - i)
        break
      }
      out += line[i]
      i += 1
    }
    return out
  })
}

function scanFile(file: string): Finding[] {
  const findings: Finding[] = []
  const rawLines = readFileSync(file, 'utf8').split('\n')
  const lines = stripComments(rawLines)

  lines.forEach((line, index) => {
    // Opt-out for SVG chart code that mirrors via its own scale direction.
    // Honoured on the offending line itself or the line immediately above, so
    // it works both as a trailing comment and as a standalone one. Read from
    // the raw lines, since the marker lives inside a comment.
    const onThisLine = (rawLines[index] ?? '').includes(IGNORE_MARKER)
    const onLineAbove = (rawLines[index - 1] ?? '').includes(IGNORE_MARKER)
    if (onThisLine || onLineAbove) return

    for (const { pattern, replacement } of [...CLASS_RULES, ...STYLE_RULES]) {
      // Patterns are global; reset so state does not leak between lines.
      pattern.lastIndex = 0
      const match = pattern.exec(line)
      if (match === null) continue

      findings.push({
        file: relative(ROOT, file).split(sep).join('/'),
        line: index + 1,
        found: match[0],
        replacement,
      })
    }
  })

  return findings
}

function main(): void {
  const findings = walk(SCAN_DIR).flatMap(scanFile)

  if (findings.length === 0) {
    process.stdout.write('logical-css: no physical direction properties found\n')
    return
  }

  process.stderr.write(
    `\nlogical-css: ${findings.length} physical direction${findings.length === 1 ? '' : 's'} found.\n` +
      'This layout must mirror in Arabic — use logical properties.\n\n',
  )
  for (const { file, line, found, replacement } of findings) {
    process.stderr.write(`  ${file}:${line}  ${found.trim()}  ->  ${replacement}\n`)
  }
  process.stderr.write(
    `\nSVG chart code may opt out per line with  // ${IGNORE_MARKER} <reason>\n\n`,
  )
  process.exitCode = 1
}

main()
