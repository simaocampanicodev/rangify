/**
 * Modo demo: tudo guardado no browser (localStorage).
 *
 * Serve para experimentar o Rangify sem configurar nada. A comunidade de
 * exemplo é gerada na primeira visita e a máquina de estados da partida corre
 * aqui, com os outros nove jogadores a jogar sozinhos: aceitam, escolhem,
 * banem, criam o grupo e confirmam o resultado. A palavra-passe fica só como
 * hash SHA-256, mas isto continua a ser um modo de demonstração.
 */
import { NOMES_MAPAS, TOTAL_BANS, equipaDoBan } from '../mapas'
import { PONTOS_INICIAIS } from '../pontos'
import { divisao, mediaDivisoes } from '../ranks'
import {
  ESTADOS_ATIVOS, HORAS_CACHE_RANK, MINUTOS_BLOQUEIO, MINUTOS_COOLDOWN, PADRAO_CODIGO, PADRAO_RIOT_ID,
  SEGUNDOS_BAN, SEGUNDOS_CONFIRMAR, SEGUNDOS_ESCOLHA, equipaDaEscolha, validarResultado,
} from '../regras'
import { blobParaDataUrl } from '../imagem'
import { periodoSemana } from '../tempo'
import { avisarMudanca } from './eventos'
import {
  aplicarResultado, codigoGrupo, codigoPartida, definirCapitaes, escolhidos, gerarEstatisticas, gerarResultado,
  melhorDisponivel, novoJogador, type JogadorGuardado, type PartidaGuardada,
} from './motor'
import {
  ID_DEMO, INICIO_TEMPORADA, MISSOES, PASSWORD_DEMO, gerarSemente,
  type AmizadeGuardada, type DenunciaGuardada, type SugestaoGuardada,
} from './semente'
import type {
  Amizade, Dados, Denuncia, Equipa, EstadoPartida, Funcao, JogadorPartida, LinhaRanking, Missao, Partida, Perfil,
  PontoForma, ResumoPartida, Sessao, Sugestao,
} from './tipos'

// v3: Trades, HS% e KAST nas partidas; os dados de exemplo voltam a ser gerados.
const CHAVE = 'rangify:demo:v3'

/** O que o motor precisa de lembrar sobre uma partida a decorrer. */
interface Motor {
  aceitaEm: Record<string, number>
  jogadaEm: number | null
  resultado: { a: number; b: number } | null
}

interface Estado {
  versao: 3
  contas: Record<string, { perfilId: string; hash: string }>
  perfis: Record<string, Perfil>
  partidas: PartidaGuardada[]
  fila: { perfilId: string; desde: string }[]
  proximoBotEm: number | null
  proximaSimulada: boolean
  motores: Record<string, Motor>
  amizades: AmizadeGuardada[]
  sugestoes: SugestaoGuardada[]
  denuncias: DenunciaGuardada[]
  sessao: Sessao | null
  serCapitao: boolean
}

let estado: Estado | null = null
let aCarregar: Promise<Estado> | null = null
const ouvintes = new Set<() => void>()

const iso = (ms: number) => new Date(ms).toISOString()
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : Infinity)
const aleatorio = (min: number, max: number) => min + Math.random() * (max - min)
const ativa = (e: EstadoPartida) => (ESTADOS_ATIVOS as readonly string[]).includes(e)

function guardar() {
  if (!estado) return
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado))
  } catch { /* browser sem espaço ou em modo privado: segue em memória */ }
}

/**
 * Hash da palavra-passe. O crypto.subtle só existe em https e localhost; num
 * endereço http da rede local o modo demo usa um hash simples, o que chega para
 * uma demonstração (nada disto sai do browser).
 */
async function sha256(texto: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (const c of texto) { h1 = Math.imul(h1 ^ c.charCodeAt(0), 16777619) >>> 0; h2 = Math.imul(h2 ^ h1, 2246822507) >>> 0 }
  return 'fnv-' + h1.toString(16) + h2.toString(16)
}

