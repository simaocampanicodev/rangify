/**
 * Torneios no modo demo: tudo guardado no browser, com as mesmas regras e as mesmas mensagens de erro das
 * funções SQL da migração 0031 (quem vê o quê, equipas e convites, sorteio, grupos, classificação, playoffs
 * com folgas, resultados, final presencial e as ferramentas de teste com bots).
 *
 * Num torneio no demo não há API da Riot: um jogo aberto fecha-se sozinho passados uns segundos, com um
 * resultado simulado, para se poder ver o fluxo todo. O sorteio, os grupos e a chave são os de verdade.
 *
 * Picks e bans de mapas e jogos à melhor de 1, 3 ou 5: as mesmas regras do SQL (90 s por vez, bots a jogar logo,
 * tempo esgotado = ao calhas). Não há cron: passado o prazo joga-se ao calhas quando alguém abre o jogo ou o torneio.
 */
import { avisarMudanca } from './eventos'
import { validarResultado } from '../regras'
import { nomeJogador } from '../partida'
import { MAPAS, NOMES_MAPAS, ROTACAO_PADRAO } from '../mapas'
import type {
  ConviteTorneio, Dados, DadosNovoTorneio, EstadoJogoTorneio, EstadoTorneio, FuncaoEquipaTorneio, ItemCalendarioTorneio,
  JogadaVetoTorneio, JogadorSugerido, MapaSerieTorneio, MelhorDe, OrigemEquipaTorneio, PassoVetoTorneio, Perfil, TorneioDetalhe, TorneioEquipa, TorneioJogo, TorneioLinhaClassificacao, TorneioMembro, TorneioResumo,
} from './tipos'

const CHAVE = 'rangify:demo:torneios:v1'

interface TorneioG {
  id: string; nome: string; descricao: string | null; estado: EstadoTorneio; publico: boolean; teste: boolean
  tamanhoGrupo: number; passamPorGrupo: number; finalPresencial: boolean; minJogadores: number
  vetoMapas: boolean; melhorDe: MelhorDe; poolMapas: string[] | null
  inscricoesAte: string; inicio: string | null; maxEquipas: number | null
  seed: number | null; sorteadoEm: string | null; campeaoId: string | null; criadoPor: string
}
interface EquipaG { id: string; torneioId: string; nome: string; capitaoId: string; estado: 'inscrita' | 'desqualificada'; grupo: number | null; ordem: number | null; criadaEm: string }
interface MembroG { equipaId: string; perfilId: string; torneioId: string; funcao: FuncaoEquipaTorneio; estado: 'convidado' | 'aceite'; convidadoPor: string | null; criadoEm: string }
interface JogoG {
  id: string; torneioId: string; fase: 'grupo' | 'playoff'; grupo: number | null; ronda: number; ordem: number; rotulo: string
  equipaA: string | null; equipaB: string | null; origemA: OrigemEquipaTorneio | null; origemB: OrigemEquipaTorneio | null
  seguinteId: string | null; seguinteLado: 'a' | 'b' | null
  agendadoPara: string | null; mapa: string | null; presencial: boolean; estado: EstadoJogoTorneio
  comecouEm: string | null; terminouEm: string | null; scoreA: number | null; scoreB: number | null
  vencedorId: string | null; como: 'api' | 'staff' | 'simulado' | 'walkover' | 'bye' | null; riotMatchId: string | null
  /** Picks e bans: o mapa foi posto pela staff, o que estava em jogo, de quem é a vez e o lado escolhido. */
  mapaStaff: boolean; poolMapas: string[] | null; vetoPrazo: string | null
  /** Formato deste jogo (null = o do torneio) e o que valia quando os picks e bans começaram. */
  melhorDe: MelhorDe | null; vetoMelhorDe: MelhorDe | null
  /** Mapas ganhos por cada equipa e os mapas da série (vazio à melhor de 1). */
  serieA: number; serieB: number; mapas: MapaSerieTorneio[]
  ladoEquipa: 'A' | 'B' | null; ladoEscolha: 'ataque' | 'defesa' | null; vetos: JogadaVetoTorneio[]
}
interface StatG {
  jogoId: string; mapaOrdem: number; perfilId: string; equipaId: string; agente: string | null
  kills: number | null; deaths: number | null; assists: number | null; acs: number | null
  firstBloods: number | null; trades: number | null; hsPct: number | null; kastPct: number | null
}
interface EstadoTorneios {
  torneios: TorneioG[]; equipas: EquipaG[]; membros: MembroG[]; acessos: { torneioId: string; perfilId: string }[]
  jogos: JogoG[]; stats: StatG[]; codigos: Record<string, string>
  /** A área de torneios está aberta a toda a gente (nasce fechada). */
  areaAberta: boolean
}

/** O que o modo demo dá a este módulo: quem sou eu, os perfis e a criação de bots. */
export interface ContextoTorneios {
  perfis(): Promise<{ eu: Perfil; todos: Perfil[] }>
  criarBot(): Perfil
  /** A rotação de mapas do hub (a que a staff define). */
  poolHub?(): string[]
}

// ---------------------------------------------------------------- estado

let estado: EstadoTorneios | null = null
let aOuvir = false
/** Outro separador do browser mudou os torneios: lê a versão nova. Só se liga quando o módulo é usado (assim não pesa no site a sério). */
function ouvirOutrosSeparadores() {
  if (aOuvir || typeof window === 'undefined') return
  aOuvir = true
  window.addEventListener('storage', (ev) => {
    if (ev.key !== CHAVE || !ev.newValue) return
    try { estado = JSON.parse(ev.newValue) as EstadoTorneios; avisarMudanca('torneios') } catch { /* ignora */ }
  })
}
function ler(): EstadoTorneios {
  ouvirOutrosSeparadores()
  if (estado) return estado
  try {
    const txt = localStorage.getItem(CHAVE)
    if (txt) estado = JSON.parse(txt) as EstadoTorneios
  } catch { estado = null }
  if (!estado) estado = { torneios: [], equipas: [], membros: [], acessos: [], jogos: [], stats: [], codigos: {}, areaAberta: false }
  // Dados guardados antes dos picks e bans (e da área aberta) não têm estes campos.
  estado.areaAberta ??= false
  for (const t of estado.torneios) { t.vetoMapas ??= true; t.melhorDe ??= 1; t.poolMapas ??= null }
  for (const x of estado.stats) x.mapaOrdem ??= 1
  for (const j of estado.jogos) { j.mapaStaff ??= !!j.mapa; j.poolMapas ??= null; j.melhorDe ??= null; j.vetoMelhorDe ??= null; j.serieA ??= 0; j.serieB ??= 0; j.mapas ??= []; j.vetoPrazo ??= null; j.ladoEscolha ??= null; j.ladoEquipa ??= null; j.vetos ??= [] }
  return estado
}
function guardar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)) } catch { /* sem espaço ou em modo privado: segue em memória */ }
}

