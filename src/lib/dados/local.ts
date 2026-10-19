/**
 * Modo demo: tudo guardado no browser (localStorage).
 *
 * Serve para experimentar o Rangify sem configurar nada. A comunidade de
 * exemplo é gerada na primeira visita e a máquina de estados da partida corre
 * aqui, com os outros nove jogadores a jogar sozinhos: aceitam, escolhem,
 * banem, criam o grupo e confirmam o resultado. A palavra-passe fica só como
 * hash SHA-256, mas isto continua a ser um modo de demonstração.
 */
import { NOMES_MAPAS, ROTACAO_PADRAO, equipaDoBan, totalBans } from '../mapas'
import { PONTOS_INICIAIS, bonusDesempenho, calcularPontos } from '../pontos'
import { AGENTES_SIMULADOS } from '../agentes'
import { divisao, mediaDivisoes } from '../ranks'
import {
  ESTADOS_ATIVOS, HORAS_CACHE_RANK, MINUTOS_BLOQUEIO, MINUTOS_COOLDOWN, PADRAO_CODIGO, PADRAO_RIOT_ID,
  SEGUNDOS_BAN, SEGUNDOS_CONFIRMAR, SEGUNDOS_ESCOLHA, SEGUNDOS_LADO, equipaDaEscolha, validarResultado,
} from '../regras'
import { blobParaDataUrl } from '../imagem'
import { nivelDe } from '../experiencia'
import {
  COINS_POR_DIARIA, COINS_POR_MARCO, COINS_POR_MVP, COINS_POR_NIVEL, COINS_POR_SEMANAL, ITEM_POR_ID, ITENS_LOJA, gifValida,
  type CategoriaLoja, type Cosmeticos, type Raridade,
} from '../loja'
import { periodoSemana } from '../tempo'
import { VALORES_CONVITE } from '../convites'
import { aoMudarDados, avisarMudanca } from './eventos'
import { criarTorneiosLocais, type ContextoTorneios } from './local-torneios'
import {
  aplicarResultado, baralhar, calcularRangifyScore, codigoGrupo, codigoPartida, definirCapitaes, escolhidos, gerarEstatisticas, gerarResultado,
  melhorDisponivel, novoJogador, type JogadorGuardado, type PartidaGuardada,
} from './motor'
import {
  ID_DEMO, INICIO_TEMPORADA, MISSOES, PASSWORD_DEMO, gerarSemente,
  type AmizadeGuardada, type DenunciaGuardada, type SugestaoGuardada,
} from './semente'
import type {
  Amizade, AvisoStaff, BanFila, ConvitesInfo, Dados, Denuncia, DivulgacaoEstado, JogadorAgente, OverlayDados, RankingAgentes, StreamerAoVivo, Equipa, EstadoLoja, EstadoPartida, Lado, Experiencia, Funcao, JogadorPartida, LinhaNivel, LinhaRanking, Missao, Novidade, Partida, Perfil,
  PontoForma, ResumoPartida, Sessao, Sugestao,
} from './tipos'

// v6: novidades publicadas pela staff; os dados de exemplo voltam a ser gerados.
const CHAVE = 'rangify:demo:v8'

/** O que o motor precisa de lembrar sobre uma partida a decorrer. */
interface Motor {
  aceitaEm: Record<string, number>
  jogadaEm: number | null
  resultado: { a: number; b: number } | null
}

interface Estado {
  versao: 7
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
  poolMapas: string[]
  rotacoes: Partial<Record<'diaria' | 'semanal', Rotacao>>
  conclusoes: Conclusao[]
  novidades: Novidade[]
  /** Discord obrigatório para a fila. No demo, "verificar" faz de conta que entraste no servidor. */
  discord?: { obrigatorio: boolean; convite: string | null; membro: boolean }
  /** A loja de Rangify Coins (só aparece a Owner e Dev até ser pública). */
  loja?: LojaDemo
  /** Avisos e bans da staff. */
  avisos?: AvisoGuardado[]
  /** Overlay, Twitch e convites (só Owner e Dev até a área ser pública). */
  streamers?: StreamersDemo
}

interface ConvidadoGuardado { convidadoId: string; convidadorId: string; criadoEm: string; estado: 'pendente' | 'premiado' | 'limite'; premiadoEm: string | null; moedasConvidador: number; moedasConvidado: number }
interface StreamersDemo {
  publico: boolean
  chaves: Record<string, string>
  twitch: Record<string, { login: string; nome: string; ligadaEm: string; aoVivo: boolean; titulo: string | null; jogo: string | null; espetadores: number | null }>
  codigos: Record<string, string>
  convidados: ConvidadoGuardado[]
}

interface AvisoGuardado extends AvisoStaff { alvoId: string; autorId: string }

interface RotacaoLoja { dia: string; diarios: string[]; semanais: string[]; destaque: string | null; semana: string; bloco: number }
interface LojaDemo {
  publica: boolean
  rotacoes: RotacaoLoja[]
  inventario: { perfilId: string; itemId: string; origem: 'compra' | 'conquista'; em: string }[]
  equipados: Record<string, Partial<Record<CategoriaLoja, string>>>
  movimentos: { perfilId: string; delta: number; motivo: 'compra' | 'devolucao' | 'teste' | 'convite'; itemId: string | null; em: string }[]
  gifs: Record<string, string>
}

interface Rotacao { id: string; inicio: string; ids: string[] }
interface Conclusao { perfilId: string; missaoId: string; chave: string; xp: number; em: string }

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
      localStorage.removeItem('rangify:demo:v3')
      localStorage.removeItem('rangify:demo:v4')
      localStorage.removeItem('rangify:demo:v5')
      localStorage.removeItem('rangify:demo:v6')
      const txt = localStorage.getItem(CHAVE)
      if (txt) lido = JSON.parse(txt) as Estado
    } catch { lido = null }
    if (!lido || lido.versao !== 7) {
      const s = gerarSemente()
      lido = {
        versao: 7, contas: { nyx: { perfilId: ID_DEMO, hash: await sha256(PASSWORD_DEMO) } },
        perfis: s.perfis, partidas: s.partidas, fila: [], proximoBotEm: null, proximaSimulada: false, motores: {},
        amizades: s.amizades, sugestoes: s.sugestoes, denuncias: s.denuncias, sessao: null, serCapitao: false, poolMapas: [...ROTACAO_PADRAO],
        rotacoes: {}, conclusoes: [],
        novidades: [{ id: novoId(), data: '2026-09-01', titulo: 'A Temporada 1 arrancou. Toda a gente começa com 1000 pontos.', texto: 'Ganhar a equipas acima do teu rank oficial vale mais. Perder contra elas custa menos.', criadaEm: new Date().toISOString() }],
      }
      // A comunidade de exemplo já traz o XP das missões que as partidas dela completam.
      for (const id of Object.keys(lido.perfis)) atualizarMissoes(lido, id)
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

function streamersDemo(e: Estado): StreamersDemo {
  if (!e.streamers) e.streamers = { publico: false, chaves: {}, twitch: {}, codigos: {}, convidados: [] }
  return e.streamers
}
const streamersVisivel = (e: Estado, p: Perfil) => streamersDemo(e).publico || p.funcao === 'owner' || p.funcao === 'dev'
function exigirStreamers(e: Estado) {
  const p = eu(e)
  if (!streamersVisivel(e, p)) throw new Error('Esta área ainda não está aberta.')
  return p
}
const novaChave = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
function codigoConvite(e: Estado, perfilId: string) {
  const s = streamersDemo(e)
  if (!s.codigos[perfilId]) s.codigos[perfilId] = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return s.codigos[perfilId]
}

/** Paga um convite pendente: moedas aos dois, bónus a cada 5 e o limite mensal (como _premiar_convite). */
function premiarConvite(e: Estado, c: ConvidadoGuardado) {
  const s = streamersDemo(e)
  const v = VALORES_CONVITE
  const agora = Date.now()
  const doMes = s.convidados.filter((x) => x.convidadorId === c.convidadorId && x.estado === 'premiado' && agora - ms(x.premiadoEm) < 30 * 86_400_000).length
  if (doMes >= v.limiteMes) { c.estado = 'limite'; c.premiadoEm = iso(agora); return }
  const premiados = s.convidados.filter((x) => x.convidadorId === c.convidadorId && x.estado === 'premiado').length + 1
  const total = v.convidador + (premiados % v.marcoACada === 0 ? v.bonusMarco : 0)
  const mov = lojaDemo(e).movimentos
  mov.push({ perfilId: c.convidadoId, delta: v.convidado, motivo: 'convite', itemId: null, em: iso(agora) })
  mov.push({ perfilId: c.convidadorId, delta: total, motivo: 'convite', itemId: null, em: iso(agora) })
  c.estado = 'premiado'; c.premiadoEm = iso(agora); c.moedasConvidador = total; c.moedasConvidado = v.convidado
}

function estadoDivulgacao(e: Estado): DivulgacaoEstado {
  const s = streamersDemo(e)
  const porConvidador = new Map<string, { convidados: number; premiados: number }>()
  for (const c of s.convidados) {
    const x = porConvidador.get(c.convidadorId) ?? { convidados: 0, premiados: 0 }
    x.convidados++
    if (c.estado === 'premiado') x.premiados++
    porConvidador.set(c.convidadorId, x)
  }
  return {
    publico: s.publico,
    twitchLigadas: Object.keys(s.twitch).length,
    aoVivo: Object.values(s.twitch).filter((t) => t.aoVivo).length,
    overlays: Object.keys(s.chaves).length,
    convidados: s.convidados.length,
    premiados: s.convidados.filter((c) => c.estado === 'premiado').length,
    moedasDadas: s.convidados.reduce((t, c) => t + c.moedasConvidador + c.moedasConvidado, 0),
    top: [...porConvidador.entries()]
      .map(([perfilId, x]) => ({ perfilId, utilizador: nomeCurto(e.perfis[perfilId]), ...x }))
      .sort((a, b) => b.premiados - a.premiados || b.convidados - a.convidados)
      .slice(0, 10),
  }
}

function exigirStaff(e: Estado) {
  const p = eu(e)
  if (!['owner', 'dev', 'mod'].includes(p.funcao)) throw new Error('Esta área é só para a equipa do Rangify.')
  return p
}

const NIVEL_FUNCAO: Record<Funcao, number> = { owner: 4, dev: 3, mod: 2, verified: 1, user: 0 }

/** Só pune quem tem uma função acima da do alvo (e ninguém se pune a si próprio). */
function exigirPodePunir(e: Estado, perfilId: string) {
  const me = exigirStaff(e)
  const alvo = e.perfis[perfilId]
  if (!alvo || alvo.bot) throw new Error('Jogador não encontrado.')
  if (alvo.id === me.id) throw new Error('Não podes aplicar isto a ti próprio.')
  if (NIVEL_FUNCAO[alvo.funcao] >= NIVEL_FUNCAO[me.funcao]) throw new Error('Só podes avisar ou banir jogadores com uma função abaixo da tua.')
  return { me, alvo }
}

/** O ban da fila que está a valer agora (um ban com a data passada já não conta). */
function banAtivo(e: Estado, perfilId: string): (BanFila & { aviso: AvisoGuardado }) | null {
  const a = (e.avisos ?? [])
    .filter((x) => x.alvoId === perfilId && x.tipo === 'ban' && !x.levantadoEm && (x.permanente || ms(x.banAte) > Date.now()))
    .sort((x, y) => ms(y.criadoEm) - ms(x.criadoEm))[0]
  return a ? { ate: a.banAte, permanente: a.permanente, mensagem: a.mensagem, aviso: a } : null
}

const banPublico = (b: ReturnType<typeof banAtivo>): BanFila | null => (b ? { ate: b.ate, permanente: b.permanente, mensagem: b.mensagem } : null)

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
    rangifyScore: j.rangifyScore ?? null, deltaDesempenho: j.deltaDesempenho ?? null, agente: j.agente ?? null,
  }
}