/** randomUUID também só existe em contextos seguros. */
function novoId(): string {
  const c = globalThis.crypto as Partial<Crypto> | undefined
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function carregar(): Promise<Estado> {
  if (estado) return estado
  if (aCarregar) return aCarregar
  aCarregar = (async () => {
    let lido: Estado | null = null
    try {
      localStorage.removeItem('rangify:demo:v1')
      localStorage.removeItem('rangify:demo:v2')
      const txt = localStorage.getItem(CHAVE)
      if (txt) lido = JSON.parse(txt) as Estado
    } catch { lido = null }
    if (!lido || lido.versao !== 3) {
      const s = gerarSemente()
      lido = {
        versao: 3, contas: { nyx: { perfilId: ID_DEMO, hash: await sha256(PASSWORD_DEMO) } },
        perfis: s.perfis, partidas: s.partidas, fila: [], proximoBotEm: null, proximaSimulada: false, motores: {},
        amizades: s.amizades, sugestoes: s.sugestoes, denuncias: s.denuncias, sessao: null, serCapitao: false,
      }
    }
    estado = lido
    guardar()
    iniciarRelogio()
    return lido
  })()
  return aCarregar
}

let relogio: number | null = null
function iniciarRelogio() {
  if (relogio != null || typeof window === 'undefined') return
  relogio = window.setInterval(passo, 500)
  // Outro separador mexeu nos dados: passa a usar os dele.
  window.addEventListener('storage', (ev) => {
    if (ev.key !== CHAVE || !ev.newValue) return
    try {
      estado = JSON.parse(ev.newValue) as Estado
      avisarMudanca('partida')
      ouvintes.forEach((cb) => cb())
    } catch { /* ignora */ }
  })
}

async function pronto(): Promise<Estado> {
  const e = await carregar()
  passo()
  return e
}

function avisarSessao() {
  ouvintes.forEach((cb) => cb())
}

// ---------------------------------------------------------------- utilidades

function eu(e: Estado): Perfil {
  const id = e.sessao?.perfilId
  const p = id ? e.perfis[id] : null
  if (!p) throw new Error('Tens de entrar na tua conta.')
  return p
}

function exigirDev(e: Estado) {
  const p = eu(e)
  if (p.funcao !== 'owner' && p.funcao !== 'dev') throw new Error('Só Owner e Dev podem usar as ferramentas de teste.')
  return p
}

function exigirStaff(e: Estado) {
  const p = eu(e)
  if (!['owner', 'dev', 'mod'].includes(p.funcao)) throw new Error('Esta área é só para a equipa do Rangify.')
  return p
}

/** Sem Riot ID a conta não joga; a palavra-passe pode ficar para depois. */
function incompleta(p: Perfil) {
  return !p.riotId
}

function obterPartida(e: Estado, id: string): PartidaGuardada {
  const p = e.partidas.find((x) => x.id === id)
  if (!p) throw new Error('Esta partida já não existe.')
  return p
}

function motor(e: Estado, p: PartidaGuardada): Motor {
  return (e.motores[p.id] ??= { aceitaEm: {}, jogadaEm: null, resultado: null })
}

function noJogo(e: Estado, perfilId: string): PartidaGuardada | undefined {
  return e.partidas.find((p) => ativa(p.estado) && p.jogadores.some((j) => j.perfilId === perfilId))
}

function nomeCurto(p: Perfil | undefined) {
  return p?.riotId?.split('#')[0] ?? p?.utilizador ?? '?'
}

function jogadorPublico(e: Estado, j: JogadorGuardado): JogadorPartida {
  const p = e.perfis[j.perfilId]
  return {
    perfilId: j.perfilId, utilizador: p?.utilizador ?? '?', riotId: p?.riotId ?? null, avatarUrl: p?.avatarUrl ?? null,
    tier: j.tier, pontos: p?.pontos ?? PONTOS_INICIAIS, funcaoJogo: p?.funcaoJogo ?? null, bot: p?.bot ?? false,
    equipa: j.equipa, capitao: j.capitao, aceitou: j.aceitou, ordemEscolha: j.ordemEscolha,
    kills: j.kills, deaths: j.deaths, assists: j.assists, acs: j.acs, firstBloods: j.firstBloods, mvp: j.mvp, deltaPontos: j.deltaPontos,
    trades: j.trades ?? null, hsPct: j.hsPct ?? null, kastPct: j.kastPct ?? null,
  }
}

function publica(e: Estado, p: PartidaGuardada): Partida {
  return { ...p, bans: [...p.bans], submissoes: [...p.submissoes], jogadores: p.jogadores.map((j) => jogadorPublico(e, j)) }
}

function terminadas(e: Estado, incluirSimuladas = false) {
  return e.partidas.filter((p) => p.estado === 'COMPLETED' && (incluirSimuladas || !p.simulada))
}

function tiersDe(p: PartidaGuardada, eq: Equipa) {
  return p.jogadores.filter((j) => j.equipa === eq).map((j) => j.tier)
}

function resumo(e: Estado, p: PartidaGuardada, ref: string | null): ResumoPartida {
  const mvp = p.jogadores.find((j) => j.mvp)
  const meu = ref ? p.jogadores.find((j) => j.perfilId === ref && j.equipa) : null
  const outra = meu?.equipa === 'A' ? 'B' : 'A'
  const media = (eq: Equipa) => Math.max(3, Math.min(27, Math.round(mediaDivisoes(tiersDe(p, eq))) + 2))
  return {
    id: p.id, codigo: p.codigo, mapa: p.mapa, estado: p.estado, resultadoA: p.resultadoA, resultadoB: p.resultadoB,
    vencedor: p.vencedor, terminouEm: p.terminouEm, simulada: p.simulada,
    capitaoA: nomeCurto(e.perfis[p.capitaoA ?? '']), capitaoB: nomeCurto(e.perfis[p.capitaoB ?? '']),
    tierMedioA: media('A'), tierMedioB: media('B'),
    duracaoMin: p.comecouEm && p.terminouEm ? Math.round((ms(p.terminouEm) - ms(p.comecouEm)) / 60_000) : null,
    mvp: mvp ? nomeCurto(e.perfis[mvp.perfilId]) : null,
    minha: meu && meu.equipa ? {
      equipa: meu.equipa, venceu: p.vencedor === meu.equipa, deltaPontos: meu.deltaPontos, kills: meu.kills,
      deaths: meu.deaths, assists: meu.assists, acs: meu.acs, mvp: meu.mvp, tierAdversario: media(outra),
    } : null,
  }
}

function classificados(e: Estado): Perfil[] {
  return Object.values(e.perfis)
    .filter((p) => p.riotId && !p.bot)
    .sort((x, y) => y.pontos - x.pontos || y.vitorias - x.vitorias || x.utilizador.localeCompare(y.utilizador))
}

function amigosDe(e: Estado, id: string): string[] {
  return e.amizades.filter((a) => a.estado === 'aceite' && (a.de === id || a.para === id)).map((a) => (a.de === id ? a.para : a.de))
}

function toque(p: PartidaGuardada, agora: number) {
  p.atualizadaEm = iso(agora)
}

// ---------------------------------------------------------------- o motor

function botLivre(e: Estado, excluir: string[] = []): string | null {
  const agora = Date.now()
  const ocupados = new Set<string>([...excluir, ...e.fila.map((f) => f.perfilId)])
  for (const p of e.partidas) if (ativa(p.estado)) p.jogadores.forEach((j) => ocupados.add(j.perfilId))
  const livres = Object.values(e.perfis).filter((p) =>
    p.id !== e.sessao?.perfilId && p.riotId && !ocupados.has(p.id) && (p.cooldownAte == null || ms(p.cooldownAte) < agora),
  )
  if (!livres.length) return null
  return livres[Math.floor(Math.random() * livres.length)].id
}

function criarPartida(e: Estado, ids: string[], opts: { simulada: boolean; automatica: boolean }) {
  const agora = Date.now()
  const p: PartidaGuardada = {
    id: novoId(), codigo: codigoPartida(Math.random), estado: 'READY_CHECK', regiao: e.perfis[ids[0]]?.regiao ?? 'eu',
    mapa: null, capitaoA: null, capitaoB: null, codigoGrupo: null, resultadoA: null, resultadoB: null, vencedor: null,
    simulada: opts.simulada, automatica: opts.automatica,
    prazoConfirmacao: iso(agora + SEGUNDOS_CONFIRMAR * 1000), inicioFase: iso(agora), prazoFase: iso(agora + SEGUNDOS_CONFIRMAR * 1000),
    comecouEm: null, terminouEm: null, estatisticas: false, criadaEm: iso(agora), atualizadaEm: iso(agora),
    jogadores: ids.map((id) => novoJogador(e.perfis[id])), bans: [], submissoes: [],
  }
  const m: Motor = { aceitaEm: {}, jogadaEm: null, resultado: null }
  for (const id of ids) m.aceitaEm[id] = agora + (opts.automatica ? aleatorio(300, 1400) : aleatorio(1200, 8000))
  e.partidas.push(p)
  e.motores[p.id] = m
  return p
}

function passoFila(e: Estado, agora: number): boolean {
  const humano = e.sessao?.perfilId
  const naFila = !!humano && e.fila.some((f) => f.perfilId === humano)
  let mudou = false
  if (naFila && e.fila.length < 10 && e.proximoBotEm != null && agora >= e.proximoBotEm) {
    const bot = botLivre(e)
    if (bot) e.fila.push({ perfilId: bot, desde: iso(agora) })
    e.proximoBotEm = agora + aleatorio(2500, 4500)
    mudou = true
  }
  if (naFila && e.fila.length >= 10) {
    const outros = e.fila.filter((f) => f.perfilId !== humano).slice(0, 9).map((f) => f.perfilId)
    const ids = [humano!, ...outros]
    e.fila = e.fila.filter((f) => !ids.includes(f.perfilId))
    criarPartida(e, ids, { simulada: e.proximaSimulada, automatica: false })
    e.proximaSimulada = false
    e.proximoBotEm = null
    mudou = true
  }
  return mudou
}

function voltarAFila(e: Estado, ids: string[], desde: string) {
  for (const id of ids) if (!e.fila.some((f) => f.perfilId === id)) e.fila.unshift({ perfilId: id, desde })
  if (e.sessao && ids.includes(e.sessao.perfilId)) e.proximoBotEm = Date.now() + 1500
}

function cancelar(e: Estado, p: PartidaGuardada, agora: number) {
  p.estado = 'CANCELLED'
  p.terminouEm = iso(agora)
  p.prazoFase = null
  toque(p, agora)
  delete e.motores[p.id]
}

/** Alguém não aceitou: fica de castigo e os outros voltam à fila com o tempo que já tinham. */
function falhouConfirmacao(e: Estado, p: PartidaGuardada, agora: number) {
  const aceitaram = p.jogadores.filter((j) => j.aceitou).map((j) => j.perfilId)
  for (const j of p.jogadores) {
    if (!j.aceitou && e.perfis[j.perfilId]) e.perfis[j.perfilId].cooldownAte = iso(agora + MINUTOS_COOLDOWN * 60_000)
  }
  cancelar(e, p, agora)
  if (!p.simulada) voltarAFila(e, aceitaram, p.criadaEm)
}

function atraso(p: PartidaGuardada) {
  return p.automatica ? aleatorio(450, 900) : aleatorio(1600, 3400)
}

function iniciarDraft(e: Estado, p: PartidaGuardada, agora: number) {
  const humano = e.sessao?.perfilId
  const forcar = p.simulada && e.serCapitao && humano && p.jogadores.some((j) => j.perfilId === humano) ? humano : undefined
  definirCapitaes(p, e.perfis, forcar)
  p.estado = 'DRAFT_PHASE'
  p.inicioFase = iso(agora)
  p.prazoFase = iso(agora + SEGUNDOS_ESCOLHA * 1000)
  motor(e, p).jogadaEm = agora + atraso(p)
  toque(p, agora)
}

function escolher(e: Estado, p: PartidaGuardada, perfilId: string, agora: number) {
  const n = escolhidos(p)
  const j = p.jogadores.find((x) => x.perfilId === perfilId && !x.equipa)
  if (!j) throw new Error('Esse jogador já foi escolhido.')
  j.equipa = equipaDaEscolha(n)
  j.ordemEscolha = n + 1
  p.inicioFase = iso(agora)
  if (n + 1 >= 8) {
    p.estado = 'MAP_BAN'
    p.prazoFase = iso(agora + SEGUNDOS_BAN * 1000)
  } else {
    p.prazoFase = iso(agora + SEGUNDOS_ESCOLHA * 1000)
  }
  motor(e, p).jogadaEm = agora + atraso(p)
  toque(p, agora)
}

function banir(e: Estado, p: PartidaGuardada, mapa: string, agora: number) {
  if (!NOMES_MAPAS.includes(mapa) || p.bans.some((b) => b.mapa === mapa)) throw new Error('Esse mapa já não está disponível.')
  const n = p.bans.length
  p.bans.push({ mapa, equipa: equipaDoBan(n), ordem: n + 1 })
  p.inicioFase = iso(agora)
  if (n + 1 >= TOTAL_BANS) {
    p.mapa = NOMES_MAPAS.find((m) => !p.bans.some((b) => b.mapa === m)) ?? null
    p.estado = 'LOBBY_CREATION'
    p.prazoFase = iso(agora + 10 * 60_000)
    motor(e, p).jogadaEm = agora + (p.automatica ? 800 : aleatorio(3500, 5500))
  } else {
    p.prazoFase = iso(agora + SEGUNDOS_BAN * 1000)
    motor(e, p).jogadaEm = agora + atraso(p)
  }
  toque(p, agora)
}

function comecar(p: PartidaGuardada, codigo: string, agora: number) {
  p.codigoGrupo = codigo
  p.estado = 'IN_PROGRESS'
  p.comecouEm = iso(agora)
  p.inicioFase = iso(agora)
  p.prazoFase = iso(agora + (p.automatica ? 1500 : MINUTOS_BLOQUEIO * 60_000))
  toque(p, agora)
}

function abrirResultado(e: Estado, p: PartidaGuardada, agora: number) {
  p.estado = 'RESULT_SUBMISSION'
  p.inicioFase = iso(agora)
  p.prazoFase = iso(agora + 60 * 60_000)
  motor(e, p).jogadaEm = agora + (p.automatica ? 700 : aleatorio(5000, 9000))
  toque(p, agora)
}

function submeter(e: Estado, p: PartidaGuardada, capitaoId: string, a: number, b: number, agora: number) {
  p.submissoes.push({ capitaoId, a, b, em: iso(agora) })
  toque(p, agora)
  if (p.submissoes.length < 2) return
  const [x, y] = p.submissoes
  if (x.a === y.a && x.b === y.b) {
    p.resultadoA = x.a
    p.resultadoB = x.b
    p.estado = 'PROCESSING_API'
    p.inicioFase = iso(agora)
    p.prazoFase = iso(agora + (p.automatica ? 1200 : 3500))
  } else {
    p.estado = 'DISPUTE'
    p.prazoFase = null
    delete e.motores[p.id]
  }
}

function terminar(e: Estado, p: PartidaGuardada, agora: number) {
  const a = p.resultadoA ?? 13
  const b = p.resultadoB ?? 0
  p.vencedor = a > b ? 'A' : 'B'
  gerarEstatisticas(Math.random, p, e.perfis)
  aplicarResultado(p, e.perfis, a, b, iso(agora))
  delete e.motores[p.id]
}

function passoPartida(e: Estado, p: PartidaGuardada, agora: number): boolean {
  const m = e.motores[p.id]
  if (!m) return false
  const humano = e.sessao?.perfilId ?? null
  const auto = (id: string | null) => !!id && (p.automatica || id !== humano)

  switch (p.estado) {
    case 'READY_CHECK': {
      let mudou = false
      for (const j of p.jogadores) {
        if (!j.aceitou && auto(j.perfilId) && agora >= (m.aceitaEm[j.perfilId] ?? Infinity)) { j.aceitou = true; mudou = true }
      }
      if (p.jogadores.every((j) => j.aceitou)) { iniciarDraft(e, p, agora); return true }
      if (agora >= ms(p.prazoConfirmacao)) { falhouConfirmacao(e, p, agora); return true }
      if (mudou) toque(p, agora)
      return mudou
    }
    case 'DRAFT_PHASE': {
      const cap = equipaDaEscolha(escolhidos(p)) === 'A' ? p.capitaoA : p.capitaoB
      if (agora >= ms(p.prazoFase) || (auto(cap) && m.jogadaEm != null && agora >= m.jogadaEm)) {
        const j = melhorDisponivel(Math.random, p, e.perfis)
        if (j) escolher(e, p, j.perfilId, agora)
        return true
      }
      return false
    }
    case 'MAP_BAN': {
      const cap = equipaDoBan(p.bans.length) === 'A' ? p.capitaoA : p.capitaoB
      if (agora >= ms(p.prazoFase) || (auto(cap) && m.jogadaEm != null && agora >= m.jogadaEm)) {
        const livres = NOMES_MAPAS.filter((x) => !p.bans.some((b) => b.mapa === x))
        banir(e, p, livres[Math.floor(Math.random() * livres.length)], agora)
        return true
      }
      return false
    }
    case 'LOBBY_CREATION': {
      if (auto(p.capitaoA) && m.jogadaEm != null && agora >= m.jogadaEm) { comecar(p, codigoGrupo(Math.random), agora); return true }
      if (agora >= ms(p.prazoFase)) { cancelar(e, p, agora); return true }
      return false
    }
    case 'IN_PROGRESS': {
      if (agora >= ms(p.prazoFase)) { abrirResultado(e, p, agora); return true }
      return false
    }
    case 'RESULT_SUBMISSION': {
      const caps = [p.capitaoA!, p.capitaoB!]
      const capHumano = caps.find((c) => !auto(c))
      if (m.jogadaEm != null && agora >= m.jogadaEm) {
        if (!capHumano) {
          // Dois capitães automáticos: inventam um resultado e submetem os dois.
          m.resultado ??= gerarResultado(Math.random, tiersDe(p, 'A'), tiersDe(p, 'B'))
          const falta = caps.find((c) => !p.submissoes.some((s) => s.capitaoId === c))
          if (falta) {
            submeter(e, p, falta, m.resultado.a, m.resultado.b, agora)
            if (e.motores[p.id]) e.motores[p.id].jogadaEm = agora + (p.automatica ? 400 : 1600)
            return true
          }
        } else {
          // O outro capitão confirma o que o capitão humano submeteu.
          const dele = p.submissoes.find((s) => s.capitaoId === capHumano)
          const outro = caps.find((c) => c !== capHumano)!
          if (dele && !p.submissoes.some((s) => s.capitaoId === outro)) {
            submeter(e, p, outro, dele.a, dele.b, agora)
            return true
          }
        }
      }
      if (agora >= ms(p.prazoFase)) {
        // Prazo esgotado: vale a única submissão; sem nenhuma, vai para a staff.
        const s = p.submissoes[0]
        if (s && p.submissoes.length === 1) {
          p.resultadoA = s.a
          p.resultadoB = s.b
          p.estado = 'PROCESSING_API'
          p.prazoFase = iso(agora + 3500)
        } else {
          p.estado = 'DISPUTE'
          p.prazoFase = null
        }
        toque(p, agora)
        return true
      }
      return false
    }
    case 'PROCESSING_API': {
      if (agora >= ms(p.prazoFase)) { terminar(e, p, agora); return true }
      return false
    }
    default:
      return false
  }
}

function passo() {
  const e = estado
  if (!e) return
  const agora = Date.now()
  let mudou = passoFila(e, agora)
  for (const p of e.partidas) {
    if (p.estado !== 'COMPLETED' && p.estado !== 'CANCELLED' && passoPartida(e, p, agora)) mudou = true
  }
  if (mudou) {
    guardar()
    avisarMudanca('partida')
  }
}

// ---------------------------------------------------------------- missões

function progressoMissoes(e: Estado, perfil: Perfil): Missao[] {
  const minhas = terminadas(e)
    .filter((p) => p.jogadores.some((j) => j.perfilId === perfil.id))
    .sort((x, y) => ms(x.terminouEm) - ms(y.terminouEm))
  const semana = ms(periodoSemana() + 'T00:00:00Z')
  const temporada = ms(INICIO_TEMPORADA)
  return MISSOES.map((def) => {
    const lista = minhas.filter((p) => ms(p.terminouEm) >= (def.ambito === 'semanal' ? semana : temporada))
    const eu = (p: PartidaGuardada) => p.jogadores.find((j) => j.perfilId === perfil.id)!
    let v = 0
    switch (def.tipo) {
      case 'jogos': v = lista.length; break
      case 'vitorias': v = lista.filter((p) => p.vencedor === eu(p).equipa).length; break
      case 'vitorias_acima': v = lista.filter((p) => {
        const j = eu(p)
        if (p.vencedor !== j.equipa) return false
        return Math.round(mediaDivisoes(tiersDe(p, j.equipa === 'A' ? 'B' : 'A'))) > divisao(j.tier)
      }).length; break
      case 'first_bloods': v = lista.reduce((s, p) => s + (eu(p).firstBloods ?? 0), 0); break
      case 'mvp': v = lista.filter((p) => eu(p).mvp).length; break
      case 'sequencia': {
        let atual = 0
        for (const p of lista) { atual = p.vencedor === eu(p).equipa ? atual + 1 : 0; v = Math.max(v, atual) }
        break
      }
      case 'acs': v = Math.max(0, ...lista.map((p) => eu(p).acs ?? 0)); break
      case 'pontos': v = perfil.pontos; break
    }
    return { ...def, progresso: Math.min(def.alvo, v), concluida: v >= def.alvo }
  })
}

// ---------------------------------------------------------------- a interface

export const dadosLocais: Dados = {
  modo: 'demo',

  async sessao() {
    const e = await carregar()
    const p = e.sessao ? e.perfis[e.sessao.perfilId] : null
    if (!p) return null
    return { perfilId: p.id, incompleta: incompleta(p) }
  },

  aoMudarSessao(cb) {
    ouvintes.add(cb)
    return () => ouvintes.delete(cb)
  },

  async entrarComDiscord() {
    // No modo demo não há Discord: cria uma conta nova, como no primeiro login a sério.
    const e = await carregar()
    let nome = ''
    do nome = `jogador${Math.floor(1000 + Math.random() * 9000)}`
    while (e.contas[nome])
    const id = novoId()
    const agora = iso(Date.now())
    e.perfis[id] = {
      id, utilizador: nome, avatarUrl: null, riotId: null, regiao: 'eu', tier: 0, rr: null, rankAtualizadoEm: null,
      pontos: PONTOS_INICIAIS, vitorias: 0, derrotas: 0, funcao: 'user', funcaoJogo: null, bot: false,
      cooldownAte: null, tourVistoEm: null, temPassword: false, criadoEm: agora,
    }
    e.contas[nome] = { perfilId: id, hash: '' }
    e.sessao = { perfilId: id, incompleta: true }
    guardar()
    avisarSessao()
  },

  async entrarComPassword(utilizador, password) {
    const e = await carregar()
    const conta = e.contas[utilizador.trim().toLowerCase()]
    if (!conta || !conta.hash || conta.hash !== (await sha256(password))) throw new Error('Utilizador ou palavra-passe errados.')
    const p = e.perfis[conta.perfilId]
    e.sessao = { perfilId: p.id, incompleta: incompleta(p) }
    guardar()
    avisarSessao()
  },

  async entrarDemo() {
    const e = await carregar()
    e.sessao = { perfilId: ID_DEMO, incompleta: false }
    guardar()
    avisarSessao()
  },

  async definirPassword(password) {
    const e = await carregar()
    const p = eu(e)
    if (password.length < 10) throw new Error('A palavra-passe precisa de 10 caracteres ou mais.')
    if (password.toLowerCase().includes(p.utilizador.toLowerCase())) throw new Error('A palavra-passe não pode conter o teu utilizador.')
    e.contas[p.utilizador] = { perfilId: p.id, hash: await sha256(password) }
    p.temPassword = true
    e.sessao = { perfilId: p.id, incompleta: incompleta(p) }
    guardar()
    avisarSessao()
  },

  async ligarRiotId(riotId, regiao) {
    const e = await carregar()
    const p = eu(e)
    const limpo = riotId.trim()
    if (!PADRAO_RIOT_ID.test(limpo)) throw new Error('O Riot ID tem o formato Nome#TAG, por exemplo Nyx#4521.')
    const dono = Object.values(e.perfis).find((x) => x.id !== p.id && x.riotId?.toLowerCase() === limpo.toLowerCase())
    if (dono) throw new Error('Esse Riot ID já está ligado a outra conta.')
    if (p.riotId && (e.fila.some((f) => f.perfilId === p.id) || noJogo(e, p.id))) {
      throw new Error('Sai da fila ou acaba a partida antes de mudar o Riot ID.')
    }
    // Sem a Henrik Dev API no modo demo: o rank sai do próprio nome, sempre igual para o mesmo ID.
    let h = 0
    for (const c of limpo.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
    p.riotId = limpo
    p.regiao = regiao
    p.tier = 6 + (h % 18)
    p.rr = h % 100
    p.rankAtualizadoEm = iso(Date.now())
    e.sessao = { perfilId: p.id, incompleta: incompleta(p) }
    guardar()
    avisarSessao()
    avisarMudanca('perfil')
    return { ...p }
  },

  async definirAvatar(imagem) {
    const e = await carregar()
    const p = eu(e)
    p.avatarUrl = imagem ? await blobParaDataUrl(imagem) : null
    guardar()
    avisarSessao()
    avisarMudanca('perfil')
    return { ...p }
  },

  async sair() {
    const e = await carregar()
    if (e.sessao) e.fila = e.fila.filter((f) => f.perfilId !== e.sessao!.perfilId)
    e.sessao = null
    guardar()
    avisarSessao()
  },

  async meuPerfil() {
    const e = await carregar()
    const id = e.sessao?.perfilId
    return id && e.perfis[id] ? { ...e.perfis[id] } : null
  },

  async perfilPorRiotId(riotId) {
    const e = await carregar()
    const alvo = riotId.toLowerCase()
    const p = Object.values(e.perfis).find((x) => x.riotId?.toLowerCase() === alvo)
    return p ? { ...p } : null
  },

  async atualizarPerfil(alt) {
    const e = await carregar()
    const p = eu(e)
    if (alt.funcaoJogo !== undefined) p.funcaoJogo = alt.funcaoJogo
    if (alt.regiao) p.regiao = alt.regiao
    guardar()
    avisarMudanca('perfil')
    return { ...p }
  },

  async marcarTourVisto(visto) {
    const e = await carregar()
    eu(e).tourVistoEm = visto ? iso(Date.now()) : null
    guardar()
    avisarMudanca('perfil')
  },

  async sincronizarRank() {
    const e = await carregar()
    const p = eu(e)
    if (!p.riotId) throw new Error('Liga primeiro o teu Riot ID.')
    const proxima = ms(p.rankAtualizadoEm) + HORAS_CACHE_RANK * 3_600_000
    if (p.rankAtualizadoEm && proxima > Date.now()) return { perfil: { ...p }, atualizado: false, proximaEm: iso(proxima) }
    p.rr = Math.max(0, Math.min(99, (p.rr ?? 50) + Math.round(aleatorio(-18, 22))))
    p.rankAtualizadoEm = iso(Date.now())
    guardar()
    avisarMudanca('perfil')
    return { perfil: { ...p }, atualizado: true, proximaEm: iso(Date.now() + HORAS_CACHE_RANK * 3_600_000) }
  },

  async estatisticas(perfilId) {
    const e = await pronto()
    const lista = terminadas(e).map((p) => p.jogadores.find((j) => j.perfilId === perfilId && j.equipa) ? p : null).filter(Boolean) as PartidaGuardada[]
    lista.sort((x, y) => ms(x.terminouEm) - ms(y.terminouEm))
    const media = (xs: (number | null | undefined)[]) => {
      const v = xs.filter((x): x is number => x != null)
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
    }
    let k = 0, d = 0, a = 0, comAcs = 0, mvps = 0, fb = 0, vit = 0, seq = 0, melhorSeq = 0, atual = 0, capP = 0, capV = 0
    const js: JogadorGuardado[] = []
    const mapas = new Map<string, { partidas: number; vitorias: number; acs: number[] }>()
    for (const p of lista) {
      const j = p.jogadores.find((x) => x.perfilId === perfilId)!
      const ganhou = p.vencedor === j.equipa
      js.push(j)
      if (ganhou) vit++
      if (j.acs != null) { k += j.kills ?? 0; d += j.deaths ?? 0; a += j.assists ?? 0; comAcs++ }
      if (j.mvp) mvps++
      fb += j.firstBloods ?? 0
      seq = ganhou ? seq + 1 : 0
      melhorSeq = Math.max(melhorSeq, seq)
      atual = ganhou ? (atual > 0 ? atual + 1 : 1) : (atual < 0 ? atual - 1 : -1)
      if (j.capitao) { capP++; if (ganhou) capV++ }
      const m = mapas.get(p.mapa ?? '?') ?? { partidas: 0, vitorias: 0, acs: [] }
      m.partidas++
      if (ganhou) m.vitorias++
      if (j.acs != null) m.acs.push(j.acs)
      mapas.set(p.mapa ?? '?', m)
    }
    const comStats = js.filter((j) => j.acs != null)
    const ordem = classificados(e)
    return {
      partidas: lista.length, vitorias: vit,
      kda: comAcs ? (k + a) / Math.max(1, d) : null, kd: comAcs ? k / Math.max(1, d) : null,
      acs: media(comStats.map((j) => j.acs)),
      killsMedia: media(comStats.map((j) => j.kills)), mortesMedia: media(comStats.map((j) => j.deaths)), assistMedia: media(comStats.map((j) => j.assists)),
      hsPct: media(js.map((j) => j.hsPct)), kastPct: media(js.map((j) => j.kastPct)), tradesMedia: media(js.map((j) => j.trades)),
      fbMedia: media(comStats.map((j) => j.firstBloods)),
      mvps, firstBloods: fb,
      melhorAcs: comStats.length ? Math.max(...comStats.map((j) => j.acs!)) : null,
      maisKills: comStats.length ? Math.max(...comStats.map((j) => j.kills ?? 0)) : null,
      melhorSequencia: melhorSeq, sequenciaAtual: atual,
      capitao: { partidas: capP, vitorias: capV },
      porMapa: [...mapas.entries()]
        .map(([mapa, m]) => ({ mapa, partidas: m.partidas, vitorias: m.vitorias, acs: media(m.acs) }))
        .sort((x, y) => y.partidas - x.partidas || x.mapa.localeCompare(y.mapa)),
      posicao: ordem.findIndex((p) => p.id === perfilId) + 1, totalJogadores: ordem.length,
    }
  },

  async forma(perfilId, n) {
    const e = await pronto()
    const lista = terminadas(e)
      .filter((p) => p.jogadores.some((j) => j.perfilId === perfilId && j.equipa))
      .sort((x, y) => ms(x.terminouEm) - ms(y.terminouEm))
      .slice(-n)
    return lista.map((p): PontoForma => {
      const j = p.jogadores.find((x) => x.perfilId === perfilId)!
      const minhaA = j.equipa === 'A'
      const adv = minhaA ? p.capitaoB : p.capitaoA
      const meus = minhaA ? p.resultadoA : p.resultadoB
      const deles = minhaA ? p.resultadoB : p.resultadoA
      return {
        partidaId: p.id, data: p.terminouEm!, mapa: p.mapa ?? '?', adversario: `Equipa ${nomeCurto(e.perfis[adv ?? ''])}`,
        venceu: p.vencedor === j.equipa, resultado: `${meus}-${deles}`, pontos: j.pontosDepois ?? 0, delta: j.deltaPontos ?? 0,
        kda: j.kills != null ? ((j.kills ?? 0) + (j.assists ?? 0)) / Math.max(1, j.deaths ?? 1) : null, acs: j.acs, mvp: j.mvp,
      }
    })
  },

  async ranking({ cursor, limite = 50, soAmigos, pesquisa }) {
    const e = await pronto()
    const ordem = classificados(e)
    const posicoes = new Map(ordem.map((p, i) => [p.id, i + 1]))
    let lista = ordem
    if (soAmigos && e.sessao) {
      const ok = new Set([e.sessao.perfilId, ...amigosDe(e, e.sessao.perfilId)])
      lista = lista.filter((p) => ok.has(p.id))
    }
    const q = pesquisa?.trim().toLowerCase()
    if (q) lista = lista.filter((p) => p.riotId!.toLowerCase().includes(q) || p.utilizador.includes(q))
    const inicio = cursor ? Number(cursor) : 0
    const pagina = lista.slice(inicio, inicio + limite)
    // Os últimos cinco resultados de cada um, do mais antigo para o mais recente.
    const forma = new Map<string, ('V' | 'D')[]>()
    const ids = new Set(pagina.map((p) => p.id))
    for (const p of terminadas(e).sort((x, y) => ms(x.terminouEm) - ms(y.terminouEm))) {
      for (const j of p.jogadores) {
        if (!ids.has(j.perfilId) || !j.equipa) continue
        const f = forma.get(j.perfilId) ?? []
        f.push(p.vencedor === j.equipa ? 'V' : 'D')
        if (f.length > 5) f.shift()
        forma.set(j.perfilId, f)
      }
    }
    const linhas: LinhaRanking[] = pagina.map((p) => ({ posicao: posicoes.get(p.id)!, perfil: { ...p }, forma: forma.get(p.id) ?? [] }))
    return { linhas, cursor: inicio + limite < lista.length ? String(inicio + limite) : null, total: lista.length }
  },

  async posicao(perfilId) {
    const e = await carregar()
    return classificados(e).findIndex((p) => p.id === perfilId) + 1
  },

  async estadoFila() {
    const e = await pronto()
    const id = e.sessao?.perfilId
    const minha = id ? e.fila.find((f) => f.perfilId === id) : undefined
    const p = id ? e.perfis[id] : null
    return {
      naFila: !!minha, desde: minha?.desde ?? null, contagem: e.fila.length, regiao: p?.regiao ?? 'eu',
      cooldownAte: p?.cooldownAte && ms(p.cooldownAte) > Date.now() ? p.cooldownAte : null,
    }
  },

  async entrarFila() {
    const e = await pronto()
    const p = eu(e)
    if (!p.riotId) throw new Error('Liga o teu Riot ID antes de entrar na fila.')
    if (p.cooldownAte && ms(p.cooldownAte) > Date.now()) throw new Error('Ainda estás de castigo por não aceitares uma partida.')
    if (noJogo(e, p.id)) throw new Error('Já tens uma partida a decorrer.')
    if (e.fila.some((f) => f.perfilId === p.id)) return
    e.fila.push({ perfilId: p.id, desde: iso(Date.now()) })
    // Há sempre alguém à espera, como num hub com gente.
    const extra = Math.floor(aleatorio(1, 4))
    for (let i = 0; i < extra && e.fila.length < 9; i++) {
      const b = botLivre(e)
      if (b) e.fila.push({ perfilId: b, desde: iso(Date.now() - aleatorio(20_000, 160_000)) })
    }
    e.proximoBotEm = Date.now() + aleatorio(2000, 3500)
    guardar()
    avisarMudanca('fila')
  },

  async sairFila() {
    const e = await carregar()
    const p = eu(e)
    e.fila = e.fila.filter((f) => f.perfilId !== p.id)
    e.proximoBotEm = null
    e.proximaSimulada = false
    guardar()
    avisarMudanca('fila')
  },

  async partidaAtiva() {
    const e = await pronto()
    const id = e.sessao?.perfilId
    if (!id) return null
    const p = e.partidas.filter((x) => ativa(x.estado) && x.jogadores.some((j) => j.perfilId === id)).sort((x, y) => ms(y.criadaEm) - ms(x.criadaEm))[0]
    return p ? publica(e, p) : null
  },

  async partida(id) {
    const e = await pronto()
    const p = e.partidas.find((x) => x.id === id)
    return p ? publica(e, p) : null
  },

  async avancarPartida(id) {
    const e = await pronto()
    const p = e.partidas.find((x) => x.id === id)
    return p ? publica(e, p) : null
  },

  async responderConfirmacao(id, aceita) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    const j = p.jogadores.find((x) => x.perfilId === me.id)
    if (!j || p.estado !== 'READY_CHECK') throw new Error('Esta confirmação já terminou.')
    const agora = Date.now()
    if (aceita) {
      j.aceitou = true
      toque(p, agora)
      if (p.jogadores.every((x) => x.aceitou)) iniciarDraft(e, p, agora)
    } else {
      j.aceitou = false
      falhouConfirmacao(e, p, agora)
    }
    guardar()
    avisarMudanca('partida')
  },

  async escolherJogador(id, perfilId) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.estado !== 'DRAFT_PHASE') throw new Error('O draft já terminou.')
    const cap = equipaDaEscolha(escolhidos(p)) === 'A' ? p.capitaoA : p.capitaoB
    if (cap !== me.id) throw new Error('Ainda não é a tua vez de escolher.')
    escolher(e, p, perfilId, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async banirMapa(id, mapa) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.estado !== 'MAP_BAN') throw new Error('Os bans já terminaram.')
    const cap = equipaDoBan(p.bans.length) === 'A' ? p.capitaoA : p.capitaoB
    if (cap !== me.id) throw new Error('Ainda não é a tua vez de banir.')
    banir(e, p, mapa, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async definirCodigo(id, codigo) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.estado !== 'LOBBY_CREATION') throw new Error('O código já foi partilhado.')
    if (p.capitaoA !== me.id) throw new Error('Só o capitão da Equipa A cria o grupo.')
    const c = codigo.trim().toUpperCase()
    if (!PADRAO_CODIGO.test(c)) throw new Error('O código tem 6 letras ou números.')
    comecar(p, c, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async submeterResultado(id, a, b) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.capitaoA !== me.id && p.capitaoB !== me.id) throw new Error('Só os capitães submetem o resultado.')
    if (p.estado === 'IN_PROGRESS') throw new Error('O resultado só abre 15 minutos depois de partilhado o código.')
    if (p.estado !== 'RESULT_SUBMISSION') throw new Error('Esta partida já não aceita resultados.')
    if (p.submissoes.some((s) => s.capitaoId === me.id)) throw new Error('Já submeteste o resultado.')
    const v = validarResultado(a, b)
    if (!v.ok) throw new Error(v.titulo)
    const agora = Date.now()
    submeter(e, p, me.id, a, b, agora)
    if (e.motores[p.id]) e.motores[p.id].jogadaEm = agora + aleatorio(1800, 3200)
    guardar()
    avisarMudanca('partida')
  },

  // No modo demo não há amigos reais na fila: completar é o mesmo que encher com bots.
  async devCompletarFila(opts) {
    return dadosLocais.devEncherFila(opts)
  },

  async devEncherFila({ serCapitao }) {
    const e = await pronto()
    const p = exigirDev(e)
    if (noJogo(e, p.id)) throw new Error('Já tens uma partida a decorrer.')
    if (!p.riotId) throw new Error('Liga o teu Riot ID antes de entrar na fila.')
    e.serCapitao = serCapitao
    if (!e.fila.some((f) => f.perfilId === p.id)) e.fila.push({ perfilId: p.id, desde: iso(Date.now()) })
    while (e.fila.length < 10) {
      const b = botLivre(e)
      if (!b) break
      e.fila.push({ perfilId: b, desde: iso(Date.now() - aleatorio(5_000, 90_000)) })
    }
    e.proximaSimulada = true
    e.proximoBotEm = Date.now()
    passoFila(e, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async devSimularPartida() {
    const e = await pronto()
    const p = exigirDev(e)
    if (noJogo(e, p.id)) throw new Error('Já tens uma partida a decorrer.')
    e.fila = e.fila.filter((f) => f.perfilId !== p.id)
    const ids = [p.id]
    while (ids.length < 10) {
      const b = botLivre(e, ids)
      if (!b) break
      ids.push(b)
      e.fila = e.fila.filter((f) => f.perfilId !== b)
    }
    if (ids.length < 10) throw new Error('Não há jogadores livres suficientes para simular.')
    criarPartida(e, ids, { simulada: true, automatica: true })
    guardar()
    avisarMudanca('partida')
  },

  async devSaltarBloqueio(id) {
    const e = await pronto()
    exigirDev(e)
    const p = obterPartida(e, id)
    if (p.estado !== 'IN_PROGRESS') throw new Error('A partida não está em jogo.')
    abrirResultado(e, p, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async devAcelerar(id) {
    const e = await pronto()
    exigirDev(e)
    const p = obterPartida(e, id)
    const m = motor(e, p)
    const agora = Date.now()
    for (const k of Object.keys(m.aceitaEm)) m.aceitaEm[k] = agora
    m.jogadaEm = agora
    if (p.estado === 'IN_PROGRESS' || p.estado === 'PROCESSING_API') p.prazoFase = iso(agora)
    passo()
    guardar()
    avisarMudanca('partida')
  },

  async devMudarFuncao(funcao) {
    const e = await carregar()
    eu(e).funcao = funcao
    guardar()
    avisarMudanca('perfil')
    avisarSessao()
  },

  async reporDemo() {
    try { localStorage.removeItem(CHAVE) } catch { /* ignora */ }
    estado = null
    aCarregar = null
    await carregar()
    avisarSessao()
    avisarMudanca('partida')
  },

  async partidas({ minhas, cursor, mapa, perfilId }) {
    const e = await pronto()
    const ref = perfilId ?? (minhas ? e.sessao?.perfilId ?? null : null)
    let lista = e.partidas.filter((p) => p.estado === 'COMPLETED')
    if (ref) lista = lista.filter((p) => p.jogadores.some((j) => j.perfilId === ref && j.equipa))
    // As simuladas só aparecem no histórico de quem as jogou.
    if (!minhas || perfilId) lista = lista.filter((p) => !p.simulada)
    if (mapa) lista = lista.filter((p) => p.mapa === mapa)
    lista.sort((x, y) => ms(y.terminouEm) - ms(x.terminouEm))
    const inicio = cursor ? Number(cursor) : 0
    const pagina = lista.slice(inicio, inicio + 20)
    return { linhas: pagina.map((p) => resumo(e, p, ref)), cursor: inicio + 20 < lista.length ? String(inicio + 20) : null }
  },

  async jogadoresDaPartida(id) {
    const e = await carregar()
    const p = obterPartida(e, id)
    return p.jogadores.map((j) => jogadorPublico(e, j))
  },

  async missoes() {
    const e = await pronto()
    return progressoMissoes(e, eu(e))
  },

  async amigos() {
    const e = await pronto()
    const me = eu(e)
    const naFila = new Set(e.fila.map((f) => f.perfilId))
    const emJogo = new Set<string>()
    // Disputas e partidas paradas há mais de 2 horas não contam como estar a jogar.
    const recente = Date.now() - 2 * 3_600_000
    for (const p of e.partidas) {
      if (ativa(p.estado) && p.estado !== 'DISPUTE' && ms(p.atualizadaEm) > recente) p.jogadores.forEach((j) => emJogo.add(j.perfilId))
    }
    const ultima = new Map<string, string>()
    for (const p of terminadas(e, true)) for (const j of p.jogadores) {
      if (!ultima.has(j.perfilId) || ms(ultima.get(j.perfilId)) < ms(p.terminouEm)) ultima.set(j.perfilId, p.terminouEm!)
    }
    return e.amizades
      .filter((a) => a.de === me.id || a.para === me.id)
      .map((a): Amizade => {
        const outro = a.de === me.id ? a.para : a.de
        return {
          perfil: { ...e.perfis[outro] }, estado: a.estado,
          direcao: a.estado === 'pendente' ? (a.de === me.id ? 'enviado' : 'recebido') : null,
          atividade: emJogo.has(outro) ? 'jogo' : naFila.has(outro) ? 'fila' : null,
          ultimaPartida: ultima.get(outro) ?? null, desde: a.desde,
        }
      })
      .filter((a) => a.perfil.id)
  },

  async pedirAmizade(alvo) {
    const e = await carregar()
    const me = eu(e)
    const q = alvo.trim().toLowerCase()
    const p = Object.values(e.perfis).find((x) => x.riotId?.toLowerCase() === q || x.utilizador === q)
    if (!p) throw new Error('Não encontrámos ninguém com esse Riot ID ou utilizador.')
    if (p.id === me.id) throw new Error('Não te podes adicionar a ti próprio.')
    const existente = e.amizades.find((a) => (a.de === me.id && a.para === p.id) || (a.de === p.id && a.para === me.id))
    if (existente?.estado === 'aceite') throw new Error('Já são amigos.')
    if (existente && existente.de === me.id) throw new Error('Já enviaste um pedido a este jogador.')
    if (existente) existente.estado = 'aceite'
    else e.amizades.push({ de: me.id, para: p.id, estado: 'pendente', desde: iso(Date.now()) })
    guardar()
    avisarMudanca('amigos')
  },

  async responderAmizade(perfilId, aceitar) {
    const e = await carregar()
    const me = eu(e)
    const a = e.amizades.find((x) => x.de === perfilId && x.para === me.id && x.estado === 'pendente')
    if (!a) throw new Error('Este pedido já não existe.')
    if (aceitar) { a.estado = 'aceite'; a.desde = iso(Date.now()) }
    else e.amizades = e.amizades.filter((x) => x !== a)
    guardar()
    avisarMudanca('amigos')
  },

  async removerAmigo(perfilId) {
    const e = await carregar()
    const me = eu(e)
    e.amizades = e.amizades.filter((a) => !((a.de === me.id && a.para === perfilId) || (a.de === perfilId && a.para === me.id)))
    guardar()
    avisarMudanca('amigos')
  },

  async sugestoes(ordem) {
    const e = await carregar()
    const me = e.sessao?.perfilId
    const lista = e.sugestoes.map((s): Sugestao => ({
      id: s.id, titulo: s.titulo, descricao: s.descricao, categoria: s.categoria, estado: s.estado,
      autor: nomeCurto(e.perfis[s.autorId]), criadaEm: s.criadaEm, votos: s.votos.length, votei: !!me && s.votos.includes(me),
    }))
    return lista.sort((x, y) => (ordem === 'votos' ? y.votos - x.votos : 0) || ms(y.criadaEm) - ms(x.criadaEm))
  },

  async criarSugestao({ titulo, categoria, descricao }) {
    const e = await carregar()
    const me = eu(e)
    if (titulo.trim().length < 6) throw new Error('Dá um título com pelo menos 6 caracteres.')
    if (descricao.trim().length < 10) throw new Error('Explica a ideia em pelo menos 10 caracteres.')
    e.sugestoes.unshift({
      id: novoId(), titulo: titulo.trim().slice(0, 80), descricao: descricao.trim().slice(0, 500), categoria,
      estado: 'recebida', autorId: me.id, criadaEm: iso(Date.now()), votos: [me.id],
    })
    guardar()
    avisarMudanca('sugestoes')
  },

  async votar(id) {
    const e = await carregar()
    const me = eu(e)
    const s = e.sugestoes.find((x) => x.id === id)
    if (!s) return
    s.votos = s.votos.includes(me.id) ? s.votos.filter((v) => v !== me.id) : [...s.votos, me.id]
    guardar()
    avisarMudanca('sugestoes')
  },

  async denunciar(perfilId, motivo, detalhes) {
    const e = await carregar()
    const me = eu(e)
    if (perfilId === me.id) throw new Error('Não te podes denunciar a ti próprio.')
    if (detalhes.trim().length < 10) throw new Error('Conta o que aconteceu em pelo menos 10 caracteres.')
    e.denuncias.unshift({ id: novoId(), denuncianteId: me.id, alvoId: perfilId, motivo, detalhes: detalhes.trim(), estado: 'aberta', criadaEm: iso(Date.now()) })
    guardar()
    avisarMudanca('staff')
  },

  async disputas() {
    const e = await pronto()
    exigirStaff(e)
    return e.partidas.filter((p) => p.estado === 'DISPUTE').map((p) => publica(e, p))
  },

  async resolverDisputa(id, r) {
    const e = await pronto()
    exigirStaff(e)
    const p = obterPartida(e, id)
    if (p.estado !== 'DISPUTE') throw new Error('Esta disputa já foi resolvida.')
    const agora = Date.now()
    if (!r) cancelar(e, p, agora)
    else {
      const v = validarResultado(r.a, r.b)
      if (!v.ok) throw new Error(v.titulo)
      p.resultadoA = r.a
      p.resultadoB = r.b
      terminar(e, p, agora)
    }
    guardar()
    avisarMudanca('staff')
  },

  async partidasEncravadas() {
    const e = await pronto()
    exigirStaff(e)
    const agora = Date.now()
    return e.partidas
      .filter((p) => {
        if (!ativa(p.estado) || p.estado === 'DISPUTE') return false
        const parada = agora - ms(p.atualizadaEm)
        return p.estado === 'IN_PROGRESS' || p.estado === 'RESULT_SUBMISSION' ? parada > 3 * 3_600_000 : parada > 10 * 60_000
      })
      .map((p) => publica(e, p))
  },

  async cancelarPartida(id) {
    const e = await pronto()
    exigirStaff(e)
    const p = obterPartida(e, id)
    if (!ativa(p.estado)) throw new Error('Esta partida já terminou.')
    cancelar(e, p, Date.now())
    guardar()
    avisarMudanca('staff')
  },

  async removerPartida(id) {
    const e = await carregar()
    const me = eu(e)
    if (me.funcao !== 'owner' && me.funcao !== 'dev') throw new Error('Só Owner e Dev podem fazer isto.')
    const p = obterPartida(e, id)
    if (p.estado !== 'COMPLETED' && p.estado !== 'CANCELLED') throw new Error('Cancela a partida antes de a remover.')
    // Numa partida real terminada, devolve os pontos, as vitórias e as derrotas.
    if (p.estado === 'COMPLETED' && !p.simulada) {
      for (const j of p.jogadores) {
        const perfil = e.perfis[j.perfilId]
        if (!perfil || !j.equipa || j.deltaPontos == null) continue
        perfil.pontos -= j.deltaPontos
        if (j.equipa === p.vencedor) perfil.vitorias = Math.max(0, perfil.vitorias - 1)
        else perfil.derrotas = Math.max(0, perfil.derrotas - 1)
      }
    }
    e.partidas = e.partidas.filter((x) => x.id !== id)
    guardar()
    avisarMudanca('partida')
    avisarMudanca('perfil')
  },

  async definirPontos(perfilId, pontos) {
    const e = await carregar()
    const me = eu(e)
    if (me.funcao !== 'owner' && me.funcao !== 'dev') throw new Error('Só Owner e Dev podem fazer isto.')
    if (!Number.isInteger(pontos) || pontos < 0 || pontos > 10000) throw new Error('Os pontos têm de estar entre 0 e 10000.')
    const alvo = e.perfis[perfilId]
    if (!alvo) throw new Error('Jogador não encontrado.')
    alvo.pontos = pontos
    guardar()
    avisarMudanca('staff')
    avisarMudanca('perfil')
  },

  async denuncias() {
    const e = await carregar()
    exigirStaff(e)
    return e.denuncias
      .map((d): Denuncia => ({
        id: d.id, denunciante: nomeCurto(e.perfis[d.denuncianteId]), alvo: { ...e.perfis[d.alvoId] }, motivo: d.motivo,
        detalhes: d.detalhes, estado: d.estado, criadaEm: d.criadaEm,
      }))
      .sort((x, y) => Number(x.estado !== 'aberta') - Number(y.estado !== 'aberta') || ms(y.criadaEm) - ms(x.criadaEm))
  },

  async tratarDenuncia(id, novo) {
    const e = await carregar()
    exigirStaff(e)
    const d = e.denuncias.find((x) => x.id === id)
    if (d) d.estado = novo
    guardar()
    avisarMudanca('staff')
  },

  async pesquisarJogadores(q) {
    const e = await carregar()
    exigirStaff(e)
    const t = q.trim().toLowerCase()
    return Object.values(e.perfis)
      .filter((p) => !t || p.utilizador.includes(t) || p.riotId?.toLowerCase().includes(t))
      .sort((x, y) => x.utilizador.localeCompare(y.utilizador))
      .slice(0, 25)
      .map((p) => ({ ...p }))
  },

  async definirFuncao(perfilId, funcao: Funcao) {
    const e = await carregar()
    const me = exigirStaff(e)
    const alvo = e.perfis[perfilId]
    if (!alvo) throw new Error('Jogador não encontrado.')
    if (alvo.id === me.id) throw new Error('Não podes mudar a tua própria função.')
    if (me.funcao === 'mod') throw new Error('Só Owner e Dev mudam funções.')
    if ((funcao === 'owner' || funcao === 'dev' || alvo.funcao === 'owner') && me.funcao !== 'owner') {
      throw new Error('Só o Owner atribui ou retira as funções Owner e Dev.')
    }
    alvo.funcao = funcao
    guardar()
    avisarMudanca('staff')
  },
}