const iso = (ms: number) => new Date(ms).toISOString()
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : NaN)
const novoId = () => {
  const c = globalThis.crypto as Partial<Crypto> | undefined
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
const eStaff = (p: Perfil) => p.funcao === 'owner' || p.funcao === 'dev'
const erro = (m: string): never => { throw new Error(m) }

function exigirStaff(p: Perfil) {
  if (!eStaff(p)) erro('Só Owner e Dev podem fazer isto.')
}

// ---------------------------------------------------------------- regras partilhadas com a SQL

const CAPACIDADE: Record<FuncaoEquipaTorneio, number> = { jogador: 5, coach: 1, suplente: 2 }
const MIN_PARA_API = 8

function visivel(s: EstadoTorneios, t: TorneioG, p: Perfil): boolean {
  if (eStaff(p)) return true
  if (t.estado === 'rascunho') return false
  return (t.publico && s.areaAberta)
    || s.acessos.some((a) => a.torneioId === t.id && a.perfilId === p.id)
    || s.membros.some((m) => m.torneioId === t.id && m.perfilId === p.id)
}
function ver(s: EstadoTorneios, id: string, p: Perfil): TorneioG {
  const t = s.torneios.find((x) => x.id === id)
  if (!t || !visivel(s, t, p)) return erro('Torneio não encontrado.')
  return t
}
const inscricoesAbertas = (t: TorneioG) => t.estado === 'inscricoes' && Date.now() < ms(t.inscricoesAte)
const perfilValido = (p: Perfil) => p.bot || !!p.riotId

function achar(todos: Perfil[], nome: string, bots = false): Perfil {
  const v = (nome ?? '').trim().toLowerCase()
  if (v.length < 2) return erro('Escreve o nome do jogador (Riot ID, por exemplo Nome#TAG).')
  const lista = todos.filter((p) => bots || !p.bot)
  const exato = lista.find((p) => p.riotId?.toLowerCase() === v)
  if (exato) return exato
  const parecidos = lista.filter((p) => p.utilizador.toLowerCase() === v || (p.riotId ?? '').split('#')[0].toLowerCase() === v)
  if (!parecidos.length) return erro(`Não encontrei ninguém chamado "${nome.trim()}". Confirma o nome (ou usa o Riot ID completo).`)
  if (parecidos.length > 1) return erro(`Há mais de um jogador chamado "${nome.trim()}". Usa o Riot ID completo (Nome#TAG).`)
  return parecidos[0]
}

const aceites = (s: EstadoTorneios, equipaId: string) => s.membros.filter((m) => m.equipaId === equipaId && m.estado === 'aceite')
const completa = (s: EstadoTorneios, e: EquipaG) => aceites(s, e.id).filter((m) => m.funcao === 'jogador').length >= 5
const lugarLivre = (s: EstadoTorneios, equipaId: string, f: FuncaoEquipaTorneio) =>
  s.membros.filter((m) => m.equipaId === equipaId && m.funcao === f).length < CAPACIDADE[f]
const funcaoValida = (f: string) => { if (!['jogador', 'coach', 'suplente'].includes(f)) erro('A função tem de ser jogador, coach ou suplente.') }

function editarEquipa(s: EstadoTorneios, equipaId: string, p: Perfil): { e: EquipaG; t: TorneioG } {
  const e = s.equipas.find((x) => x.id === equipaId)
  if (!e) return erro('Equipa não encontrada.')
  const t = s.torneios.find((x) => x.id === e.torneioId)!
  if (!visivel(s, t, p)) erro('Equipa não encontrada.')
  if (t.estado === 'concluido' || t.estado === 'cancelado') erro('Este torneio já acabou.')
  if (eStaff(p)) return { e, t }
  if (e.capitaoId !== p.id) erro('Só o capitão pode mudar a equipa.')
  if (!inscricoesAbertas(t)) erro('As inscrições já fecharam: já não se pode mudar a equipa.')
  return { e, t }
}

// ---------------------------------------------------------------- o motor: grupos, classificação e chave

/** Todos contra todos (método do círculo): uma jornada por ronda, cada equipa joga uma vez por jornada. */
export function calendarioGrupo(ids: string[]): { ronda: number; ordem: number; a: string; b: string }[] {
  let v: (string | null)[] = [...ids]
  if (v.length % 2 === 1) v.push(null)
  const n = v.length
  const jogos: { ronda: number; ordem: number; a: string; b: string }[] = []
  for (let r = 1; r <= n - 1; r++) {
    let k = 0
    for (let i = 0; i < n / 2; i++) {
      const a = v[i], b = v[n - 1 - i]
      if (a && b) jogos.push({ ronda: r, ordem: ++k, a, b })
    }
    v = [v[0], v[n - 1], ...v.slice(1, n - 1)]
  }
  return jogos
}

/** A ordem dos cabeças de série numa chave de n lugares: 1 contra n, 4 contra n-3, ... */
export function ordemChaves(n: number): number[] {
  let v = [1]
  let k = 1
  while (k < n) {
    const novo: number[] = []
    for (const x of v) novo.push(x, 2 * k + 1 - x)
    v = novo
    k *= 2
  }
  return v
}
const proximoPot = (n: number) => { let v = 1; while (v < n) v *= 2; return v }

/** Gerador pseudoaleatório com seed (mulberry32): a mesma seed dá sempre o mesmo sorteio. */
function aleatorio(seed: number) {
  let a = Math.floor((seed + 1) * 2 ** 30) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A tabela de cada grupo. Ordem: vitórias, confronto direto (só em empates a dois), diferença de rondas, rondas ganhas, sorteio. */
export function classificar(s: Pick<EstadoTorneios, 'equipas' | 'jogos'>, torneioId: string, passam: number): { grupo: number; equipas: TorneioLinhaClassificacao[] }[] {
  const equipas = s.equipas.filter((e) => e.torneioId === torneioId && e.grupo != null)
  const feitos = s.jogos.filter((j) => j.torneioId === torneioId && j.fase === 'grupo' && j.estado === 'concluido')
  const linhas = equipas.map((e) => {
    const meus = feitos.filter((j) => j.equipaA === e.id || j.equipaB === e.id)
    let rg = 0, rp = 0, v = 0
    for (const j of meus) {
      const sou_a = j.equipaA === e.id
      rg += (sou_a ? j.scoreA : j.scoreB) ?? 0
      rp += (sou_a ? j.scoreB : j.scoreA) ?? 0
      if (j.vencedorId === e.id) v++
    }
    return { e, jogos: meus.length, v, d: meus.length - v, rg, rp }
  })
  const grupos = [...new Set(equipas.map((e) => e.grupo!))].sort((x, y) => x - y)
  return grupos.map((g) => {
    const doGrupo = linhas.filter((l) => l.e.grupo === g)
    const h2h = (l: (typeof linhas)[number]) => {
      const empatadas = doGrupo.filter((o) => o.v === l.v)
      if (empatadas.length !== 2) return 0
      const outro = empatadas.find((o) => o !== l)!
      return feitos.some((j) => j.vencedorId === l.e.id && (j.equipaA === outro.e.id || j.equipaB === outro.e.id)) ? 1 : 0
    }
    const ordenadas = [...doGrupo].sort((x, y) => y.v - x.v || h2h(y) - h2h(x) || (y.rg - y.rp) - (x.rg - x.rp) || y.rg - x.rg || (x.e.ordem ?? 0) - (y.e.ordem ?? 0))
    return {
      grupo: g,
      equipas: ordenadas.map((l, i) => ({
        equipaId: l.e.id, nome: l.e.nome, jogos: l.jogos, vitorias: l.v, derrotas: l.d, rondasGanhas: l.rg, rondasPerdidas: l.rp,
        diferenca: l.rg - l.rp, posicao: i + 1, passa: i + 1 <= passam,
      })),
    }
  })
}

function recalcularEstado(j: JogoG) {
  if (j.estado === 'pendente' || j.estado === 'agendado') j.estado = j.equipaA && j.equipaB && j.agendadoPara ? 'agendado' : 'pendente'
}

/**
 * Os playoffs: passam os melhores de cada grupo e quem perde está fora. Com 2 a passar e um número de grupos
 * potência de 2, o 1.º de um grupo apanha o 2.º do grupo vizinho; nos outros casos usa a ordem da fase de grupos
 * e dá folga aos primeiros.
 */
function gerarPlayoffs(s: EstadoTorneios, t: TorneioG) {
  if (t.estado !== 'grupos') return
  if (s.jogos.some((j) => j.torneioId === t.id && j.fase === 'playoff')) return
  if (s.jogos.some((j) => j.torneioId === t.id && j.fase === 'grupo' && j.estado !== 'concluido')) erro('Ainda há jogos de grupo por jogar.')
  const tabelas = classificar(s, t.id, t.passamPorGrupo)
  const g = tabelas.length
  const q = tabelas.flatMap((c) => c.equipas.filter((l) => l.passa).map((l) => ({ ...l, grupo: c.grupo })))
  if (q.length < 2) erro('Não há equipas suficientes para os playoffs.')
  const lugar = (grupo: number, posicao: number) => q.find((x) => x.grupo === grupo && x.posicao === posicao)
  const origem = (x?: { grupo: number; posicao: number }): OrigemEquipaTorneio | null => (x ? { tipo: 'grupo', grupo: x.grupo, posicao: x.posicao } : null)
  const slots: { a: string | null; b: string | null; oa: OrigemEquipaTorneio | null; ob: OrigemEquipaTorneio | null }[] = []
  let tamanho: number
  if (t.passamPorGrupo === 2 && g >= 1 && (g & (g - 1)) === 0) {
    if (g === 1) {
      slots.push({ a: lugar(1, 1)?.equipaId ?? null, b: lugar(1, 2)?.equipaId ?? null, oa: origem(lugar(1, 1)), ob: origem(lugar(1, 2)) })
    } else {
      for (const k of [0, 1]) {
        for (let i = 0; i < g / 2; i++) {
          const ga = k === 0 ? 2 * i + 1 : 2 * i + 2
          const gb = k === 0 ? 2 * i + 2 : 2 * i + 1
          const a = lugar(ga, 1), b = lugar(gb, 2)
          slots.push({ a: a?.equipaId ?? null, b: b?.equipaId ?? null, oa: origem(a), ob: origem(b) })
        }
      }
    }
    tamanho = slots.length * 2
  } else {
    tamanho = proximoPot(q.length)
    const seeds = [...q].sort((x, y) => x.posicao - y.posicao || y.vitorias - x.vitorias || y.diferenca - x.diferenca || y.rondasGanhas - x.rondasGanhas || x.grupo - y.grupo)
    const ordem = ordemChaves(tamanho)
    for (let k = 0; k < tamanho / 2; k++) {
      const a = seeds[ordem[2 * k] - 1], b = seeds[ordem[2 * k + 1] - 1]
      slots.push({ a: a?.equipaId ?? null, b: b?.equipaId ?? null, oa: origem(a), ob: origem(b) })
    }
  }
  let rondas = 0
  for (let k = 1; k < tamanho; k *= 2) rondas++
  const criados: JogoG[] = []
  for (let r = 1; r <= rondas; r++) {
    for (let i = 1; i <= tamanho / 2 ** r; i++) {
      const slot = r === 1 ? slots[i - 1] : null
      const falta = rondas - r
      criados.push(novoJogo(t.id, 'playoff', null, r, i,
        falta === 0 ? 'final' : falta === 1 ? 'meias' : falta === 2 ? 'quartos' : falta === 3 ? 'oitavos' : 'ronda',
        slot?.a ?? null, slot?.b ?? null,
        slot ? slot.oa : { tipo: 'vencedor', ronda: r - 1, ordem: 2 * i - 1 },
        slot ? slot.ob : { tipo: 'vencedor', ronda: r - 1, ordem: 2 * i },
        falta === 0 && t.finalPresencial))
    }
  }
  for (const j of criados) {
    const n = criados.find((x) => x.ronda === j.ronda + 1 && x.ordem === Math.floor((j.ordem + 1) / 2))
    if (n) { j.seguinteId = n.id; j.seguinteLado = j.ordem % 2 === 1 ? 'a' : 'b' }
  }
  s.jogos.push(...criados)
  // Folgas: quem não tem adversário passa logo à ronda seguinte.
  for (const j of criados.filter((x) => x.ronda === 1 && (x.equipaA == null) !== (x.equipaB == null))) {
    j.estado = 'concluido'; j.como = 'bye'; j.vencedorId = j.equipaA ?? j.equipaB; j.terminouEm = iso(Date.now())
    const n = criados.find((x) => x.id === j.seguinteId)
    if (n) { if (j.seguinteLado === 'a') n.equipaA = j.vencedorId; else n.equipaB = j.vencedorId }
  }
  t.estado = 'playoffs'
}

function novoJogo(torneioId: string, fase: 'grupo' | 'playoff', grupo: number | null, ronda: number, ordem: number, rotulo: string,
  a: string | null, b: string | null, oa: OrigemEquipaTorneio | null = null, ob: OrigemEquipaTorneio | null = null, presencial = false): JogoG {
  return {
    id: novoId(), torneioId, fase, grupo, ronda, ordem, rotulo, equipaA: a, equipaB: b, origemA: oa, origemB: ob, seguinteId: null, seguinteLado: null,
    agendadoPara: null, mapa: null, presencial, estado: 'pendente', comecouEm: null, terminouEm: null, scoreA: null, scoreB: null,
    vencedorId: null, como: null, riotMatchId: null,
    mapaStaff: false, poolMapas: null, melhorDe: null, vetoMelhorDe: null, serieA: 0, serieB: 0, mapas: [], vetoPrazo: null, ladoEquipa: null, ladoEscolha: null, vetos: [],
  }
}

type StatsEntrada = { perfilId: string; agente?: string | null; kills?: number; deaths?: number; assists?: number; acs?: number; firstBloods?: number; trades?: number; hsPct?: number; kastPct?: number }

function guardarStats(s: EstadoTorneios, j: JogoG, ordem: number, stats: StatsEntrada[] | null) {
  s.stats = s.stats.filter((x) => !(x.jogoId === j.id && x.mapaOrdem === ordem))
  for (const x of stats ?? []) {
    const m = s.membros.find((y) => y.estado === 'aceite' && y.perfilId === x.perfilId && (y.equipaId === j.equipaA || y.equipaId === j.equipaB))
    if (!m) continue
    s.stats.push({
      jogoId: j.id, mapaOrdem: ordem, perfilId: x.perfilId, equipaId: m.equipaId, agente: x.agente ?? null, kills: x.kills ?? null, deaths: x.deaths ?? null,
      assists: x.assists ?? null, acs: x.acs ?? null, firstBloods: x.firstBloods ?? null, trades: x.trades ?? null, hsPct: x.hsPct ?? null, kastPct: x.kastPct ?? null,
    })
  }
}

/** O jogo (ou a série) acabou com este vencedor: fecha-o, sobe o vencedor na chave e fecha o torneio na final. */
function fecharJogo(s: EstadoTorneios, j: JogoG, vencedor: string, como: NonNullable<JogoG['como']>, riotMatch: string | null) {
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  j.estado = 'concluido'; j.vencedorId = vencedor; j.como = como
  j.terminouEm = iso(Date.now()); j.comecouEm = j.comecouEm ?? iso(Date.now()); j.riotMatchId = riotMatch
  if (j.fase === 'playoff') {
    const n = j.seguinteId ? s.jogos.find((x) => x.id === j.seguinteId) : null
    if (n) {
      if (j.seguinteLado === 'a') n.equipaA = vencedor; else n.equipaB = vencedor
      recalcularEstado(n)
    } else {
      t.campeaoId = vencedor; t.estado = 'concluido'
    }
  } else if (!s.jogos.some((x) => x.torneioId === t.id && x.fase === 'grupo' && x.estado !== 'concluido')) {
    gerarPlayoffs(s, t)
  }
}

/**
 * Chega um resultado. À melhor de 1 é o do jogo. Numa série online é o do mapa que se joga agora (o jogo só acaba
 * quando uma equipa chega aos mapas precisos). Numa série presencial a staff põe os mapas ganhos. Falta de
 * comparência: a equipa que apareceu ganha a série.
 */
function aplicarResultado(s: EstadoTorneios, jogoId: string, a: number, b: number, stats: StatsEntrada[] | null, como: NonNullable<JogoG['como']>, riotMatch: string | null = null, eBot: (perfilId: string) => boolean = () => false) {
  const j = s.jogos.find((x) => x.id === jogoId)
  if (!j) return erro('Jogo não encontrado.')
  if (j.estado === 'concluido') erro('Este jogo já tem resultado.')
  if (!j.equipaA || !j.equipaB) erro('Este jogo ainda não tem as duas equipas.')
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  if (t.estado !== 'grupos' && t.estado !== 'playoffs') erro('O torneio não está a decorrer.')
  const eqA = j.equipaA!, eqB = j.equipaB!
  const n = melhorDeDoJogo(j, t)
  const precisa = (n + 1) / 2
  const ganhouA = a > b
  const vencedor = ganhouA ? eqA : eqB

  if (n > 1 && como === 'walkover') {
    j.serieA = ganhouA ? precisa : 0; j.serieB = ganhouA ? 0 : precisa
    j.scoreA = ganhouA ? 13 * precisa : 0; j.scoreB = ganhouA ? 0 : 13 * precisa
    return fecharJogo(s, j, vencedor, como, null)
  }
  if (n > 1 && j.presencial) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.max(a, b) !== precisa || Math.min(a, b) < 0 || Math.min(a, b) >= precisa) erro(`Num jogo à melhor de ${n} o vencedor ganha ${precisa} mapas e o outro menos do que isso.`)
    j.serieA = a; j.serieB = b; j.scoreA = a; j.scoreB = b
    return fecharJogo(s, j, vencedor, como, null)
  }
  if (n > 1) {
    const v = validarResultado(a, b)
    if (!v.ok) erro(v.titulo)
    if (!j.mapas.length) {
      // Ainda sem picks e bans (um resultado posto à mão): despacham-se ao calhas.
      vetoCompletar(s, j, eBot)
      if (!j.mapas.length) erro(`Este jogo é à melhor de ${n} e ainda não tem mapas: faz primeiro os picks e bans.`)
    }
    const k = j.serieA + j.serieB + 1
    const mapa = j.mapas[k - 1]
    guardarStats(s, j, k, stats)
    Object.assign(mapa, {
      estado: 'concluido', scoreA: a, scoreB: b, vencedorId: vencedor, como: como === 'api' || como === 'simulado' ? como : 'staff',
      comecouEm: mapa.comecouEm ?? iso(Date.now()), terminouEm: iso(Date.now()),
    })
    if (ganhouA) j.serieA++; else j.serieB++
    j.scoreA = (j.scoreA ?? 0) + a; j.scoreB = (j.scoreB ?? 0) + b
    if (j.serieA >= precisa || j.serieB >= precisa) return fecharJogo(s, j, j.serieA >= precisa ? eqA : eqB, como, riotMatch)
    // Segue-se o mapa seguinte, com o grupo do Valorant que já existe.
    const prox = j.mapas[k]
    Object.assign(j, {
      mapa: prox.mapa, ladoEquipa: prox.ladoEquipa, ladoEscolha: prox.ladoEscolha, estado: j.agendadoPara ? 'agendado' : 'pendente',
      comecouEm: null, terminouEm: null, riotMatchId: null,
    })
    return
  }
  // Melhor de 1.
  if (como === 'walkover') {
    /* 13-0 sem mais validações */
  } else if (j.presencial && como === 'staff') {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a === b) erro('Põe um resultado com vencedor (não há empates).')
  } else {
    const v = validarResultado(a, b)
    if (!v.ok) erro(v.titulo)
  }
  j.scoreA = a; j.scoreB = b
  guardarStats(s, j, 1, stats)
  fecharJogo(s, j, vencedor, como, riotMatch)
}

