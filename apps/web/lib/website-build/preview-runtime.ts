import type { WebsiteArtifact } from './types'

// All executable code is owned here. Model output is only inert markup/style and
// a validated behavior graph. No eval, model JavaScript, or network capability.
export const WEBSITE_RUNTIME = String.raw`(() => {
  const config = JSON.parse(document.getElementById('__atlas_config').textContent);
  for (const behavior of config.behaviors) {
    const trigger = document.getElementById(behavior.triggerId);
    const targets = behavior.targetIds.map(id => document.getElementById(id));
    trigger.addEventListener('click', () => {
      const expanded = trigger.getAttribute('aria-expanded') !== 'true';
      for (const target of targets) target.hidden = !expanded;
      trigger.setAttribute('aria-expanded', String(expanded));
      if (behavior.kind === 'tabs') {
        for (const sibling of config.behaviors.filter(b => b.kind === 'tabs' && b.triggerId !== behavior.triggerId)) {
          for (const id of sibling.targetIds) document.getElementById(id).hidden = true;
          document.getElementById(sibling.triggerId).setAttribute('aria-selected', 'false');
        }
        for (const target of targets) target.hidden = false;
        trigger.setAttribute('aria-selected', 'true');
      }
    });
  }
  for (const form of document.querySelectorAll('form')) form.addEventListener('submit', e => e.preventDefault());
  if (config.preview) {
    document.addEventListener('click', event => {
      const link = event.target.closest && event.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (href.startsWith('#')) return;
      event.preventDefault();
      const key = href.split('#')[0].replace(/\.html$/, '');
      if (config.pages.includes(key)) parent.postMessage({ type: 'atlas-preview-page', token: config.preview.token, artifactHash: config.preview.artifactHash, pageKey: key }, '*');
    });
  }
})();`

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
export function websiteCsp(scriptSource: string): string {
  return `default-src 'none'; script-src ${scriptSource}; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`
}

/** Client-safe renderer; callers receive artifacts only through the authorized API. */
export function renderPreviewDocument(artifact: WebsiteArtifact, pageKey: string, channelToken: string): string {
  const page = artifact.pages.find(p => p.key === pageKey)
  if (!page) throw new Error('PREVIEW_PAGE_NOT_FOUND')
  const match = page.html.match(/<script type="application\/json" id="__atlas_config">([\s\S]*?)<\/script>/)
  if (!match) throw new Error('PREVIEW_CONFIG_MISSING')
  const config = JSON.parse(match[1])
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  const nonce = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return page.html
    .replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(websiteCsp(`'nonce-${nonce}'`))}">`)
    .replace(match[0], `<script type="application/json" id="__atlas_config">${scriptJson({ ...config, preview: { token: channelToken, artifactHash: artifact.sha256 } })}</script>`)
    .replace(/<script src="website\.js" integrity="[^"]*" crossorigin="anonymous"><\/script>/, `<script nonce="${nonce}">${WEBSITE_RUNTIME}</script>`)
}
