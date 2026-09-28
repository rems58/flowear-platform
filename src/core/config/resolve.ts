import { DEFAULTS } from './defaults'
import { appConfigSchema, appSettingSchema, type AppConfig, type AppSetting } from './schema'
import type { AppDefinition } from '@/apps/types'

type Plain = Record<string, unknown>

const isPlain = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Fusion profonde : les objets se fusionnent, tout le reste (tableaux compris) se remplace. */
export function deepMerge<T extends Plain>(base: T, patch: Plain | undefined): T {
  if (!patch) return base
  const out: Plain = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = out[key]
    out[key] = isPlain(current) && isPlain(value) ? deepMerge(current, value) : value
  }
  return out as T
}

/** Pose une valeur à un chemin pointé (« agent.maxSteps ») sans toucher au reste. */
export function setPath(target: Plain, path: string, value: unknown): Plain {
  const keys = path.split('.')
  const out: Plain = { ...target }
  let cursor: Plain = out
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    const next = cursor[k]
    cursor[k] = isPlain(next) ? { ...next } : {}
    cursor = cursor[k] as Plain
  }
  cursor[keys[keys.length - 1]] = value
  return out
}

/** Les clés que l'admin peut poser à chaud. Tout le reste est refusé (pas de surprise en prod). */
export const SETTABLE_KEY_PREFIXES = [
  'models.',
  'agent.',
  'plans.',
  'costGuard.',
  'trial.',
  'offers.',
  'ads.',
  'rateLimits.',
  'tools.disabled',
  'tools.overrides.',
  'defaultLocale',
]

export function isSettableKey(key: string): boolean {
  return SETTABLE_KEY_PREFIXES.some((p) => (p.endsWith('.') ? key.startsWith(p) : key === p))
}

function appliesTo(setting: AppSetting, slug: string): boolean {
  return setting.scope === 'all' || setting.scope.includes(slug)
}

/**
 * Résout la configuration d'une app.
 * Ordre : DEFAULTS → manifeste.config → réglages « all » → réglages ciblés.
 * `tools.disabled` s'accumule (union) au lieu de se remplacer : désactiver un tool
 * partout puis un autre sur une seule IA doit donner les deux.
 * Résultat validé par Zod : une config invalide lève, elle ne passe jamais en prod.
 */
export function resolveConfig(app: AppDefinition, settings: AppSetting[] = []): AppConfig {
  let cfg: Plain = deepMerge({ ...DEFAULTS, slug: app.slug } as Plain, app.config as Plain | undefined)
  cfg = deepMerge(cfg, {
    tools: {
      enabled: [...app.tools.enabled],
      disabled: [...DEFAULTS.tools.disabled],
      overrides: { ...DEFAULTS.tools.overrides, ...(app.tools.overrides ?? {}) },
    },
  })
  if (app.plans) cfg = deepMerge(cfg, { plans: app.plans as Plain })

  const ordered = settings
    .map((s) => appSettingSchema.parse(s))
    .filter((s) => appliesTo(s, app.slug) && isSettableKey(s.key))
    .sort((a, b) => (a.scope === 'all' ? 0 : 1) - (b.scope === 'all' ? 0 : 1))

  for (const s of ordered) {
    if (s.key === 'tools.disabled') {
      const current = ((cfg.tools as Plain).disabled as string[]) ?? []
      const extra = Array.isArray(s.value) ? s.value.filter((v) => typeof v === 'string') : []
      cfg = setPath(cfg, 'tools.disabled', Array.from(new Set([...current, ...extra])))
    } else {
      cfg = setPath(cfg, s.key, s.value)
    }
  }

  const tools = cfg.tools as { enabled: string[]; disabled: string[] }
  cfg = setPath(
    cfg,
    'tools.enabled',
    tools.enabled.filter((t) => !tools.disabled.includes(t))
  )

  return appConfigSchema.parse(cfg)
}