function desfazer(s: EstadoTorneios, jogoId: string) {
  const j = s.jogos.find((x) => x.id === jogoId)
  if (!j) return erro('Jogo não encontrado.')
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  if (j.como === 'bye') erro('Uma folga não se desfaz.')
  if (j.estado === 'concluido') {
    if (j.fase === 'grupo' && t.estado !== 'grupos') erro('Os playoffs já foram gerados: não se mexe nos resultados dos grupos.')
    if (j.fase === 'playoff' && j.seguinteId) {
      const n = s.jogos.find((x) => x.id === j.seguinteId)!
      if (n.estado === 'a_decorrer' || n.estado === 'concluido') erro('O jogo seguinte já começou.')
      if (j.seguinteLado === 'a') n.equipaA = null; else n.equipaB = null
      recalcularEstado(n)
    } else if (j.fase === 'playoff') {
      t.campeaoId = null; t.estado = 'playoffs'
    }
  }
  s.stats = s.stats.filter((x) => x.jogoId !== j.id)
  delete s.codigos[j.id]
  Object.assign(j, { scoreA: null, scoreB: null, serieA: 0, serieB: 0, vencedorId: null, como: null, riotMatchId: null, comecouEm: null, terminouEm: null, estado: 'pendente' as EstadoJogoTorneio })
  // Numa série os mapas voltam a estar por jogar e o jogo volta ao primeiro.
  if (j.mapas.length) {
    for (const m of j.mapas) Object.assign(m, { estado: 'pendente', scoreA: null, scoreB: null, vencedorId: null, como: null, comecouEm: null, terminouEm: null })
    Object.assign(j, { mapa: j.mapas[0].mapa, ladoEquipa: j.mapas[0].ladoEquipa, ladoEscolha: j.mapas[0].ladoEscolha })
  }
  recalcularEstado(j)
}

const AGENTES = ['Jett', 'Sage', 'Omen', 'Sova', 'Reyna', 'Killjoy', 'Brimstone', 'Fade']
const inteiro = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

/** Um resultado inventado mas válido (de vez em quando com prolongamento) e estatísticas de mentira: o do jogo ou o do mapa em jogo. */
function simularMapa(s: EstadoTorneios, j: JogoG, como: 'simulado' | 'api', eBot: (perfilId: string) => boolean) {
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  const n = melhorDeDoJogo(j, t)
  const precisa = (n + 1) / 2
  const ganhaA = Math.random() < 0.5
  if (n > 1 && j.presencial) {
    // Presencial à melhor de 3 ou 5: a série acaba logo, com os mapas ganhos.
    const perde = inteiro(0, precisa - 1)
    return aplicarResultado(s, j.id, ganhaA ? precisa : perde, ganhaA ? perde : precisa, null, como, null, eBot)
  }
  let ganha = 13, perde = inteiro(0, 11)
  if (Math.random() < 0.15) { ganha = inteiro(14, 16); perde = ganha - 2 }
  const stats: StatsEntrada[] = s.membros.filter((m) => m.estado === 'aceite' && m.funcao === 'jogador' && (m.equipaId === j.equipaA || m.equipaId === j.equipaB)).map((m) => ({
    perfilId: m.perfilId, agente: AGENTES[inteiro(0, AGENTES.length - 1)], kills: inteiro(6, 25), deaths: inteiro(4, 19), assists: inteiro(0, 11),
    acs: inteiro(120, 349), firstBloods: inteiro(0, 5), trades: inteiro(0, 4), hsPct: inteiro(10, 44), kastPct: inteiro(55, 89),
  }))
  aplicarResultado(s, j.id, ganhaA ? ganha : perde, ganhaA ? perde : ganha, stats, como, null, eBot)
}

/** Simula o jogo todo: numa série joga os mapas até alguém ter os precisos. */
function simular(s: EstadoTorneios, jogoId: string, eBot: (perfilId: string) => boolean) {
  const j = s.jogos.find((x) => x.id === jogoId)!
  vetoCompletar(s, j, eBot)
  for (let k = 0; k < 6 && j.estado !== 'concluido'; k++) simularMapa(s, j, 'simulado', eBot)
}


// ---------------------------------------------------------------- picks e bans de mapas

const SEGUNDOS_VETO = 90
/** A rotação do hub (o motor do demo pede-a ao adaptador; sem isso, a de origem). */
let rotacaoHub: () => string[] = () => ROTACAO_PADRAO

/** Os mapas em jogo: os do torneio ou a rotação do hub, pela ordem do jogo. */
const poolDoTorneio = (t: TorneioG): string[] => NOMES_MAPAS.filter((m) => (t.poolMapas ?? rotacaoHub()).includes(m))

/** O formato do jogo: 1, 3 ou 5 mapas (os picks e bans já começados guardam o que valia na altura). */
const melhorDeDoJogo = (j: JogoG, t: TorneioG): MelhorDe => j.vetoMelhorDe ?? j.melhorDe ?? t.melhorDe

/**
 * A ordem dos picks e bans de um jogo à melhor de N com n mapas (a equipa A começa). À melhor de 1: só bans. À melhor
 * de 3 ou 5: dois bans, os picks (cada um com o lado escolhido pela outra equipa) e, se sobrarem mapas, mais bans; o que
 * fica é o decisivo, cujo lado escolhe quem não fez a última jogada de mapa. O lado do decisivo é sempre o último passo.
 */
export function passosVeto(melhorDe: MelhorDe, n: number): PassoVetoTorneio[] {
  const passos: PassoVetoTorneio[] = []
  const picks = Math.max(melhorDe - 1, 0)
  const bans = Math.max(n - melhorDe, 0)
  const antes = melhorDe === 1 ? bans : Math.min(2, bans)
  const depois = bans - antes
  let ultima: 'A' | 'B' = 'B'
  const ban = (i: number) => { ultima = i % 2 === 1 ? 'A' : 'B'; passos.push({ tipo: 'ban', equipa: ultima }) }
  for (let i = 1; i <= antes; i++) ban(i)
  for (let i = 1; i <= picks; i++) {
    ultima = i % 2 === 1 ? 'A' : 'B'
    passos.push({ tipo: 'pick', equipa: ultima, alvo: i })
    passos.push({ tipo: 'lado', equipa: ultima === 'A' ? 'B' : 'A', alvo: i })
  }
  for (let i = 1; i <= depois; i++) ban(i)
  passos.push({ tipo: 'lado', equipa: ultima === 'A' ? 'B' : 'A', alvo: melhorDe })
  return passos
}

