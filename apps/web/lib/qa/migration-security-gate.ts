/**
 * lib/qa/migration-security-gate.ts — Phase 9AA: the migration security DIFF gate.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Closure audit #5 proved that CI passed migrations which DISABLE row level
 * security, add a permissive anon policy, or grant client roles onto server-only
 * tables. The one migration-aware suite in the gate asked "does an ENABLE exist
 * anywhere in the corpus?" — which an earlier migration had always already
 * satisfied. Phase 9AB then showed the class is wider still: a policy can have RLS
 * on, mention auth.uid(), and still hand anon every row through an OR branch that
 * does not depend on the caller. And a VIEW runs as its owner, so base-table RLS
 * never applies through it.
 *
 * ── HOW IT DECIDES ─────────────────────────────────────────────────────────
 * No database. Every migration in BOTH roots is lexed, split into statements
 * (static SQL inside DO blocks and EXECUTE literals included, never stripped),
 * parsed, and replayed in canonical order over a model seeded from the bootstrap
 * schema and Supabase's default privileges. Each migration is judged on its OWN
 * delta against the state it inherits — so `ENABLE` in an old file cannot excuse
 * `DISABLE` in a new one, and a grant that already existed is not blamed on a
 * file that did not add it.
 *
 * Every finding carries one of five categories:
 *   WEAKENING   — blocking: widens what anon/authenticated can reach
 *   UNKNOWN     — blocking: the gate cannot tell, so it fails closed
 *   HARDENING   — narrows access (ENABLE RLS, REVOKE, dropping an unsafe policy)
 *   LOCKOUT     — availability change, not escalation (dropping an owner policy)
 *   CONTEXTUAL  — recognised and allowed by the object's class, or recorded only
 * A blocking finding passes only with an exact reviewed allowlist entry
 * (tests/isolation/migration-security-allowlist.json): migration, object, policy,
 * rule and statement fingerprint, no wildcards.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ─── Roots ──────────────────────────────────────────────────────────────────

export type Root = 'repo-root' | 'apps/web'

/** BOTH canonical migration roots. Removing either one must fail the gate's self-test. */
export const MIGRATION_ROOTS: ReadonlyArray<{ root: Root; dir: string }> = [
  { root: 'repo-root', dir: 'supabase/migrations' },
  { root: 'apps/web', dir: 'apps/web/supabase/migrations' },
]
export const BOOTSTRAP_FILE = 'packages/db/full_schema_run_in_supabase.sql'
export const REGISTRY_FILE = 'apps/web/tests/isolation/schema-security.json'
export const ALLOWLIST_FILE = 'apps/web/tests/isolation/migration-security-allowlist.json'

export interface MigrationFile { root: Root; name: string; relPath: string; version: string; sql: string }

/** The repo root, located by its two migration roots rather than assumed from cwd. */
export function findRepoRoot(from = process.cwd()): string {
  let dir = resolve(from)
  for (let i = 0; i < 6; i++) {
    if (MIGRATION_ROOTS.every(r => existsSync(join(dir, r.dir)))) return dir
    dir = resolve(dir, '..')
  }
  throw new Error(`migration-security-gate: no directory above ${from} holds both migration roots`)
}

/** Every migration in both roots, canonically ordered. A missing or empty root throws. */
export function discoverMigrations(repoRoot = findRepoRoot()): MigrationFile[] {
  const out: MigrationFile[] = []
  for (const r of MIGRATION_ROOTS) {
    const dir = join(repoRoot, r.dir)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new Error(`migration-security-gate: root ${r.dir} is missing — refusing to judge a partial corpus`)
    }
    const names = readdirSync(dir).filter(n => n.endsWith('.sql')).sort()
    if (names.length === 0) throw new Error(`migration-security-gate: root ${r.dir} holds no migrations`)
    for (const name of names) {
      const v = /^(\d+)/.exec(name)
      if (!v) throw new Error(`migration-security-gate: ${r.dir}/${name} has no version prefix`)
      out.push({ root: r.root, name, relPath: `${r.dir}/${name}`, version: v[1], sql: readFileSync(join(dir, name), 'utf8') })
    }
  }
  return canonicalOrder(out)
}

