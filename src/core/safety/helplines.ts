import type { Locale } from '@/core/i18n/locale'

/**
 * Numéros d'aide en cas de détresse, par pays. Écrits ici, jamais par le modèle : un numéro
 * inventé dans ce contexte est le pire défaut possible. Le pays vient du fuseau horaire du
 * navigateur (le plus fiable que l'on ait sans demander), à défaut de la langue.
 *
 * Sources : 3114.fr, 988lifeline.org, samaritans.org, telefono024 (Ministerio de Sanidad),
 * cvv.org.br, telefonseelsorge.de, 113.nl, lifeline.org.au, findahelpline.com. À revérifier
 * une fois par an (date en bas).
 */
export interface Helpline {
  /** Code pays ISO, ou 'XX' pour la fiche internationale. */
  country: string
  lines: { name: string; number: string; hours?: string }[]
  /** Numéro d'urgence générale du pays. */
  emergency: string
  /** Annuaire mondial, toujours présent en dernier recours. */
  directory: string
}

const DIRECTORY = 'https://findahelpline.com'

const BY_COUNTRY: Record<string, Omit<Helpline, 'country' | 'directory'>> = {
  FR: { lines: [{ name: '3114, numéro national de prévention du suicide', number: '3114', hours: '24h/24, gratuit' }], emergency: '15 ou 112' },
  BE: { lines: [{ name: 'Centre de prévention du suicide', number: '0800 32 123', hours: '24h/24, gratuit' }, { name: 'Zelfmoordlijn (NL)', number: '1813' }], emergency: '112' },
  CH: { lines: [{ name: 'La Main Tendue', number: '143', hours: '24h/24' }], emergency: '144 ou 112' },
  LU: { lines: [{ name: 'SOS Détresse', number: '45 45 45' }], emergency: '112' },
  CA: { lines: [{ name: 'Ligne d’aide en cas de crise / Suicide Crisis Helpline', number: '988', hours: '24/7' }], emergency: '911' },
  US: { lines: [{ name: '988 Suicide & Crisis Lifeline', number: '988', hours: '24/7, call or text' }], emergency: '911' },
  GB: { lines: [{ name: 'Samaritans', number: '116 123', hours: '24/7, free' }], emergency: '999 or 112' },
  IE: { lines: [{ name: 'Samaritans', number: '116 123', hours: '24/7, free' }], emergency: '112 or 999' },
  AU: { lines: [{ name: 'Lifeline', number: '13 11 14', hours: '24/7' }], emergency: '000' },
  NZ: { lines: [{ name: 'Need to talk?', number: '1737', hours: '24/7, call or text' }], emergency: '111' },
  IN: { lines: [{ name: 'Kiran', number: '1800-599-0019', hours: '24/7' }], emergency: '112' },
  ES: { lines: [{ name: 'Línea 024 de atención a la conducta suicida', number: '024', hours: '24 h, gratuita' }], emergency: '112' },
  MX: { lines: [{ name: 'Línea de la Vida', number: '800 911 2000', hours: '24 h' }], emergency: '911' },
  AR: { lines: [{ name: 'Centro de Asistencia al Suicida', number: '135', hours: 'CABA y GBA' }, { name: 'Línea nacional', number: '0800 345 1435' }], emergency: '911' },
  CL: { lines: [{ name: 'Línea de prevención del suicidio', number: '*4141', hours: '24 h' }], emergency: '131' },
  CO: { lines: [{ name: 'Línea 106', number: '106', hours: '24 h' }], emergency: '123' },
  PE: { lines: [{ name: 'Línea 113, opción 5', number: '113' }], emergency: '105' },
  PT: { lines: [{ name: 'SOS Voz Amiga', number: '213 544 545', hours: '16h às 24h' }], emergency: '112' },
  BR: { lines: [{ name: 'CVV, Centro de Valorização da Vida', number: '188', hours: '24 h, gratuito' }], emergency: '192 ou 190' },
  DE: { lines: [{ name: 'Telefonseelsorge', number: '0800 111 0 111', hours: 'rund um die Uhr, kostenlos' }], emergency: '112' },
  AT: { lines: [{ name: 'Telefonseelsorge', number: '142', hours: 'rund um die Uhr' }], emergency: '144 oder 112' },
  IT: { lines: [{ name: 'Telefono Amico Italia', number: '02 2327 2327', hours: '10–24' }], emergency: '112' },
  NL: { lines: [{ name: '113 Zelfmoordpreventie', number: '113', hours: '24/7' }, { name: 'Gratis', number: '0800-0113' }], emergency: '112' },
}