const poolDoJogo = (j: JogoG, t: TorneioG) => j.poolMapas ?? poolDoTorneio(t)
const passosDoJogo = (j: JogoG, t: TorneioG) => passosVeto(melhorDeDoJogo(j, t), poolDoJogo(j, t).length)
function vezVeto(j: JogoG, t: TorneioG): (PassoVetoTorneio & { ordem: number }) | null {
  const passos = passosDoJogo(j, t)
  return j.vetos.length < passos.length ? { ...passos[j.vetos.length], ordem: j.vetos.length + 1 } : null
}
const mapasUsados = (j: JogoG) => new Set(j.vetos.filter((v) => v.tipo !== 'lado').map((v) => v.valor))

/**
 * Faz o passo que falta. No último (o lado do decisivo) os picks e bans fecham: ficam os mapas da série e o jogo volta
 * a "agendado", pronto a abrir. À melhor de 1 o mapa fica à vista logo que acabam os bans (falta só o lado).
 */
function vetoFazer(s: EstadoTorneios, j: JogoG, valor: string | null, auto: boolean) {
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  if (j.estado !== 'veto') erro('Os picks e bans deste jogo não estão a decorrer.')
  const vez = vezVeto(j, t)
  if (!vez) return erro('Os picks e bans já acabaram.')
  const pool = poolDoJogo(j, t)
  if (vez.tipo === 'lado') {
    if (valor !== 'ataque' && valor !== 'defesa') erro('Escolhe Ataque ou Defesa.')
  } else if (!valor || !pool.includes(valor) || mapasUsados(j).has(valor)) {
    erro('Esse mapa já não está disponível.')
  }
  j.vetos.push({ ordem: vez.ordem, tipo: vez.tipo, equipa: vez.equipa, valor: valor!, auto })
  const total = passosDoJogo(j, t).length
  if (vez.ordem === total) return vetoFechar(j, pool)
  j.vetoPrazo = iso(Date.now() + SEGUNDOS_VETO * 1000)
  if (melhorDeDoJogo(j, t) === 1 && vez.ordem === total - 1) j.mapa = pool.find((m) => !mapasUsados(j).has(m)) ?? null
}

/** Acabaram os picks e bans: os mapas escolhidos e o decisivo (o que sobrou) ficam na ordem de jogo, cada um com o seu lado. */
function vetoFechar(j: JogoG, pool: string[]) {
  const picks = j.vetos.filter((v) => v.tipo === 'pick')
  const lados = j.vetos.filter((v) => v.tipo === 'lado')
  const decisivo = pool.find((m) => !mapasUsados(j).has(m)) ?? pool[0]
  const mapas = [...picks.map((p) => ({ mapa: p.valor, por: p.equipa as 'A' | 'B' | 'decisivo' })), { mapa: decisivo, por: 'decisivo' as const }]
  j.mapas = (j.vetoMelhorDe ?? 1) > 1 ? mapas.map((m, i) => ({
    ordem: i + 1, mapa: m.mapa, escolhidaPor: m.por, ladoEquipa: lados[i]?.equipa ?? null, ladoEscolha: (lados[i]?.valor as 'ataque' | 'defesa' | undefined) ?? null,
    estado: 'pendente', scoreA: null, scoreB: null, vencedorId: null, como: null, comecouEm: null, terminouEm: null,
  })) : []
  Object.assign(j, {
    mapa: mapas[0].mapa, ladoEquipa: lados[0]?.equipa ?? null, ladoEscolha: lados[0]?.valor ?? null, vetoPrazo: null, serieA: 0, serieB: 0,
    estado: j.agendadoPara ? 'agendado' : 'pendente',
  })
}

/** Joga o passo que falta ao calhas (tempo esgotado, capitão bot ou staff a despachar). */
function vetoAuto(s: EstadoTorneios, j: JogoG) {
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  if (j.estado !== 'veto') return
  const vez = vezVeto(j, t)
  if (!vez) return
  if (vez.tipo === 'lado') return vetoFazer(s, j, Math.random() < 0.5 ? 'ataque' : 'defesa', true)
  const livres = poolDoJogo(j, t).filter((m) => !mapasUsados(j).has(m))
  vetoFazer(s, j, livres[Math.floor(Math.random() * livres.length)], true)
}

/** Enquanto for a vez de uma equipa cujo capitão é um bot, o bot joga. */
function vetoBots(s: EstadoTorneios, j: JogoG, eBot: (perfilId: string) => boolean) {
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  for (let k = 0; k < 30 && j.estado === 'veto'; k++) {
    const vez = vezVeto(j, t)
    if (!vez) return
    const e = s.equipas.find((x) => x.id === (vez.equipa === 'A' ? j.equipaA : j.equipaB))
    if (!e || !eBot(e.capitaoId)) return
    vetoAuto(s, j)
  }
}

function vetoComecar(s: EstadoTorneios, j: JogoG, eBot: (perfilId: string) => boolean) {
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  const pool = poolDoTorneio(t)
  const n = j.melhorDe ?? t.melhorDe
  if (pool.length < 3) erro('A lista de mapas do torneio precisa de pelo menos 3 mapas.')
  if (pool.length < n) erro(`Este jogo é à melhor de ${n} e só há ${pool.length} mapas em jogo: junta mais mapas ao torneio.`)
  Object.assign(j, {
    estado: 'veto' as EstadoJogoTorneio, poolMapas: pool, vetoMelhorDe: n, vetoPrazo: iso(Date.now() + SEGUNDOS_VETO * 1000),
    mapa: null, mapaStaff: false, ladoEquipa: null, ladoEscolha: null, vetos: [], mapas: [], serieA: 0, serieB: 0,
  })
  vetoBots(s, j, eBot)
}

/** Despacha os picks e bans todos ao calhas (staff ou simulação); se não tinham começado, começa-os. */
function vetoCompletar(s: EstadoTorneios, j: JogoG, eBot: (perfilId: string) => boolean) {
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  if (!t.vetoMapas || j.presencial || j.mapaStaff || !j.equipaA || !j.equipaB) return
  if (j.estado === 'a_decorrer' || j.estado === 'concluido') return
  if (j.estado !== 'veto') {
    if (j.ladoEscolha) return
    vetoComecar(s, j, eBot)
  }
  for (let k = 0; k < 30 && j.estado === 'veto'; k++) vetoAuto(s, j)
}

/** O que o cron faz no SQL: as vezes que passaram do prazo jogam ao calhas. */
function vetoTick(s: EstadoTorneios, eBot: (perfilId: string) => boolean): boolean {
  let mexeu = false
  for (const j of s.jogos.filter((x) => x.estado === 'veto' && x.vetoPrazo && ms(x.vetoPrazo) < Date.now())) {
    vetoAuto(s, j); vetoBots(s, j, eBot); mexeu = true
  }
  return mexeu
}

/** O mapa só muda se vier (undefined/null = deixar; vazio = tirar o da staff). Um mapa à mão dispensa os picks e bans. */
function fixarMapa(j: JogoG, mapa: string | null | undefined) {
  if (mapa == null) return
  const m = mapa.trim()
  if (m && !MAPAS.some((x) => x.nome === m)) erro(`Mapa desconhecido: ${m}.`)
  if (m) {
    Object.assign(j, { mapa: m, mapaStaff: true, poolMapas: null, vetoMelhorDe: null, vetoPrazo: null, ladoEquipa: null, ladoEscolha: null, vetos: [] })
    if (j.estado === 'veto') j.estado = 'pendente'
  } else if (j.mapaStaff) {
    j.mapa = null; j.mapaStaff = false
  }
}

/** O formato tem de ser 1, 3 ou 5 e haver mapas para os picks (3: 3 mapas; 5: 5 mapas). */
function validarMelhorDe(n: number, pool: string[] | null, vetoMapas = true) {
  if (n !== 1 && n !== 3 && n !== 5) erro('Escolhe melhor de 1, 3 ou 5.')
  if (n > 1 && !vetoMapas) erro('Os jogos à melhor de 3 ou 5 precisam dos picks e bans de mapas: liga-os ou deixa os jogos à melhor de 1.')
  const mapas = (pool ?? rotacaoHub()).length
  if (n > mapas) erro(`Para jogar à melhor de ${n} são precisos pelo menos ${n} mapas em jogo (há ${mapas}).`)
}

/**
 * Marca (ou muda) um jogo: data, mapa fixado pela staff, presencial e formato. O mapa só muda se vier (null/undefined =
 * deixar; vazio = tirar o da staff); à melhor de 3 ou 5 não há mapa fixado (saem dos picks e bans).
 */
function agendarJogo(s: EstadoTorneios, j: JogoG, quando: string | null, mapa: string | null | undefined, presencial: boolean | null | undefined, melhorDe: MelhorDe | null | undefined) {
  if (j.estado === 'a_decorrer' || j.estado === 'concluido') erro('Este jogo já começou.')
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  const querMapa = !!mapa && !!mapa.trim()
  if (querMapa && !MAPAS.some((x) => x.nome === mapa!.trim())) erro(`Mapa desconhecido: ${mapa!.trim()}.`)
  if (melhorDe != null && melhorDe !== 1 && melhorDe !== 3 && melhorDe !== 5) erro('Escolhe melhor de 1, 3 ou 5.')
  const atual = j.melhorDe ?? t.melhorDe
  const n = melhorDe ?? atual
  if (melhorDe != null && melhorDe > 1 && !t.vetoMapas) erro('Os jogos à melhor de 3 ou 5 precisam dos picks e bans de mapas: liga-os ou deixa os jogos à melhor de 1.')
  if (j.serieA + j.serieB > 0 && (querMapa || n !== atual)) erro('A série já começou: desfaz o jogo para mudares o formato ou o mapa.')
  if (n !== atual) {
    if (j.estado === 'veto' || j.ladoEscolha) erro('Reinicia primeiro os picks e bans deste jogo para mudares o formato.')
    const mapas = poolDoTorneio(t).length
    if (n > mapas) erro(`Para jogar à melhor de ${n} são precisos pelo menos ${n} mapas em jogo (há ${mapas}).`)
  }
  if (querMapa && n > 1) erro(`Num jogo à melhor de ${n} os mapas saem dos picks e bans: muda o jogo para melhor de 1 para fixares o mapa.`)
  j.agendadoPara = quando || null
  if (presencial != null) j.presencial = presencial
  if (melhorDe != null) {
    j.melhorDe = melhorDe === t.melhorDe ? null : melhorDe
    if (melhorDe > 1 && j.mapaStaff) { j.mapa = null; j.mapaStaff = false }
  }
  fixarMapa(j, mapa)
  recalcularEstado(j)
}

