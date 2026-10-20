/**
 * A extensão do browser (pasta extension/). Quando está instalada e viva, é ela que toca o aviso de "partida
 * encontrada", para se ouvir mesmo com outro separador à frente (o YouTube, por exemplo), e é ela que mantém o
 * sinal de vida da fila quando o separador do Rangify fecha. O site fala com o script de ponte da extensão por
 * window.postMessage; não passa nenhum dado da conta, só estas perguntas e avisos.
 */
const DO_SITE = 'rangify-site'
const DA_EXTENSAO = 'rangify-extensao'
/** Uma resposta da extensão vale isto: passado este tempo o site volta a perguntar. */
const VALIDADE_MS = 120_000
const ESPERA_MS = 600

interface Resposta { viva: boolean; som: boolean }

let presente = false
const ouvintes = new Set<() => void>()
let ultima: { perfilId: string; em: number; viva: boolean; som: boolean } | null = null
const pendentes = new Map<string, (r: Resposta) => void>()

const enviar = (m: Record<string, unknown>) => window.postMessage({ origem: DO_SITE, ...m }, window.location.origin)

/** Chamado uma vez ao arrancar: fica a ouvir a extensão e pergunta se há alguma. */
export function iniciarExtensao() {
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return
    const m = e.data as { origem?: string; tipo?: string; id?: string; viva?: boolean; som?: boolean } | null
    if (!m || m.origem !== DA_EXTENSAO) return
    if (m.tipo === 'ola') { presente = true; ouvintes.forEach((f) => f()) }
    else if (m.tipo === 'estado' && m.id) {
      pendentes.get(m.id)?.({ viva: !!m.viva, som: !!m.som })
      pendentes.delete(m.id)
    }
  })
  enviar({ tipo: 'quem-ha' })
}

/** A extensão está instalada neste browser? */
export const extensaoPresente = () => presente

/** Onde instalar a extensão (a página dela na Chrome Web Store ou no Edge Add-ons), se o site a tiver configurada. */
export const URL_EXTENSAO = ((import.meta.env.VITE_EXTENSAO_URL as string | undefined) ?? '').trim()

/** Chama `cb` quando a extensão se anuncia (a resposta chega depois de a página carregar). */
export function aoAparecerExtensao(cb: () => void): () => void {
  ouvintes.add(cb)
  return () => { ouvintes.delete(cb) }
}

/** Pergunta à extensão se está viva e com sessão nesta conta (e se toca o som). Sem extensão, responde logo que não. */
export function consultarExtensao(perfilId: string): Promise<Resposta> {
  if (!presente) return Promise.resolve({ viva: false, som: false })
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const t = window.setTimeout(() => { pendentes.delete(id); resolve({ viva: false, som: false }) }, ESPERA_MS)
    pendentes.set(id, (r) => {
      window.clearTimeout(t)
      ultima = { perfilId, em: Date.now(), ...r }
      resolve(r)
    })
    enviar({ tipo: 'estado', id, perfilId })
  })
}

/** Vai ser a extensão a tocar o aviso de partida encontrada desta conta? */
export async function extensaoTocaOSom(perfilId: string): Promise<boolean> {
  const r = await consultarExtensao(perfilId)
  return r.viva && r.som
}

/**
 * A extensão está viva nesta conta (pela última resposta que deu)? Síncrono, para o aviso de fecho do
 * separador: com ela viva, fechar o Rangify não tira ninguém da fila, é ela que continua a dar o sinal de vida.
 */
export function extensaoMantemAFila(perfilId: string): boolean {
  return !!ultima && ultima.perfilId === perfilId && ultima.viva && Date.now() - ultima.em < VALIDADE_MS
}

/** Diz à extensão que entraste ou saíste da fila, para ela começar (ou deixar) de a acompanhar já, sem esperar pelo alarme. */
export function extensaoAvisarFila() {
  if (presente) enviar({ tipo: 'fila-mudou' })
}

/** Diz à extensão que a partida acabou de ser encontrada, para tocar já (o site vê-a antes do ciclo dela). */
export function extensaoAvisarPartida() {
  if (!presente) return
  enviar({ tipo: 'partida-encontrada', visivel: document.visibilityState === 'visible' && document.hasFocus() })
}