/** Fuseau IANA → pays. Les préfixes de région couvrent les fuseaux multiples (Brésil, Argentine, Australie). */
const TZ_EXACT: Record<string, string> = {
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'Europe/Luxembourg': 'LU', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Lisbon': 'PT', 'Atlantic/Azores': 'PT', 'Atlantic/Madeira': 'PT',
  'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE', 'Europe/Vienna': 'AT', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL',
  'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Monterrey': 'MX', 'America/Tijuana': 'MX', 'America/Chihuahua': 'MX', 'America/Hermosillo': 'MX', 'America/Merida': 'MX', 'America/Mazatlan': 'MX', 'America/Matamoros': 'MX', 'America/Ojinaga': 'MX', 'America/Bahia_Banderas': 'MX',
  'America/Santiago': 'CL', 'America/Punta_Arenas': 'CL', 'Pacific/Easter': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'America/Toronto': 'CA', 'America/Montreal': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA', 'America/Regina': 'CA', 'America/Moncton': 'CA', 'America/Whitehorse': 'CA', 'America/Yellowknife': 'CA', 'America/Iqaluit': 'CA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'America/Detroit': 'US', 'America/Boise': 'US', 'America/Juneau': 'US', 'Pacific/Honolulu': 'US',
  'America/Sao_Paulo': 'BR', 'America/Manaus': 'BR', 'America/Recife': 'BR', 'America/Fortaleza': 'BR', 'America/Bahia': 'BR', 'America/Belem': 'BR', 'America/Cuiaba': 'BR', 'America/Porto_Velho': 'BR', 'America/Boa_Vista': 'BR', 'America/Rio_Branco': 'BR', 'America/Noronha': 'BR', 'America/Maceio': 'BR', 'America/Araguaina': 'BR', 'America/Santarem': 'BR', 'America/Campo_Grande': 'BR', 'America/Eirunepe': 'BR',
  'Pacific/Auckland': 'NZ', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
}
const TZ_PREFIX: [string, string][] = [
  ['America/Argentina/', 'AR'],
  ['America/Indiana/', 'US'],
  ['America/Kentucky/', 'US'],
  ['America/North_Dakota/', 'US'],
  ['Australia/', 'AU'],
]

const LOCALE_DEFAULT: Record<Locale, string> = { fr: 'FR', en: 'US', es: 'ES', de: 'DE', it: 'IT' }

export function countryFromTimezone(timezone: string | undefined): string | null {
  if (!timezone) return null
  if (TZ_EXACT[timezone]) return TZ_EXACT[timezone]
  const hit = TZ_PREFIX.find(([prefix]) => timezone.startsWith(prefix))
  return hit ? hit[1] : null
}

/** La fiche d'aide pour cette personne : son pays si on le connaît et qu'on a un numéro, sinon celui de sa langue, sinon l'annuaire mondial. */
export function helplineFor(timezone: string | undefined, locale: Locale): Helpline {
  const country = countryFromTimezone(timezone)
  const code = country && BY_COUNTRY[country] ? country : (LOCALE_DEFAULT[locale] ?? 'XX')
  const entry = BY_COUNTRY[code]
  if (!entry) return { country: 'XX', lines: [], emergency: '112', directory: DIRECTORY }
  return { country: code, ...entry, directory: DIRECTORY }
}

/** Dernière vérification des numéros : 18 septembre 2026. */
export const HELPLINES_CHECKED_ON = '2026-09-18'
