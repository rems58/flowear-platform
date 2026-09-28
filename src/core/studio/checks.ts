import { z } from 'zod'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'
import { appManifestSchema, type AppManifestInput } from '@/apps/types'
import type { CreatorKnowledgeFile } from '@/core/data/types'
import { isReservedSlug } from '@/core/apps/reserved'
import { CREATOR_TOOL_ALLOWLIST } from './manifest'
import { FORBIDDEN_WORDS, INJECTION_PATTERNS } from './forbidden'

/** Les douze règles sans réseau, puis les deux du scénario en bac à sable (`scenario.ts`). */
export const CHECK_NAMES = ['schema', 'slug_reserved', 'locales', 'persona_length', 'no_numbers_in_examples', 'injection', 'claims', 'helplines', 'urls', 'tools_allowlist', 'knowledge_size', 'assessment_source', 'scenario', 'cost_probe'] as const
export type CheckName = (typeof CHECK_NAMES)[number]

export interface CheckResult {
  check: CheckName
  ok: boolean
  /** Motif en français, lu par l'admin et affiché au créateur (traduction par `check` côté client). */
  detail: string | null
}

export interface CheckInput {
  manifest: AppManifestInput
  knowledge: CreatorKnowledgeFile[]
  /** Hôtes autorisés en plus de flowear.app : le site déclaré par le créateur. */
  allowedHosts?: string[]
}

export const PERSONA_MIN = 200
export const PERSONA_MAX = 6000
export const KNOWLEDGE_MAX_FILES = 20
export const KNOWLEDGE_MAX_BYTES = 200_000
export const ALWAYS_ALLOWED_HOSTS = ['flowear.app', 'www.flowear.app'] as const

type Plain = Record<string, unknown>
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Champs de texte visibles, dans tout le manifeste, à servir dans chaque langue. */
const LOCALIZED_KEYS = new Set(['name', 'tagline', 'pitch', 'description', 'intro', 'label', 'prompt', 'result', 'disclaimer', 'placeholder'])
/** Champs de texte libre lus par le modèle ou la personne, en plus des champs localisés. */
const TEXT_KEYS = new Set([...LOCALIZED_KEYS, 'system', 'tone', 'boundaries'])
/** Champs où une promesse compte. Les avertissements et les intros de questionnaire (« pas un diagnostic ») en sont exclus. */
const CLAIM_KEYS = new Set(['system', 'tagline', 'pitch', 'description', 'prompt', 'label', 'result'])
/** Le nom d'une IA est une marque : la même chaîne dans toutes les langues est acceptée. */
const BRAND_KEYS = new Set(['name'])
const HEX_COLOR = /^#[0-9a-f]{6}$/i

function walk(value: unknown, path: string[], visit: (key: string, value: unknown, path: string[]) => void): void {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, [...path, String(i)], visit))
  else if (isPlain(value)) for (const [k, v] of Object.entries(value)) {
    visit(k, v, [...path, k])
    walk(v, [...path, k], visit)
  }
}

/** Tous les textes d'un manifeste, avec leur clé et leur chemin. */
function texts(manifest: AppManifestInput): { key: string; path: string; text: string }[] {
  const out: { key: string; path: string; text: string }[] = []
  walk(manifest, [], (key, value, path) => {
    const named = [...path].reverse().find((seg) => !/^\d+$/.test(seg)) ?? key
    if (typeof value === 'string') {
      if (TEXT_KEYS.has(named) && !HEX_COLOR.test(value)) out.push({ key: named, path: path.join('.'), text: value })
    } else if (isPlain(value) && LOCALIZED_KEYS.has(key)) {
      for (const [loc, t] of Object.entries(value)) if (typeof t === 'string') out.push({ key, path: [...path, loc].join('.'), text: t })
    }
  })
  // Un objet localisé produit ses feuilles deux fois (clé puis langue) : on garde la version par langue.
  return out.filter((t, i, all) => !(LOCALIZED_KEYS.has(t.key) && all.some((o) => o !== t && o.path.startsWith(t.path + '.'))))
}

