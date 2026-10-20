// Documento escondido que o service worker abre para tocar o aviso sonoro (um service worker não toca som).
import { acordeWav } from '../lib/audio.js'

chrome.runtime.onMessage.addListener((m, _remetente, responder) => {
  if (m?.para !== 'offscreen') return
  if (m.tipo === 'tocar') {
    const url = URL.createObjectURL(new Blob([acordeWav(!!m.lembrete, Number(m.volume))], { type: 'audio/wav' }))
    const som = new Audio(url)
    const limpar = () => URL.revokeObjectURL(url)
    som.addEventListener('ended', limpar, { once: true })
    som.addEventListener('error', limpar, { once: true })
    som.play().then(() => responder({ ok: true })).catch((e) => responder({ ok: false, erro: String(e?.message ?? e) }))
    return true
  }
  if (m.tipo === 'ping') { responder({ ok: true }); return }
})