function publica(e: Estado, p: PartidaGuardada): Partida {
  // As sugestões só aparecem à equipa que está a decidir (no demo, a do jogador).
  const meu = p.jogadores.find((j) => j.perfilId === e.sessao?.perfilId)?.equipa
  const sugestoes = p.estado === 'MAP_BAN' && meu && meu === vezMapas(p).equipa ? [...(p.sugestoes ?? [])] : []
  return {
    ...p, bans: [...p.bans], submissoes: [...p.submissoes], lado: p.lado ? { ...p.lado } : null, sugestoes,
    cancelamento: estadoCancelamento(e, p),
    jogadores: p.jogadores.map((j) => jogadorPublico(e, j)),
  }
}

const MINUTOS_CANCELAR = 10

/** Só as pessoas votam: 70% delas (7 de 10) cancelam a partida. No demo, os outros jogadores são simulados, por isso a única pessoa és tu. */
function pessoasDa(e: Estado, p: PartidaGuardada) {
  const eu = e.sessao?.perfilId
  return p.jogadores.filter((j) => j.equipa && j.perfilId === eu).map((j) => j.perfilId)
}

function estadoCancelamento(e: Estado, p: PartidaGuardada) {
  if (p.estado !== 'LOBBY_CREATION' && p.estado !== 'IN_PROGRESS') return null
  const pessoas = pessoasDa(e, p)
  const eu = e.sessao?.perfilId ?? ''
  const votos = (p.votosCancelar ?? []).filter((id) => pessoas.includes(id))
  return {
    votos: votos.length,
    necessarios: Math.max(1, Math.ceil(pessoas.length * 0.7)),
    euVotei: votos.includes(eu),
    aberto: p.estado === 'LOBBY_CREATION' || (!!p.comecouEm && Date.now() - ms(p.comecouEm) < MINUTOS_CANCELAR * 60_000),
  }
}

/** A vez nos mapas: um ban (passo 0, 1, 2...) ou a escolha do lado (passo 100). */
function vezMapas(p: PartidaGuardada): { passo: number; equipa: Equipa; capitao: string | null } {
  if (p.mapa && p.lado) return { passo: 100, equipa: p.lado.equipa, capitao: p.lado.equipa === 'A' ? p.capitaoA : p.capitaoB }
  const equipa = equipaDoBan(p.bans.length)
  return { passo: p.bans.length, equipa, capitao: equipa === 'A' ? p.capitaoA : p.capitaoB }
}

/** A sugestão mais votada da equipa (a mais antiga desempata), se ainda for válida. */
function sugestaoTop(p: PartidaGuardada): string | null {
  const vez = vezMapas(p)
  const validas = (p.sugestoes ?? []).filter((s) => vez.passo === 100 ? s.valor === 'ataque' || s.valor === 'defesa'
    : p.pool.includes(s.valor) && !p.bans.some((b) => b.mapa === s.valor))
  const votos = new Map<string, number>()
  for (const s of validas) votos.set(s.valor, (votos.get(s.valor) ?? 0) + 1)
  let melhor: string | null = null
  for (const [v, n] of votos) if (melhor === null || n > (votos.get(melhor) ?? 0)) melhor = v
  return melhor
}

/** Um capitão automático espera mais se houver uma pessoa na equipa, para ela poder sugerir. */
function atrasoMapas(e: Estado, p: PartidaGuardada, equipa: Equipa) {
  if (p.automatica) return aleatorio(450, 900)
  const humano = e.sessao?.perfilId
  const naEquipa = p.jogadores.some((j) => j.perfilId === humano && j.equipa === equipa && !j.capitao)
  return naEquipa ? aleatorio(7000, 12000) : aleatorio(1600, 3400)
}

// As partidas de teste contam como as outras.
function terminadas(e: Estado) {
  return e.partidas.filter((p) => p.estado === 'COMPLETED')
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
      deaths: meu.deaths, assists: meu.assists, acs: meu.acs, mvp: meu.mvp,
      rangifyScore: meu.rangifyScore ?? null, agente: meu.agente ?? null, tierAdversario: media(outra),
    } : null,
  }
}

/** Só quem já jogou pelo menos uma partida aparece nas tabelas (como em _na_tabela, na base de dados). */
const jaJogou = (p: Perfil) => !!p.riotId && !p.bot && p.vitorias + p.derrotas > 0

function classificados(e: Estado): Perfil[] {
  return Object.values(e.perfis)
    .filter(jaJogou)
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
    simulada: opts.simulada, automatica: opts.automatica, pool: [...e.poolMapas],
    prazoConfirmacao: iso(agora + SEGUNDOS_CONFIRMAR * 1000), inicioFase: iso(agora), prazoFase: iso(agora + SEGUNDOS_CONFIRMAR * 1000),
    comecouEm: null, terminouEm: null, estatisticas: false, criadaEm: iso(agora), atualizadaEm: iso(agora),
    jogadores: ids.map((id) => novoJogador(e.perfis[id])), bans: [], submissoes: [], lado: null, sugestoes: [],
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
  definirCapitaes(p, forcar)
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
    p.sugestoes = []
    motor(e, p).jogadaEm = agora + atrasoMapas(e, p, 'A')
  } else {
    p.prazoFase = iso(agora + SEGUNDOS_ESCOLHA * 1000)
    motor(e, p).jogadaEm = agora + atraso(p)
  }
  toque(p, agora)
}

function banir(e: Estado, p: PartidaGuardada, mapa: string, agora: number) {
  if (p.mapa) throw new Error('Os bans já terminaram: falta escolher o lado.')
  if (!p.pool.includes(mapa) || p.bans.some((b) => b.mapa === mapa)) throw new Error('Esse mapa já não está disponível.')
  const n = p.bans.length
  const equipa = equipaDoBan(n)
  p.bans.push({ mapa, equipa, ordem: n + 1 })
  p.inicioFase = iso(agora)
  p.sugestoes = []
  const outra: Equipa = equipa === 'A' ? 'B' : 'A'
  if (n + 1 >= totalBans(p.pool)) {
    // Sobra um mapa. A equipa que não fez o último ban escolhe o lado.
    p.mapa = p.pool.find((m) => !p.bans.some((b) => b.mapa === m)) ?? null
    p.lado = { equipa: outra, escolha: null }
    p.prazoFase = iso(agora + SEGUNDOS_LADO * 1000)
  } else {
    p.prazoFase = iso(agora + SEGUNDOS_BAN * 1000)
  }
  motor(e, p).jogadaEm = agora + atrasoMapas(e, p, outra)
  toque(p, agora)
}