const wordRe = (word: string) => new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'iu')

function checkSchema(m: AppManifestInput): CheckResult {
  const parsed = appManifestSchema.safeParse(m)
  if (parsed.success) return { check: 'schema', ok: true, detail: null }
  const first = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
  return { check: 'schema', ok: false, detail: first.join(' ; ') }
}

function checkSlug(m: AppManifestInput): CheckResult {
  const slug = typeof m.slug === 'string' ? m.slug : ''
  if (!/^[a-z0-9-]{2,32}$/.test(slug)) return { check: 'slug_reserved', ok: false, detail: 'Slug mal formé (2 à 32 caractères, minuscules, chiffres, tirets).' }
  if (isReservedSlug(slug)) return { check: 'slug_reserved', ok: false, detail: `Le slug « ${slug} » est réservé.` }
  return { check: 'slug_reserved', ok: true, detail: null }
}

function checkLocales(m: AppManifestInput): CheckResult {
  const wanted = Array.isArray(m.locales) && m.locales.length ? m.locales : [...SUPPORTED_LOCALES]
  const missing: string[] = []
  walk(m, [], (key, value, path) => {
    if (!LOCALIZED_KEYS.has(key)) return
    if (typeof value === 'string') {
      if (!BRAND_KEYS.has(key) && !(wanted.length === 1 && wanted[0] === 'en')) missing.push(`${path.join('.')} (${wanted.filter((l) => l !== 'en').join(', ')})`)
      return
    }
    if (!isPlain(value)) return
    const absent = wanted.filter((l) => typeof value[l] !== 'string' || !(value[l] as string).trim())
    if (absent.length) missing.push(`${path.join('.')} (${absent.join(', ')})`)
  })
  return missing.length ? { check: 'locales', ok: false, detail: `Langues manquantes : ${missing.slice(0, 5).join(' ; ')}${missing.length > 5 ? '…' : ''}` } : { check: 'locales', ok: true, detail: null }
}

function checkPersonaLength(m: AppManifestInput): CheckResult {
  const n = (m.persona?.system ?? '').length
  if (n < PERSONA_MIN) return { check: 'persona_length', ok: false, detail: `Persona trop courte : ${n} caractères, minimum ${PERSONA_MIN}.` }
  if (n > PERSONA_MAX) return { check: 'persona_length', ok: false, detail: `Persona trop longue : ${n} caractères, maximum ${PERSONA_MAX}.` }
  return { check: 'persona_length', ok: true, detail: null }
}

