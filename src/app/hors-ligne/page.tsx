import type { Metadata } from 'next'
import { FlowearLogo } from '@/components/flowear-logo'
import { getI18n } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return { title: t.pwa.offlineTitle }
}

/**
 * Page d'attente hors ligne. Le service worker la met en cache à son installation et la
 * sert quand une navigation échoue, faute de réseau.
 *
 * Elle est la seule page qui doit tenir sans rien d'autre qu'elle-même : hors ligne, ni la
 * feuille de styles ni le bundle JavaScript ne sont disponibles. D'où les styles en ligne
 * (police système, couleurs des deux thèmes) et un script natif pour le bouton. La classe
 * `dark` est posée par le script de thème du layout, qui est lui aussi en ligne.
 *
 * Elle est rendue côté serveur comme les autres : la copie mise en cache l'est donc dans la
 * langue de la personne au moment de l'installation. Le ton est celui du reste : on rassure
 * sur ce qui est conservé plutôt que d'afficher une erreur technique.
 */
export default async function OfflinePage() {
  const { t } = await getI18n()
  return (
    <main className="fw-offline">
      <style dangerouslySetInnerHTML={{ __html: OFFLINE_STYLE }} />
      <div className="fw-offline-card">
        <div className="fw-offline-logo">
          <FlowearLogo size={56} />
        </div>
        <h1>
          <span className="fw-offline-dot" aria-hidden />
          {t.pwa.offlineTitle}
        </h1>
        <p>{t.pwa.offlineBody}</p>
        <button type="button" id="fw-offline-retry" className="fw-offline-button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {t.pwa.retry}
        </button>
        <p className="fw-offline-hint">{t.pwa.offlineAuto}</p>
      </div>
      <script dangerouslySetInnerHTML={{ __html: OFFLINE_SCRIPT }} />
    </main>
  )
}

/** Même palette que globals.css (fond gris doux, carte blanche, noir profond en sombre), sans en dépendre. */
const OFFLINE_STYLE = `
.fw-offline{--bg:#f5f5f7;--card:#fff;--fg:#1d1d1f;--muted:#6e6e73;--line:rgba(0,0,0,.06);--accent:#5E5CE6;--accent-fg:#fff;
  position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);
  font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;text-align:center}
.dark .fw-offline{--bg:#000;--card:#1c1c1e;--fg:#f5f5f7;--muted:#98989d;--line:rgba(255,255,255,.08)}
.fw-offline-card{width:100%;max-width:400px;padding:40px 28px 32px;border-radius:28px;background:var(--card);border:1px solid var(--line);box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 40px -16px rgba(0,0,0,.18);display:flex;flex-direction:column;align-items:center;gap:12px}
.fw-offline-logo{margin-bottom:6px;filter:drop-shadow(0 8px 20px rgba(94,92,230,.35))}
.fw-offline-dot{display:inline-block;width:9px;height:9px;margin-right:10px;vertical-align:middle;position:relative;top:-2px;border-radius:999px;background:#ff9f0a;animation:fw-pulse 1.6s ease-in-out infinite}
.fw-offline-dot.is-online{background:#30d158;animation:none}
.fw-offline h1{margin:4px 0 0;font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.2}
.fw-offline p{margin:0;font-size:15px;line-height:1.55;color:var(--muted);max-width:32ch}
.fw-offline-button{margin-top:14px;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 22px;border:0;border-radius:999px;background:var(--accent);color:var(--accent-fg);font:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .2s}
.fw-offline-button:hover{opacity:.9}.fw-offline-button:active{transform:scale(.98)}
.fw-offline-button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.fw-offline-button svg{transition:transform .5s}.fw-offline-button.is-busy svg{animation:fw-spin .8s linear infinite}
.fw-offline-hint{font-size:13px!important;color:var(--muted);margin-top:2px!important}
@keyframes fw-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes fw-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.fw-offline-dot,.fw-offline-button svg{animation:none!important}.fw-offline-button{transition:none}}
`

/**
 * Sans le bundle, il faut un script natif : le bouton rejoue la requête d'origine, et le
 * retour du réseau relance tout seul, sans attendre le clic.
 */
const OFFLINE_SCRIPT = `(function(){var b=document.getElementById('fw-offline-retry');var d=document.querySelector('.fw-offline-dot');function go(){if(b){b.classList.add('is-busy');b.disabled=true}location.reload()}if(b)b.addEventListener('click',go);addEventListener('online',function(){if(d)d.classList.add('is-online');setTimeout(go,600)})})()`