/** Dados do torneio sobre a lista de mapas (criar e editar). */
function poolDosDados(pool: string[] | null | undefined): string[] | null {
  if (!pool || !pool.length) return null
  const v = [...new Set(pool)]
  if (v.some((m) => !NOMES_MAPAS.includes(m))) erro('Há um mapa que não existe no Valorant.')
  if (v.length < 3) erro('A lista de mapas do torneio precisa de pelo menos 3 mapas.')
  return NOMES_MAPAS.filter((m) => v.includes(m))
}

// ---------------------------------------------------------------- JSON para as páginas

function jsonResumo(s: EstadoTorneios, t: TorneioG, p: Perfil): TorneioResumo {
  const doTorneio = s.equipas.filter((e) => e.torneioId === t.id && e.estado === 'inscrita')
  const meu = s.membros.find((m) => m.torneioId === t.id && m.perfilId === p.id && m.estado === 'aceite')
  const minha = meu ? s.equipas.find((e) => e.id === meu.equipaId) : null
  const campeao = t.campeaoId ? s.equipas.find((e) => e.id === t.campeaoId) : null
  return {
    id: t.id, nome: t.nome, descricao: t.descricao, estado: t.estado, publico: t.publico, teste: t.teste,
    tamanhoGrupo: t.tamanhoGrupo, passamPorGrupo: t.passamPorGrupo, finalPresencial: t.finalPresencial,
    vetoMapas: t.vetoMapas, melhorDe: t.melhorDe, poolMapas: t.poolMapas, poolEfetiva: poolDoTorneio(t), minJogadores: t.minJogadores,
    inscricoesAte: t.inscricoesAte, inicio: t.inicio, maxEquipas: t.maxEquipas, sorteadoEm: t.sorteadoEm,
    inscricoesAbertas: inscricoesAbertas(t), equipas: doTorneio.length, completas: doTorneio.filter((e) => completa(s, e)).length,
    campeao: campeao ? { id: campeao.id, nome: campeao.nome } : null,
    minhaEquipa: minha && meu ? { id: minha.id, nome: minha.nome, funcao: meu.funcao, capitao: minha.capitaoId === p.id } : null,
    convites: s.membros.filter((m) => m.torneioId === t.id && m.perfilId === p.id && m.estado === 'convidado').length,
    gerir: eStaff(p),
  }
}

function jsonEquipa(s: EstadoTorneios, e: EquipaG, p: Perfil, perfis: Map<string, Perfil>): TorneioEquipa {
  const peso = (f: FuncaoEquipaTorneio) => (f === 'jogador' ? 0 : f === 'suplente' ? 1 : 2)
  const membros: TorneioMembro[] = s.membros
    .filter((m) => m.equipaId === e.id && (m.estado === 'aceite' || eStaff(p) || e.capitaoId === p.id || m.perfilId === p.id))
    .sort((x, y) => peso(x.funcao) - peso(y.funcao) || Number(y.perfilId === e.capitaoId) - Number(x.perfilId === e.capitaoId) || x.criadoEm.localeCompare(y.criadoEm))
    .map((m) => {
      const pr = perfis.get(m.perfilId)!
      return { perfilId: pr.id, utilizador: nomeJogador(pr), riotId: pr.riotId, avatarUrl: pr.avatarUrl, bot: pr.bot, funcao: m.funcao, estado: m.estado, capitao: pr.id === e.capitaoId }
    })
  return { id: e.id, nome: e.nome, capitaoId: e.capitaoId, estado: e.estado, grupo: e.grupo, ordem: e.ordem, completa: completa(s, e), membros }
}

function jsonJogo(s: EstadoTorneios, j: JogoG, p: Perfil, perfis: Map<string, Perfil>): TorneioJogo {
  const ref = (id: string | null) => { const e = id ? s.equipas.find((x) => x.id === id) : null; return e ? { id: e.id, nome: e.nome } : null }
  const dosDois = [j.equipaA, j.equipaB]
  const vejoCodigo = eStaff(p) || s.membros.some((m) => m.estado === 'aceite' && m.perfilId === p.id && dosDois.includes(m.equipaId))
  const eqA = j.equipaA
  const t = s.torneios.find((x) => x.id === j.torneioId)!
  return {
    id: j.id, fase: j.fase, grupo: j.grupo, ronda: j.ronda, ordem: j.ordem, rotulo: j.rotulo, equipaA: ref(j.equipaA), equipaB: ref(j.equipaB),
    origemA: j.origemA, origemB: j.origemB, agendadoPara: j.agendadoPara, mapa: j.mapa, presencial: j.presencial, estado: j.estado,
    melhorDe: melhorDeDoJogo(j, t), serieA: j.serieA, serieB: j.serieB, mapas: j.mapas.map((m) => ({ ...m })),
    veto: t.vetoMapas && !j.presencial ? {
      melhorDe: melhorDeDoJogo(j, t), pool: poolDoJogo(j, t), passos: passosDoJogo(j, t), feitos: j.vetos.map((v) => ({ ...v })),
      prazo: j.vetoPrazo, ladoEquipa: j.ladoEquipa, ladoEscolha: j.ladoEscolha, mapaStaff: j.mapaStaff,
    } : null,
    comecouEm: j.comecouEm, terminouEm: j.terminouEm, scoreA: j.scoreA, scoreB: j.scoreB, vencedorId: j.vencedorId, como: j.como,
    semResultadoAuto: j.estado === 'a_decorrer' && Date.now() - ms(j.comecouEm) > 60 * 60_000,
    codigo: vejoCodigo ? s.codigos[j.id] ?? null : null,
    jogadores: s.stats.filter((x) => x.jogoId === j.id)
      .sort((x, y) => x.mapaOrdem - y.mapaOrdem || Number(y.equipaId === eqA) - Number(x.equipaId === eqA) || (y.acs ?? -1) - (x.acs ?? -1))
      .map((x) => ({ mapaOrdem: x.mapaOrdem, perfilId: x.perfilId, equipaId: x.equipaId, utilizador: nomeJogador(perfis.get(x.perfilId)!), agente: x.agente, kills: x.kills, deaths: x.deaths, assists: x.assists, acs: x.acs, firstBloods: x.firstBloods, trades: x.trades, hsPct: x.hsPct, kastPct: x.kastPct })),
  }
}

const sugerido = (p: Perfil): JogadorSugerido => ({ perfilId: p.id, utilizador: nomeJogador(p), riotId: p.riotId, avatarUrl: p.avatarUrl })

// ---------------------------------------------------------------- a API que o resto do site usa