function escolherLado(e: Estado, p: PartidaGuardada, lado: Lado, agora: number) {
  if (p.estado !== 'MAP_BAN' || !p.mapa || !p.lado || p.lado.escolha) throw new Error('O lado já foi escolhido.')
  if (lado !== 'ataque' && lado !== 'defesa') throw new Error('Escolhe Ataque ou Defesa.')
  p.lado = { ...p.lado, escolha: lado }
  p.sugestoes = []
  p.estado = 'LOBBY_CREATION'
  p.inicioFase = iso(agora)
  p.prazoFase = iso(agora + 10 * 60_000)
  motor(e, p).jogadaEm = agora + (p.automatica ? 800 : aleatorio(3500, 5500))
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

const MINUTOS_ATE_API = 3

/**
 * Os capitães confirmaram (ou o tempo acabou): segue para a "API". No demo não há API:
 * o resultado é inventado, a favor da equipa que os capitães votaram.
 */
function seguirParaApi(e: Estado, p: PartidaGuardada, agora: number) {
  const m = motor(e, p)
  m.resultado ??= gerarResultado(Math.random, tiersDe(p, 'A'), tiersDe(p, 'B'))
  const votosA = p.submissoes.filter((s) => s.vencedor === 'A').length
  const votosB = p.submissoes.filter((s) => s.vencedor === 'B').length
  const ganhaA = votosA !== votosB ? votosA > votosB : m.resultado.a > m.resultado.b
  const r = (m.resultado.a > m.resultado.b) === ganhaA ? m.resultado : { a: m.resultado.b, b: m.resultado.a }
  p.resultadoA = r.a
  p.resultadoB = r.b
  p.estado = 'PROCESSING_API'
  p.inicioFase = iso(agora)
  p.prazoFase = iso(agora + (p.automatica ? 1200 : 3500))
  toque(p, agora)
}

function submeter(e: Estado, p: PartidaGuardada, capitaoId: string, vencedor: Equipa, agora: number) {
  p.submissoes.push({ capitaoId, vencedor, em: iso(agora) })
  toque(p, agora)
  if (p.submissoes.length >= 2) { seguirParaApi(e, p, agora); return }
  // Só um capitão votou: se o outro não votar, a API entra em ação 3 minutos depois.
  p.prazoFase = iso(Math.min(ms(p.prazoFase), agora + MINUTOS_ATE_API * 60_000))
}

function terminar(e: Estado, p: PartidaGuardada, agora: number) {
  const a = p.resultadoA ?? 13
  const b = p.resultadoB ?? 0
  p.vencedor = a > b ? 'A' : 'B'
  gerarEstatisticas(Math.random, p, e.perfis)
  aplicarResultado(p, e.perfis, a, b, iso(agora))
  for (const j of p.jogadores) if (j.equipa) atualizarMissoes(e, j.perfilId)
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
      const vez = vezMapas(p)
      if (agora >= ms(p.prazoFase) || (auto(vez.capitao) && m.jogadaEm != null && agora >= m.jogadaEm)) {
        // Sem decisão a tempo (ou capitão bot): vale a sugestão mais votada da equipa, senão ao calhas.
        const sugerido = sugestaoTop(p)
        if (vez.passo === 100) escolherLado(e, p, (sugerido as Lado | null) ?? (Math.random() < 0.5 ? 'ataque' : 'defesa'), agora)
        else {
          const livres = p.pool.filter((x) => !p.bans.some((b) => b.mapa === x))
          banir(e, p, sugerido ?? livres[Math.floor(Math.random() * livres.length)], agora)
        }
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
          // Dois capitães automáticos: inventam um resultado e votam os dois na equipa que ganhou.
          m.resultado ??= gerarResultado(Math.random, tiersDe(p, 'A'), tiersDe(p, 'B'))
          const falta = caps.find((c) => !p.submissoes.some((s) => s.capitaoId === c))
          if (falta) {
            submeter(e, p, falta, m.resultado.a > m.resultado.b ? 'A' : 'B', agora)
            if (e.motores[p.id]) e.motores[p.id].jogadaEm = agora + (p.automatica ? 400 : 1600)
            return true
          }
        } else {
          // O outro capitão vota o mesmo que o capitão humano.
          const dele = p.submissoes.find((s) => s.capitaoId === capHumano)
          const outro = caps.find((c) => c !== capHumano)!
          if (dele && !p.submissoes.some((s) => s.capitaoId === outro)) {
            submeter(e, p, outro, dele.vencedor, agora)
            return true
          }
        }
      }
      if (agora >= ms(p.prazoFase)) {
        // 3 minutos depois do primeiro voto (ou 60 minutos sem votos): a "API" decide o resultado.
        seguirParaApi(e, p, agora)
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

const POR_ROTACAO = { diaria: 4, semanal: 8 } as const
type AmbitoRodado = keyof typeof POR_ROTACAO

function inicioPeriodo(a: AmbitoRodado): string {
  if (a === 'semanal') return periodoSemana() + 'T00:00:00.000Z'
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

/** Sorteia uma rotação nova, preferindo missões que não estavam na anterior. */
function sortear(e: Estado, a: AmbitoRodado, inicio: string): Rotacao {
  const antes = e.rotacoes[a]?.ids ?? []
  const lista = baralhar(Math.random, MISSOES.filter((m) => m.ambito === a))
    .sort((x, y) => Number(antes.includes(x.id)) - Number(antes.includes(y.id)))
  const r = { id: novoId(), inicio, ids: lista.slice(0, POR_ROTACAO[a]).map((m) => m.id) }
  e.rotacoes[a] = r
  return r
}

/** A rotação em vigor; nasce uma nova quando o dia ou a semana mudam (UTC). */
function rotacao(e: Estado, a: AmbitoRodado): Rotacao {
  const inicio = inicioPeriodo(a)
  const r = e.rotacoes[a]
  if (r && ms(r.inicio) >= ms(inicio)) return r
  return sortear(e, a, inicio)
}

type MissaoAtiva = Missao & { chave: string }

function progressoMissoes(e: Estado, perfil: Perfil): MissaoAtiva[] {
  const minhas = terminadas(e)
    .filter((p) => p.jogadores.some((j) => j.perfilId === perfil.id && j.equipa))
    .sort((x, y) => ms(x.terminouEm) - ms(y.terminouEm))
  const dia = rotacao(e, 'diaria')
  const semana = rotacao(e, 'semanal')
  const ativas = [
    ...MISSOES.filter((m) => dia.ids.includes(m.id)).map((def) => ({ def, chave: dia.id, desde: ms(dia.inicio) })),
    ...MISSOES.filter((m) => semana.ids.includes(m.id)).map((def) => ({ def, chave: semana.id, desde: ms(semana.inicio) })),
    ...MISSOES.filter((m) => m.ambito === 'temporada').map((def) => ({ def, chave: 'temporada', desde: ms(INICIO_TEMPORADA) })),
  ]
  const eu = (p: PartidaGuardada) => p.jogadores.find((j) => j.perfilId === perfil.id)!
  const capitao = (p: PartidaGuardada) => p.capitaoA === perfil.id || p.capitaoB === perfil.id
  const ganhou = (p: PartidaGuardada) => p.vencedor === eu(p).equipa
  const soma = (l: PartidaGuardada[], f: (j: JogadorGuardado) => number | null | undefined) => l.reduce((t, p) => t + (f(eu(p)) ?? 0), 0)
  return ativas.map(({ def, chave, desde }) => {
    const lista = minhas.filter((p) => ms(p.terminouEm) >= desde)
    let v = 0
    switch (def.tipo) {
      case 'jogos': v = lista.length; break
      case 'vitorias': v = lista.filter(ganhou).length; break
      case 'vitorias_acima': v = lista.filter((p) => {
        const j = eu(p)
        if (p.vencedor !== j.equipa) return false
        return Math.round(mediaDivisoes(tiersDe(p, j.equipa === 'A' ? 'B' : 'A'))) > divisao(j.tier)
      }).length; break
      case 'first_bloods': v = soma(lista, (j) => j.firstBloods); break
      case 'mvp': v = lista.filter((p) => eu(p).mvp).length; break
      case 'sequencia': {
        let atual = 0
        for (const p of lista) { atual = ganhou(p) ? atual + 1 : 0; v = Math.max(v, atual) }
        break
      }
      case 'acs': v = Math.max(0, ...lista.map((p) => eu(p).acs ?? 0)); break
      case 'pontos': v = perfil.pontos; break
      case 'kills': v = soma(lista, (j) => j.kills); break
      case 'assists': v = soma(lista, (j) => j.assists); break
      case 'trades': v = soma(lista, (j) => j.trades); break
      case 'capitao': v = lista.filter(capitao).length; break
      case 'vitorias_capitao': v = lista.filter((p) => capitao(p) && ganhou(p)).length; break
      case 'mapas': v = new Set(lista.map((p) => p.mapa)).size; break
    }
    return { ...def, chave, progresso: Math.min(def.alvo, v), concluida: v >= def.alvo }
  })
}

/** Dá o XP das missões que ficaram completas; com "rever" tira o das que deixaram de o estar. */
function atualizarMissoes(e: Estado, perfilId: string, rever = false) {
  const perfil = e.perfis[perfilId]
  if (!perfil || perfil.bot) return
  for (const m of progressoMissoes(e, perfil)) {
    const i = e.conclusoes.findIndex((c) => c.perfilId === perfilId && c.missaoId === m.id && c.chave === m.chave)
    if (m.concluida && i < 0) e.conclusoes.push({ perfilId, missaoId: m.id, chave: m.chave, xp: m.xp, em: new Date().toISOString() })
    else if (!m.concluida && i >= 0 && rever) e.conclusoes.splice(i, 1)
  }
}

const ordenarNovidades = (e: Estado) =>
  [...e.novidades].sort((a, b) => b.data.localeCompare(a.data) || b.criadaEm.localeCompare(a.criadaEm))

const xpDe = (e: Estado, perfilId: string) => e.conclusoes.reduce((t, c) => t + (c.perfilId === perfilId ? c.xp : 0), 0)

function noRankingDeNivel(e: Estado) {
  return Object.values(e.perfis)
    .filter(jaJogou)
    .map((p) => ({ perfil: p, xp: xpDe(e, p.id) }))
    .sort((x, y) => y.xp - x.xp || y.perfil.pontos - x.perfil.pontos || x.perfil.utilizador.localeCompare(y.perfil.utilizador))
}

// ---------------------------------------------------------------- a interface

// ---------------------------------------------------------------- loja
// As mesmas regras da 0015_loja.sql: coins derivadas do Experience mais o histórico,
// loja de Lisboa (8 diários, 2 semanais, 1 destaque), 14 dias sem repetir.

const CATEGORIAS_DIARIAS: CategoriaLoja[] = ['borda', 'efeito', 'placa', 'banner', 'titulo', 'cartao', 'linha', 'mvp']
const PESO_RARIDADE: Record<Raridade, number> = { comum: 52, raro: 32, epico: 16, lendario: 10 }
const DIA_ZERO = '2026-01-01'

function diaLisboa(quando = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(quando)
}
const diaMs = (dia: string) => { const [y, m, d] = dia.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const somarDias = (dia: string, n: number) => new Date(diaMs(dia) + n * 86400000).toISOString().slice(0, 10)
const diasEntre = (a: string, b: string) => Math.round((diaMs(b) - diaMs(a)) / 86400000)
const segundaDe = (dia: string) => somarDias(dia, -((new Date(diaMs(dia)).getUTCDay() + 6) % 7))

/** A meia-noite de Lisboa desse dia (no verão, Lisboa está uma hora à frente de UTC). */
function meiaNoiteLisboa(dia: string) {
  const utc = diaMs(dia)
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(utc))
  return new Date(utc - h * 3600000).toISOString()
}

function lojaDemo(e: Estado): LojaDemo {
  if (!e.loja) e.loja = { publica: false, rotacoes: [], inventario: [], equipados: {}, movimentos: [], gifs: {} }
  return e.loja
}

/** Um item ao calhas, com mais peso nos comuns. */
function sortearItem(categorias: CategoriaLoja[], raridades: Raridade[], fora: string[]) {
  const candidatos = ITENS_LOJA.filter((i) => categorias.includes(i.categoria) && raridades.includes(i.raridade) && !i.conquista && i.id !== 'gif' && !fora.includes(i.id))
  let melhor: string | null = null
  let chave = Infinity
  for (const i of candidatos) {
    const k = -Math.log(Math.max(Math.random(), 1e-9)) / PESO_RARIDADE[i.raridade]
    if (k < chave) { chave = k; melhor = i.id }
  }
  return melhor
}

function lojaHoje(e: Estado, forcar = false): RotacaoLoja {
  const l = lojaDemo(e)
  const dia = diaLisboa()
  const atual = l.rotacoes.find((r) => r.dia === dia)
  if (atual && !forcar) return atual
  const semana = segundaDe(dia)
  const bloco = Math.floor(diasEntre(DIA_ZERO, dia) / 3)
  const recentes = l.rotacoes.filter((r) => r.dia < dia && diasEntre(r.dia, dia) <= 13).flatMap((r) => [...r.diarios, ...r.semanais, r.destaque ?? ''])
  const anterior = l.rotacoes.filter((r) => r.dia < dia).sort((a, b) => b.dia.localeCompare(a.dia))[0]
  const todas = [...new Set(ITENS_LOJA.map((i) => i.categoria))]

  let semanais: string[] = []
  if (!forcar && anterior?.semana === semana) semanais = anterior.semanais
  else for (let n = 0; n < 2; n++) {
    const usadas = semanais.map((id) => ITEM_POR_ID[id].categoria)
    const id = sortearItem(todas.filter((c) => c !== 'gif' && !usadas.includes(c)), ['epico'], [...recentes, ...semanais])
      ?? sortearItem(todas, ['epico'], semanais)
    if (id) semanais.push(id)
  }
  const destaque = !forcar && anterior?.bloco === bloco ? anterior.destaque
    : sortearItem(todas, ['lendario'], recentes) ?? sortearItem(todas, ['lendario'], [])
  const diarios = CATEGORIAS_DIARIAS.map((c) => sortearItem([c], ['comum', 'raro', 'epico'], [...recentes, ...semanais]) ?? sortearItem([c], ['comum', 'raro', 'epico'], semanais))
    .filter((x): x is string => !!x)

  const nova: RotacaoLoja = { dia, diarios, semanais, destaque, semana, bloco }
  l.rotacoes = [...l.rotacoes.filter((r) => r.dia !== dia && diasEntre(r.dia, dia) <= 30), nova]
  guardar()
  return nova
}

const mvpsDe = (e: Estado, perfilId: string) => e.partidas.filter((p) => p.estado === 'COMPLETED' && !p.automatica && p.jogadores.some((j) => j.perfilId === perfilId && j.mvp)).length

function moedasGanhas(e: Estado, perfilId: string) {
  const { nivel } = nivelDe(xpDe(e, perfilId))
  const ambito = (id: string) => MISSOES.find((m) => m.id === id)?.ambito
  const diarias = e.conclusoes.filter((c) => c.perfilId === perfilId && ambito(c.missaoId) === 'diaria').length
  const semanais = e.conclusoes.filter((c) => c.perfilId === perfilId && ambito(c.missaoId) === 'semanal').length
  return {
    nivel,
    porNivel: COINS_POR_NIVEL * Math.max(0, nivel - 1),
    porMarcos: COINS_POR_MARCO * Math.floor(nivel / 5),
    porDiarias: COINS_POR_DIARIA * diarias,
    porSemanais: COINS_POR_SEMANAL * semanais,
    porMvp: COINS_POR_MVP * mvpsDe(e, perfilId),
  }
}

function moedas(e: Estado, perfilId: string) {
  const g = moedasGanhas(e, perfilId)
  return g.porNivel + g.porMarcos + g.porDiarias + g.porSemanais + g.porMvp + lojaDemo(e).movimentos.reduce((t, m) => t + (m.perfilId === perfilId ? m.delta : 0), 0)
}

const staffLoja = (p: Perfil) => p.funcao === 'owner' || p.funcao === 'dev'
const lojaVisivel = (e: Estado, p: Perfil) => lojaDemo(e).publica || staffLoja(p)
const temItem = (e: Estado, perfilId: string, itemId: string) => lojaDemo(e).inventario.some((i) => i.perfilId === perfilId && i.itemId === itemId)

function darConquistas(e: Estado, perfilId: string) {
  const l = lojaDemo(e)
  const dar = (itemId: string) => { if (!temItem(e, perfilId, itemId)) l.inventario.push({ perfilId, itemId, origem: 'conquista', em: new Date().toISOString() }) }
  if (mvpsDe(e, perfilId) >= 10) dar('t-mvp')
  const pessoas = Object.values(e.perfis).filter((p) => !p.bot).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
  if (pessoas.slice(0, 100).some((p) => p.id === perfilId)) dar('t-primeiro')
  const primeiro = pessoas.filter((p) => p.riotId).sort((a, b) => b.pontos - a.pontos || b.vitorias - a.vitorias || a.utilizador.localeCompare(b.utilizador))[0]
  if (primeiro?.id === perfilId) dar('t-topo')
}

function equipar(e: Estado, perfilId: string, itemId: string) {
  const l = lojaDemo(e)
  l.equipados[perfilId] = { ...l.equipados[perfilId], [ITEM_POR_ID[itemId].categoria]: itemId }
}

function estadoLoja(e: Estado): EstadoLoja {
  const me = eu(e)
  if (!lojaVisivel(e, me)) return { visivel: false }
  darConquistas(e, me.id)
  const l = lojaDemo(e)
  const h = lojaHoje(e)
  return {
    visivel: true,
    publica: l.publica,
    staff: staffLoja(me),
    moedas: moedas(e, me.id),
    ganhas: { ...moedasGanhas(e, me.id), testes: l.movimentos.reduce((t, m) => t + (m.perfilId === me.id && m.motivo === 'teste' ? m.delta : 0), 0), porConvites: l.movimentos.reduce((t, m) => t + (m.perfilId === me.id && m.motivo === 'convite' ? m.delta : 0), 0) },
    hoje: {
      dia: h.dia, diarios: h.diarios, semanais: h.semanais, destaque: h.destaque,
      mudaEm: meiaNoiteLisboa(somarDias(h.dia, 1)),
      semanaisAte: meiaNoiteLisboa(somarDias(h.semana, 7)),
      destaqueAte: meiaNoiteLisboa(somarDias(DIA_ZERO, (h.bloco + 1) * 3)),
    },
    inventario: l.inventario.filter((i) => i.perfilId === me.id).map((i) => i.itemId),
    equipados: { ...l.equipados[me.id] },
    avatarGif: l.gifs[me.id] ?? null,
  }
}

function mudouLoja(e: Estado) {
  guardar()
  avisarMudanca('loja')
  return estadoLoja(e)
}

/** O que o módulo dos torneios precisa do demo: quem sou eu, os perfis e a criação de bots. */
const contextoTorneios: ContextoTorneios = {
  async perfis() {
    const e = await pronto()
    return { eu: eu(e), todos: Object.values(e.perfis) }
  },
  criarBot() {
    const e = estado!
    const sufixo = () => Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    const id = novoId()
    const bot: Perfil = {
      id, utilizador: `bot_${id.slice(0, 8)}`, avatarUrl: null, riotId: `Bot${sufixo()}#BOT`, regiao: 'eu', tier: 6 + Math.floor(Math.random() * 18), rr: null,
      rankAtualizadoEm: null, pontos: 1000, vitorias: 0, derrotas: 0, funcao: 'user',
      funcaoJogo: (['Duelista', 'Controlador', 'Iniciador', 'Sentinela'] as const)[Math.floor(Math.random() * 4)],
      bot: true, cooldownAte: null, tourVistoEm: iso(Date.now()), temPassword: false, criadoEm: iso(Date.now()),
    }
    e.perfis[id] = bot
    guardar()
    return bot
  },
}

export const dadosLocais: Dados = {
  ...criarTorneiosLocais(contextoTorneios),
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
    const mapas = new Map<string, { partidas: number; vitorias: number; acs: number[]; rs: number[] }>()
    const agentes = new Map<string, { partidas: number; vitorias: number; acs: number[]; rs: number[] }>()
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
      const somar = (tabela: typeof mapas, chave: string) => {
        const m = tabela.get(chave) ?? { partidas: 0, vitorias: 0, acs: [], rs: [] }
        m.partidas++
        if (ganhou) m.vitorias++
        if (j.acs != null) m.acs.push(j.acs)
        if (j.rangifyScore != null) m.rs.push(j.rangifyScore)
        tabela.set(chave, m)
      }
      somar(mapas, p.mapa ?? '?')
      if (j.agente) somar(agentes, j.agente)
    }
    const comStats = js.filter((j) => j.acs != null)
    const ordem = classificados(e)
    return {
      partidas: lista.length, vitorias: vit,
      kda: comAcs ? (k + a) / Math.max(1, d) : null, kd: comAcs ? k / Math.max(1, d) : null,
      acs: media(comStats.map((j) => j.acs)),
      rangifyScore: media(js.map((j) => j.rangifyScore)),
      melhorRs: js.some((j) => j.rangifyScore != null) ? Math.max(...js.map((j) => j.rangifyScore ?? 0)) : null,
      killsMedia: media(comStats.map((j) => j.kills)), mortesMedia: media(comStats.map((j) => j.deaths)), assistMedia: media(comStats.map((j) => j.assists)),
      hsPct: media(js.map((j) => j.hsPct)), kastPct: media(js.map((j) => j.kastPct)), tradesMedia: media(js.map((j) => j.trades)),
      fbMedia: media(comStats.map((j) => j.firstBloods)),
      mvps, firstBloods: fb,
      melhorAcs: comStats.length ? Math.max(...comStats.map((j) => j.acs!)) : null,
      maisKills: comStats.length ? Math.max(...comStats.map((j) => j.kills ?? 0)) : null,
      melhorSequencia: melhorSeq, sequenciaAtual: atual,
      capitao: { partidas: capP, vitorias: capV },
      porMapa: [...mapas.entries()]
        .map(([mapa, m]) => ({ mapa, partidas: m.partidas, vitorias: m.vitorias, acs: media(m.acs), rs: media(m.rs) }))
        .sort((x, y) => y.partidas - x.partidas || x.mapa.localeCompare(y.mapa)),
      porAgente: [...agentes.entries()]
        .map(([agente, m]) => ({ agente, partidas: m.partidas, vitorias: m.vitorias, acs: media(m.acs), rs: media(m.rs) }))
        .sort((x, y) => y.partidas - x.partidas || x.agente.localeCompare(y.agente)),
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
        kda: j.kills != null ? ((j.kills ?? 0) + (j.assists ?? 0)) / Math.max(1, j.deaths ?? 1) : null, acs: j.acs, rs: j.rangifyScore ?? null, mvp: j.mvp,
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
      ban: id ? banPublico(banAtivo(e, id)) : null,
    }
  },

  async entrarFila() {
    const e = await pronto()
    const p = eu(e)
    const ban = banAtivo(e, p.id)
    if (ban) {
      throw new Error(`Estás banido da fila ${ban.permanente ? 'para sempre' : 'até ' + new Date(ban.ate!).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}. Motivo: ${ban.mensagem}`)
    }
    if (!p.riotId) throw new Error('Liga o teu Riot ID antes de entrar na fila.')
    if (p.cooldownAte && ms(p.cooldownAte) > Date.now()) throw new Error('Ainda estás de castigo por não aceitares uma partida.')
    if (noJogo(e, p.id)) throw new Error('Já tens uma partida a decorrer.')
    if (e.discord?.obrigatorio && !e.discord.membro) throw new Error('Entra no servidor de Discord do Rangify para poderes entrar na fila.')
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

  async batimentoFila() { /* no demo ninguém sai por falta de sinal */ },

  sairFilaAoFechar() {
    // Síncrono: só mexe no estado já carregado em memória e guarda.
    if (!estado?.sessao) return
    const eu = estado.sessao.perfilId
    estado.fila = estado.fila.filter((f) => f.perfilId !== eu)
    guardar()
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

  async situacao(ultima) {
    const fila = await dadosLocais.estadoFila()
    const ativa = await dadosLocais.partidaAtiva()
    const id = ativa?.id ?? ultima
    return { fila, partida: id ? await dadosLocais.avancarPartida(id) : null }
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
    if (p.mapa) throw new Error('Os bans já terminaram: falta escolher o lado.')
    if (vezMapas(p).capitao !== me.id) throw new Error('Ainda não é a tua vez de banir.')
    banir(e, p, mapa, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async escolherLado(id, lado) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.estado !== 'MAP_BAN' || !p.mapa) throw new Error('Ainda não é altura de escolher o lado.')
    if (vezMapas(p).capitao !== me.id) throw new Error('Só o capitão da equipa que escolhe o lado pode decidir.')
    escolherLado(e, p, lado, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async votarCancelar(id, voto) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.automatica) throw new Error('Numa simulação automática não há nada para cancelar.')
    if (!p.jogadores.some((j) => j.perfilId === me.id && j.equipa)) throw new Error('Só quem está na partida pode votar.')
    const c = estadoCancelamento(e, p)
    if (!c || !c.aberto) throw new Error('Já não dá para votar o cancelamento: só enquanto o grupo é criado e nos primeiros 10 minutos de jogo.')
    p.votosCancelar = [...new Set([...(p.votosCancelar ?? []).filter((x) => x !== me.id), ...(voto ? [me.id] : [])])]
    toque(p, Date.now())
    const depois = estadoCancelamento(e, p)
    if (depois && depois.votos >= depois.necessarios) cancelar(e, p, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async sugerirMapa(id, valor) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.estado !== 'MAP_BAN') throw new Error('Já não há nada para sugerir.')
    const vez = vezMapas(p)
    const minha = p.jogadores.find((j) => j.perfilId === me.id)?.equipa
    if (!minha || minha !== vez.equipa) throw new Error('Só a equipa que está a decidir pode sugerir.')
    if (vez.passo === 100) { if (valor !== 'ataque' && valor !== 'defesa') throw new Error('Sugere Ataque ou Defesa.') }
    else if (!p.pool.includes(valor) || p.bans.some((b) => b.mapa === valor)) throw new Error('Esse mapa já não está disponível.')
    const lista = (p.sugestoes ?? []).filter((s) => s.perfilId !== me.id)
    const tinha = (p.sugestoes ?? []).some((s) => s.perfilId === me.id && s.valor === valor)
    p.sugestoes = tinha ? lista : [...lista, { perfilId: me.id, valor }]
    toque(p, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async definirCodigo(id, codigo) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.estado !== 'LOBBY_CREATION') throw new Error('O código já foi partilhado.')
    if (p.capitaoA !== me.id && p.capitaoB !== me.id) throw new Error('Só os capitães criam o grupo.')
    const c = codigo.trim().toUpperCase()
    if (!PADRAO_CODIGO.test(c)) throw new Error('O código tem 6 letras ou números.')
    comecar(p, c, Date.now())
    guardar()
    avisarMudanca('partida')
  },

  async submeterResultado(id, vencedor) {
    const e = await pronto()
    const p = obterPartida(e, id)
    const me = eu(e)
    if (p.capitaoA !== me.id && p.capitaoB !== me.id) throw new Error('Só os capitães confirmam quem ganhou.')
    if (p.estado === 'IN_PROGRESS') throw new Error('O resultado só abre 15 minutos depois de partilhado o código.')
    if (p.estado !== 'RESULT_SUBMISSION') throw new Error('Esta partida já não aceita votos.')
    if (p.submissoes.some((s) => s.capitaoId === me.id)) throw new Error('Já votaste.')
    if (vencedor !== 'A' && vencedor !== 'B') throw new Error('Escolhe a equipa que ganhou: A ou B.')
    const agora = Date.now()
    submeter(e, p, me.id, vencedor, agora)
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

  async partidas({ minhas, cursor, mapa, perfilId, limite = 20 }) {
    const e = await pronto()
    const ref = perfilId ?? (minhas ? e.sessao?.perfilId ?? null : null)
    let lista = e.partidas.filter((p) => p.estado === 'COMPLETED')
    if (ref) lista = lista.filter((p) => p.jogadores.some((j) => j.perfilId === ref && j.equipa))
    if (mapa) lista = lista.filter((p) => p.mapa === mapa)
    lista.sort((x, y) => ms(y.terminouEm) - ms(x.terminouEm))
    const inicio = cursor ? Number(cursor) : 0
    const pagina = lista.slice(inicio, inicio + limite)
    return { linhas: pagina.map((p) => resumo(e, p, ref)), cursor: inicio + limite < lista.length ? String(inicio + limite) : null }
  },

  async jogadoresDaPartida(id) {
    const e = await carregar()
    const p = obterPartida(e, id)
    return p.jogadores.map((j) => jogadorPublico(e, j))
  },

  async missoes() {
    const e = await pronto()
    const me = eu(e)
    atualizarMissoes(e, me.id)
    guardar()
    return progressoMissoes(e, me).map(({ chave: _, ...m }) => m)
  },

  async experiencia(perfilId) {
    const e = await pronto()
    const id = perfilId ?? eu(e).id
    const lista = noRankingDeNivel(e)
    const xp = xpDe(e, id)
    const semana = ms(inicioPeriodo('semanal'))
    return {
      ...nivelDe(xp), xp,
      xpSemana: e.conclusoes.reduce((t, c) => t + (c.perfilId === id && ms(c.em) >= semana ? c.xp : 0), 0),
      posicao: lista.some((l) => l.perfil.id === id) ? 1 + lista.filter((l) => l.perfil.id !== id && l.xp > xp).length : 0,
      total: lista.length,
    } satisfies Experiencia
  },

  async rankingNivel(limite = 50) {
    const e = await pronto()
    return noRankingDeNivel(e).slice(0, limite).map((l, i): LinhaNivel => ({ posicao: i + 1, perfil: { ...l.perfil }, xp: l.xp, ...nivelDe(l.xp) }))
  },

  async rankingRs(limite = 50) {
    const e = await pronto()
    const minimo = 1
    const por = new Map<string, number[]>()
    for (const p of terminadas(e)) for (const j of p.jogadores) {
      if (!j.equipa || j.rangifyScore == null) continue
      const perfil = e.perfis[j.perfilId]
      if (!perfil || perfil.bot || !perfil.riotId) continue
      por.set(j.perfilId, [...(por.get(j.perfilId) ?? []), j.rangifyScore])
    }
    const todos = [...por.entries()].map(([id, rs]) => ({
      perfil: e.perfis[id], media: Math.round((rs.reduce((s, x) => s + x, 0) / rs.length) * 10) / 10, melhor: Math.max(...rs), partidas: rs.length,
    }))
    const ordem = todos.filter((x) => x.partidas >= minimo)
      .sort((x, y) => y.media - x.media || y.partidas - x.partidas || y.perfil.pontos - x.perfil.pontos || x.perfil.utilizador.localeCompare(y.perfil.utilizador))
    const meu = e.sessao ? todos.find((x) => x.perfil.id === e.sessao!.perfilId) : undefined
    return {
      minimo,
      linhas: ordem.slice(0, limite).map((x, i) => ({ posicao: i + 1, perfil: { ...x.perfil }, media: x.media, melhor: x.melhor, partidas: x.partidas })),
      eu: meu ? { posicao: ordem.indexOf(meu) + 1 || null, media: meu.media, melhor: meu.melhor, partidas: meu.partidas } : null,
    }
  },

  async rankingAgentes(opts) {
    const e = await pronto()
    const minimo = Math.max(1, opts?.minimo ?? 1)
    const top = Math.min(10, Math.max(1, opts?.top ?? 5))
    const por = new Map<string, Map<string, { rs: number[]; vitorias: number; acs: number[]; kills: number; assists: number; mortes: number }>>()
    for (const p of terminadas(e)) for (const j of p.jogadores) {
      if (!j.equipa || !j.agente || j.rangifyScore == null) continue
      const perfil = e.perfis[j.perfilId]
      if (!perfil || !jaJogou(perfil)) continue
      const doAgente = por.get(j.agente) ?? new Map()
      const x = doAgente.get(j.perfilId) ?? { rs: [], vitorias: 0, acs: [], kills: 0, assists: 0, mortes: 0 }
      x.rs.push(j.rangifyScore)
      if (j.equipa === p.vencedor) x.vitorias++
      if (j.acs != null) x.acs.push(j.acs)
      x.kills += j.kills ?? 0; x.assists += j.assists ?? 0; x.mortes += j.deaths ?? 0
      doAgente.set(j.perfilId, x)
      por.set(j.agente, doAgente)
    }
    const media = (xs: number[]) => xs.reduce((t, v) => t + v, 0) / xs.length
    return {
      minimo,
      agentes: [...por.entries()].sort((a, b) => a[0].localeCompare(b[0])).flatMap(([agente, doAgente]) => {
        const jogadores = [...doAgente.entries()]
          .filter(([, x]) => x.rs.length >= minimo)
          .map(([id, x]) => ({ perfil: e.perfis[id], x }))
          .sort((a, b) => media(b.x.rs) - media(a.x.rs) || b.x.rs.length - a.x.rs.length || b.perfil.pontos - a.perfil.pontos || a.perfil.utilizador.localeCompare(b.perfil.utilizador))
          .slice(0, top)
          .map(({ perfil, x }, i): JogadorAgente => ({
            posicao: i + 1, perfil: { ...perfil }, media: Math.round(media(x.rs) * 10) / 10, melhor: Math.max(...x.rs), partidas: x.rs.length, vitorias: x.vitorias,
            acs: x.acs.length ? Math.round(media(x.acs)) : null, kda: x.mortes || x.kills || x.assists ? Math.round(((x.kills + x.assists) / Math.max(1, x.mortes)) * 100) / 100 : null,
          }))
        return jogadores.length ? [{ agente, jogadores }] : []
      }),
    } satisfies RankingAgentes
  },

  async resetarMissoes() {
    const e = await pronto()
    const me = eu(e)
    if (me.funcao !== 'owner' && me.funcao !== 'dev') throw new Error('Só Owner e Dev podem fazer isto.')
    const agora = new Date().toISOString()
    sortear(e, 'diaria', agora)
    sortear(e, 'semanal', agora)
    guardar()
    avisarMudanca('staff')
    return progressoMissoes(e, me).map(({ chave: _, ...m }) => m)
  },

  // No demo, as mudanças de amizade já avisam a página (avisarMudanca).
  // No demo, a fila e as partidas correm no próprio browser e avisam com avisarMudanca.
  aoMudarJogo() {
    return () => {}
  },

  aoMudarAmizades() {
    return () => {}
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
    for (const p of terminadas(e)) for (const j of p.jogadores) {
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

  async definirEstadoSugestao(id, estado) {
    const e = await carregar()
    exigirStaff(e)
    const s = e.sugestoes.find((x) => x.id === id)
    if (!s) throw new Error('Esta sugestão já não existe.')
    s.estado = estado
    guardar()
    avisarMudanca('sugestoes')
    avisarMudanca('staff')
  },

  async apagarSugestao(id) {
    const e = await carregar()
    exigirStaff(e)
    if (!e.sugestoes.some((x) => x.id === id)) throw new Error('Esta sugestão já não existe.')
    e.sugestoes = e.sugestoes.filter((x) => x.id !== id)
    guardar()
    avisarMudanca('sugestoes')
    avisarMudanca('staff')
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

  async novidades(limite = 5) {
    const e = await carregar()
    return ordenarNovidades(e).slice(0, limite)
  },

  async criarNovidade(n) {
    const e = await carregar()
    const me = eu(e)
    if (me.funcao !== 'owner' && me.funcao !== 'dev') throw new Error('Só Owner e Dev podem fazer isto.')
    const titulo = n.titulo.trim()
    const texto = n.texto.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.data)) throw new Error('Escolhe a data da novidade.')
    if (titulo.length < 3 || titulo.length > 120) throw new Error('O título tem entre 3 e 120 caracteres.')
    if (texto.length < 3 || texto.length > 500) throw new Error('A descrição tem entre 3 e 500 caracteres.')
    e.novidades.push({ id: novoId(), data: n.data, titulo, texto, criadaEm: new Date().toISOString() })
    guardar()
    avisarMudanca('staff')
    return ordenarNovidades(e)
  },

  async apagarNovidade(id) {
    const e = await carregar()
    const me = eu(e)
    if (me.funcao !== 'owner' && me.funcao !== 'dev') throw new Error('Só Owner e Dev podem fazer isto.')
    if (!e.novidades.some((n) => n.id === id)) throw new Error('Esta novidade já não existe.')
    e.novidades = e.novidades.filter((n) => n.id !== id)
    guardar()
    avisarMudanca('staff')
    return ordenarNovidades(e)
  },

  // O modo demo não tem servidor de Discord.
  async discordPartida() {
    return null
  },
  async puxarCall() {
    return { movido: false, foraDaVoz: true }
  },

  async lojaVisivel() {
    const e = await carregar()
    const me = e.sessao?.perfilId ? e.perfis[e.sessao.perfilId] : null
    return !!me && lojaVisivel(e, me)
  },

  async loja() {
    const e = await pronto()
    const r = estadoLoja(e)
    guardar()
    return r
  },

  async comprarItem(id) {
    const e = await pronto()
    const me = eu(e)
    if (!lojaVisivel(e, me)) throw new Error('A loja ainda não está aberta.')
    const it = ITEM_POR_ID[id]
    if (!it) throw new Error('Este item não existe.')
    if (temItem(e, me.id, id)) throw new Error('Já tens este item.')
    // Owner e Dev compram qualquer item, para testar. Os outros só o que está hoje na loja.
    if (!staffLoja(me)) {
      if (it.conquista) throw new Error('Este item não se compra: ganha-se a jogar.')
      const h = lojaHoje(e)
      if (id !== 'gif' && ![...h.diarios, ...h.semanais, h.destaque].includes(id)) throw new Error('Este item já não está na loja hoje.')
    }
    if (moedas(e, me.id) < it.preco) throw new Error('Não tens coins suficientes.')
    const l = lojaDemo(e)
    const agora = new Date().toISOString()
    if (it.preco > 0) l.movimentos.push({ perfilId: me.id, delta: -it.preco, motivo: 'compra', itemId: id, em: agora })
    l.inventario.push({ perfilId: me.id, itemId: id, origem: 'compra', em: agora })
    if (it.categoria !== 'gif' || l.gifs[me.id]) equipar(e, me.id, id)
    return mudouLoja(e)
  },

  async equiparItem(id) {
    const e = await pronto()
    const me = eu(e)
    if (!lojaVisivel(e, me)) throw new Error('A loja ainda não está aberta.')
    if (!ITEM_POR_ID[id]) throw new Error('Este item não existe.')
    if (!temItem(e, me.id, id)) throw new Error('Ainda não tens este item.')
    if (id === 'gif' && !lojaDemo(e).gifs[me.id]) throw new Error('Põe primeiro o link da tua GIF.')
    equipar(e, me.id, id)
    return mudouLoja(e)
  },

  async desequiparItem(categoria) {
    const e = await pronto()
    const me = eu(e)
    const l = lojaDemo(e)
    const { [categoria]: _, ...resto } = l.equipados[me.id] ?? {}
    l.equipados[me.id] = resto
    return mudouLoja(e)
  },

  async definirAvatarGif(url) {
    const e = await pronto()
    const me = eu(e)
    const l = lojaDemo(e)
    const v = url?.trim() || null
    if (!v) {
      delete l.gifs[me.id]
      const { gif: _, ...resto } = l.equipados[me.id] ?? {}
      l.equipados[me.id] = resto
      return mudouLoja(e)
    }
    if (!temItem(e, me.id, 'gif')) throw new Error('Compra primeiro a Foto em GIF na loja.')
    if (!gifValida(v)) throw new Error('O link tem de ser https e acabar em .gif ou .webp (ou ser do Giphy, Tenor ou Discord).')
    l.gifs[me.id] = v
    equipar(e, me.id, 'gif')
    return mudouLoja(e)
  },

  async cosmeticos(ids) {
    const e = await carregar()
    const me = e.sessao?.perfilId ? e.perfis[e.sessao.perfilId] : null
    if (!me || !lojaVisivel(e, me)) return {}
    const l = lojaDemo(e)
    const r: Record<string, Cosmeticos> = {}
    for (const id of ids) {
      const eq = { ...l.equipados[id] }
      if (eq.gif) { if (l.gifs[id]) eq.gif = l.gifs[id]; else delete eq.gif }
      if (Object.keys(eq).length) r[id] = eq
    }
    return r
  },

  async definirLojaPublica(publica) {
    const e = await pronto()
    exigirDev(e)
    lojaDemo(e).publica = publica
    avisarMudanca('staff')
    return mudouLoja(e)
  },

  async lojaResetar() {
    const e = await pronto()
    exigirDev(e)
    lojaHoje(e, true)
    return mudouLoja(e)
  },

  async lojaMoedasTeste(quantidade) {
    const e = await pronto()
    const me = exigirDev(e)
    if (!Number.isInteger(quantidade) || quantidade === 0 || Math.abs(quantidade) > 100000) throw new Error('Escolhe uma quantidade entre 1 e 100 000.')
    lojaDemo(e).movimentos.push({ perfilId: me.id, delta: quantidade, motivo: 'teste', itemId: null, em: new Date().toISOString() })
    return mudouLoja(e)
  },

  async lojaDevolver(id) {
    const e = await pronto()
    const me = exigirDev(e)
    const l = lojaDemo(e)
    const agora = new Date().toISOString()
    // Os títulos ganhos a jogar ficam.
    const sair = l.inventario.filter((i) => i.perfilId === me.id && i.origem === 'compra' && (id === null || i.itemId === id))
    for (const i of sair) {
      const preco = ITEM_POR_ID[i.itemId]?.preco ?? 0
      if (preco > 0) l.movimentos.push({ perfilId: me.id, delta: preco, motivo: 'devolucao', itemId: i.itemId, em: agora })
    }
    const ids = new Set(sair.map((i) => i.itemId))
    l.inventario = l.inventario.filter((i) => !(i.perfilId === me.id && ids.has(i.itemId)))
    l.equipados[me.id] = Object.fromEntries(Object.entries(l.equipados[me.id] ?? {}).filter(([, v]) => !ids.has(v as string)))
    if (!temItem(e, me.id, 'gif')) { delete l.gifs[me.id]; delete l.equipados[me.id].gif }
    return mudouLoja(e)
  },

  async estadoDiscord(verificar) {
    const e = await carregar()
    const d = e.discord ?? { obrigatorio: false, convite: null, membro: false }
    if (verificar && d.obrigatorio && !d.membro) { e.discord = { ...d, membro: true }; guardar() }
    const atual = e.discord ?? d
    return { obrigatorio: atual.obrigatorio, convite: atual.convite, membro: atual.obrigatorio ? atual.membro : null, verificadoEm: null }
  },

  async publicarPingDiscord() {
    throw new Error('A mensagem do ping só se publica com o Supabase ligado: no modo demo não há bot do Discord.')
  },

  async publicarFilaDiscord() {
    throw new Error('A mensagem da fila só se publica com o Supabase ligado: no modo demo não há bot do Discord.')
  },

  async definirDiscordFila(obrigatorio, convite) {
    const e = await carregar()
    const me = eu(e)
    if (me.funcao !== 'owner' && me.funcao !== 'dev') throw new Error('Só Owner e Dev podem fazer isto.')
    const c = convite.trim() || null
    if (c && !/^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+\/?$/.test(c)) throw new Error('O convite tem de ser um link discord.gg ou discord.com/invite.')
    if (obrigatorio && !c) throw new Error('Põe o link de convite do servidor antes de tornar o Discord obrigatório.')
    e.discord = { obrigatorio, convite: c, membro: e.discord?.membro ?? false }
    guardar()
    avisarMudanca('staff')
    return dadosLocais.estadoDiscord(false)
  },

  async testarApi() {
    throw new Error('O teste da API só funciona com o Supabase ligado: no modo demo não há Henrik Dev API.')
  },

  async poolMapas() {
    const e = await carregar()
    return NOMES_MAPAS.filter((m) => e.poolMapas.includes(m))
  },

  async definirPoolMapas(mapas) {
    const e = await carregar()
    const me = eu(e)
    if (me.funcao !== 'owner' && me.funcao !== 'dev') throw new Error('Só Owner e Dev podem fazer isto.')
    if (mapas.some((m) => !NOMES_MAPAS.includes(m))) throw new Error('Há um mapa que não existe no Valorant.')
    const pool = NOMES_MAPAS.filter((m) => mapas.includes(m))
    if (pool.length < 3) throw new Error('A rotação precisa de pelo menos 3 mapas.')
    e.poolMapas = pool
    guardar()
    avisarMudanca('staff')
    return [...pool]
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

  async resultadosPendentes() {
    const e = await pronto()
    exigirStaff(e)
    return e.partidas.filter((p) => p.estado === 'IN_PROGRESS' || p.estado === 'RESULT_SUBMISSION').map((p) => publica(e, p))
  },

  async submeterResultadoStaff(id, vencedor) {
    const e = await pronto()
    exigirStaff(e)
    const p = obterPartida(e, id)
    if (p.estado !== 'IN_PROGRESS' && p.estado !== 'RESULT_SUBMISSION') throw new Error('Esta partida já não está à espera do resultado.')
    if (vencedor !== 'A' && vencedor !== 'B') throw new Error('Escolhe a equipa que ganhou: A ou B.')
    const agora = Date.now()
    if (p.estado === 'IN_PROGRESS') abrirResultado(e, p, agora)
    // Em nome de cada capitão que ainda não votou.
    for (const cap of [p.capitaoA, p.capitaoB]) {
      if (p.estado !== 'RESULT_SUBMISSION' || !cap) break
      if (!p.submissoes.some((s) => s.capitaoId === cap)) submeter(e, p, cap, vencedor, agora)
    }
    guardar()
    avisarMudanca('staff')
    avisarMudanca('partida')
  },

  async partidasAoVivo() {
    const e = await pronto()
    exigirStaff(e)
    return e.partidas.filter((p) => p.estado !== 'COMPLETED' && p.estado !== 'CANCELLED').map((p) => publica(e, p))
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
    // Numa partida terminada que deu pontos (também as de teste), devolve os pontos, as vitórias e as derrotas.
    if (p.estado === 'COMPLETED' && (p.pontosAplicados ?? !p.simulada)) {
      for (const j of p.jogadores) {
        const perfil = e.perfis[j.perfilId]
        if (!perfil || !j.equipa || j.deltaPontos == null) continue
        perfil.pontos -= j.deltaPontos
        if (j.equipa === p.vencedor) perfil.vitorias = Math.max(0, perfil.vitorias - 1)
        else perfil.derrotas = Math.max(0, perfil.derrotas - 1)
      }
    }
    e.partidas = e.partidas.filter((x) => x.id !== id)
    // O XP das missões que esta partida tinha completado também sai.
    for (const j of p.jogadores) if (j.equipa) atualizarMissoes(e, j.perfilId, true)
    guardar()
    avisarMudanca('partida')
    avisarMudanca('perfil')
  },

  // No demo não há API: recalcula com as estatísticas que a partida já tem.
  async recarregarPartida(id) {
    const e = await carregar()
    const me = eu(e)
    if (me.funcao !== 'owner' && me.funcao !== 'dev') throw new Error('Só Owner e Dev podem fazer isto.')
    const p = obterPartida(e, id)
    if (p.estado !== 'COMPLETED') throw new Error('Só se recarregam partidas terminadas.')
    const antes = new Map(p.jogadores.map((j) => [j.perfilId, j.deltaPontos]))
    const usados = new Map<string, number>()
    for (const j of p.jogadores) {
      if (!j.equipa || j.agente) continue
      const funcao = e.perfis[j.perfilId]?.funcaoJogo ?? 'outro'
      const lista = AGENTES_SIMULADOS[funcao]
      const k = `${j.equipa}:${funcao}`
      const n = (usados.get(k) ?? 0) + 1
      usados.set(k, n)
      j.agente = lista[n % lista.length]
    }
    calcularRangifyScore(p)
    for (const j of p.jogadores) {
      if (!j.equipa) continue
      const perf = bonusDesempenho(j.rangifyScore)
      const novo = calcularPontos(j.equipa === p.vencedor, p.resultadoA ?? 0, p.resultadoB ?? 0).total + perf
      const dif = novo - (j.deltaPontos ?? 0)
      const perfil = e.perfis[j.perfilId]
      if (perfil && (p.pontosAplicados ?? !p.simulada)) perfil.pontos += dif
      if (j.pontosDepois != null) j.pontosDepois += dif
      j.deltaPontos = novo
      j.deltaDesempenho = j.rangifyScore != null ? perf : null
      atualizarMissoes(e, j.perfilId, true)
    }
    guardar()
    avisarMudanca('partida')
    avisarMudanca('perfil')
    return {
      codigo: p.codigo, fonte: 'teste',
      jogadores: p.jogadores.filter((j) => j.equipa).map((j) => ({
        nome: nomeCurto(e.perfis[j.perfilId]), antes: antes.get(j.perfilId) ?? null, depois: j.deltaPontos ?? 0,
        rangifyScore: j.rangifyScore ?? null, agente: j.agente ?? null,
      })),
    }
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
      .map((p) => ({ ...p, ban: banPublico(banAtivo(e, p.id)) }))
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
  async contarJogadores() {
    const e = await carregar()
    exigirStaff(e)
    return Object.values(e.perfis).filter((p) => !p.bot).length
  },

  async avisarJogador(perfilId, mensagem) {
    const e = await carregar()
    const { me, alvo } = exigirPodePunir(e, perfilId)
    const msg = mensagem.trim()
    if (msg.length < 3) throw new Error('Escreve o aviso (pelo menos 3 caracteres).')
    if (msg.length > 500) throw new Error('O aviso pode ter no máximo 500 caracteres.')
    const a: AvisoGuardado = {
      id: novoId(), tipo: 'aviso', mensagem: msg, banAte: null, permanente: false, criadoEm: iso(Date.now()), lidoEm: null, levantadoEm: null,
      autor: nomeCurto(me), dm: null, alvoId: alvo.id, autorId: me.id,
    }
    ;(e.avisos ??= []).push(a)
    guardar()
    avisarMudanca('staff')
    return a
  },

  async banirDaFila(perfilId, mensagem, horas) {
    const e = await carregar()
    const { me, alvo } = exigirPodePunir(e, perfilId)
    const msg = mensagem.trim()
    if (msg.length < 3) throw new Error('Escreve o motivo do ban (pelo menos 3 caracteres).')
    if (msg.length > 500) throw new Error('O motivo pode ter no máximo 500 caracteres.')
    if (horas != null && (!Number.isInteger(horas) || horas < 1 || horas > 24 * 365)) throw new Error('A duração do ban é de 1 hora até 1 ano (ou para sempre).')
    const a: AvisoGuardado = {
      id: novoId(), tipo: 'ban', mensagem: msg, banAte: horas == null ? null : iso(Date.now() + horas * 3_600_000), permanente: horas == null,
      criadoEm: iso(Date.now()), lidoEm: null, levantadoEm: null, autor: nomeCurto(me), dm: null, alvoId: alvo.id, autorId: me.id,
    }
    ;(e.avisos ??= []).push(a)
    e.fila = e.fila.filter((f) => f.perfilId !== alvo.id)
    guardar()
    avisarMudanca('staff')
    avisarMudanca('fila')
    return a
  },

  async levantarBan(perfilId) {
    const e = await carregar()
    const { alvo } = exigirPodePunir(e, perfilId)
    if (!banAtivo(e, alvo.id)) throw new Error('Este jogador não está banido da fila.')
    for (const a of e.avisos ?? []) {
      if (a.alvoId === alvo.id && a.tipo === 'ban' && !a.levantadoEm) { a.levantadoEm = iso(Date.now()); a.lidoEm ??= a.levantadoEm }
    }
    guardar()
    avisarMudanca('staff')
    avisarMudanca('fila')
  },

  async avisosDoJogador(perfilId) {
    const e = await carregar()
    exigirStaff(e)
    return (e.avisos ?? [])
      .filter((a) => a.alvoId === perfilId)
      .sort((x, y) => ms(y.criadoEm) - ms(x.criadoEm))
      .slice(0, 30)
      .map(({ alvoId: _a, autorId: _b, ...a }) => a)
  },

  async avisoPendente() {
    const e = await carregar()
    const id = e.sessao?.perfilId
    if (!id) return null
    const a = (e.avisos ?? [])
      .filter((x) => x.alvoId === id && !x.lidoEm && !x.levantadoEm)
      .sort((x, y) => ms(x.criadoEm) - ms(y.criadoEm))[0]
    if (!a) return null
    // O jogador não vê quem foi da staff nem como correu a mensagem privada.
    const { alvoId: _a, autorId: _b, autor: _c, dm: _d, ...publico } = a
    return publico
  },

  async confirmarAviso(id) {
    const e = await carregar()
    const me = eu(e)
    const a = (e.avisos ?? []).find((x) => x.id === id && x.alvoId === me.id)
    if (a && !a.lidoEm) { a.lidoEm = iso(Date.now()); guardar() }
  },

  aoMudarAvisos(_perfilId, cb) {
    // No demo, quem dá o aviso e quem o recebe usam o mesmo browser.
    return aoMudarDados((o) => { if (o === 'staff') cb() })
  },

  // ------------------------------------------------------------ streamers, overlay e convites

  async streamersVisivel() {
    const e = await carregar()
    const me = e.sessao?.perfilId ? e.perfis[e.sessao.perfilId] : null
    return !!me && streamersVisivel(e, me)
  },

  async meuOverlay() {
    const e = await pronto()
    const me = exigirStreamers(e)
    const s = streamersDemo(e)
    s.chaves[me.id] ??= novaChave()
    guardar()
    return { chave: s.chaves[me.id] }
  },

  async renovarOverlay() {
    const e = await pronto()
    const me = exigirStreamers(e)
    streamersDemo(e).chaves[me.id] = novaChave()
    guardar()
    avisarMudanca('streamers')
    return { chave: streamersDemo(e).chaves[me.id] }
  },

  async overlayDados(chave): Promise<OverlayDados | null> {
    const e = await pronto()
    const s = streamersDemo(e)
    const perfilId = Object.keys(s.chaves).find((id) => s.chaves[id] === chave)
    const p = perfilId ? e.perfis[perfilId] : null
    if (!p || !streamersVisivel(e, p)) return null
    const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0)
    const dele = (m: PartidaGuardada) => m.jogadores.find((j) => j.perfilId === p.id && j.equipa)
    const feitas = e.partidas.filter((m) => m.estado === 'COMPLETED' && !m.automatica && dele(m))
    let vitorias = 0, derrotas = 0, delta = 0
    for (const m of feitas.filter((x) => (ms(x.terminouEm) || 0) >= inicioDia.getTime())) {
      const j = dele(m)!
      if (j.equipa === m.vencedor) vitorias++; else derrotas++
      delta += j.deltaPontos ?? 0
    }
    const viva = e.partidas.find((m) => !m.automatica && ativa(m.estado) && m.jogadores.some((j) => j.perfilId === p.id))
    const naFila = e.fila.find((f) => f.perfilId === p.id)
    const ult = [...feitas].sort((a, b) => (ms(b.terminouEm) || 0) - (ms(a.terminouEm) || 0))[0]
    const jUlt = ult ? dele(ult) : null
    return {
      nome: nomeCurto(p), riotId: p.riotId, avatarUrl: p.avatarUrl, tier: p.tier, rr: p.rr, pontos: p.pontos, vitorias: p.vitorias, derrotas: p.derrotas,
      hoje: { vitorias, derrotas, delta },
      estado: viva ? 'partida' : naFila ? 'fila' : 'livre',
      fila: !viva && naFila ? { contagem: e.fila.length, desde: naFila.desde } : null,
      partida: viva ? { estado: viva.estado, codigo: viva.codigo, mapa: viva.mapa, equipa: viva.jogadores.find((j) => j.perfilId === p.id)?.equipa ?? null, comecouEm: viva.comecouEm } : null,
      ultima: ult && jUlt ? {
        codigo: ult.codigo, mapa: ult.mapa, venceu: jUlt.equipa === ult.vencedor,
        rondasFeitas: jUlt.equipa === 'A' ? ult.resultadoA : ult.resultadoB, rondasSofridas: jUlt.equipa === 'A' ? ult.resultadoB : ult.resultadoA,
        delta: jUlt.deltaPontos ?? null, terminouEm: ult.terminouEm,
      } : null,
      twitch: s.twitch[p.id]?.login ?? null,
      codigoConvite: s.codigos[p.id] ?? null,
      agora: iso(Date.now()),
    }
  },

  async minhaTwitch() {
    const e = await carregar()
    const me = e.sessao?.perfilId ? e.perfis[e.sessao.perfilId] : null
    const t = me && streamersVisivel(e, me) ? streamersDemo(e).twitch[me.id] : null
    return t ?? null
  },

  async twitchUrlLigar() {
    throw new Error('No modo demo não há ligação à Twitch a sério: usa "Ligar canal (demo)".')
  },

  async twitchLigarDemo(canal) {
    const e = await pronto()
    const me = exigirStreamers(e)
    const c = canal.trim().replace(/^@/, '')
    if (!/^[A-Za-z0-9_]{3,25}$/.test(c)) throw new Error('O nome do canal tem 3 a 25 letras, números ou _.')
    streamersDemo(e).twitch[me.id] = { login: c.toLowerCase(), nome: c, ligadaEm: iso(Date.now()), aoVivo: false, titulo: null, jogo: null, espetadores: null }
    guardar()
    avisarMudanca('streamers')
  },

  async twitchAoVivoDemo(aoVivo) {
    const e = await pronto()
    const me = exigirStreamers(e)
    const t = streamersDemo(e).twitch[me.id]
    if (!t) throw new Error('Liga primeiro o teu canal da Twitch.')
    Object.assign(t, aoVivo ? { aoVivo: true, titulo: 'Ranked no Rangify com a malta', jogo: 'VALORANT', espetadores: 27 } : { aoVivo: false, titulo: null, jogo: null, espetadores: null })
    guardar()
    avisarMudanca('streamers')
  },

  async desligarTwitch() {
    const e = await pronto()
    const me = eu(e)
    delete streamersDemo(e).twitch[me.id]
    guardar()
    avisarMudanca('streamers')
  },

  async streamersAoVivo(): Promise<StreamerAoVivo[]> {
    const e = await carregar()
    const me = e.sessao?.perfilId ? e.perfis[e.sessao.perfilId] : null
    if (!me || !streamersVisivel(e, me)) return []
    return Object.entries(streamersDemo(e).twitch)
      .filter(([id, t]) => t.aoVivo && e.perfis[id] && streamersVisivel(e, e.perfis[id]))
      .map(([id, t]) => ({ perfilId: id, utilizador: nomeCurto(e.perfis[id]), canal: t.login, nome: t.nome, titulo: t.titulo, jogo: t.jogo, espetadores: t.espetadores, desde: t.ligadaEm }))
  },

  async meuConvite(): Promise<ConvitesInfo> {
    const e = await pronto()
    const me = exigirStreamers(e)
    const s = streamersDemo(e)
    const codigo = codigoConvite(e, me.id)
    guardar()
    const meus = s.convidados.filter((c) => c.convidadorId === me.id)
    const deQuem = s.convidados.find((c) => c.convidadoId === me.id)
    return {
      codigo,
      valores: VALORES_CONVITE,
      convidados: [...meus].sort((a, b) => ms(b.criadoEm) - ms(a.criadoEm)).map((c) => ({
        perfilId: c.convidadoId, utilizador: nomeCurto(e.perfis[c.convidadoId]), avatarUrl: e.perfis[c.convidadoId]?.avatarUrl ?? null,
        estado: c.estado, desde: c.criadoEm, premiadoEm: c.premiadoEm, moedas: c.moedasConvidador,
      })),
      premiados: meus.filter((c) => c.estado === 'premiado').length,
      moedas: meus.reduce((t, c) => t + c.moedasConvidador, 0),
      conviteDe: deQuem ? { utilizador: nomeCurto(e.perfis[deQuem.convidadorId]), estado: deQuem.estado, moedas: deQuem.moedasConvidado } : null,
    }
  },

  async usarConvite(codigo) {
    const e = await pronto()
    const me = eu(e)
    const s = streamersDemo(e)
    const c = codigo.trim().toUpperCase()
    if (s.convidados.some((x) => x.convidadoId === me.id)) throw new Error('Já usaste um convite.')
    const convidadorId = Object.keys(s.codigos).find((id) => s.codigos[id] === c)
    if (!convidadorId) throw new Error('Esse convite não existe.')
    if (convidadorId === me.id) throw new Error('Não podes usar o teu próprio convite.')
    const jaJogou = e.partidas.some((m) => m.jogadores.some((j) => j.perfilId === me.id && j.equipa))
    if (Date.now() - ms(me.criadoEm) > VALORES_CONVITE.diasParaUsar * 86_400_000 || jaJogou) {
      throw new Error('Os convites só valem para quem acabou de criar a conta e ainda não jogou.')
    }
    s.convidados.push({ convidadoId: me.id, convidadorId, criadoEm: iso(Date.now()), estado: 'pendente', premiadoEm: null, moedasConvidador: 0, moedasConvidado: 0 })
    guardar()
    avisarMudanca('streamers')
    return { convidador: nomeCurto(e.perfis[convidadorId]), moedas: VALORES_CONVITE.convidado }
  },

  async conviteConvidadoDemo() {
    const e = await pronto()
    const me = exigirStreamers(e)
    const s = streamersDemo(e)
    // Um jogador qualquer da comunidade de exemplo faz de convidado (ainda sem convite, e que não és tu).
    const convidado = Object.values(e.perfis).find((p) => p.id !== me.id && !s.convidados.some((c) => c.convidadoId === p.id) && !s.codigos[p.id])
    if (!convidado) throw new Error('Já não há mais jogadores de teste para convidar.')
    codigoConvite(e, me.id)
    const c: ConvidadoGuardado = { convidadoId: convidado.id, convidadorId: me.id, criadoEm: iso(Date.now()), estado: 'pendente', premiadoEm: null, moedasConvidador: 0, moedasConvidado: 0 }
    s.convidados.push(c)
    premiarConvite(e, c)
    guardar()
    avisarMudanca('streamers'); avisarMudanca('loja')
  },

  async divulgacaoEstado() {
    const e = await pronto()
    exigirStaff(e)
    return estadoDivulgacao(e)
  },

  async definirStreamersPublico(publico) {
    const e = await pronto()
    exigirDev(e)
    streamersDemo(e).publico = publico
    guardar()
    avisarMudanca('staff'); avisarMudanca('streamers')
    return estadoDivulgacao(e)
  },
}
