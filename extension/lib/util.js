const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Texto que vem do servidor (motivos de ban, erros) nunca entra no HTML sem passar por aqui. */
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])

export const relogio = (segundos) => {
  const s = Math.max(0, Math.ceil(segundos))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** A hora do servidor, para as contagens não dependerem do relógio deste computador. */
export const agoraServidor = (desvio) => Date.now() + (desvio ?? 0)

export function textoBan(ban) {
  if (ban.permanente || !ban.ate) return 'para sempre'
  return `até ${new Date(ban.ate).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`
}

/** Um ban com a data passada já não conta (o servidor também o ignora). */
export const banAtivo = (fila, agora) => {
  const b = fila?.ban
  return b && (b.permanente || !b.ate || Date.parse(b.ate) > agora) ? b : null
}

/** Fala com o service worker e devolve a resposta, ou lança o erro que ele devolveu. */
export async function pedir(mensagem) {
  const r = await chrome.runtime.sendMessage(mensagem)
  if (r?.erro) throw new Error(r.erro)
  return r
}