/** Version, then apps/web before repo-root, then name — the order the Phase 9Z rebuild uses. */
export function canonicalOrder(files: MigrationFile[]): MigrationFile[] {
  const rank = (r: Root) => (r === 'apps/web' ? 0 : 1)
  return [...files].sort((a, b) =>
    a.version < b.version ? -1 : a.version > b.version ? 1
      : rank(a.root) - rank(b.root) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

// ─── Lexer ──────────────────────────────────────────────────────────────────

export type TokKind =
  | 'ident' | 'qident' | 'string' | 'dollar' | 'number' | 'op'
  | 'lparen' | 'rparen' | 'lbracket' | 'rbracket' | 'comma' | 'semi' | 'dot' | 'colon2'
export interface Tok { kind: TokKind; text: string; value: string; pos: number }

export class SqlLexError extends Error {
  constructor(message: string, readonly pos: number) { super(`${message} at offset ${pos}`) }
}

// Postgres identifiers may contain any non-ASCII letter; built at runtime so this
// source stays plain ASCII.
const HIGH = `${String.fromCharCode(0x80)}-${String.fromCharCode(0xffff)}`
const IDENT_START = new RegExp(`[A-Za-z_${HIGH}]`)
const IDENT_PART = new RegExp(`[A-Za-z0-9_$${HIGH}]`)

/**
 * A PostgreSQL lexer: line and NESTED block comments, '…' with '' escapes, E'…'
 * with backslash escapes, U&'…', B'…', X'…', N'…', $tag$…$tag$ bodies, "quoted"
 * identifiers (case preserved) and unquoted identifiers (folded to lower case).
 * Comment markers inside strings or bodies are not comments.
 */
export function lex(sql: string): Tok[] {
  const toks: Tok[] = []
  const n = sql.length
  let i = 0
  const push = (kind: TokKind, text: string, value: string, pos: number) => { toks.push({ kind, text, value, pos }) }
  const dollarRe = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y
  const paramRe = /\$\d+/y
  const numRe = /(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/y
  const opRe = /[+\-*/<>=~!@#%^&|`?]+/y
  while (i < n) {
    const c = sql[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { i++; continue }
    if (c === '-' && sql[i + 1] === '-') { const e = sql.indexOf('\n', i); i = e === -1 ? n : e + 1; continue }
    if (c === '/' && sql[i + 1] === '*') {
      let depth = 1
      let k = i + 2
      while (k < n && depth > 0) {
        if (sql[k] === '/' && sql[k + 1] === '*') { depth++; k += 2 }
        else if (sql[k] === '*' && sql[k + 1] === '/') { depth--; k += 2 }
        else k++
      }
      if (depth > 0) throw new SqlLexError('unterminated block comment', i)
      i = k
      continue
    }
    if (c === '$') {
      dollarRe.lastIndex = i
      const m = dollarRe.exec(sql)
      if (m) {
        const tag = m[0]
        const end = sql.indexOf(tag, i + tag.length)
        if (end === -1) throw new SqlLexError('unterminated dollar-quoted string', i)
        push('dollar', sql.slice(i, end + tag.length), sql.slice(i + tag.length, end), i)
        i = end + tag.length
        continue
      }
      paramRe.lastIndex = i
      const p = paramRe.exec(sql)
      if (p) { push('ident', p[0], p[0], i); i += p[0].length; continue }
    }
    const prev = i > 0 ? sql[i - 1] : ' '
    const prefixed = /[EeBbXxNn]/.test(c) && sql[i + 1] === "'" && !IDENT_PART.test(prev)
    const unicode = (c === 'U' || c === 'u') && sql[i + 1] === '&' && sql[i + 2] === "'" && !IDENT_PART.test(prev)
    if (c === "'" || prefixed || unicode) {
      const escapes = c === 'E' || c === 'e'
      let k = (c === "'" ? i : unicode ? i + 2 : i + 1) + 1
      let val = ''
      for (;;) {
        if (k >= n) throw new SqlLexError('unterminated string literal', i)
        const ch = sql[k]
        if (escapes && ch === '\\') { val += sql[k + 1] ?? ''; k += 2; continue }
        if (ch === "'") {
          if (sql[k + 1] === "'") { val += "'"; k += 2; continue }
          k++
          break
        }
        val += ch
        k++
      }
      push('string', sql.slice(i, k), val, i)
      i = k
      continue
    }
    if (c === '"') {
      let k = i + 1
      let val = ''
      for (;;) {
        if (k >= n) throw new SqlLexError('unterminated quoted identifier', i)
        if (sql[k] === '"') {
          if (sql[k + 1] === '"') { val += '"'; k += 2; continue }
          k++
          break
        }
        val += sql[k]
        k++
      }
      push('qident', sql.slice(i, k), val, i)
      i = k
      continue
    }
    if (IDENT_START.test(c)) {
      let k = i + 1
      while (k < n && IDENT_PART.test(sql[k])) k++
      const t = sql.slice(i, k)
      push('ident', t, t.toLowerCase(), i)
      i = k
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      numRe.lastIndex = i
      const m = numRe.exec(sql)
      const t = m ? m[0] : c
      push('number', t, t, i)
      i += t.length
      continue
    }
    if (c === '(') { push('lparen', c, c, i); i++; continue }
    if (c === ')') { push('rparen', c, c, i); i++; continue }
    if (c === '[') { push('lbracket', c, c, i); i++; continue }
    if (c === ']') { push('rbracket', c, c, i); i++; continue }
    if (c === ',') { push('comma', c, c, i); i++; continue }
    if (c === ';') { push('semi', c, c, i); i++; continue }
    if (c === ':' && sql[i + 1] === ':') { push('colon2', '::', '::', i); i += 2; continue }
    if (c === ':' && sql[i + 1] === '=') { push('op', ':=', ':=', i); i += 2; continue }
    if (c === ':') { push('op', ':', ':', i); i++; continue }
    if (c === '.') { push('dot', c, c, i); i++; continue }
    opRe.lastIndex = i
    const m = opRe.exec(sql)
    if (m) {
      let op = m[0]
      for (const stop of ['--', '/*']) { const x = op.indexOf(stop); if (x > 0) op = op.slice(0, x) }
      push('op', op, op, i)
      i += op.length
      continue
    }
    throw new SqlLexError(`unexpected character ${JSON.stringify(c)}`, i)
  }
  return toks
}

/** Top-level statements. Bodies and strings are single tokens, so a `;` inside one never splits. */
export function splitStatements(toks: Tok[]): Tok[][] {
  const out: Tok[][] = []
  let cur: Tok[] = []
  for (const t of toks) {
    if (t.kind === 'semi') { if (cur.length) out.push(cur); cur = [] }
    else cur.push(t)
  }
  if (cur.length) out.push(cur)
  return out
}

/** Stable, whitespace- and comment-insensitive statement text. */
export function normalize(toks: Tok[]): string {
  return toks.map(t => {
    switch (t.kind) {
      case 'ident': return t.value
      case 'qident': return `"${t.value.replace(/"/g, '""')}"`
      case 'string': return `'${t.value.replace(/'/g, "''")}'`
      case 'dollar': return `$$${t.value.replace(/\s+/g, ' ').trim()}$$`
      default: return t.text
    }
  }).join(' ')
}
export const fingerprint = (toks: Tok[]) => createHash('sha256').update(normalize(toks)).digest('hex').slice(0, 16)

// ─── Token helpers ──────────────────────────────────────────────────────────

const isWord = (t: Tok | undefined, ...words: string[]): boolean => !!t && t.kind === 'ident' && words.includes(t.value)
const isName = (t: Tok | undefined): boolean => !!t && (t.kind === 'ident' || t.kind === 'qident')
/** Placeholder for identifiers a DO block builds at run time (format %I, concatenation). */
export const DYNAMIC = '__dynamic__'

class Cursor {
  i = 0
  constructor(readonly toks: Tok[]) {}
  peek(o = 0): Tok | undefined { return this.toks[this.i + o] }
  next(): Tok | undefined { return this.toks[this.i++] }
  done(): boolean { return this.i >= this.toks.length }
  eat(...words: string[]): boolean { if (isWord(this.peek(), ...words)) { this.i++; return true } return false }
  eatSeq(...words: string[]): boolean {
    for (let k = 0; k < words.length; k++) if (!isWord(this.peek(k), words[k])) return false
    this.i += words.length
    return true
  }
  /** The tokens of a parenthesised group starting at the cursor, without the parens. */
  group(): Tok[] | null {
    if (this.peek()?.kind !== 'lparen') return null
    let depth = 0
    const start = this.i
    for (let k = this.i; k < this.toks.length; k++) {
      const t = this.toks[k]
      if (t.kind === 'lparen') depth++
      else if (t.kind === 'rparen' && --depth === 0) { this.i = k + 1; return this.toks.slice(start + 1, k) }
    }
    return null
  }
}

export interface QName { schema: string | null; name: string }
export const qkey = (q: QName): string => `${q.schema ?? 'public'}.${q.name}`
export const isDynamic = (q: QName): boolean => q.name === DYNAMIC || q.schema === DYNAMIC

function parseName(c: Cursor): QName | null {
  const a = c.peek()
  if (!a || !isName(a)) return null
  c.next()
  const b = c.peek(1)
  if (c.peek()?.kind === 'dot' && b && isName(b)) {
    c.next()
    c.next()
    return { schema: a.value, name: b.value }
  }
  return { schema: null, name: a.value }
}

function parseNameList(c: Cursor): QName[] {
  const out: QName[] = []
  for (;;) {
    const q = parseName(c)
    if (!q) break
    out.push(q)
    if (c.peek()?.kind === 'lparen') c.group() // function argument list
    if (c.peek()?.kind !== 'comma') break
    c.next()
  }
  return out
}

function parseRoleList(c: Cursor): string[] {
  const out: string[] = []
  for (;;) {
    c.eat('group')
    const t = c.peek()
    if (!t || !isName(t)) break
    c.next()
    out.push(t.value)
    if (c.peek()?.kind !== 'comma') break
    c.next()
  }
  return out
}

// ─── Statements ─────────────────────────────────────────────────────────────

export type Cmd = 'all' | 'select' | 'insert' | 'update' | 'delete'
export type GrantTarget =
  | { type: 'relation'; objs: QName[] }
  | { type: 'all-tables'; schemas: string[] }
  | { type: 'schema'; schemas: string[] }
  | { type: 'function'; objs: QName[] }
  | { type: 'other' }

export type Op =
  | { k: 'create_table'; obj: QName; temp: boolean }
  | { k: 'alter_table_rls'; obj: QName; action: 'enable' | 'disable' | 'force' | 'no_force' }
  | { k: 'rename'; obj: QName; to: string }
  | { k: 'set_schema'; obj: QName; to: string }
  | { k: 'create_view'; obj: QName; orReplace: boolean; materialized: boolean; temp: boolean; invoker: boolean | null; refs: QName[] }
  | { k: 'alter_view_opts'; obj: QName; invoker: boolean | 'reset' }
  | { k: 'drop_relations'; objs: QName[] }
  | { k: 'create_policy'; name: string; table: QName; permissive: boolean; cmd: Cmd; roles: string[]; explicitRoles: boolean; using: Tok[] | null; check: Tok[] | null }
  | { k: 'alter_policy'; name: string; table: QName; renameTo?: string; roles?: string[]; using?: Tok[]; check?: Tok[] }
  | { k: 'drop_policy'; name: string; table: QName }
  | { k: 'grant' | 'revoke'; privs: string[]; target: GrantTarget; grantees: string[] }
  | { k: 'grant_role' | 'revoke_role'; grantees: string[] }
  | { k: 'default_privs'; action: 'grant' | 'revoke'; schemas: string[]; objtype: string; privs: string[]; grantees: string[] }
  | { k: 'function'; name: QName; securityDefiner: boolean; language: string; body: string | null }
  | { k: 'alter_function_security'; name: QName; definer: boolean }
  | { k: 'alter_role'; role: string }
  | { k: 'do_block'; body: string; language: string }
  | { k: 'unparsed'; reason: string }

const TABLE_PRIVS = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
const CLIENT_ROLES = ['anon', 'authenticated', 'public']
const isClientRole = (r: string): boolean => CLIENT_ROLES.includes(r)

/** Does this statement start like one the gate must understand? Used to fail closed on a parse miss. */
function looksSecuritySensitive(toks: Tok[]): boolean {
  const w = toks.slice(0, 6).map(t => (t.kind === 'ident' ? t.value : t.text)).join(' ')
  return /^(grant|revoke)\b/.test(w)
    || /^(create|alter|drop)\s+policy\b/.test(w)
    || /^alter\s+default\s+privileges\b/.test(w)
    || /^create\s+(or\s+replace\s+)?((temp|temporary|recursive)\s+)*(materialized\s+)?view\b/.test(w)
    || /^alter\s+(materialized\s+)?view\b/.test(w)
    || /^alter\s+role\b/.test(w)
    || (/^alter\s+table\b/.test(w) && toks.some(t => isWord(t, 'security')))
}

export function parseOp(toks: Tok[]): Op | null {
  if (toks.length === 0) return null
  try {
    const op = parseOpInner(new Cursor(toks))
    if (op === null && looksSecuritySensitive(toks)) return { k: 'unparsed', reason: 'recognised verb, unrecognised form' }
    return op
  } catch (e) {
    return looksSecuritySensitive(toks) ? { k: 'unparsed', reason: (e as Error).message } : null
  }
}

function parseOpInner(c: Cursor): Op | null {
  if (c.eat('do')) {
    let language = 'plpgsql'
    let body: string | null = null
    while (!c.done()) {
      const t = c.next()!
      if (isWord(t, 'language')) { const l = c.next(); if (l) language = l.value.toLowerCase(); continue }
      if (t.kind === 'dollar' || t.kind === 'string') body = t.value
    }
    return body === null ? { k: 'unparsed', reason: 'DO without a body' } : { k: 'do_block', body, language }
  }
  if (c.eat('create')) {
    const orReplace = c.eatSeq('or', 'replace')
    let temp = false
    for (;;) {
      if (c.eat('global', 'local', 'unlogged', 'recursive')) continue
      if (c.eat('temp', 'temporary')) { temp = true; continue }
      break
    }
    if (c.eat('table')) {
      c.eatSeq('if', 'not', 'exists')
      const obj = parseName(c)
      return obj ? { k: 'create_table', obj, temp } : { k: 'unparsed', reason: 'CREATE TABLE without a name' }
    }
    const materialized = c.eat('materialized')
    if (c.eat('view')) {
      c.eatSeq('if', 'not', 'exists')
      const obj = parseName(c)
      if (!obj) return { k: 'unparsed', reason: 'CREATE VIEW without a name' }
      if (c.peek()?.kind === 'lparen') c.group()
      if (c.eat('using')) c.next()
      let invoker: boolean | null = null
      if (c.eat('with')) { const opts = c.group(); if (opts) invoker = viewInvokerOption(opts) }
      if (c.eat('tablespace')) c.next()
      if (!c.eat('as')) return { k: 'unparsed', reason: 'CREATE VIEW without AS' }
      return { k: 'create_view', obj, orReplace, materialized, temp, invoker, refs: referencedRelations(c.toks.slice(c.i)) }
    }
    if (c.eat('policy')) {
      const name = c.next()
      if (!name || !(isName(name) || name.kind === 'string')) return { k: 'unparsed', reason: 'CREATE POLICY without a name' }
      if (!c.eat('on')) return { k: 'unparsed', reason: 'CREATE POLICY without ON' }
      const table = parseName(c)
      if (!table) return { k: 'unparsed', reason: 'CREATE POLICY without a table' }
      let permissive = true
      let cmd = 'all'
      let roles = ['public']
      let explicitRoles = false
      let using: Tok[] | null = null
      let check: Tok[] | null = null
      while (!c.done()) {
        if (c.eat('as')) { permissive = !isWord(c.next(), 'restrictive'); continue }
        if (c.eat('for')) { cmd = c.next()?.value ?? 'all'; continue }
        if (c.eat('to')) { roles = parseRoleList(c); explicitRoles = true; continue }
        if (c.eat('using')) { using = c.group(); if (!using) return { k: 'unparsed', reason: 'USING without parentheses' }; continue }
        if (c.eatSeq('with', 'check')) { check = c.group(); if (!check) return { k: 'unparsed', reason: 'WITH CHECK without parentheses' }; continue }
        return { k: 'unparsed', reason: `unexpected ${c.peek()!.text} in CREATE POLICY` }
      }
      if (!['all', 'select', 'insert', 'update', 'delete'].includes(cmd)) return { k: 'unparsed', reason: `unknown policy command ${cmd}` }
      if (roles.length === 0) return { k: 'unparsed', reason: 'TO without roles' }
      return { k: 'create_policy', name: name.value, table, permissive, cmd: cmd as Cmd, roles, explicitRoles, using, check }
    }
    if (c.eat('function', 'procedure')) {
      const name = parseName(c)
      if (!name) return { k: 'unparsed', reason: 'CREATE FUNCTION without a name' }
      let securityDefiner = false
      let language = 'sql'
      let body: string | null = null
      let expectBody = false
      while (!c.done()) {
        const t = c.next()!
        if (isWord(t, 'security')) { securityDefiner = isWord(c.next(), 'definer'); continue }
        if (isWord(t, 'language')) { const l = c.next(); if (l) language = l.value.toLowerCase(); continue }
        if (isWord(t, 'as')) { expectBody = true; continue }
        if (expectBody && (t.kind === 'dollar' || t.kind === 'string')) { body = t.value; expectBody = false }
      }
      return { k: 'function', name, securityDefiner, language, body }
    }
    return null
  }
  if (c.eat('alter')) {
    if (c.eat('table')) {
      c.eatSeq('if', 'exists')
      c.eat('only')
      const obj = parseName(c)
      if (!obj) return null
      if (c.peek()?.text === '*') c.next()
      const rest = c.toks.slice(c.i)
      const words = rest.map(t => (t.kind === 'ident' ? t.value : t.text)).join(' ')
      if (/\bno force row level security\b/.test(words)) return { k: 'alter_table_rls', obj, action: 'no_force' }
      if (/\bdisable row level security\b/.test(words)) return { k: 'alter_table_rls', obj, action: 'disable' }
      if (/\bforce row level security\b/.test(words)) return { k: 'alter_table_rls', obj, action: 'force' }
      if (/\benable row level security\b/.test(words)) return { k: 'alter_table_rls', obj, action: 'enable' }
      if (/^rename to \S+$/.test(words)) return { k: 'rename', obj, to: rest[2].value }
      if (/^set schema \S+$/.test(words)) return { k: 'set_schema', obj, to: rest[2].value }
      if (/\brow level security\b/.test(words)) return { k: 'unparsed', reason: 'unrecognised row level security action' }
      return null
    }
    c.eat('materialized')
    if (c.eat('view')) {
      c.eatSeq('if', 'exists')
      const obj = parseName(c)
      if (!obj) return { k: 'unparsed', reason: 'ALTER VIEW without a name' }
      if (c.eat('set')) {
        if (c.eat('schema')) return { k: 'set_schema', obj, to: c.next()?.value ?? '' }
        const opts = c.group()
        if (!opts) return { k: 'unparsed', reason: 'ALTER VIEW SET without options' }
        const v = viewInvokerOption(opts)
        return v === null ? null : { k: 'alter_view_opts', obj, invoker: v }
      }
      if (c.eat('reset')) {
        const opts = c.group() ?? []
        return opts.some(t => isWord(t, 'security_invoker')) ? { k: 'alter_view_opts', obj, invoker: 'reset' } : null
      }
      if (c.eatSeq('rename', 'to')) return { k: 'rename', obj, to: c.next()?.value ?? '' }
      return null
    }
    if (c.eat('policy')) {
      const name = c.next()
      if (!name || !c.eat('on')) return { k: 'unparsed', reason: 'ALTER POLICY without ON' }
      const table = parseName(c)
      if (!table) return { k: 'unparsed', reason: 'ALTER POLICY without a table' }
      if (c.eatSeq('rename', 'to')) return { k: 'alter_policy', name: name.value, table, renameTo: c.next()?.value }
      const op: Extract<Op, { k: 'alter_policy' }> = { k: 'alter_policy', name: name.value, table }
      while (!c.done()) {
        if (c.eat('to')) { op.roles = parseRoleList(c); continue }
        if (c.eat('using')) { op.using = c.group() ?? []; continue }
        if (c.eatSeq('with', 'check')) { op.check = c.group() ?? []; continue }
        return { k: 'unparsed', reason: `unexpected ${c.peek()!.text} in ALTER POLICY` }
      }
      return op
    }
    if (c.eatSeq('default', 'privileges')) {
      const schemas: string[] = []
      for (;;) {
        if (c.eat('for')) { c.eat('role', 'user'); parseRoleList(c); continue }
        if (c.eatSeq('in', 'schema')) { schemas.push(...parseRoleList(c)); continue }
        break
      }
      const action = c.next()
      if (!action || !isWord(action, 'grant', 'revoke')) return { k: 'unparsed', reason: 'ALTER DEFAULT PRIVILEGES without GRANT/REVOKE' }
      if (action.value === 'revoke') c.eatSeq('grant', 'option', 'for')
      const privs = parsePrivileges(c)
      if (!c.eat('on')) return { k: 'unparsed', reason: 'default privileges without ON' }
      const objtype = c.next()?.value ?? ''
      if (!c.eat(action.value === 'grant' ? 'to' : 'from')) return { k: 'unparsed', reason: 'default privileges without grantees' }
      return { k: 'default_privs', action: action.value as 'grant' | 'revoke', schemas, objtype, privs, grantees: parseRoleList(c) }
    }
    if (c.eat('function', 'procedure', 'routine')) {
      const name = parseName(c)
      if (!name) return null
      if (c.peek()?.kind === 'lparen') c.group()
      const rest = c.toks.slice(c.i).map(t => t.value).join(' ')
      if (/\bsecurity definer\b/.test(rest)) return { k: 'alter_function_security', name, definer: true }
      if (/\bsecurity invoker\b/.test(rest)) return { k: 'alter_function_security', name, definer: false }
      return null
    }
    if (c.eat('role', 'user')) {
      const r = c.next()
      return r ? { k: 'alter_role', role: r.value } : { k: 'unparsed', reason: 'ALTER ROLE without a role' }
    }
    return null
  }
  if (c.eat('drop')) {
    if (c.eat('policy')) {
      c.eatSeq('if', 'exists')
      const name = c.next()
      if (!name || !c.eat('on')) return { k: 'unparsed', reason: 'DROP POLICY without ON' }
      const table = parseName(c)
      return table ? { k: 'drop_policy', name: name.value, table } : { k: 'unparsed', reason: 'DROP POLICY without a table' }
    }
    c.eat('materialized')
    if (c.eat('table', 'view')) {
      c.eatSeq('if', 'exists')
      return { k: 'drop_relations', objs: parseNameList(c) }
    }
    return null
  }
  if (c.eat('grant', 'revoke')) {
    const verb = c.toks[c.i - 1].value as 'grant' | 'revoke'
    const toWord = verb === 'grant' ? 'to' : 'from'
    if (verb === 'revoke') c.eatSeq('grant', 'option', 'for')
    // Role membership: GRANT role TO role (no ON before TO/FROM).
    const onIdx = c.toks.findIndex((t, k) => k >= c.i && isWord(t, 'on'))
    const toIdx = c.toks.findIndex((t, k) => k >= c.i && isWord(t, toWord))
    if (onIdx === -1 || (toIdx !== -1 && toIdx < onIdx)) {
      if (toIdx === -1) return { k: 'unparsed', reason: 'role grant without grantees' }
      c.i = toIdx + 1
      return { k: verb === 'grant' ? 'grant_role' : 'revoke_role', grantees: parseRoleList(c) }
    }
    const privs = parsePrivileges(c)
    if (!c.eat('on')) return { k: 'unparsed', reason: `${verb} without ON` }
    let target: GrantTarget
    if (c.eat('all')) {
      const kind = c.next()?.value ?? ''
      if (!c.eatSeq('in', 'schema')) return { k: 'unparsed', reason: `${verb} ON ALL without IN SCHEMA` }
      const schemas = parseRoleList(c)
      target = kind === 'tables' ? { type: 'all-tables', schemas }
        : ['functions', 'procedures', 'routines'].includes(kind) ? { type: 'function', objs: schemas.map(s => ({ schema: s, name: '*' })) }
          : { type: 'other' }
    } else if (c.eat('schema')) {
      target = { type: 'schema', schemas: parseRoleList(c) }
    } else if (c.eat('function', 'procedure', 'routine')) {
      target = { type: 'function', objs: parseNameList(c) }
    } else if (c.eat('sequence', 'database', 'language', 'type', 'domain', 'tablespace', 'foreign', 'large', 'parameter')) {
      target = { type: 'other' }
      while (!c.done() && !isWord(c.peek(), toWord)) c.next()
    } else {
      c.eat('table')
      target = { type: 'relation', objs: parseNameList(c) }
    }
    if (!c.eat(toWord)) return { k: 'unparsed', reason: `${verb} without grantees` }
    return { k: verb, privs, target, grantees: parseRoleList(c) }
  }
  return null
}

function parsePrivileges(c: Cursor): string[] {
  const out: string[] = []
  while (!c.done() && !isWord(c.peek(), 'on')) {
    const t = c.next()!
    if (t.kind === 'lparen') { c.i--; c.group(); continue }
    if (t.kind === 'ident' && t.value !== 'privileges') out.push(t.value)
  }
  return out.flatMap(p => (p === 'all' ? TABLE_PRIVS : [p]))
}

function viewInvokerOption(opts: Tok[]): boolean | null {
  for (let k = 0; k < opts.length; k++) {
    if (!isWord(opts[k], 'security_invoker')) continue
    const eq = opts[k + 1]
    if (!eq || eq.kind === 'comma') return true
    const v = opts[k + 2]
    return !!v && ['true', 'on', '1', 'yes', 't', 'y'].includes(v.value.toLowerCase())
  }
  return null
}

/** Relations a view reads: names after FROM / JOIN and comma-separated FROM items. CTEs excluded. */
export function referencedRelations(query: Tok[]): QName[] {
  const ctes = new Set<string>()
  for (let k = 0; k + 2 < query.length; k++) {
    const prev = query[k - 1]
    if (isName(query[k]) && isWord(query[k + 1], 'as') && query[k + 2].kind === 'lparen'
      && (!prev || isWord(prev, 'with', 'recursive') || prev.kind === 'comma' || prev.kind === 'rparen')) ctes.add(query[k].value)
  }
  const STOP = new Set(['where', 'group', 'order', 'limit', 'offset', 'having', 'union', 'intersect', 'except', 'window', 'on', 'using',
    'join', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'natural', 'lateral', 'select', 'from', 'with', 'fetch', 'for'])
  const out: QName[] = []
  const c = new Cursor(query)
  while (!c.done()) {
    if (!isWord(c.next(), 'from', 'join')) continue
    for (;;) {
      c.eat('lateral', 'only')
      if (c.peek()?.kind === 'lparen') c.group()
      else {
        const q = parseName(c)
        if (q && !(q.schema === null && ctes.has(q.name))) out.push(q)
        if (q && c.peek()?.kind === 'lparen') c.group() // set-returning function
      }
      c.eat('as')
      const alias = c.peek()
      if (alias && isName(alias) && !STOP.has(alias.value)) c.next()
      if (c.peek()?.kind === 'lparen') c.group()
      if (c.peek()?.kind === 'comma') { c.next(); continue }
      break
    }
  }
  return out
}

// ─── Policy expressions ─────────────────────────────────────────────────────

export type Verdict = 'BOUNDED' | 'DENY' | 'CALLER_INDEPENDENT'
export interface ExprAnalysis { verdict: Verdict; branches: string[] }
const BOUNDED: ExprAnalysis = { verdict: 'BOUNDED', branches: [] }
const DENY: ExprAnalysis = { verdict: 'DENY', branches: [] }
export const text = (toks: Tok[]): string =>
  toks.map(t => t.text).join(' ').replace(/\s*\.\s*/g, '.').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+,/g, ',')
const independent = (toks: Tok[]): ExprAnalysis => ({ verdict: 'CALLER_INDEPENDENT', branches: [text(toks)] })

/**
 * Is every row this expression admits bounded by WHO is asking?
 *
 * Every OR branch must be caller-bounded; one bounded conjunct bounds an AND. A
 * branch that never consults the caller — `project_id IS NULL`, `true`, `1=1`,
 * `scope = 'world'` — admits its rows to everyone the policy applies to, however
 * many times auth.uid() appears elsewhere. A subquery is judged by its own
 * WHERE/ON, so `x IN (SELECT … WHERE col IS NULL OR owner = auth.uid())` is
 * caller-independent too. A missing expression is DENY (Postgres semantics).
 */
export function analyzeExpr(toks: Tok[] | null | undefined): ExprAnalysis {
  if (!toks || toks.length === 0) return DENY
  return orExpr(stripParens(toks))
}
export const analyzeExprText = (sql: string): ExprAnalysis => analyzeExpr(lex(sql))

function stripParens(toks: Tok[]): Tok[] {
  let cur = toks
  for (;;) {
    if (cur.length < 2 || cur[0].kind !== 'lparen' || cur[cur.length - 1].kind !== 'rparen') return cur
    let depth = 0
    for (let k = 0; k < cur.length; k++) {
      if (cur[k].kind === 'lparen') depth++
      else if (cur[k].kind === 'rparen' && --depth === 0 && k < cur.length - 1) return cur
    }
    const inner = cur.slice(1, -1)
    if (isWord(inner[0], 'select', 'with', 'values')) return cur
    cur = inner
  }
}

function splitTop(toks: Tok[], word: 'or' | 'and'): Tok[][] {
  const parts: Tok[][] = []
  let cur: Tok[] = []
  let depth = 0
  let caseDepth = 0
  let between = false
  for (const t of toks) {
    if (t.kind === 'lparen' || t.kind === 'lbracket') depth++
    else if (t.kind === 'rparen' || t.kind === 'rbracket') depth--
    if (depth === 0 && t.kind === 'ident') {
      if (t.value === 'case') caseDepth++
      else if (t.value === 'end' && caseDepth > 0) caseDepth--
      else if (caseDepth === 0) {
        if (t.value === 'between') between = true
        else if (t.value === word) {
          if (word === 'and' && between) { between = false; cur.push(t); continue }
          parts.push(cur)
          cur = []
          continue
        }
      }
    }
    cur.push(t)
  }
  parts.push(cur)
  return parts.filter(p => p.length > 0)
}

function orExpr(toks: Tok[]): ExprAnalysis {
  const parts = splitTop(toks, 'or')
  if (parts.length === 1) return andExpr(toks)
  const rs = parts.map(p => andExpr(stripParens(p)))
  if (rs.some(r => r.verdict === 'CALLER_INDEPENDENT')) {
    return { verdict: 'CALLER_INDEPENDENT', branches: rs.flatMap(r => (r.verdict === 'CALLER_INDEPENDENT' ? r.branches : [])) }
  }
  return rs.every(r => r.verdict === 'DENY') ? DENY : BOUNDED
}

function andExpr(toks: Tok[]): ExprAnalysis {
  const parts = splitTop(toks, 'and')
  if (parts.length === 1) return notExpr(toks)
  const rs = parts.map(p => notExpr(stripParens(p)))
  if (rs.some(r => r.verdict === 'DENY')) return DENY
  if (rs.some(r => r.verdict === 'BOUNDED')) return BOUNDED
  return independent(toks)
}

function notExpr(toks: Tok[]): ExprAnalysis {
  // NOT of anything admits rows the caller does not own (or everything, for NOT false).
  if (isWord(toks[0], 'not')) return independent(toks)
  const s = stripParens(toks)
  return s !== toks ? orExpr(s) : atom(toks)
}

interface Group { start: number; end: number; inner: Tok[] }
function topGroups(toks: Tok[]): Group[] {
  const out: Group[] = []
  let depth = 0
  let start = -1
  for (let k = 0; k < toks.length; k++) {
    if (toks[k].kind === 'lparen') { if (depth === 0) start = k; depth++ }
    else if (toks[k].kind === 'rparen' && --depth === 0) out.push({ start, end: k, inner: toks.slice(start + 1, k) })
  }
  return out
}

/** auth.uid() / auth.email() / auth.jwt() / request.jwt settings at k: its end, and whether it names a person. */
function callerRefAt(toks: Tok[], k: number): { end: number; bounding: boolean } | null {
  const t = toks[k]
  if (isWord(t, 'auth') && toks[k + 1]?.kind === 'dot' && isName(toks[k + 2]) && toks[k + 3]?.kind === 'lparen' && toks[k + 4]?.kind === 'rparen') {
    const fn = toks[k + 2].value
    if (fn === 'role') return { end: k + 4, bounding: false }
    if (fn === 'uid' || fn === 'email') return { end: k + 4, bounding: true }
    if (fn === 'jwt') {
      // The claim decides: `role` and `aud` describe populations, not identities.
      let e = k + 4
      let claim = ''
      while (toks[e + 1]?.kind === 'op' && (toks[e + 1].text === '->' || toks[e + 1].text === '->>') && toks[e + 2]) {
        claim = toks[e + 2].value.toLowerCase()
        e += 2
      }
      return { end: e, bounding: claim !== 'role' && claim !== 'aud' }
    }
  }
  if (isWord(t, 'current_setting') && toks[k + 1]?.kind === 'lparen' && toks[k + 2]?.kind === 'string') {
    const key = toks[k + 2].value.toLowerCase()
    if (!key.startsWith('request.jwt')) return null
    let depth = 0
    for (let j = k + 1; j < toks.length; j++) {
      if (toks[j].kind === 'lparen') depth++
      else if (toks[j].kind === 'rparen' && --depth === 0) return { end: j, bounding: !key.endsWith('.role') }
    }
  }
  return null
}

function isCallerWrapper(inner: Tok[]): boolean {
  if (!isWord(inner[0], 'select')) return false
  const ref = callerRefAt(inner, 1)
  return !!ref && ref.end === inner.length - 1
}

/** Tokens outside subqueries, with `(select auth.uid())` wrappers replaced by the bare call. */
function outsideSubqueries(toks: Tok[]): Tok[] {
  const out: Tok[] = []
  let k = 0
  for (const g of topGroups(toks)) {
    out.push(...toks.slice(k, g.start))
    if (isWord(g.inner[0], 'select', 'with')) {
      if (isCallerWrapper(g.inner)) out.push(...g.inner.slice(1))
      else out.push({ kind: 'ident', text: '__subquery__', value: '__subquery__', pos: toks[g.start].pos })
    } else {
      out.push(toks[g.start], ...outsideSubqueries(g.inner), toks[g.end])
    }
    k = g.end + 1
  }
  out.push(...toks.slice(k))
  return out
}

const SUBQUERY_CLAUSES = new Set(['group', 'order', 'limit', 'offset', 'having', 'union', 'intersect', 'except', 'window', 'fetch', 'for',
  'join', 'left', 'right', 'inner', 'full', 'cross', 'natural', 'where', 'on'])
function subqueryConditions(inner: Tok[]): Tok[][] {
  const conds: Tok[][] = []
  let depth = 0
  for (let k = 0; k < inner.length; k++) {
    const t = inner[k]
    if (t.kind === 'lparen') { depth++; continue }
    if (t.kind === 'rparen') { depth--; continue }
    if (depth !== 0 || !isWord(t, 'where', 'on')) continue
    const cond: Tok[] = []
    let d = 0
    for (let j = k + 1; j < inner.length; j++) {
      const u = inner[j]
      if (u.kind === 'lparen') d++
      else if (u.kind === 'rparen') d--
      if (d === 0 && u.kind === 'ident' && SUBQUERY_CLAUSES.has(u.value)) break
      cond.push(u)
    }
    conds.push(cond)
  }
  return conds
}

function atom(toks: Tok[]): ExprAnalysis {
  if (toks.length === 0) return DENY
  const bare = toks.filter((t, k) => !(t.kind === 'colon2' || (k > 0 && toks[k - 1].kind === 'colon2')))
  const truthy = ['t', 'true', 'on', 'yes', '1', 'y']
  if (bare.length === 1 && (isWord(bare[0], 'true') || (bare[0].kind === 'string' && truthy.includes(bare[0].value.toLowerCase())))) return independent(toks)
  if (bare.length === 1 && (isWord(bare[0], 'false') || (bare[0].kind === 'string' && ['f', 'false', 'off', 'no', '0', 'n'].includes(bare[0].value.toLowerCase())))) return DENY
  // COALESCE(…, true): the fallback admits everyone the moment the caller branch is NULL.
  for (let k = 0; k < toks.length; k++) {
    if (!isWord(toks[k], 'coalesce') || toks[k + 1]?.kind !== 'lparen') continue
    const g = topGroups(toks.slice(k + 1))[0]
    if (g && g.inner.some((t, j) => isWord(t, 'true') && (j === 0 || g.inner[j - 1].kind === 'comma'))) return independent(toks)
  }
  // CASE with a literal TRUE outcome.
  if (toks.some(t => isWord(t, 'case')) && toks.some((t, k) => isWord(t, 'true') && isWord(toks[k - 1], 'then', 'else'))) return independent(toks)

  const outer = outsideSubqueries(toks)
  const negated = outer.some((t, k) => isWord(t, 'not') && isWord(outer[k + 1], 'in', 'exists'))
  let bounded = false
  for (const g of topGroups(toks)) {
    if (!isWord(g.inner[0], 'select', 'with') || isCallerWrapper(g.inner)) continue
    const conds = subqueryConditions(g.inner)
    if (conds.length === 0) return independent(toks) // unbounded subquery: every row of its source
    const rs = conds.map(cnd => analyzeExpr(cnd))
    if (rs.some(r => r.verdict === 'DENY')) return DENY
    if (!rs.some(r => r.verdict === 'BOUNDED')) {
      const branches = rs.flatMap(r => r.branches)
      return { verdict: 'CALLER_INDEPENDENT', branches: branches.length ? branches : [text(toks)] }
    }
    bounded = true
  }
  if (bounded || callerBounding(outer)) return negated ? independent(toks) : BOUNDED
  return independent(toks)
}

/** Is a caller identity compared for EQUALITY with something that is not itself the caller? */
function callerBounding(toks: Tok[]): boolean {
  for (let k = 0; k < toks.length; k++) {
    const ref = callerRefAt(toks, k)
    if (!ref) continue
    if (!ref.bounding) { k = ref.end; continue }
    let p = k - 1
    while (p >= 0 && toks[p].kind === 'lparen') p--
    const left = toks[p]
    if (left?.kind === 'op' && left.text === '=' && p > 0 && !isWord(toks[p - 1], 'null') && !callerRefEndsAt(toks, p - 1)) return true
    if (left && (left.kind === 'comma' || left.kind === 'lparen') && insideCall(toks, k)) return true
    let q = ref.end + 1
    for (;;) {
      if (toks[q]?.kind === 'colon2') { q += 2; continue }
      if (toks[q]?.kind === 'rparen') { q++; continue }
      break
    }
    const right = toks[q]
    if (right?.kind === 'op' && right.text === '=' && toks[q + 1] && !isWord(toks[q + 1], 'null') && !callerRefAt(toks, q + 1)) return true
    if (isWord(right, 'in')) return true
    k = ref.end
  }
  return false
}
function callerRefEndsAt(toks: Tok[], idx: number): boolean {
  for (let k = Math.max(0, idx - 12); k <= idx; k++) { const r = callerRefAt(toks, k); if (r && r.end === idx) return true }
  return false
}
/** Is position k an argument of a function call, e.g. is_member(project_id, auth.uid())? */
function insideCall(toks: Tok[], k: number): boolean {
  let depth = 0
  for (let j = k - 1; j >= 0; j--) {
    if (toks[j].kind === 'rparen') depth++
    else if (toks[j].kind === 'lparen') {
      if (depth === 0) return j > 0 && isName(toks[j - 1]) && !isWord(toks[j - 1], 'in', 'and', 'or', 'not', 'exists')
      depth--
    }
  }
  return false
}

// ─── Classification context ─────────────────────────────────────────────────

export type TableClass = 'SERVER_ONLY' | 'TENANT_RLS' | 'INTERNAL_DENY_ALL' | 'INTENTIONALLY_PUBLIC'
export interface Registry {
  tables: Record<string, { class: TableClass; rls: boolean }>
  views?: Record<string, { class: TableClass }>
  _meta: { created_not_live?: { tables?: string[]; classes?: Record<string, TableClass> } } & Record<string, unknown>
}
export interface InternalSchema { schema: string; exposed_via_data_api: boolean; verified: string; justification: string }
export type ExceptionStatus = 'HISTORICAL_SUPERSEDED' | 'CURRENT_INTENTIONAL'
export interface AllowEntry {
  migration: string; table: string; policy: string | null; rule: RuleId; fingerprint: string
  status: ExceptionStatus; superseded_by?: string; justification: string
}
export interface Allowlist { internal_schemas: InternalSchema[]; exceptions: AllowEntry[] }

// ─── Rules ──────────────────────────────────────────────────────────────────

export type Category = 'WEAKENING' | 'UNKNOWN' | 'HARDENING' | 'LOCKOUT' | 'CONTEXTUAL'
export const RULES = {
  NEW_TABLE_WITHOUT_RLS: 'WEAKENING',
  DISABLE_RLS: 'WEAKENING',
  NO_FORCE_RLS: 'WEAKENING',
  PUBLIC_POLICY_CALLER_INDEPENDENT: 'WEAKENING',
  PUBLIC_POLICY_WRITE_EXTENSION: 'WEAKENING',
  AUTH_POLICY_CROSS_TENANT: 'WEAKENING',
  AUTH_POLICY_CROSS_TENANT_WRITE: 'WEAKENING',
  CLIENT_POLICY_ON_SERVER_ONLY: 'WEAKENING',
  RESTRICTIVE_POLICY_DROPPED: 'WEAKENING',
  CLIENT_GRANT_ON_SERVER_ONLY: 'WEAKENING',
  CLIENT_GRANT_ON_RLS_OFF_TABLE: 'WEAKENING',
  CLIENT_DML_GRANT_ON_PUBLIC_TABLE: 'WEAKENING',
  CLIENT_GRANT_ALL_TABLES: 'WEAKENING',
  SCHEMA_CREATE_CLIENT_GRANT: 'WEAKENING',
  DEFAULT_PRIVILEGES_CLIENT_GRANT: 'WEAKENING',
  INTERNAL_SCHEMA_CLIENT_GRANT: 'WEAKENING',
  CLIENT_ROLE_MEMBERSHIP: 'WEAKENING',
  CLIENT_ROLE_ALTERED: 'WEAKENING',
  VIEW_RLS_BYPASS: 'WEAKENING',
  VIEW_SECURITY_INVOKER_DISABLED: 'WEAKENING',
  CLIENT_GRANT_ON_INSECURE_VIEW: 'WEAKENING',
  CLIENT_GRANT_ON_SERVER_ONLY_VIEW: 'WEAKENING',
  SERVER_ONLY_VIEW_CLIENT_REACHABLE: 'WEAKENING',
  UNCLASSIFIED_TABLE: 'UNKNOWN',
  UNCLASSIFIED_VIEW: 'UNKNOWN',
  UNKNOWN_SCHEMA: 'UNKNOWN',
  UNPARSED_SECURITY_STATEMENT: 'UNKNOWN',
  DYNAMIC_SECURITY_SQL: 'UNKNOWN',
  FUNCTION_BODY_SECURITY_DDL: 'UNKNOWN',
  OBJECT_MOVED_INTO_EXPOSED_SCHEMA: 'UNKNOWN',
  RLS_ENABLED: 'HARDENING',
  CLIENT_PRIVILEGE_REVOKED: 'HARDENING',
  UNSAFE_POLICY_DROPPED: 'HARDENING',
  VIEW_SECURED: 'HARDENING',
  RESTRICTIVE_POLICY: 'HARDENING',
  POLICY_DROPPED_LOCKOUT: 'LOCKOUT',
  TENANT_POLICY: 'CONTEXTUAL',
  DENY_POLICY: 'CONTEXTUAL',
  NON_CLIENT_POLICY: 'CONTEXTUAL',
  PUBLIC_READ_REVIEWED_CLASS: 'CONTEXTUAL',
  CLIENT_GRANT_INERT_UNDER_RLS: 'CONTEXTUAL',
  SERVICE_ROLE_GRANT: 'CONTEXTUAL',
  INTERNAL_SCHEMA_OBJECT: 'CONTEXTUAL',
  SECURITY_DEFINER_FUNCTION: 'CONTEXTUAL',
  FUNCTION_EXECUTE_CLIENT_GRANT: 'CONTEXTUAL',
  POLICY_DROP_NOOP: 'CONTEXTUAL',
} as const satisfies Record<string, Category>
export type RuleId = keyof typeof RULES
export const isBlocking = (r: RuleId): boolean => RULES[r] === 'WEAKENING' || RULES[r] === 'UNKNOWN'

export type Origin = 'statement' | 'do-block' | 'do-execute' | 'do-literal' | 'function-body'
export interface Finding {
  migration: string
  root: Root | 'bootstrap'
  rule: RuleId
  category: Category
  blocking: boolean
  object: string
  policy: string | null
  fingerprint: string
  statement: string
  detail: string
  origin: Origin
}

// ─── Model ──────────────────────────────────────────────────────────────────

export interface Rel {
  key: string; schema: string; name: string; kind: 'table' | 'view' | 'matview'
  rls: boolean; invoker: boolean; grants: Map<string, Set<string>>; refs: string[]
}
export interface Pol { table: string; name: string; permissive: boolean; cmd: Cmd; roles: string[]; explicitRoles: boolean; using: Tok[] | null; check: Tok[] | null }
export const polKey = (table: string, name: string): string => `${table}|${name}`

export class Model {
  rels = new Map<string, Rel>()
  pols = new Map<string, Pol>()
  /** schema -> role -> privileges a newly created relation receives (ALTER DEFAULT PRIVILEGES … ON TABLES). */
  defaults = new Map<string, Map<string, Set<string>>>()
  constructor() {
    // Supabase's posture: every relation created in `public` is granted to the client roles.
    this.defaults.set('public', new Map(['anon', 'authenticated', 'service_role'].map(r => [r, new Set(TABLE_PRIVS)])))
  }
  defaultGrants(schema: string): Map<string, Set<string>> {
    const d = this.defaults.get(schema)
    return new Map([...(d ?? new Map<string, Set<string>>())].map(([r, p]) => [r, new Set(p)]))
  }
}
const clientSelect = (r: Rel): boolean => CLIENT_ROLES.some(role => r.grants.get(role)?.has('select'))
const clientAny = (r: Rel): boolean => CLIENT_ROLES.some(role => (r.grants.get(role)?.size ?? 0) > 0)

interface Stmt { toks: Tok[]; origin: Origin; dynamic: boolean }
interface Ctx {
  registry: Registry
  internal: Set<string>
  model: Model
  file: { relPath: string; root: Root | 'bootstrap' }
  out: Finding[] | null
  createdTables: Map<string, Stmt>
  touchedViews: Map<string, Stmt>
}

const scopeOf = (ctx: Ctx, schema: string | null): 'exposed' | 'internal' | 'unknown' => {
  const s = schema ?? 'public'
  return s === 'public' ? 'exposed' : ctx.internal.has(s) ? 'internal' : 'unknown'
}
export function tableClass(reg: Registry, name: string): TableClass | null {
  return reg.tables[name]?.class ?? reg._meta.created_not_live?.classes?.[name] ?? null
}
export const viewClass = (reg: Registry, name: string): TableClass | null => reg.views?.[name]?.class ?? null

function emit(ctx: Ctx, rule: RuleId, st: Stmt, object: string, policy: string | null, detail: string): void {
  if (!ctx.out) return
  ctx.out.push({
    migration: ctx.file.relPath, root: ctx.file.root, rule, category: RULES[rule], blocking: isBlocking(rule),
    object, policy, fingerprint: fingerprint(st.toks), statement: normalize(st.toks).slice(0, 400), detail, origin: st.origin,
  })
}

/** Evaluate a policy definition against the class of the table it protects. */
export function evaluatePolicy(reg: Registry, pol: Pol): { rule: RuleId; detail: string }[] {
  const name = pol.table.slice(pol.table.indexOf('.') + 1)
  const cls = pol.table.startsWith('public.') ? tableClass(reg, name) : null
  const roles = pol.roles.length ? pol.roles : ['public']
  const anon = roles.some(r => r === 'public' || r === 'anon')
  const client = anon || roles.includes('authenticated')
  if (!pol.permissive) return [{ rule: 'RESTRICTIVE_POLICY', detail: 'restrictive policies can only narrow access' }]
  if (!client) return [{ rule: 'NON_CLIENT_POLICY', detail: `applies to ${roles.join(', ')} only` }]
  const reads = pol.cmd === 'all' || pol.cmd === 'select' ? analyzeExpr(pol.using) : DENY
  const rows = pol.cmd === 'all' || pol.cmd === 'update' || pol.cmd === 'delete' ? analyzeExpr(pol.using) : DENY
  const inherited = pol.check === null && (pol.cmd === 'all' || pol.cmd === 'update')
  const newRows = pol.cmd === 'insert' ? analyzeExpr(pol.check)
    : pol.cmd === 'all' || pol.cmd === 'update' ? analyzeExpr(pol.check ?? pol.using) : DENY
  if (reads.verdict === 'DENY' && rows.verdict === 'DENY' && newRows.verdict === 'DENY') {
    return [{ rule: 'DENY_POLICY', detail: 'admits no row' }]
  }
  const who = pol.explicitRoles ? `TO ${roles.join(', ')}` : 'no TO clause, so PUBLIC (anon included)'
  const out: { rule: RuleId; detail: string }[] = []
  if (cls === 'SERVER_ONLY' || cls === 'INTERNAL_DENY_ALL') {
    out.push({ rule: 'CLIENT_POLICY_ON_SERVER_ONLY', detail: `${cls} table gains a client-reachable policy (${who})` })
  }
  const writeBranches = [rows, newRows].filter(r => r.verdict === 'CALLER_INDEPENDENT').flatMap(r => r.branches)
  const writeNote = inherited ? ' — WITH CHECK omitted, so the caller-independent USING also governs INSERT/UPDATE' : ''
  if (anon) {
    if (reads.verdict === 'CALLER_INDEPENDENT') {
      out.push(cls === 'INTENTIONALLY_PUBLIC'
        ? { rule: 'PUBLIC_READ_REVIEWED_CLASS', detail: 'reviewed public read' }
        : { rule: 'PUBLIC_POLICY_CALLER_INDEPENDENT', detail: `${who}; caller-independent branch(es): ${reads.branches.join(' | ')}` })
    }
    if (writeBranches.length) {
      out.push({ rule: 'PUBLIC_POLICY_WRITE_EXTENSION', detail: `${who}; ${pol.cmd.toUpperCase()} write admits: ${[...new Set(writeBranches)].join(' | ')}${writeNote}` })
    }
  } else {
    if (reads.verdict === 'CALLER_INDEPENDENT') {
      out.push(cls === 'INTENTIONALLY_PUBLIC'
        ? { rule: 'PUBLIC_READ_REVIEWED_CLASS', detail: 'reviewed public read' }
        : { rule: 'AUTH_POLICY_CROSS_TENANT', detail: `${who}; every signed-in user reads: ${reads.branches.join(' | ')}` })
    }
    if (writeBranches.length) {
      out.push({ rule: 'AUTH_POLICY_CROSS_TENANT_WRITE', detail: `${who}; every signed-in user writes: ${[...new Set(writeBranches)].join(' | ')}${writeNote}` })
    }
  }
  if (out.length === 0) out.push({ rule: 'TENANT_POLICY', detail: 'every branch is bounded by the caller' })
  return out
}

function isOverRlsData(ctx: Ctx, refs: string[]): boolean {
  return refs.some(key => {
    const rel = ctx.model.rels.get(key)
    if (rel) return rel.kind !== 'table' || rel.rls || (rel.schema === 'public' && tableClass(ctx.registry, rel.name) !== null)
    return key.startsWith('public.') && tableClass(ctx.registry, key.slice(7)) !== null
  })
}

/** Apply one parsed statement: statement-level rules first, then the state change. */
function apply(ctx: Ctx, op: Op, st: Stmt): void {
  const m = ctx.model
  switch (op.k) {
    case 'unparsed':
      emit(ctx, 'UNPARSED_SECURITY_STATEMENT', st, '?', null, op.reason)
      return
    case 'do_block': {
      const { stmts, unresolved } = expandPlpgsql(op.body, 'do-block')
      for (const u of unresolved) emit(ctx, 'DYNAMIC_SECURITY_SQL', { ...st, toks: u, origin: 'do-block' }, '?', null, 'EXECUTE of SQL the gate cannot resolve')
      for (const inner of stmts) {
        const iop = parseOp(inner.toks)
        if (iop) apply(ctx, iop, inner)
      }
      return
    }
    case 'function': {
      if (op.securityDefiner) emit(ctx, 'SECURITY_DEFINER_FUNCTION', st, qkey(op.name), null, `SECURITY DEFINER ${op.language} function — recorded, not enforced`)
      if (op.body !== null && (op.language === 'plpgsql' || op.language === 'sql')) {
        const inner = op.language === 'plpgsql' ? expandPlpgsql(op.body, 'function-body').stmts
          : splitStatements(safeLex(op.body)).map(toks => ({ toks, origin: 'function-body' as Origin, dynamic: false }))
        for (const s of inner) {
          const iop = parseOp(s.toks)
          if (iop && !['function', 'do_block'].includes(iop.k)) {
            emit(ctx, 'FUNCTION_BODY_SECURITY_DDL', s, qkey(op.name), null, `function body runs ${iop.k} when called — review required`)
          }
        }
      }
      return
    }
    case 'alter_function_security':
      if (op.definer) emit(ctx, 'SECURITY_DEFINER_FUNCTION', st, qkey(op.name), null, 'made SECURITY DEFINER — recorded, not enforced')
      return
    case 'alter_role':
      if (isClientRole(op.role)) emit(ctx, 'CLIENT_ROLE_ALTERED', st, op.role, null, 'a client role\'s attributes changed')
      return
    case 'create_table': {
      if (op.temp) return
      const key = qkey(op.obj)
      const scope = scopeOf(ctx, op.obj.schema)
      if (isDynamic(op.obj)) { emit(ctx, 'DYNAMIC_SECURITY_SQL', st, key, null, 'CREATE TABLE with a run-time name'); return }
      if (scope === 'unknown') { emit(ctx, 'UNKNOWN_SCHEMA', st, key, null, `schema ${op.obj.schema} is neither public nor a reviewed internal schema`); return }
      if (m.rels.has(key)) return // CREATE TABLE IF NOT EXISTS on an existing table: no change
      m.rels.set(key, { key, schema: op.obj.schema ?? 'public', name: op.obj.name, kind: 'table', rls: false, invoker: false, grants: m.defaultGrants(op.obj.schema ?? 'public'), refs: [] })
      if (scope === 'exposed') {
        ctx.createdTables.set(key, st)
        if (!tableClass(ctx.registry, op.obj.name)) emit(ctx, 'UNCLASSIFIED_TABLE', st, key, null, 'new public table has no class in the schema-security registry')
      }
      return
    }
    case 'alter_table_rls': {
      const key = qkey(op.obj)
      const scope = scopeOf(ctx, op.obj.schema)
      const weakening = op.action === 'disable' || op.action === 'no_force'
      if (isDynamic(op.obj)) {
        if (weakening) emit(ctx, 'DYNAMIC_SECURITY_SQL', st, key, null, `${op.action} row level security on a run-time name`)
        else emit(ctx, 'RLS_ENABLED', st, key, null, `${op.action} on a run-time name`)
        return
      }
      if (scope === 'unknown') { emit(ctx, 'UNKNOWN_SCHEMA', st, key, null, `schema ${op.obj.schema} is not reviewed`); return }
      if (scope === 'exposed' && !tableClass(ctx.registry, op.obj.name) && !m.rels.has(key)) {
        emit(ctx, 'UNCLASSIFIED_TABLE', st, key, null, 'row level security changed on a table nobody classified')
      }
      const rel = m.rels.get(key)
      if (op.action === 'disable') { emit(ctx, 'DISABLE_RLS', st, key, null, 'DISABLE ROW LEVEL SECURITY — every client grant becomes live'); if (rel) rel.rls = false; return }
      if (op.action === 'no_force') { emit(ctx, 'NO_FORCE_RLS', st, key, null, 'NO FORCE ROW LEVEL SECURITY — the owner bypasses RLS again'); return }
      emit(ctx, 'RLS_ENABLED', st, key, null, `${op.action.toUpperCase()} ROW LEVEL SECURITY`)
      if (rel) rel.rls = true
      else m.rels.set(key, { key, schema: op.obj.schema ?? 'public', name: op.obj.name, kind: 'table', rls: true, invoker: false, grants: new Map(), refs: [] })
      return
    }
    case 'rename': {
      const key = qkey(op.obj)
      const rel = m.rels.get(key)
      if (!rel) return
      const nk = `${rel.schema}.${op.to}`
      m.rels.delete(key)
      m.rels.set(nk, { ...rel, key: nk, name: op.to })
      for (const [pk, p] of [...m.pols]) if (p.table === key) { m.pols.delete(pk); m.pols.set(polKey(nk, p.name), { ...p, table: nk }) }
      if (rel.schema === 'public' && !(rel.kind === 'table' ? tableClass(ctx.registry, op.to) : viewClass(ctx.registry, op.to))) {
        emit(ctx, rel.kind === 'table' ? 'UNCLASSIFIED_TABLE' : 'UNCLASSIFIED_VIEW', st, nk, null, 'renamed to a name nobody classified')
      }
      return
    }
    case 'set_schema': {
      const key = qkey(op.obj)
      if (op.to === 'public') emit(ctx, 'OBJECT_MOVED_INTO_EXPOSED_SCHEMA', st, key, null, 'object moved into the Data API schema')
      const rel = m.rels.get(key)
      if (rel) { m.rels.delete(key); const nk = `${op.to}.${rel.name}`; m.rels.set(nk, { ...rel, key: nk, schema: op.to }) }
      return
    }
    case 'create_view': {
      if (op.temp) return
      const key = qkey(op.obj)
      const scope = scopeOf(ctx, op.obj.schema)
      if (isDynamic(op.obj)) { emit(ctx, 'DYNAMIC_SECURITY_SQL', st, key, null, 'CREATE VIEW with a run-time name'); return }
      if (scope === 'unknown') { emit(ctx, 'UNKNOWN_SCHEMA', st, key, null, `schema ${op.obj.schema} is not reviewed`); return }
      const refs = op.refs.map(qkey)
      const existing = m.rels.get(key)
      const invoker = op.invoker === true
      if (existing && (existing.kind === 'view' || existing.kind === 'matview')) {
        // Postgres resets view options on CREATE OR REPLACE without WITH, and keeps the ACL.
        if (existing.invoker && !invoker) {
          emit(ctx, 'VIEW_SECURITY_INVOKER_DISABLED', st, key, null, 'CREATE OR REPLACE without security_invoker silently turns invoker mode OFF')
        }
        existing.invoker = invoker
        existing.refs = refs
      } else {
        m.rels.set(key, { key, schema: op.obj.schema ?? 'public', name: op.obj.name, kind: op.materialized ? 'matview' : 'view', rls: false, invoker, grants: m.defaultGrants(op.obj.schema ?? 'public'), refs })
      }
      if (scope === 'internal') { emit(ctx, 'INTERNAL_SCHEMA_OBJECT', st, key, null, 'view in a reviewed internal schema (not exposed by the Data API)'); return }
      ctx.touchedViews.set(key, st)
      if (!viewClass(ctx.registry, op.obj.name)) emit(ctx, 'UNCLASSIFIED_VIEW', st, key, null, 'public view has no class in the schema-security registry')
      return
    }
    case 'alter_view_opts': {
      const key = qkey(op.obj)
      const rel = m.rels.get(key)
      if (op.invoker === true) {
        emit(ctx, 'VIEW_SECURED', st, key, null, 'security_invoker = true: the view honours the caller\'s RLS')
        if (rel) rel.invoker = true
        return
      }
      emit(ctx, 'VIEW_SECURITY_INVOKER_DISABLED', st, key, null, 'security_invoker turned off: the view runs as its owner and bypasses RLS')
      if (rel) rel.invoker = false
      return
    }
    case 'drop_relations':
      for (const q of op.objs) {
        const key = qkey(q)
        m.rels.delete(key)
        for (const [pk, p] of [...m.pols]) if (p.table === key) m.pols.delete(pk)
      }
      return
    case 'create_policy':
    case 'alter_policy': {
      const table = qkey(op.table)
      const scope = scopeOf(ctx, op.table.schema)
      const pk = polKey(table, op.name)
      const prev = m.pols.get(pk)
      let pol: Pol
      if (op.k === 'create_policy') {
        pol = { table, name: op.name, permissive: op.permissive, cmd: op.cmd, roles: op.roles, explicitRoles: op.explicitRoles, using: op.using, check: op.check }
      } else {
        if (op.renameTo) {
          if (prev) { m.pols.delete(pk); m.pols.set(polKey(table, op.renameTo), { ...prev, name: op.renameTo }) }
          return
        }
        pol = {
          table, name: op.name, permissive: prev?.permissive ?? true, cmd: prev?.cmd ?? 'all',
          roles: op.roles ?? prev?.roles ?? ['public'], explicitRoles: op.roles ? true : prev?.explicitRoles ?? false,
          using: op.using ?? prev?.using ?? null, check: op.check ?? prev?.check ?? null,
        }
      }
      if (isDynamic(op.table)) { emit(ctx, 'DYNAMIC_SECURITY_SQL', st, table, op.name, 'policy on a run-time table name'); return }
      m.pols.set(pk, pol)
      if (scope === 'unknown') { emit(ctx, 'UNKNOWN_SCHEMA', st, table, op.name, `schema ${op.table.schema} is not reviewed`); return }
      if (scope === 'internal') { emit(ctx, 'INTERNAL_SCHEMA_OBJECT', st, table, op.name, 'policy in a reviewed internal schema; client reach there needs a grant, which is caught'); return }
      if (!tableClass(ctx.registry, op.table.name)) emit(ctx, 'UNCLASSIFIED_TABLE', st, table, op.name, 'policy on a table nobody classified')
      for (const r of evaluatePolicy(ctx.registry, pol)) emit(ctx, r.rule, st, table, op.name, r.detail)
      return
    }
    case 'drop_policy': {
      const table = qkey(op.table)
      const pk = polKey(table, op.name)
      const prev = m.pols.get(pk)
      m.pols.delete(pk)
      if (!prev) { emit(ctx, 'POLICY_DROP_NOOP', st, table, op.name, 'no such policy in the replayed state'); return }
      const was = evaluatePolicy(ctx.registry, prev)
      if (!prev.permissive) emit(ctx, 'RESTRICTIVE_POLICY_DROPPED', st, table, op.name, 'a restriction is removed')
      else if (was.some(r => isBlocking(r.rule))) emit(ctx, 'UNSAFE_POLICY_DROPPED', st, table, op.name, `removes ${was.filter(r => isBlocking(r.rule)).map(r => r.rule).join(', ')}`)
      else if (was.every(r => r.rule === 'DENY_POLICY' || r.rule === 'NON_CLIENT_POLICY')) emit(ctx, 'POLICY_DROP_NOOP', st, table, op.name, 'the dropped policy admitted no client row')
      else emit(ctx, 'POLICY_DROPPED_LOCKOUT', st, table, op.name, 'owners lose access (default-deny) — availability, not escalation')
      return
    }
    case 'grant':
    case 'revoke':
      applyGrant(ctx, op, st)
      return
    case 'grant_role':
      if (op.grantees.some(isClientRole)) emit(ctx, 'CLIENT_ROLE_MEMBERSHIP', st, op.grantees.join(','), null, 'a client role becomes a member of another role')
      return
    case 'revoke_role':
      return
    case 'default_privs': {
      const schemas = op.schemas.length ? op.schemas : ['public']
      const clients = op.grantees.filter(isClientRole)
      for (const s of schemas) {
        if (op.objtype === 'tables') {
          const d = m.defaults.get(s) ?? new Map<string, Set<string>>()
          for (const g of op.grantees) {
            const set = d.get(g) ?? new Set<string>()
            for (const p of op.privs) { if (op.action === 'grant') set.add(p); else set.delete(p) }
            d.set(g, set)
          }
          m.defaults.set(s, d)
        }
        if (op.action === 'revoke') { if (clients.length) emit(ctx, 'CLIENT_PRIVILEGE_REVOKED', st, s, null, `default ${op.objtype} privileges revoked from ${clients.join(', ')}`); continue }
        if (!clients.length) { emit(ctx, 'SERVICE_ROLE_GRANT', st, s, null, `default ${op.objtype} privileges for ${op.grantees.join(', ')}`); continue }
        if (op.objtype === 'functions' || op.objtype === 'routines') emit(ctx, 'FUNCTION_EXECUTE_CLIENT_GRANT', st, s, null, 'default EXECUTE for client roles — recorded')
        else if (scopeOf(ctx, s) === 'unknown') emit(ctx, 'UNKNOWN_SCHEMA', st, s, null, `schema ${s} is not reviewed`)
        else emit(ctx, 'DEFAULT_PRIVILEGES_CLIENT_GRANT', st, s, null, `every future ${op.objtype} in ${s} is granted to ${clients.join(', ')}`)
      }
      return
    }
  }
}

function applyGrant(ctx: Ctx, op: Extract<Op, { k: 'grant' | 'revoke' }>, st: Stmt): void {
  const m = ctx.model
  const clients = op.grantees.filter(isClientRole)
  const isGrant = op.k === 'grant'
  const mutate = (rel: Rel) => {
    for (const g of op.grantees) {
      const set = rel.grants.get(g) ?? new Set<string>()
      for (const p of op.privs) { if (isGrant) set.add(p); else set.delete(p) }
      rel.grants.set(g, set)
    }
  }
  const t = op.target
  if (t.type === 'other') return
  if (t.type === 'function') {
    if (isGrant && clients.length) emit(ctx, 'FUNCTION_EXECUTE_CLIENT_GRANT', st, t.objs.map(qkey).join(','), null, `EXECUTE for ${clients.join(', ')} — recorded, not enforced`)
    return
  }
  if (t.type === 'schema') {
    for (const s of t.schemas) {
      if (!isGrant) { if (clients.length) emit(ctx, 'CLIENT_PRIVILEGE_REVOKED', st, s, null, `schema privileges revoked from ${clients.join(', ')}`); continue }
      if (!clients.length) { emit(ctx, 'SERVICE_ROLE_GRANT', st, s, null, `schema ${s} for ${op.grantees.join(', ')}`); continue }
      const scope = scopeOf(ctx, s)
      if (scope === 'exposed') {
        if (op.privs.includes('create')) emit(ctx, 'SCHEMA_CREATE_CLIENT_GRANT', st, s, null, 'client roles may create objects in the Data API schema')
        else emit(ctx, 'CLIENT_GRANT_INERT_UNDER_RLS', st, s, null, 'USAGE on public is Supabase\'s default')
      } else if (scope === 'internal') emit(ctx, 'INTERNAL_SCHEMA_CLIENT_GRANT', st, s, null, 'a client role gains access to an internal schema')
      else emit(ctx, 'UNKNOWN_SCHEMA', st, s, null, `schema ${s} is not reviewed`)
    }
    return
  }
  if (t.type === 'all-tables') {
    for (const s of t.schemas) {
      for (const rel of m.rels.values()) if (rel.schema === s) mutate(rel)
      if (!clients.length) { emit(ctx, isGrant ? 'SERVICE_ROLE_GRANT' : 'CLIENT_PRIVILEGE_REVOKED', st, `${s}.*`, null, `all tables in ${s}`); continue }
      if (!isGrant) { emit(ctx, 'CLIENT_PRIVILEGE_REVOKED', st, `${s}.*`, null, `all tables in ${s} revoked from ${clients.join(', ')}`); continue }
      const scope = scopeOf(ctx, s)
      emit(ctx, scope === 'exposed' ? 'CLIENT_GRANT_ALL_TABLES' : scope === 'internal' ? 'INTERNAL_SCHEMA_CLIENT_GRANT' : 'UNKNOWN_SCHEMA',
        st, `${s}.*`, null, `every table in ${s}, SERVER_ONLY ones included, granted to ${clients.join(', ')}`)
    }
    return
  }
  for (const q of t.objs) {
    const key = qkey(q)
    const scope = scopeOf(ctx, q.schema)
    let rel = m.rels.get(key)
    if (!isGrant) {
      if (rel) mutate(rel)
      if (clients.length) emit(ctx, 'CLIENT_PRIVILEGE_REVOKED', st, key, null, `${op.privs.join(', ')} revoked from ${clients.join(', ')}`)
      continue
    }
    if (!clients.length) {
      if (rel) mutate(rel)
      emit(ctx, 'SERVICE_ROLE_GRANT', st, key, null, `granted to ${op.grantees.join(', ')}`)
      continue
    }
    if (isDynamic(q)) { emit(ctx, 'DYNAMIC_SECURITY_SQL', st, key, null, 'client grant on a run-time name'); continue }
    if (scope === 'unknown') { emit(ctx, 'UNKNOWN_SCHEMA', st, key, null, `schema ${q.schema} is not reviewed`); continue }
    if (scope === 'internal') { if (rel) mutate(rel); emit(ctx, 'INTERNAL_SCHEMA_CLIENT_GRANT', st, key, null, `internal-schema object granted to ${clients.join(', ')}`); continue }
    const isView = (rel && rel.kind !== 'table') || (!rel && viewClass(ctx.registry, q.name) !== null)
    if (!rel) {
      rel = { key, schema: 'public', name: q.name, kind: isView ? 'view' : 'table', rls: tableClass(ctx.registry, q.name) !== null, invoker: false, grants: new Map(), refs: [] }
      m.rels.set(key, rel)
    }
    mutate(rel)
    if (isView) {
      const cls = viewClass(ctx.registry, q.name)
      if (!cls) emit(ctx, 'UNCLASSIFIED_VIEW', st, key, null, 'client grant on a view nobody classified')
      else if (cls === 'SERVER_ONLY') emit(ctx, 'CLIENT_GRANT_ON_SERVER_ONLY_VIEW', st, key, null, `SERVER_ONLY view granted to ${clients.join(', ')}`)
      else if (!rel.invoker && isOverRlsData(ctx, rel.refs)) emit(ctx, 'CLIENT_GRANT_ON_INSECURE_VIEW', st, key, null, 'owner-executed view over RLS-protected data granted to client roles')
      else emit(ctx, 'CLIENT_GRANT_INERT_UNDER_RLS', st, key, null, 'security_invoker view: the caller\'s RLS applies')
      continue
    }
    const cls = tableClass(ctx.registry, q.name)
    if (!cls) { emit(ctx, 'UNCLASSIFIED_TABLE', st, key, null, 'client grant on a table nobody classified'); continue }
    if (cls === 'SERVER_ONLY' || cls === 'INTERNAL_DENY_ALL') {
      emit(ctx, 'CLIENT_GRANT_ON_SERVER_ONLY', st, key, null, `${cls} table granted ${op.privs.join(', ')} to ${clients.join(', ')} — inert under RLS today, one permissive policy from live`)
    } else if (cls === 'INTENTIONALLY_PUBLIC' && op.privs.some(p => p !== 'select')) {
      emit(ctx, 'CLIENT_DML_GRANT_ON_PUBLIC_TABLE', st, key, null, 'a deliberately public table may hold SELECT only')
    } else if (!rel.rls) {
      emit(ctx, 'CLIENT_GRANT_ON_RLS_OFF_TABLE', st, key, null, 'client grant on a table whose RLS is off at this point')
    } else {
      emit(ctx, 'CLIENT_GRANT_INERT_UNDER_RLS', st, key, null, `${cls}: RLS gates every row`)
    }
  }
}

function safeLex(sql: string): Tok[] { try { return lex(sql) } catch { return [] } }

const PLPGSQL_SKIP = ['perform', 'raise', 'return', 'null', 'exit', 'continue', 'get', 'open', 'fetch', 'close', 'assert', 'commit', 'rollback', 'call', 'move']

function indexAtDepth0(toks: Tok[], word: string): number {
  let depth = 0
  for (let k = 0; k < toks.length; k++) {
    if (toks[k].kind === 'lparen') depth++
    else if (toks[k].kind === 'rparen') depth--
    else if (depth === 0 && isWord(toks[k], word)) return k
  }
  return -1
}

/** Strip PL/pgSQL control flow from the front of a statement so the SQL it guards is visible. */
function stripControl(piece: Tok[]): Tok[] {
  let p = piece
  for (let guard = 0; guard < 64 && p.length; guard++) {
    const h = p[0]
    if (h.kind === 'op' && h.text === '<<') { const e = p.findIndex(t => t.kind === 'op' && t.text === '>>'); p = e === -1 ? [] : p.slice(e + 1); continue }
    if (isWord(h, 'declare')) { const b = indexAtDepth0(p, 'begin'); p = b === -1 ? [] : p.slice(b + 1); continue }
    if (isWord(h, 'begin', 'else', 'loop', 'exception')) { p = p.slice(1); continue }
    if (isWord(h, 'end')) return []
    if (isWord(h, 'if', 'elsif', 'elseif', 'when', 'case')) { const e = indexAtDepth0(p, 'then'); p = e === -1 ? [] : p.slice(e + 1); continue }
    if (isWord(h, 'while', 'for', 'foreach')) { const e = indexAtDepth0(p, 'loop'); p = e === -1 ? [] : p.slice(e + 1); continue }
    break
  }
  return p
}

/** EXECUTE 'lit' / EXECUTE format('…%I…', …) / EXECUTE 'a' || x || 'b' → the SQL it runs, or null. */
function resolveExecute(expr: Tok[]): { sql: string; dynamic: boolean; used: Tok[] } | null {
  const cut = indexAtDepth0(expr, 'into')
  const cut2 = indexAtDepth0(expr, 'using')
  const end = [cut, cut2].filter(x => x !== -1).sort((a, b) => a - b)[0] ?? expr.length
  const e = expr.slice(0, end)
  const lit = (t: Tok | undefined) => !!t && (t.kind === 'string' || t.kind === 'dollar')
  if (e.length === 1 && lit(e[0])) return { sql: e[0].value, dynamic: false, used: [e[0]] }
  if (isWord(e[0], 'format') && e[1]?.kind === 'lparen' && lit(e[2])) {
    const fmt = e[2].value.replace(/%(\d+\$)?-?\d*([IsL])/g, (_m, _a, t: string) => (t === 'L' ? `'${DYNAMIC}'` : DYNAMIC)).replace(/%%/g, '%')
    return { sql: fmt, dynamic: true, used: [e[2]] }
  }
  if (e.some(t => t.kind === 'op' && t.text === '||')) {
    const parts: Tok[][] = [[]]
    let depth = 0
    for (const t of e) {
      if (t.kind === 'lparen') depth++
      else if (t.kind === 'rparen') depth--
      if (depth === 0 && t.kind === 'op' && t.text === '||') { parts.push([]); continue }
      parts[parts.length - 1].push(t)
    }
    const used: Tok[] = []
    const sql = parts.map(p => (p.length === 1 && lit(p[0]) ? (used.push(p[0]), p[0].value) : ` ${DYNAMIC} `)).join('')
    if (used.length) return { sql, dynamic: true, used }
  }
  return null
}

/** The SQL a PL/pgSQL body runs: static statements, resolved EXECUTEs, and SQL-shaped literals. */
export function expandPlpgsql(body: string, origin: 'do-block' | 'function-body'): { stmts: Stmt[]; unresolved: Tok[][] } {
  const toks = safeLex(body)
  const stmts: Stmt[] = []
  const unresolved: Tok[][] = []
  const used = new Set<Tok>()
  for (const raw of splitStatements(toks)) {
    const piece = stripControl(raw)
    if (piece.length === 0) continue
    if (isWord(piece[0], 'execute')) {
      const r = resolveExecute(piece.slice(1))
      if (!r) { unresolved.push(piece); continue }
      for (const t of r.used) used.add(t)
      for (const inner of splitStatements(safeLex(r.sql))) stmts.push({ toks: inner, origin: origin === 'do-block' ? 'do-execute' : 'function-body', dynamic: r.dynamic })
      continue
    }
    if (isWord(piece[0], ...PLPGSQL_SKIP)) continue
    if (piece.slice(0, 5).some(t => t.kind === 'op' && t.text === ':=')) continue
    stmts.push({ toks: piece, origin, dynamic: false })
  }
  // A literal can be executed later (v := 'GRANT …'; EXECUTE v): SQL-shaped literals count too.
  for (const t of toks) {
    if ((t.kind !== 'string' && t.kind !== 'dollar') || used.has(t)) continue
    for (const inner of splitStatements(safeLex(t.value))) {
      const op = parseOp(inner)
      if (op && op.k !== 'unparsed' && op.k !== 'do_block' && op.k !== 'function') {
        stmts.push({ toks: inner, origin: origin === 'do-block' ? 'do-literal' : 'function-body', dynamic: false })
      }
    }
  }
  return { stmts, unresolved }
}

// ─── Corpus analysis ────────────────────────────────────────────────────────

export interface AnalysisInput { files: MigrationFile[]; registry: Registry; allowlist: Allowlist; bootstrapSql: string }
export interface Analysis { findings: Finding[]; model: Model; order: string[]; statements: number }

function runFile(model: Model, file: { relPath: string; root: Root | 'bootstrap'; sql: string }, registry: Registry, internal: Set<string>, out: Finding[] | null): number {
  const ctx: Ctx = { registry, internal, model, file, out, createdTables: new Map(), touchedViews: new Map() }
  let toks: Tok[]
  try { toks = lex(file.sql) } catch (e) {
    if (out) out.push({ migration: file.relPath, root: file.root, rule: 'UNPARSED_SECURITY_STATEMENT', category: 'UNKNOWN', blocking: true,
      object: '?', policy: null, fingerprint: 'lex-error', statement: '', detail: `file does not lex: ${(e as Error).message}`, origin: 'statement' })
    return 0
  }
  const stmts = splitStatements(toks)
  for (const s of stmts) {
    const op = parseOp(s)
    if (op) apply(ctx, op, { toks: s, origin: 'statement', dynamic: false })
  }
  // End-of-migration: what the file leaves behind, not the order it did it in.
  for (const [key, st] of ctx.createdTables) {
    const rel = model.rels.get(key)
    if (rel && rel.kind === 'table' && !rel.rls) {
      emit(ctx, 'NEW_TABLE_WITHOUT_RLS', st, key, null, `created without row level security${clientAny(rel) ? ' while Supabase default grants hand it to anon and authenticated' : ''}`)
    }
  }
  for (const [key, st] of ctx.touchedViews) {
    const rel = model.rels.get(key)
    if (!rel || rel.kind === 'table') continue
    if (!rel.invoker && clientSelect(rel) && isOverRlsData(ctx, rel.refs)) {
      emit(ctx, 'VIEW_RLS_BYPASS', st, key, null, `owner-executed view over ${rel.refs.join(', ')} left readable by client roles — base-table RLS is bypassed`)
    } else if (viewClass(registry, rel.name) === 'SERVER_ONLY' && clientAny(rel)) {
      emit(ctx, 'SERVER_ONLY_VIEW_CLIENT_REACHABLE', st, key, null, 'SERVER_ONLY view left with client grants')
    }
  }
  return stmts.length
}

export function analyze(input: AnalysisInput): Analysis {
  const model = new Model()
  const internal = new Set(input.allowlist.internal_schemas.map(s => s.schema))
  runFile(model, { relPath: BOOTSTRAP_FILE, root: 'bootstrap', sql: input.bootstrapSql }, input.registry, internal, null)
  const findings: Finding[] = []
  const files = canonicalOrder(input.files)
  let statements = 0
  for (const f of files) statements += runFile(model, f, input.registry, internal, findings)
  return { findings, model, order: files.map(f => f.relPath), statements }
}

// ─── Allowlist ──────────────────────────────────────────────────────────────

export const matches = (e: AllowEntry, f: Finding): boolean =>
  f.migration === e.migration && f.object === e.table && (f.policy ?? null) === (e.policy ?? null) && f.rule === e.rule && f.fingerprint === e.fingerprint

export interface GateResult { blocking: Finding[]; unexcused: Finding[]; stale: AllowEntry[]; ambiguous: AllowEntry[] }
export function gate(findings: Finding[], allowlist: Allowlist): GateResult {
  const blocking = findings.filter(f => f.blocking)
  return {
    blocking,
    unexcused: blocking.filter(f => !allowlist.exceptions.some(e => matches(e, f))),
    stale: allowlist.exceptions.filter(e => !blocking.some(f => matches(e, f))),
    ambiguous: allowlist.exceptions.filter(e => blocking.filter(f => matches(e, f)).length > 1),
  }
}

const WILDCARD = /[*?%]|\.\*|\[|\]/

/** Is the condition an exception excuses still present at the end of the replayed corpus? */
export function stillOpen(e: AllowEntry, a: Analysis, reg: Registry): boolean {
  const m = a.model
  if (e.rule === 'NEW_TABLE_WITHOUT_RLS') { const r = m.rels.get(e.table); return !!r && !r.rls }
  if (['PUBLIC_POLICY_CALLER_INDEPENDENT', 'PUBLIC_POLICY_WRITE_EXTENSION', 'AUTH_POLICY_CROSS_TENANT', 'AUTH_POLICY_CROSS_TENANT_WRITE', 'CLIENT_POLICY_ON_SERVER_ONLY'].includes(e.rule)) {
    const p = e.policy ? m.pols.get(polKey(e.table, e.policy)) : undefined
    return !!p && evaluatePolicy(reg, p).some(r => r.rule === e.rule)
  }
  if (['VIEW_RLS_BYPASS', 'SERVER_ONLY_VIEW_CLIENT_REACHABLE', 'CLIENT_GRANT_ON_INSECURE_VIEW', 'CLIENT_GRANT_ON_SERVER_ONLY_VIEW', 'VIEW_SECURITY_INVOKER_DISABLED'].includes(e.rule)) {
    const v = m.rels.get(e.table)
    return !!v && (!v.invoker || (viewClass(reg, v.name) === 'SERVER_ONLY' && clientAny(v)))
  }
  if (e.rule === 'CLIENT_GRANT_ON_SERVER_ONLY' || e.rule === 'CLIENT_GRANT_ON_RLS_OFF_TABLE') { const r = m.rels.get(e.table); return !!r && clientAny(r) }
  return true
}

/** Everything wrong with the allowlist itself. An empty list means it is safe to trust. */
export function allowlistProblems(al: Allowlist, a: Analysis, reg: Registry, repoRoot: string): string[] {
  const p: string[] = []
  const seen = new Set<string>()
  const pos = (f: string) => a.order.indexOf(f)
  for (const s of al.internal_schemas) {
    if (!s.schema || WILDCARD.test(s.schema)) p.push(`internal schema entry ${JSON.stringify(s.schema)} is empty or a wildcard`)
    if (s.schema === 'public') p.push('public can never be an internal schema')
    if (s.exposed_via_data_api !== false) p.push(`${s.schema}: an exposed schema cannot be treated as internal`)
    if (!s.justification || s.justification.length < 30) p.push(`${s.schema}: justification missing`)
  }
  for (const e of al.exceptions) {
    const id = `${e.migration} :: ${e.table} :: ${e.policy ?? '-'} :: ${e.rule}`
    for (const [k, v] of [['migration', e.migration], ['table', e.table], ['policy', e.policy ?? ''], ['rule', e.rule]] as const) {
      if (WILDCARD.test(v)) p.push(`${id}: ${k} contains a wildcard`)
    }
    if (!e.migration || !e.table || !e.rule || !e.fingerprint || !e.status || !e.justification) p.push(`${id}: a required field is empty`)
    if (!(e.rule in RULES)) p.push(`${id}: unknown rule`)
    else if (!isBlocking(e.rule)) p.push(`${id}: excuses a non-blocking rule — nothing to waive`)
    if (!/^[0-9a-f]{16}$/.test(e.fingerprint)) p.push(`${id}: fingerprint is not a 16-hex statement hash`)
    if (!existsSync(join(repoRoot, e.migration))) p.push(`${id}: migration file does not exist`)
    if (pos(e.migration) === -1) p.push(`${id}: migration is not in the scanned corpus`)
    if (!/^[a-z_][a-z0-9_]*\.[^.]+$/.test(e.table)) p.push(`${id}: table must be schema-qualified`)
    if (e.justification.length < 60) p.push(`${id}: justification too thin to review`)
    if (seen.has(id)) p.push(`${id}: duplicate entry`)
    seen.add(id)
    if (e.status === 'HISTORICAL_SUPERSEDED') {
      if (!e.superseded_by || pos(e.superseded_by) === -1) p.push(`${id}: superseded_by is missing or not a scanned migration`)
      else if (pos(e.superseded_by) <= pos(e.migration)) p.push(`${id}: superseded_by must come after the migration it supersedes`)
      if (stillOpen(e, a, reg)) p.push(`${id}: marked superseded, but the condition is still present at the end of the corpus`)
    } else if (e.status === 'CURRENT_INTENTIONAL') {
      if (!stillOpen(e, a, reg)) p.push(`${id}: marked current, but the condition no longer exists — the entry is stale`)
    } else p.push(`${id}: unknown status`)
  }
  return p
}
