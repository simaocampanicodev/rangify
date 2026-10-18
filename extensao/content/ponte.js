// Corre nas páginas do Rangify (ver manifest). Faz a ponte entre o site e a extensão:
//  - o site fica a saber que a extensão está instalada e viva, e por isso deixa de tocar o aviso sonoro;
//  - o site avisa a extensão no instante em que a partida é encontrada, para o som não esperar pelo próximo ciclo;
//  - o site avisa quando a pessoa entra ou sai da fila, para a extensão a acompanhar logo (sem perguntar de segundo a segundo).
// Não passa nenhum token nem dado da conta: só estas perguntas e avisos.
const DO_SITE = 'rangify-site'
const DA_EXTENSAO = 'rangify-extensao'

const dizer = (mensagem) => window.postMessage({ origem: DA_EXTENSAO, ...mensagem }, location.origin)

/** Depois de a extensão ser recarregada, este script fica órfão: não deve rebentar a página. */
const noServiceWorker = (m) => {
  try { return chrome.runtime.sendMessage(m) } catch { return Promise.resolve(null) }
}

dizer({ tipo: 'ola' })

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.origin !== location.origin) return
  const m = e.data
  if (!m || m.origem !== DO_SITE) return
  if (m.tipo === 'quem-ha') dizer({ tipo: 'ola' })
  else if (m.tipo === 'estado') {
    const r = await noServiceWorker({ tipo: 'ponte-estado', perfilId: m.perfilId })
    dizer({ tipo: 'estado', id: m.id, viva: !!r?.viva, som: !!r?.som })
  } else if (m.tipo === 'partida-encontrada') {
    noServiceWorker({ tipo: 'ponte-partida', visivel: !!m.visivel })
  } else if (m.tipo === 'fila-mudou') {
    noServiceWorker({ tipo: 'ponte-fila' })
  }
})