/** Exemples de phrases : ce qui est entre guillemets dans la persona. Le modèle les recopie, chiffres et prénoms compris. */
function checkExamples(m: AppManifestInput): CheckResult {
  const system = m.persona?.system ?? ''
  const quotes = [...system.matchAll(/«\s*([^»]{3,})\s*»|"([^"\n]{3,})"|“([^”\n]{3,})”/g)].map((x) => (x[1] ?? x[2] ?? x[3]).trim())
  const bad: string[] = []
  for (const q of quotes) {
    if (/\d/.test(q)) bad.push(q)
    else {
      const words = q.split(/\s+/)
      // Une majuscule après le premier mot = un nom propre (ou un sigle) que le modèle réutilisera.
      if (words.slice(1).some((w) => /^[A-ZÀ-Ý][a-zà-ÿ]{2,}/.test(w.replace(/^[«"'(]+/, '')))) bad.push(q)
    }
  }
  return bad.length ? { check: 'no_numbers_in_examples', ok: false, detail: `Exemples avec un chiffre ou un nom propre : ${bad.slice(0, 3).map((b) => `« ${b} »`).join(', ')}` } : { check: 'no_numbers_in_examples', ok: true, detail: null }
}

function checkInjection(m: AppManifestInput, knowledge: CreatorKnowledgeFile[]): CheckResult {
  const sources = [...texts(m).map((t) => ({ where: t.path, text: t.text })), ...knowledge.map((k) => ({ where: `connaissances/${k.name}`, text: k.markdown }))]
  for (const s of sources) for (const re of INJECTION_PATTERNS) {
    const hit = s.text.match(re)
    if (hit) return { check: 'injection', ok: false, detail: `Motif interdit dans ${s.where} : « ${hit[0].slice(0, 60)} »` }
  }
  return { check: 'injection', ok: true, detail: null }
}

function checkClaims(m: AppManifestInput, knowledge: CreatorKnowledgeFile[]): CheckResult {
  const sources = [...texts(m).filter((t) => CLAIM_KEYS.has(t.key)).map((t) => ({ where: t.path, text: t.text })), ...knowledge.map((k) => ({ where: `connaissances/${k.name}`, text: k.markdown }))]
  const words = Object.values(FORBIDDEN_WORDS).flat()
  for (const s of sources) for (const w of words) {
    if (wordRe(w).test(s.text)) return { check: 'claims', ok: false, detail: `Mot interdit « ${w} » dans ${s.where}.` }
  }
  return { check: 'claims', ok: true, detail: null }
}

const PHONE_STRICT = /(?:\+\d{1,3}[\s.-]?)?(?:\(?0\d\)?[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){2,4}/
const DIGIT_RUN = /\d[\d\s.-]*\d/

function checkHelplines(m: AppManifestInput, knowledge: CreatorKnowledgeFile[]): CheckResult {
  // Persona, suggestions, onboarding, questionnaires : aucun nombre de 3 chiffres ou plus (un numéro
  // court comme 3114 ou 112 y ressemble). Connaissances : formats de téléphone seulement, les années
  // et les statistiques y sont légitimes.
  for (const t of texts(m)) {
    const run = t.text.match(DIGIT_RUN)
    if (run && run[0].replace(/\D/g, '').length >= 3) return { check: 'helplines', ok: false, detail: `Nombre « ${run[0].trim()} » dans ${t.path} : les numéros d'aide viennent de la base, jamais du texte.` }
  }
  for (const k of knowledge) {
    const hit = k.markdown.match(PHONE_STRICT)
    if (hit && hit[0].replace(/\D/g, '').length >= 8) return { check: 'helplines', ok: false, detail: `Numéro de téléphone « ${hit[0].trim()} » dans connaissances/${k.name}.` }
  }
  return { check: 'helplines', ok: true, detail: null }
}

const URL_RE = /\b(?:https?:\/\/|www\.)([a-z0-9.-]+\.[a-z]{2,})(?:[/?#][^\s)»"']*)?|\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fr|app|io|net|org|co|eu|de|es|it|me|ai|be|ch))\b(?:\/[^\s)»"']*)?/gi

function checkUrls(m: AppManifestInput, knowledge: CreatorKnowledgeFile[], allowedHosts: string[]): CheckResult {
  const allowed = new Set([...ALWAYS_ALLOWED_HOSTS, ...allowedHosts.map((h) => h.toLowerCase().replace(/^www\./, ''))])
  const sources = [...texts(m).map((t) => ({ where: t.path, text: t.text })), ...knowledge.map((k) => ({ where: `connaissances/${k.name}`, text: k.markdown }))]
  for (const s of sources) for (const hit of s.text.matchAll(URL_RE)) {
    const host = (hit[1] ?? hit[2] ?? '').toLowerCase().replace(/^www\./, '')
    if (host && !allowed.has(host)) return { check: 'urls', ok: false, detail: `Adresse hors liste blanche « ${hit[0].slice(0, 60)} » dans ${s.where}.` }
  }
  return { check: 'urls', ok: true, detail: null }
}

function checkTools(m: AppManifestInput): CheckResult {
  const allow = new Set<string>(CREATOR_TOOL_ALLOWLIST)
  const enabled = Array.isArray(m.tools?.enabled) ? m.tools.enabled : []
  const outside = enabled.filter((t) => !allow.has(t))
  if (outside.length) return { check: 'tools_allowlist', ok: false, detail: `Outils hors catalogue créateur : ${outside.join(', ')}.` }
  if (m.tools?.overrides && Object.keys(m.tools.overrides).length) return { check: 'tools_allowlist', ok: false, detail: 'Les surcharges d’outils (quota, plan) sont posées par Flowear, pas par le manifeste.' }
  return { check: 'tools_allowlist', ok: true, detail: null }
}

const HTML_RE = /<\s*(script|iframe|img|object|embed|style|link|svg|video|audio|form|input)\b|<\s*\/?\s*[a-z][a-z0-9-]*\s*>|data:[a-z]+\/[a-z0-9.+-]+;base64/i

function checkKnowledge(knowledge: CreatorKnowledgeFile[]): CheckResult {
  if (knowledge.length > KNOWLEDGE_MAX_FILES) return { check: 'knowledge_size', ok: false, detail: `${knowledge.length} fichiers, maximum ${KNOWLEDGE_MAX_FILES}.` }
  const bytes = knowledge.reduce((n, k) => n + new TextEncoder().encode(k.markdown).length, 0)
  if (bytes > KNOWLEDGE_MAX_BYTES) return { check: 'knowledge_size', ok: false, detail: `${Math.round(bytes / 1000)} Ko au total, maximum ${KNOWLEDGE_MAX_BYTES / 1000} Ko.` }
  for (const k of knowledge) {
    if (!/^[a-z0-9-]{1,40}$/.test(k.name)) return { check: 'knowledge_size', ok: false, detail: `Nom de fichier « ${k.name.slice(0, 40)} » : minuscules, chiffres et tirets seulement.` }
    const hit = k.markdown.match(HTML_RE)
    if (hit) return { check: 'knowledge_size', ok: false, detail: `HTML ou contenu encodé dans connaissances/${k.name} (« ${hit[0].slice(0, 30)} ») : Markdown seul.` }
  }
  return { check: 'knowledge_size', ok: true, detail: null }
}

const assessmentSourceSchema = z.array(z.object({ id: z.string().optional(), source: z.string().min(1).max(200).optional() }).loose())

function checkAssessments(m: AppManifestInput): CheckResult {
  const parsed = assessmentSourceSchema.safeParse(m.assessments ?? [])
  if (!parsed.success) return { check: 'assessment_source', ok: false, detail: 'Questionnaires illisibles.' }
  const missing = parsed.data.filter((a) => !a.source?.trim()).map((a) => a.id ?? '?')
  return missing.length ? { check: 'assessment_source', ok: false, detail: `Questionnaire sans instrument source : ${missing.join(', ')}.` } : { check: 'assessment_source', ok: true, detail: null }
}

/**
 * Les règles que la base impose déjà à Amorce, rendues exécutables sur un manifeste créateur.
 * Chaque règle rend son verdict indépendamment : un manifeste cassé reçoit toute la liste, pas
 * seulement la première erreur. Sans appel réseau ; le scénario en bac à sable est à part.
 */
export function runManifestChecks(input: CheckInput): CheckResult[] {
  const m = input.manifest
  const knowledge = input.knowledge ?? []
  const hosts = input.allowedHosts ?? []
  const safe = (check: CheckName, fn: () => CheckResult): CheckResult => {
    try {
      return fn()
    } catch (error) {
      return { check, ok: false, detail: `Vérification impossible : ${error instanceof Error ? error.message.slice(0, 120) : 'erreur'}` }
    }
  }
  return [
    safe('schema', () => checkSchema(m)),
    safe('slug_reserved', () => checkSlug(m)),
    safe('locales', () => checkLocales(m)),
    safe('persona_length', () => checkPersonaLength(m)),
    safe('no_numbers_in_examples', () => checkExamples(m)),
    safe('injection', () => checkInjection(m, knowledge)),
    safe('claims', () => checkClaims(m, knowledge)),
    safe('helplines', () => checkHelplines(m, knowledge)),
    safe('urls', () => checkUrls(m, knowledge, hosts)),
    safe('tools_allowlist', () => checkTools(m)),
    safe('knowledge_size', () => checkKnowledge(knowledge)),
    safe('assessment_source', () => checkAssessments(m)),
  ]
}

export function checksPass(results: CheckResult[]): boolean {
  return results.every((r) => r.ok)
}