export function criarTorneiosLocais(ctx: ContextoTorneios): Pick<Dados,
  'torneiosVisivel' | 'torneiosLista' | 'torneioDetalhe' | 'meusConvitesTorneio' | 'torneioProcurarJogadores' | 'torneioCriarEquipa' | 'torneioRenomearEquipa'
  | 'torneioConvidar' | 'torneioResponderConvite' | 'torneioRemoverMembro' | 'torneioMudarFuncao' | 'torneioSairEquipa' | 'torneioApagarEquipa'
  | 'torneiosAreaAberta' | 'torneiosDefinirArea' | 'torneioAbrirJogo' | 'torneioVetoIniciar' | 'torneioVetoAgir' | 'torneioVetoAvancar' | 'torneioVetoConcluir' | 'torneioVetoReiniciar' | 'torneioProcessarJogo' | 'torneioCriar' | 'torneioEditar' | 'torneioMudarEstado' | 'torneioApagar' | 'torneioAcesso'
  | 'torneioAcessos' | 'torneioStaffAdicionar' | 'torneioSortear' | 'torneioAgendar' | 'torneioAgendarVarios' | 'torneioResolverJogo'
  | 'torneioWalkover' | 'torneioDesfazerJogo' | 'torneioGerarPlayoffs' | 'torneioTesteEquipas' | 'torneioTestePreencher'
  | 'torneioTesteSimular' | 'torneioTesteSimularTudo' | 'torneioTesteReiniciar'> {
  const mudou = () => { guardar(); avisarMudanca('torneios') }
  const so_teste = (s: EstadoTorneios, id: string) => {
    const t = s.torneios.find((x) => x.id === id)
    if (!t) return erro('Torneio não encontrado.')
    if (!t.teste) erro('Isto só existe em torneios de teste.')
    return t
  }
  const mapaPerfis = (todos: Perfil[]) => new Map(todos.map((p) => [p.id, p]))
  if (ctx.poolHub) rotacaoHub = ctx.poolHub
  const eBotDe = (todos: Perfil[]) => { const bots = new Set(todos.filter((p) => p.bot).map((p) => p.id)); return (id: string) => bots.has(id) }

  /** Bots livres neste torneio (que não estão em nenhuma equipa dele), criando os que faltarem. */
  const botsLivres = (s: EstadoTorneios, t: TorneioG, todos: Perfil[], n: number): Perfil[] => {
    const usados = new Set(s.membros.filter((m) => m.torneioId === t.id).map((m) => m.perfilId))
    const livres = todos.filter((p) => p.bot && !usados.has(p.id)).sort(() => Math.random() - 0.5).slice(0, n)
    while (livres.length < n) livres.push(ctx.criarBot())
    return livres
  }

  return {
    async torneiosVisivel() {
      try {
        const { eu } = await ctx.perfis()
        const s = ler()
        return eStaff(eu) || s.areaAberta || s.torneios.some((t) => visivel(s, t, eu))
      } catch { return false }
    },

    async torneiosAreaAberta() {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      return ler().areaAberta
    },

    async torneiosDefinirArea(aberta) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      ler().areaAberta = !!aberta
      mudou()
      avisarMudanca('staff')
      return !!aberta
    },

    async torneiosLista() {
      const { eu } = await ctx.perfis()
      const s = ler()
      const peso = (e: EstadoTorneio) => (e === 'inscricoes' ? 0 : e === 'grupos' || e === 'playoffs' ? 1 : e === 'rascunho' ? 2 : e === 'concluido' ? 3 : 4)
      return s.torneios.filter((t) => visivel(s, t, eu)).sort((x, y) => peso(x.estado) - peso(y.estado) || ms(y.inscricoesAte) - ms(x.inscricoesAte)).map((t) => jsonResumo(s, t, eu))
    },

    async torneioDetalhe(id): Promise<TorneioDetalhe> {
      const { eu, todos } = await ctx.perfis()
      const s = ler()
      const t = ver(s, id, eu)
      if (vetoTick(s, eBotDe(todos))) guardar()
      const perfis = mapaPerfis(todos)
      const resumo = jsonResumo(s, t, eu)
      if (eStaff(eu)) resumo.seed = t.seed
      return {
        torneio: resumo,
        equipas: s.equipas.filter((e) => e.torneioId === t.id)
          .sort((x, y) => (x.grupo ?? 99) - (y.grupo ?? 99) || (x.ordem ?? 99) - (y.ordem ?? 99) || x.criadaEm.localeCompare(y.criadaEm))
          .map((e) => jsonEquipa(s, e, eu, perfis)),
        jogos: s.jogos.filter((j) => j.torneioId === t.id)
          .sort((x, y) => Number(x.fase === 'playoff') - Number(y.fase === 'playoff') || (x.grupo ?? 99) - (y.grupo ?? 99) || x.ronda - y.ronda || x.ordem - y.ordem)
          .map((j) => jsonJogo(s, j, eu, perfis)),
        classificacao: classificar(s, t.id, t.passamPorGrupo),
        agora: iso(Date.now()),
      }
    },

    async meusConvitesTorneio(): Promise<ConviteTorneio[]> {
      const { eu, todos } = await ctx.perfis()
      const s = ler()
      const perfis = mapaPerfis(todos)
      return s.membros.filter((m) => m.perfilId === eu.id && m.estado === 'convidado')
        .filter((m) => inscricoesAbertas(s.torneios.find((t) => t.id === m.torneioId)!))
        .sort((x, y) => y.criadoEm.localeCompare(x.criadoEm))
        .map((m) => {
          const e = s.equipas.find((x) => x.id === m.equipaId)!
          const t = s.torneios.find((x) => x.id === m.torneioId)!
          const por = m.convidadoPor ? perfis.get(m.convidadoPor) : null
          return { equipaId: e.id, equipaNome: e.nome, torneioId: t.id, torneioNome: t.nome, funcao: m.funcao, convidadoPor: por ? nomeJogador(por) : null, inscricoesAte: t.inscricoesAte, em: m.criadoEm }
        })
    },

    async torneioProcurarJogadores(q) {
      const { eu, todos } = await ctx.perfis()
      const s = ler()
      if (!eStaff(eu) && !s.torneios.some((t) => visivel(s, t, eu))) return []
      const v = (q ?? '').trim().toLowerCase()
      if (v.length < 2) return []
      // No demo a comunidade de exemplo é toda de bots: também aparecem aqui (convidá-los aceita logo).
      return todos.filter((p) => p.riotId && p.id !== eu.id && (p.riotId.toLowerCase().includes(v) || p.utilizador.toLowerCase().includes(v)))
        .sort((x, y) => Number(y.riotId!.toLowerCase().startsWith(v)) - Number(x.riotId!.toLowerCase().startsWith(v)) || x.utilizador.localeCompare(y.utilizador))
        .slice(0, 8).map(sugerido)
    },

    async torneioCriarEquipa(torneio, nome, funcao = 'jogador') {
      const { eu } = await ctx.perfis()
      const s = ler()
      const t = ver(s, torneio, eu)
      const v = (nome ?? '').trim()
      if (funcao !== 'jogador' && funcao !== 'coach') erro('Quem cria a equipa entra como jogador ou como coach.')
      if (!inscricoesAbertas(t) && !eStaff(eu)) erro('As inscrições deste torneio não estão abertas.')
      if (t.estado !== 'inscricoes' && t.estado !== 'rascunho') erro('As inscrições deste torneio não estão abertas.')
      if (!perfilValido(eu)) erro('Liga o teu Riot ID no perfil antes de te inscreveres.')
      if (v.length < 2 || v.length > 32) erro('O nome da equipa tem entre 2 e 32 letras.')
      if (s.membros.some((m) => m.torneioId === t.id && m.perfilId === eu.id && m.estado === 'aceite')) erro('Já estás numa equipa deste torneio.')
      if (t.maxEquipas != null && s.equipas.filter((e) => e.torneioId === t.id).length >= t.maxEquipas) erro('O torneio já tem o máximo de equipas.')
      if (s.equipas.some((e) => e.torneioId === t.id && e.nome.trim().toLowerCase() === v.toLowerCase())) erro('Já existe uma equipa com esse nome neste torneio.')
      const e: EquipaG = { id: novoId(), torneioId: t.id, nome: v, capitaoId: eu.id, estado: 'inscrita', grupo: null, ordem: null, criadaEm: iso(Date.now()) }
      s.equipas.push(e)
      s.membros = s.membros.filter((m) => !(m.torneioId === t.id && m.perfilId === eu.id && m.estado === 'convidado'))
      s.membros.push({ equipaId: e.id, perfilId: eu.id, torneioId: t.id, funcao, estado: 'aceite', convidadoPor: eu.id, criadoEm: iso(Date.now()) })
      mudou()
      return e.id
    },

    async torneioRenomearEquipa(equipa, nome) {
      const { eu } = await ctx.perfis()
      const s = ler()
      const { e } = editarEquipa(s, equipa, eu)
      const v = (nome ?? '').trim()
      if (v.length < 2 || v.length > 32) erro('O nome da equipa tem entre 2 e 32 letras.')
      if (s.equipas.some((x) => x.torneioId === e.torneioId && x.id !== e.id && x.nome.trim().toLowerCase() === v.toLowerCase())) erro('Já existe uma equipa com esse nome neste torneio.')
      e.nome = v
      mudou()
    },

    async torneioConvidar(equipa, nome, funcao) {
      const { eu, todos } = await ctx.perfis()
      const s = ler()
      const { e } = editarEquipa(s, equipa, eu)
      funcaoValida(funcao)
      const alvo = achar(todos, nome, true)
      if (!perfilValido(alvo)) erro('Esse jogador ainda não ligou o Riot ID, por isso não pode jogar torneios.')
      if (s.membros.some((m) => m.torneioId === e.torneioId && m.perfilId === alvo.id && m.estado === 'aceite')) erro('Esse jogador já está numa equipa deste torneio.')
      if (s.membros.some((m) => m.equipaId === e.id && m.perfilId === alvo.id)) erro('Já convidaste esse jogador.')
      if (!lugarLivre(s, e.id, funcao)) {
        erro(funcao === 'jogador' ? 'A equipa já tem os 5 jogadores (contando os convites por aceitar).' : funcao === 'coach' ? 'A equipa já tem coach.' : 'A equipa já tem os 2 suplentes.')
      }
      // No demo os jogadores de exemplo são bots e aceitam logo (num torneio a sério a pessoa tem de aceitar).
      s.membros.push({ equipaId: e.id, perfilId: alvo.id, torneioId: e.torneioId, funcao, estado: alvo.bot ? 'aceite' : 'convidado', convidadoPor: eu.id, criadoEm: iso(Date.now()) })
      mudou()
      return sugerido(alvo)
    },

    async torneioStaffAdicionar(equipa, nome, funcao) {
      const { eu, todos } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const { e, t } = editarEquipa(s, equipa, eu)
      funcaoValida(funcao)
      const alvo = achar(todos, nome, t.teste)
      if (!perfilValido(alvo)) erro('Esse jogador ainda não ligou o Riot ID.')
      if (s.membros.some((m) => m.torneioId === e.torneioId && m.perfilId === alvo.id && m.estado === 'aceite')) erro('Esse jogador já está numa equipa deste torneio.')
      s.membros = s.membros.filter((m) => !(m.equipaId === e.id && m.perfilId === alvo.id))
      if (!lugarLivre(s, e.id, funcao)) erro('Essa equipa já não tem lugar para essa função.')
      s.membros.push({ equipaId: e.id, perfilId: alvo.id, torneioId: e.torneioId, funcao, estado: 'aceite', convidadoPor: eu.id, criadoEm: iso(Date.now()) })
      s.membros = s.membros.filter((m) => !(m.torneioId === e.torneioId && m.perfilId === alvo.id && m.estado === 'convidado'))
      mudou()
      return sugerido(alvo)
    },

    async torneioResponderConvite(equipa, aceitar) {
      const { eu } = await ctx.perfis()
      const s = ler()
      const m = s.membros.find((x) => x.equipaId === equipa && x.perfilId === eu.id && x.estado === 'convidado')
      if (!m) return erro('Esse convite já não existe.')
      const t = s.torneios.find((x) => x.id === m.torneioId)!
      if (!aceitar) { s.membros = s.membros.filter((x) => x !== m); mudou(); return }
      if (!inscricoesAbertas(t)) erro('As inscrições já fecharam: já não podes aceitar este convite.')
      if (!perfilValido(eu)) erro('Liga o teu Riot ID no perfil antes de aceitares.')
      if (s.membros.some((x) => x.torneioId === t.id && x.perfilId === eu.id && x.estado === 'aceite')) erro('Já estás numa equipa deste torneio.')
      m.estado = 'aceite'
      s.membros = s.membros.filter((x) => !(x.torneioId === t.id && x.perfilId === eu.id && x.estado === 'convidado'))
      mudou()
    },

    async torneioRemoverMembro(equipa, perfil) {
      const { eu } = await ctx.perfis()
      const s = ler()
      const { e } = editarEquipa(s, equipa, eu)
      if (perfil === e.capitaoId) erro('O capitão não sai da equipa: apaga a equipa ou pede à staff.')
      const antes = s.membros.length
      s.membros = s.membros.filter((m) => !(m.equipaId === e.id && m.perfilId === perfil))
      if (s.membros.length === antes) erro('Esse jogador não está na equipa.')
      mudou()
    },

    async torneioMudarFuncao(equipa, perfil, funcao) {
      const { eu } = await ctx.perfis()
      const s = ler()
      const { e } = editarEquipa(s, equipa, eu)
      funcaoValida(funcao)
      const m = s.membros.find((x) => x.equipaId === e.id && x.perfilId === perfil)
      if (!m) return erro('Esse jogador não está na equipa.')
      if (m.funcao === funcao) return
      if (perfil === e.capitaoId && funcao === 'suplente') erro('O capitão joga ou é o coach.')
      if (!lugarLivre(s, e.id, funcao)) erro('Já não há lugar para essa função na equipa.')
      m.funcao = funcao
      mudou()
    },

    async torneioSairEquipa(equipa) {
      const { eu } = await ctx.perfis()
      const s = ler()
      const e = s.equipas.find((x) => x.id === equipa)
      if (!e) return erro('Equipa não encontrada.')
      const t = s.torneios.find((x) => x.id === e.torneioId)!
      if (e.capitaoId === eu.id) erro('O capitão não sai da equipa: apaga a equipa ou pede à staff.')
      if (!inscricoesAbertas(t)) erro('As inscrições já fecharam: pede à staff para mudar a equipa.')
      const antes = s.membros.length
      s.membros = s.membros.filter((m) => !(m.equipaId === e.id && m.perfilId === eu.id))
      if (s.membros.length === antes) erro('Não estás nessa equipa.')
      mudou()
    },

    async torneioApagarEquipa(equipa) {
      const { eu } = await ctx.perfis()
      const s = ler()
      const { e, t } = editarEquipa(s, equipa, eu)
      if (t.estado !== 'rascunho' && t.estado !== 'inscricoes') erro('O sorteio já foi feito: pede à staff (um jogo perdido por falta de comparência resolve-se na Staff).')
      s.equipas = s.equipas.filter((x) => x.id !== e.id)
      s.membros = s.membros.filter((m) => m.equipaId !== e.id)
      mudou()
    },

    async torneioAbrirJogo(jogo, codigo) {
      const { eu } = await ctx.perfis()
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      const t = s.torneios.find((x) => x.id === j.torneioId)!
      if (!visivel(s, t, eu)) erro('Jogo não encontrado.')
      if (t.estado !== 'grupos' && t.estado !== 'playoffs') erro('O torneio não está a decorrer.')
      if (!j.equipaA || !j.equipaB) erro('Este jogo ainda não tem as duas equipas.')
      if (j.presencial) erro('Este jogo é presencial: o resultado é posto pela staff.')
      if (j.estado === 'concluido') erro('Este jogo já tem resultado.')
      const capitaes = s.equipas.filter((e) => e.id === j.equipaA || e.id === j.equipaB).map((e) => e.capitaoId)
      if (!eStaff(eu) && !capitaes.includes(eu.id)) erro('Só os capitães das duas equipas abrem o jogo.')
      if (j.estado === 'veto') erro('Os picks e bans ainda não acabaram.')
      if (t.vetoMapas && !j.mapa) erro('Faltam os picks e bans de mapas: começa-os antes de abrir o jogo.')
      if (!eStaff(eu) && !t.teste && j.serieA + j.serieB === 0 && (!j.agendadoPara || Date.now() < ms(j.agendadoPara) - 30 * 60_000)) erro('Ainda é cedo: o jogo abre 30 minutos antes da hora marcada.')
      const v = (codigo ?? '').trim().toUpperCase()
      if (!/^[A-Z0-9]{6}$/.test(v)) erro('O código do grupo tem 6 letras ou números.')
      s.codigos[j.id] = v
      j.estado = 'a_decorrer'
      j.comecouEm = j.comecouEm ?? iso(Date.now())
      // Numa série, o mapa que se joga agora é o seguinte ao último que acabou.
      const mapaAgora = j.mapas[j.serieA + j.serieB]
      if (mapaAgora) { mapaAgora.estado = 'a_decorrer'; mapaAgora.comecouEm = mapaAgora.comecouEm ?? iso(Date.now()) }
      mudou()
    },

    /** Os capitães das duas equipas (ou a staff) começam os picks e bans, 30 minutos antes da hora marcada. */
    async torneioVetoIniciar(jogo) {
      const { eu, todos } = await ctx.perfis()
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      const t = s.torneios.find((x) => x.id === j.torneioId)!
      if (!visivel(s, t, eu)) erro('Jogo não encontrado.')
      if (t.estado !== 'grupos' && t.estado !== 'playoffs') erro('O torneio não está a decorrer.')
      if (!t.vetoMapas) erro('Este torneio não tem picks e bans de mapas.')
      if (j.presencial) erro('Este jogo é presencial: o mapa é a staff que o define.')
      if (!j.equipaA || !j.equipaB) erro('Este jogo ainda não tem as duas equipas.')
      if (j.estado === 'veto') erro('Os picks e bans já começaram.')
      if (j.estado === 'a_decorrer' || j.estado === 'concluido') erro('Este jogo já começou.')
      if (j.mapaStaff) erro('A staff já definiu o mapa deste jogo.')
      if (j.ladoEscolha) erro('Os picks e bans deste jogo já acabaram.')
      const capitaes = s.equipas.filter((e) => e.id === j.equipaA || e.id === j.equipaB).map((e) => e.capitaoId)
      if (!eStaff(eu) && !capitaes.includes(eu.id)) erro('Só os capitães das duas equipas começam os picks e bans.')
      if (!eStaff(eu) && !t.teste && (!j.agendadoPara || Date.now() < ms(j.agendadoPara) - 30 * 60_000)) erro('Ainda é cedo: os picks e bans abrem 30 minutos antes da hora marcada.')
      vetoComecar(s, j, eBotDe(todos))
      mudou()
    },

    /** O capitão da equipa da vez escolhe (mapa para banir ou escolher, ou o lado). A staff joga por qualquer uma. */
    async torneioVetoAgir(jogo, valor) {
      const { eu, todos } = await ctx.perfis()
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      const t = s.torneios.find((x) => x.id === j.torneioId)!
      if (!visivel(s, t, eu)) erro('Jogo não encontrado.')
      if (j.estado !== 'veto') erro('Os picks e bans deste jogo não estão a decorrer.')
      const vez = vezVeto(j, t)
      if (!vez) return erro('Os picks e bans já acabaram.')
      const capDaVez = s.equipas.find((e) => e.id === (vez.equipa === 'A' ? j.equipaA : j.equipaB))?.capitaoId
      const capOutro = s.equipas.find((e) => e.id === (vez.equipa === 'A' ? j.equipaB : j.equipaA))?.capitaoId
      if (!eStaff(eu) && eu.id !== capDaVez) {
        if (eu.id === capOutro) erro('Não é a tua vez: espera pela outra equipa.')
        erro('Só os capitães das duas equipas escolhem os mapas.')
      }
      vetoFazer(s, j, (valor ?? '').trim(), false)
      vetoBots(s, j, eBotDe(todos))
      mudou()
    },

    /** Passou o tempo da vez? Joga ao calhas por quem não jogou. */
    async torneioVetoAvancar(jogo) {
      const { eu, todos } = await ctx.perfis()
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      const t = s.torneios.find((x) => x.id === j.torneioId)!
      if (!visivel(s, t, eu)) erro('Jogo não encontrado.')
      if (j.estado !== 'veto' || !j.vetoPrazo || ms(j.vetoPrazo) > Date.now()) return false
      vetoAuto(s, j)
      vetoBots(s, j, eBotDe(todos))
      mudou()
      return true
    },

    async torneioVetoConcluir(jogo) {
      const { eu, todos } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      const t = s.torneios.find((x) => x.id === j.torneioId)!
      if (!t.vetoMapas) erro('Este torneio não tem picks e bans de mapas.')
      if (j.presencial) erro('Este jogo é presencial: o mapa é a staff que o define.')
      if (!j.equipaA || !j.equipaB) erro('Este jogo ainda não tem as duas equipas.')
      if (j.estado === 'a_decorrer' || j.estado === 'concluido') erro('Este jogo já começou.')
      if (j.mapaStaff) erro('O mapa deste jogo foi posto pela staff.')
      vetoCompletar(s, j, eBotDe(todos))
      mudou()
    },

    async torneioVetoReiniciar(jogo) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      if (j.estado === 'a_decorrer' || j.estado === 'concluido') erro('Este jogo já começou.')
      if (j.serieA + j.serieB > 0) erro('A série já começou: desfaz o jogo para refazeres os picks e bans.')
      Object.assign(j, { poolMapas: null, vetoMelhorDe: null, vetoPrazo: null, ladoEquipa: null, ladoEscolha: null, vetos: [], mapas: [], mapa: j.mapaStaff ? j.mapa : null, estado: 'pendente' as EstadoJogoTorneio })
      recalcularEstado(j)
      mudou()
    },

    /** No demo não há API: passados 15 s o jogo fecha-se com um resultado simulado. */
    async torneioProcessarJogo(jogo) {
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j || j.estado !== 'a_decorrer') return
      if (Date.now() - ms(j.comecouEm) < 15_000) return
      const t = s.torneios.find((x) => x.id === j.torneioId)!
      if (t.estado !== 'grupos' && t.estado !== 'playoffs') return
      // A "API" do demo fecha o mapa que está em jogo (numa série, um de cada vez).
      simularMapa(s, j, 'api', () => false)
      mudou()
    },

    async torneioCriar(p: DadosNovoTorneio) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      if ((p.nome ?? '').trim().length < 3) erro('O torneio precisa de um nome (pelo menos 3 letras).')
      if (!p.inscricoesAte) erro('Falta a data limite das inscrições.')
      const t: TorneioG = {
        id: novoId(), nome: p.nome.trim(), descricao: (p.descricao ?? '').trim() || null, estado: 'rascunho', publico: !!p.publico, teste: !!p.teste,
        tamanhoGrupo: p.tamanhoGrupo ?? 4, passamPorGrupo: p.passamPorGrupo ?? 2, finalPresencial: !!p.finalPresencial,
        vetoMapas: p.vetoMapas ?? true, melhorDe: p.melhorDe ?? 1, poolMapas: poolDosDados(p.poolMapas),
        minJogadores: p.minJogadores ?? (p.teste ? 2 : MIN_PARA_API), inscricoesAte: p.inscricoesAte, inicio: p.inicio || null,
        maxEquipas: p.maxEquipas ?? null, seed: null, sorteadoEm: null, campeaoId: null, criadoPor: eu.id,
      }
      if (t.passamPorGrupo >= t.tamanhoGrupo) erro('Têm de passar menos equipas do que as que há num grupo.')
      validarMelhorDe(t.melhorDe, t.poolMapas, t.vetoMapas)
      s.torneios.push(t)
      mudou()
      return t.id
    },

    async torneioEditar(id, p) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const t = s.torneios.find((x) => x.id === id)
      if (!t) return erro('Torneio não encontrado.')
      if (t.estado === 'concluido' || t.estado === 'cancelado') erro('Este torneio já acabou.')
      if (t.estado !== 'rascunho' && t.estado !== 'inscricoes' && (p.tamanhoGrupo !== undefined || p.passamPorGrupo !== undefined)) erro('O formato dos grupos já não se muda depois do sorteio.')
      if (p.nome !== undefined && p.nome.trim()) t.nome = p.nome.trim()
      if (p.descricao !== undefined) t.descricao = (p.descricao ?? '').trim() || null
      if (p.tamanhoGrupo !== undefined) t.tamanhoGrupo = p.tamanhoGrupo
      if (p.passamPorGrupo !== undefined) t.passamPorGrupo = p.passamPorGrupo
      if (t.passamPorGrupo >= t.tamanhoGrupo) erro('Têm de passar menos equipas do que as que há num grupo.')
      if (p.finalPresencial !== undefined) {
        t.finalPresencial = p.finalPresencial
        for (const j of s.jogos.filter((x) => x.torneioId === t.id && x.fase === 'playoff' && x.rotulo === 'final' && (x.estado === 'pendente' || x.estado === 'agendado'))) j.presencial = !!p.finalPresencial
      }
      const novaPool = p.poolMapas !== undefined ? poolDosDados(p.poolMapas) : t.poolMapas
      validarMelhorDe(p.melhorDe ?? t.melhorDe, novaPool, p.vetoMapas ?? t.vetoMapas)
      if (p.vetoMapas !== undefined) t.vetoMapas = p.vetoMapas
      if (p.melhorDe !== undefined) t.melhorDe = p.melhorDe
      t.poolMapas = novaPool
      if (p.minJogadores !== undefined) t.minJogadores = p.minJogadores
      if (p.inscricoesAte !== undefined) t.inscricoesAte = p.inscricoesAte
      if (p.inicio !== undefined) t.inicio = p.inicio || null
      if (p.maxEquipas !== undefined) t.maxEquipas = p.maxEquipas
      if (p.publico !== undefined) t.publico = p.publico
      mudou()
    },

    async torneioMudarEstado(id, novo) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const t = s.torneios.find((x) => x.id === id)
      if (!t) return erro('Torneio não encontrado.')
      if (novo === 'inscricoes') { if (t.estado !== 'rascunho') erro('Só um rascunho se publica.') }
      else if (novo === 'rascunho') {
        if (t.estado !== 'inscricoes') erro('Só se volta a rascunho antes do sorteio.')
        if (s.equipas.some((e) => e.torneioId === t.id)) erro('Já há equipas inscritas: apaga-as primeiro.')
      } else if (novo === 'cancelado') { if (t.estado === 'concluido' || t.estado === 'cancelado') erro('Este torneio já acabou.') }
      else erro('Estado inválido.')
      t.estado = novo
      mudou()
    },

    async torneioApagar(id) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const t = s.torneios.find((x) => x.id === id)
      if (!t) return erro('Torneio não encontrado.')
      if (!(t.estado === 'rascunho' || t.estado === 'cancelado' || t.teste)) erro('Um torneio a sério não se apaga: cancela-o.')
      const jogos = new Set(s.jogos.filter((j) => j.torneioId === id).map((j) => j.id))
      s.torneios = s.torneios.filter((x) => x.id !== id)
      s.equipas = s.equipas.filter((e) => e.torneioId !== id)
      s.membros = s.membros.filter((m) => m.torneioId !== id)
      s.acessos = s.acessos.filter((a) => a.torneioId !== id)
      s.jogos = s.jogos.filter((j) => j.torneioId !== id)
      s.stats = s.stats.filter((x) => !jogos.has(x.jogoId))
      for (const j of jogos) delete s.codigos[j]
      mudou()
    },

    async torneioAcesso(id, nome, dar) {
      const { eu, todos } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      if (!s.torneios.some((x) => x.id === id)) erro('Torneio não encontrado.')
      const alvo = achar(todos, nome)
      s.acessos = s.acessos.filter((a) => !(a.torneioId === id && a.perfilId === alvo.id))
      if (dar) s.acessos.push({ torneioId: id, perfilId: alvo.id })
      mudou()
      return sugerido(alvo)
    },

    async torneioAcessos(id) {
      const { eu, todos } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const perfis = mapaPerfis(todos)
      return s.acessos.filter((a) => a.torneioId === id).map((a) => perfis.get(a.perfilId)).filter((p): p is Perfil => !!p).map(sugerido)
    },

    async torneioSortear(id, seed) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const t = s.torneios.find((x) => x.id === id)
      if (!t) return erro('Torneio não encontrado.')
      if (t.estado !== 'inscricoes' && t.estado !== 'grupos') erro('O torneio não está na fase de inscrições nem de grupos.')
      if (s.jogos.some((j) => j.torneioId === t.id && (j.estado === 'a_decorrer' || j.estado === 'concluido'))) erro('Já há jogos a decorrer ou terminados: já não se pode repetir o sorteio.')
      const ids = s.equipas.filter((e) => e.torneioId === t.id && e.estado === 'inscrita' && completa(s, e)).map((e) => e.id).sort()
      const n = ids.length
      if (n < 4) erro(`São precisas pelo menos 4 equipas completas (5 jogadores aceites) e há ${n}.`)
      const g = Math.ceil(n / t.tamanhoGrupo)
      if (Math.floor(n / g) <= t.passamPorGrupo) erro(`Com ${n} equipas os grupos ficavam demasiado pequenos para passarem ${t.passamPorGrupo} de cada. Muda o formato.`)
      const semente = seed ?? Math.random() * 2 - 1
      if (semente < -1 || semente > 1) erro('A seed fica entre -1 e 1.')
      const rng = aleatorio(semente)
      for (let i = n - 1; i >= 1; i--) { const k = Math.floor(rng() * (i + 1)); [ids[i], ids[k]] = [ids[k], ids[i]] }
      s.jogos = s.jogos.filter((j) => j.torneioId !== t.id)
      for (const e of s.equipas.filter((x) => x.torneioId === t.id)) { e.grupo = null; e.ordem = null }
      ids.forEach((eid, i) => { const e = s.equipas.find((x) => x.id === eid)!; e.grupo = (i % g) + 1; e.ordem = Math.floor(i / g) + 1 })
      for (let grupo = 1; grupo <= g; grupo++) {
        const doGrupo = s.equipas.filter((e) => e.torneioId === t.id && e.grupo === grupo).sort((x, y) => x.ordem! - y.ordem!).map((e) => e.id)
        for (const c of calendarioGrupo(doGrupo)) s.jogos.push(novoJogo(t.id, 'grupo', grupo, c.ronda, c.ordem, 'jornada', c.a, c.b))
      }
      t.estado = 'grupos'
      t.inscricoesAte = ms(t.inscricoesAte) > Date.now() ? iso(Date.now()) : t.inscricoesAte
      t.seed = semente; t.sorteadoEm = iso(Date.now()); t.campeaoId = null
      mudou()
      return { grupos: g, equipas: n, seed: semente }
    },

    async torneioAgendar(jogo, quando, mapa, presencial, melhorDe) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      agendarJogo(s, j, quando, mapa, presencial, melhorDe)
      mudou()
    },

    async torneioAgendarVarios(itens: ItemCalendarioTorneio[]) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      for (const x of itens ?? []) {
        const j = s.jogos.find((y) => y.id === x.jogo)
        if (!j) erro('Jogo não encontrado.')
        else agendarJogo(s, j, x.quando, x.mapa, x.presencial, x.melhorDe)
      }
      mudou()
      return (itens ?? []).length
    },

    async torneioResolverJogo(jogo, a, b) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      if (j.estado === 'concluido') desfazer(s, jogo)
      aplicarResultado(s, jogo, a, b, null, 'staff', null, eBotDe((await ctx.perfis()).todos))
      mudou()
    },

    async torneioWalkover(jogo, vencedor) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      if (vencedor !== j.equipaA && vencedor !== j.equipaB) erro('Essa equipa não joga este jogo.')
      if (j.estado === 'concluido') desfazer(s, jogo)
      aplicarResultado(s, jogo, vencedor === j.equipaA ? 13 : 0, vencedor === j.equipaB ? 13 : 0, null, 'walkover')
      mudou()
    },

    async torneioDesfazerJogo(jogo) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      desfazer(ler(), jogo)
      mudou()
    },

    async torneioGerarPlayoffs(id) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const t = s.torneios.find((x) => x.id === id)
      if (!t) return erro('Torneio não encontrado.')
      gerarPlayoffs(s, t)
      mudou()
    },

    async torneioTesteEquipas(id, n) {
      const { eu, todos } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const t = so_teste(s, id)
      if (t.estado !== 'rascunho' && t.estado !== 'inscricoes') erro('Só se juntam equipas antes do sorteio.')
      if (!n || n < 1 || n > 32) erro('Entre 1 e 32 equipas.')
      const nomes = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa']
      let feitas = 0, i = 0
      while (feitas < n && i <= 200) {
        i++
        const nome = `Bots ${nomes[(i - 1) % nomes.length]}${i > nomes.length ? ` ${Math.floor((i - 1) / nomes.length) + 1}` : ''}`
        if (s.equipas.some((e) => e.torneioId === t.id && e.nome.toLowerCase() === nome.toLowerCase())) continue
        if (t.maxEquipas != null && s.equipas.filter((e) => e.torneioId === t.id).length >= t.maxEquipas) break
        const bots = botsLivres(s, t, todos, 5)
        const e: EquipaG = { id: novoId(), torneioId: t.id, nome, capitaoId: bots[0].id, estado: 'inscrita', grupo: null, ordem: null, criadaEm: iso(Date.now()) }
        s.equipas.push(e)
        for (const b of bots) s.membros.push({ equipaId: e.id, perfilId: b.id, torneioId: t.id, funcao: 'jogador', estado: 'aceite', convidadoPor: eu.id, criadoEm: iso(Date.now()) })
        todos.push(...bots.filter((b) => !todos.includes(b)))
        feitas++
      }
      mudou()
      return feitas
    },

    async torneioTestePreencher(equipa, completo = false) {
      const { eu, todos } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const e = s.equipas.find((x) => x.id === equipa)
      if (!e) return erro('Equipa não encontrada.')
      const t = so_teste(s, e.torneioId)
      if (t.estado !== 'rascunho' && t.estado !== 'inscricoes') erro('Só se muda a equipa antes do sorteio.')
      let adicionados = 0
      for (const f of ['jogador', 'coach', 'suplente'] as const) {
        if (f !== 'jogador' && !completo) continue
        const falta = CAPACIDADE[f] - s.membros.filter((m) => m.equipaId === e.id && m.funcao === f).length
        if (falta <= 0) continue
        for (const b of botsLivres(s, t, todos, falta)) {
          s.membros.push({ equipaId: e.id, perfilId: b.id, torneioId: t.id, funcao: f, estado: 'aceite', convidadoPor: eu.id, criadoEm: iso(Date.now()) })
          todos.push(...(todos.includes(b) ? [] : [b]))
          adicionados++
        }
      }
      mudou()
      return adicionados
    },

    async torneioTesteSimular(jogo) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const j = s.jogos.find((x) => x.id === jogo)
      if (!j) return erro('Jogo não encontrado.')
      so_teste(s, j.torneioId)
      if (j.estado === 'concluido') erro('Este jogo já tem resultado.')
      if (!j.equipaA || !j.equipaB) erro('Este jogo ainda não tem as duas equipas.')
      simular(s, jogo, eBotDe((await ctx.perfis()).todos))
      mudou()
    },

    async torneioTesteSimularTudo(id, soGrupos = false) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      so_teste(s, id)
      const eBot = eBotDe((await ctx.perfis()).todos)
      let n = 0
      for (;;) {
        const j = s.jogos.filter((x) => x.torneioId === id && x.estado !== 'concluido' && x.equipaA && x.equipaB && (!soGrupos || x.fase === 'grupo'))
          .sort((x, y) => Number(x.fase === 'playoff') - Number(y.fase === 'playoff') || x.ronda - y.ronda || x.ordem - y.ordem)[0]
        if (!j || n >= 300) break
        simular(s, j.id, eBot)
        n++
      }
      mudou()
      return n
    },

    async torneioTesteReiniciar(id) {
      const { eu } = await ctx.perfis()
      exigirStaff(eu)
      const s = ler()
      const t = so_teste(s, id)
      const jogos = new Set(s.jogos.filter((j) => j.torneioId === id).map((j) => j.id))
      s.jogos = s.jogos.filter((j) => j.torneioId !== id)
      s.stats = s.stats.filter((x) => !jogos.has(x.jogoId))
      for (const j of jogos) delete s.codigos[j]
      for (const e of s.equipas.filter((x) => x.torneioId === id)) { e.grupo = null; e.ordem = null }
      t.estado = 'inscricoes'; t.campeaoId = null; t.seed = null; t.sorteadoEm = null
      t.inscricoesAte = iso(Math.max(ms(t.inscricoesAte), Date.now() + 86_400_000))
      mudou()
    },
  }
}
