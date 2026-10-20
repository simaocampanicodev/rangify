/**
 * A comunidade de exemplo do modo demo: 64 jogadores, cerca de 150 partidas
 * do último mês já com pontos aplicados, amizades, sugestões e denúncias.
 * Gerada com um gerador determinístico, por isso é sempre igual.
 */
import { ROTACAO_PADRAO, equipaDoBan, totalBans } from '../mapas'
import { PONTOS_INICIAIS } from '../pontos'
import { podeRanked } from '../ranks'
import { equipaDaEscolha } from '../regras'
import {
  aplicarResultado, baralhar, codigoGrupo, codigoPartida, definirCapitaes, entre, escolherUm, gerarEstatisticas,
  gerarResultado, inteiro, melhorDisponivel, mulberry32, novoJogador, type PartidaGuardada, type Rng,
} from './motor'
import type { EstadoSugestao, FilaTipo, Funcao, FuncaoJogo, Missao, Perfil } from './tipos'

export const ID_DEMO = 'j-nyx'
export const PASSWORD_DEMO = 'nyx4521'
export const INICIO_TEMPORADA = '2026-09-01T00:00:00Z'

export interface AmizadeGuardada { de: string; para: string; estado: 'pendente' | 'aceite'; desde: string }
export interface SugestaoGuardada {
  id: string; titulo: string; descricao: string; categoria: string; estado: EstadoSugestao
  autorId: string; criadaEm: string; votos: string[]
}
export interface DenunciaGuardada {
  id: string; denuncianteId: string; alvoId: string; motivo: string; detalhes: string
  estado: 'aberta' | 'resolvida' | 'arquivada'; criadaEm: string
}

export type DefinicaoMissao = Omit<Missao, 'progresso' | 'concluida'>

/** O catálogo completo, igual ao da migração 0007: cada rotação mostra só uma parte. */
export const MISSOES: DefinicaoMissao[] = [
  { id: 'd-jogar', titulo: 'Aquecimento', descricao: 'Joga 1 partida hoje.', tipo: 'jogos', alvo: 1, ambito: 'diaria', xp: 100 },
  { id: 'd-vitoria', titulo: 'Primeira vitória', descricao: 'Ganha 1 partida hoje.', tipo: 'vitorias', alvo: 1, ambito: 'diaria', xp: 150 },
  { id: 'd-tres', titulo: 'Sessão completa', descricao: 'Joga 3 partidas hoje.', tipo: 'jogos', alvo: 3, ambito: 'diaria', xp: 200 },
  { id: 'd-kills', titulo: 'Mão quente', descricao: 'Faz 20 kills hoje.', tipo: 'kills', alvo: 20, ambito: 'diaria', xp: 120 },
  { id: 'd-fb', titulo: 'Abrir caminho', descricao: 'Faz 3 first bloods hoje.', tipo: 'first_bloods', alvo: 3, ambito: 'diaria', xp: 120 },
  { id: 'd-assist', titulo: 'Espírito de equipa', descricao: 'Faz 8 assistências hoje.', tipo: 'assists', alvo: 8, ambito: 'diaria', xp: 100 },
  { id: 'd-duas', titulo: 'Dose dupla', descricao: 'Ganha 2 partidas hoje.', tipo: 'vitorias', alvo: 2, ambito: 'diaria', xp: 220 },
  { id: 'd-capitao', titulo: 'Capitão do dia', descricao: 'Joga 1 partida como capitão hoje.', tipo: 'capitao', alvo: 1, ambito: 'diaria', xp: 120 },
  { id: 'd-trades', titulo: 'Troca justa', descricao: 'Faz 4 trades hoje.', tipo: 'trades', alvo: 4, ambito: 'diaria', xp: 100 },
  { id: 'd-acs', titulo: 'Bom jogo', descricao: 'Acaba uma partida hoje com 250 de ACS ou mais.', tipo: 'acs', alvo: 250, ambito: 'diaria', xp: 150 },
  { id: 'm-jogos', titulo: 'Rotina de competição', descricao: 'Joga 10 partidas esta semana.', tipo: 'jogos', alvo: 10, ambito: 'semanal', xp: 400 },
  { id: 'm-vitorias', titulo: 'Cinco vitórias', descricao: 'Ganha 5 partidas esta semana.', tipo: 'vitorias', alvo: 5, ambito: 'semanal', xp: 450 },
  { id: 'm-fb', titulo: 'Primeiro sangue', descricao: 'Faz 15 first bloods esta semana.', tipo: 'first_bloods', alvo: 15, ambito: 'semanal', xp: 350 },
  { id: 'm-mvp', titulo: 'Jogador da partida', descricao: 'Sê MVP em 2 partidas esta semana.', tipo: 'mvp', alvo: 2, ambito: 'semanal', xp: 400 },
  { id: 's-serie', titulo: 'Em forma', descricao: 'Ganha 3 partidas seguidas esta semana.', tipo: 'sequencia', alvo: 3, ambito: 'semanal', xp: 450 },
  { id: 's-kills', titulo: 'Ceifeiro', descricao: 'Faz 100 kills esta semana.', tipo: 'kills', alvo: 100, ambito: 'semanal', xp: 350 },
  { id: 's-assist', titulo: 'Suporte de ouro', descricao: 'Faz 40 assistências esta semana.', tipo: 'assists', alvo: 40, ambito: 'semanal', xp: 300 },
  { id: 's-lider', titulo: 'Liderança', descricao: 'Ganha 2 partidas como capitão esta semana.', tipo: 'vitorias_capitao', alvo: 2, ambito: 'semanal', xp: 400 },
  { id: 's-mapas', titulo: 'Volta aos mapas', descricao: 'Joga em 4 mapas diferentes esta semana.', tipo: 'mapas', alvo: 4, ambito: 'semanal', xp: 300 },
  { id: 's-trades', titulo: 'Rei das trocas', descricao: 'Faz 15 trades esta semana.', tipo: 'trades', alvo: 15, ambito: 'semanal', xp: 300 },
  { id: 's-acs', titulo: 'Grande jogo', descricao: 'Acaba uma partida esta semana com 270 de ACS ou mais.', tipo: 'acs', alvo: 270, ambito: 'semanal', xp: 400 },
  { id: 's-maratona', titulo: 'Maratonista', descricao: 'Joga 20 partidas esta semana.', tipo: 'jogos', alvo: 20, ambito: 'semanal', xp: 600 },
  { id: 's-imparavel', titulo: 'Imparável', descricao: 'Ganha 10 partidas esta semana.', tipo: 'vitorias', alvo: 10, ambito: 'semanal', xp: 700 },
  { id: 's-capitao', titulo: 'Capitão de serviço', descricao: 'Joga 4 partidas como capitão esta semana.', tipo: 'capitao', alvo: 4, ambito: 'semanal', xp: 350 },
  { id: 'm-seq', titulo: 'Em série', descricao: 'Ganha 4 partidas seguidas nesta temporada.', tipo: 'sequencia', alvo: 4, ambito: 'temporada', xp: 800 },
  { id: 'm-acs', titulo: 'Noite inspirada', descricao: 'Acaba uma partida com 300 de ACS ou mais.', tipo: 'acs', alvo: 300, ambito: 'temporada', xp: 600 },
  { id: 'm-pontos', titulo: 'Rumo aos 1200', descricao: 'Chega aos 1200 pontos nesta temporada.', tipo: 'pontos', alvo: 1200, ambito: 'temporada', xp: 1000 },
  { id: 't-veterano', titulo: 'Veterano', descricao: 'Joga 50 partidas nesta temporada.', tipo: 'jogos', alvo: 50, ambito: 'temporada', xp: 1000 },
]

const JOGADORES: [string, string][] = [
  ['Kaiser', 'EUW'], ['Lusitano', 'PT1'], ['Vexa', '7781'], ['Morfeu', '2210'], ['Tejo', 'LX1'], ['Rafa', '0042'],
  ['Sombra', '666'], ['Fenix', 'PTGG'], ['Zaraka', '1312'], ['Bruma', 'NRT'], ['Kairo', 'EU1'], ['Lince', '4040'],
  ['Duarte', 'GG7'], ['Ines', '3131'], ['Valk', '8800'], ['Mantis', '9090'], ['Corvo', 'PRT'], ['Orion', '2024'],
  ['Saturno', '777'], ['Picanha', 'BR1'], ['Neblina', '0101'], ['Tremoço', 'PT2'], ['Faisca', '5150'], ['Rui', 'ACE'],
  ['Matilde', 'MTL'], ['Golias', '3000'], ['Kuro', 'JP1'], ['Sardinha', 'LIS'], ['Tiago', 'TGO'], ['Ventania', '2112'],
  ['Pixel', '8BIT'], ['Raposa', 'FOX'], ['Boreal', 'NORD'], ['Nuno', 'N10'], ['Ash', '0001'], ['Granito', 'ROCK'],
  ['Ecco', 'ECO'], ['Lumi', 'LUX'], ['Draco', 'DRG'], ['Bianca', 'B13'], ['Hugo', 'HGO'], ['Maré', 'WAVE'],
  ['Seixo', '4321'], ['Zen', 'ZEN'], ['Kappa', 'KPA'], ['Tornado', 'T0R'], ['Marta', 'MRT'], ['Brisa', 'AIR'],
  ['Ferrão', 'STNG'], ['Oak', 'TREE'], ['Leo', 'LEO7'], ['Nox', 'NOX'], ['Carvalho', 'CRV'], ['Riso', 'LOL'],
  ['Pedra', 'STN'], ['Sol', 'SUN'], ['Cometa', '1997'], ['Gelo', 'ICE'], ['Joana', 'JNA'], ['Trovão', 'THDR'],
  ['Mira', 'AIM'], ['Abel', 'ABL'], ['Pulse', 'PLS'], ['Vasco', 'GAMA'],
]

const FUNCOES_JOGO: FuncaoJogo[] = ['Duelista', 'Controlador', 'Iniciador', 'Sentinela']

function semAcentos(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function novoPerfil(id: string, nome: string, tag: string, tier: number, funcao: Funcao, funcaoJogo: FuncaoJogo, criadoEm: string): Perfil {
  return {
    id, utilizador: semAcentos(nome), avatarUrl: null, riotId: `${nome}#${tag}`, regiao: 'eu', tier,
    rr: null, rankAtualizadoEm: null, pontos: PONTOS_INICIAIS, vitorias: 0, derrotas: 0,
    pontosRanked: PONTOS_INICIAIS, vitoriasRanked: 0, derrotasRanked: 0, funcao, funcaoJogo,
    bot: false, cooldownAte: null, tourVistoEm: criadoEm, temPassword: true, criadoEm,
  }
}

/** Monta uma partida completa de histórico: draft, bans, resultado e estatísticas. */
function jogarPartida(rng: Rng, perfis: Record<string, Perfil>, ids: string[], quando: number, favorecer?: string, fila: FilaTipo = 'aberta'): PartidaGuardada {
  const inicio = new Date(quando).toISOString()
  const duracao = inteiro(rng, 28, 46) * 60_000
  const fim = new Date(quando + 6 * 60_000 + duracao).toISOString()
  const p: PartidaGuardada = {
    id: `h-${Math.floor(rng() * 1e9).toString(36)}-${ids.length}`,
    codigo: codigoPartida(rng), estado: 'IN_PROGRESS', regiao: 'eu', fila, mapa: null, capitaoA: null, capitaoB: null,
    codigoGrupo: codigoGrupo(rng), resultadoA: null, resultadoB: null, vencedor: null, simulada: false, pool: [...ROTACAO_PADRAO], automatica: false,
    prazoConfirmacao: null, inicioFase: null, prazoFase: null, comecouEm: new Date(quando + 6 * 60_000).toISOString(), terminouEm: null,
    estatisticas: false, criadaEm: inicio, atualizadaEm: fim, jogadores: ids.map((id) => ({ ...novoJogador(perfis[id]), aceitou: true })), bans: [], submissoes: [], lado: null, sugestoes: [],
  }
  definirCapitaes(p, undefined, rng)
  for (let n = 0; n < 8; n++) {
    const j = melhorDisponivel(rng, p, perfis)!
    j.equipa = equipaDaEscolha(n)
    j.ordemEscolha = n + 1
  }
  const pool = baralhar(rng, ROTACAO_PADRAO)
  const bans = totalBans(pool)
  for (let n = 0; n < bans; n++) p.bans.push({ mapa: pool[n], equipa: equipaDoBan(n), ordem: n + 1 })
  p.mapa = pool[bans]
  // A equipa que não fez o último ban escolheu o lado.
  p.lado = { equipa: equipaDoBan(bans - 1) === 'A' ? 'B' : 'A', escolha: rng() < 0.5 ? 'ataque' : 'defesa' }
  const tiers = (eq: 'A' | 'B') => p.jogadores.filter((j) => j.equipa === eq).map((j) => j.tier)
  let r = gerarResultado(rng, tiers('A'), tiers('B'))
  // A conta de exemplo segue uma subida tranquila (cerca de +4 por partida),
  // para ficar a meio da tabela com um histórico variado, seja qual for a sorte.
  if (favorecer) {
    const eu = perfis[favorecer]
    const jogos = fila === 'ranked' ? eu.vitoriasRanked + eu.derrotasRanked : eu.vitorias + eu.derrotas
    const pontos = fila === 'ranked' ? eu.pontosRanked : eu.pontos
    const alvo = PONTOS_INICIAIS + 4 * jogos
    const eq = p.jogadores.find((j) => j.perfilId === favorecer)!.equipa
    const ganhou = (eq === 'A' && r.a > r.b) || (eq === 'B' && r.b > r.a)
    if ((!ganhou && pontos < alvo - 15 && rng() < 0.65) || (ganhou && pontos > alvo + 25 && rng() < 0.55)) r = { a: r.b, b: r.a }
  }
  p.submissoes = [
    { capitaoId: p.capitaoA!, vencedor: r.a > r.b ? 'A' : 'B', em: fim },
    { capitaoId: p.capitaoB!, vencedor: r.a > r.b ? 'A' : 'B', em: fim },
  ]
  p.resultadoA = r.a
  p.resultadoB = r.b
  p.vencedor = r.a > r.b ? 'A' : 'B'
  gerarEstatisticas(rng, p, perfis)
  aplicarResultado(p, perfis, r.a, r.b, fim)
  return p
}

export function gerarSemente(agora = Date.now()) {
  const rng = mulberry32(4521)
  const perfis: Record<string, Perfil> = {}
  const dia = 86_400_000
  const ids: string[] = []

  JOGADORES.forEach(([nome, tag], i) => {
    const id = `j-${String(i + 1).padStart(2, '0')}`
    // Distribuição parecida com a do jogo: muitos Ouro a Diamante, poucos no topo.
    let tier = Math.round(16 + (rng() + rng() + rng() - 1.5) * 8)
    if (i === 6) tier = 27
    if (i === 0 || i === 12 || i === 33) tier = inteiro(rng, 24, 26)
    // Um terço da comunidade já joga no topo: chega para a fila ranked ter partidas e tabela.
    if (i % 3 === 1) tier = Math.max(tier, 21 + (i % 6))
    tier = Math.max(4, Math.min(27, tier))
    const funcao: Funcao = i === 0 || i === 13 ? 'mod' : i % 9 === 4 ? 'verified' : 'user'
    const criado = new Date(agora - inteiro(rng, 34, 60) * dia).toISOString()
    perfis[id] = novoPerfil(id, nome, tag, tier, funcao, escolherUm(rng, FUNCOES_JOGO), criado)
    perfis[id].rankAtualizadoEm = new Date(agora - inteiro(rng, 1, 72) * 3_600_000).toISOString()
    perfis[id].rr = inteiro(rng, 0, 99)
    ids.push(id)
  })

  // A conta de exemplo é Ascendente 2: pode jogar nas duas filas.
  const nyx = novoPerfil(ID_DEMO, 'Nyx', '4521', 22, 'owner', 'Controlador', new Date(agora - 41 * dia).toISOString())
  nyx.utilizador = 'nyx'
  nyx.rr = 64
  nyx.rankAtualizadoEm = new Date(agora - 7 * 3_600_000).toISOString()
  perfis[ID_DEMO] = nyx

  // Partidas do último mês por ordem cronológica, para os pontos baterem certo.
  const partidas: PartidaGuardada[] = []
  const momentos: { t: number; nyx: boolean; ranked: boolean }[] = []
  for (let k = 0; k < 120; k++) momentos.push({ t: agora - entre(rng, 0.4, 30) * dia, nyx: rng() < 0.2, ranked: rng() < 0.3 })
  // As últimas da conta de exemplo caem nas últimas horas, para as missões semanais terem progresso.
  for (let k = 0; k < 4; k++) momentos.push({ t: agora - (k * 62 + 70) * 60_000, nyx: true, ranked: k === 1 })
  momentos.sort((x, y) => x.t - y.t)

  // Cada sala junta ranks parecidos, como a fila de uma região a sério. A fila ranked só junta quem tem Ascendente 1 ou mais.
  const noTopo = ids.filter((id) => podeRanked(perfis[id].tier))
  for (const m of momentos) {
    const fila: FilaTipo = m.ranked ? 'ranked' : 'aberta'
    const quem = fila === 'ranked' ? noTopo : ids
    const ancora = m.nyx ? ID_DEMO : escolherUm(rng, quem)
    const t = perfis[ancora].tier
    const perto = quem
      .filter((id) => id !== ancora)
      .map((id) => ({ id, d: Math.abs(perfis[id].tier - t) + rng() * 4 }))
      .sort((x, y) => x.d - y.d)
      .slice(0, 9)
      .map((x) => x.id)
    partidas.push(jogarPartida(rng, perfis, [ancora, ...perto], m.t, m.nyx ? ID_DEMO : undefined, fila))
  }

  // Uma disputa por resolver e uma partida encravada, para a área de staff ter trabalho.
  const disputa = jogarPartida(rng, perfis, baralhar(rng, ids).slice(0, 10), agora - 95 * 60_000)
  desfazer(disputa, perfis)
  disputa.estado = 'DISPUTE'
  disputa.submissoes = [
    { capitaoId: disputa.capitaoA!, vencedor: 'A', em: new Date(agora - 40 * 60_000).toISOString() },
    { capitaoId: disputa.capitaoB!, vencedor: 'B', em: new Date(agora - 38 * 60_000).toISOString() },
  ]
  disputa.atualizadaEm = new Date(agora - 38 * 60_000).toISOString()
  partidas.push(disputa)

  const livres = ids.filter((id) => !disputa.jogadores.some((j) => j.perfilId === id))
  const encravada = jogarPartida(rng, perfis, baralhar(rng, livres).slice(0, 10), agora - 3 * 3_600_000)
  desfazer(encravada, perfis)
  encravada.estado = 'LOBBY_CREATION'
  encravada.codigoGrupo = null
  encravada.comecouEm = null
  encravada.submissoes = []
  encravada.atualizadaEm = new Date(agora - 170 * 60_000).toISOString()
  partidas.push(encravada)

  // Amizades da conta de exemplo: 14 aceites, 2 pedidos recebidos e 1 enviado.
  const amizades: AmizadeGuardada[] = []
  const outros = baralhar(rng, ids)
  outros.slice(0, 14).forEach((id, i) => amizades.push({ de: i % 2 ? ID_DEMO : id, para: i % 2 ? id : ID_DEMO, estado: 'aceite', desde: new Date(agora - inteiro(rng, 3, 38) * dia).toISOString() }))
  outros.slice(14, 16).forEach((id) => amizades.push({ de: id, para: ID_DEMO, estado: 'pendente', desde: new Date(agora - inteiro(rng, 1, 30) * 3_600_000).toISOString() }))
  amizades.push({ de: ID_DEMO, para: outros[16], estado: 'pendente', desde: new Date(agora - 2 * dia).toISOString() })
  // E algumas entre os outros, para o "só amigos" do ranking ser diferente para cada um.
  for (let k = 0; k < 60; k++) {
    const [x, y] = baralhar(rng, ids)
    if (!amizades.some((a) => (a.de === x && a.para === y) || (a.de === y && a.para === x))) amizades.push({ de: x, para: y, estado: 'aceite', desde: new Date(agora - inteiro(rng, 3, 38) * dia).toISOString() })
  }

  const votantes = (n: number) => baralhar(rng, [...ids, ID_DEMO]).slice(0, n)
  const sug = (titulo: string, descricao: string, categoria: string, estado: EstadoSugestao, votos: number, dias: number): SugestaoGuardada => ({
    id: `s-${Math.floor(rng() * 1e9).toString(36)}`, titulo, descricao, categoria, estado,
    autorId: escolherUm(rng, ids), criadaEm: new Date(agora - dias * dia).toISOString(), votos: votantes(votos).filter((v) => v !== ID_DEMO || votos > 30),
  })
  const sugestoes: SugestaoGuardada[] = [
    sug('Avisos no Discord quando a partida é encontrada', 'Uma mensagem privada do bot no Discord quando a fila encontra partida, para quem está noutra janela.', 'Discord', 'feita', 57, 26),
    sug('Fila por função', 'Escolher a função principal antes de entrar na fila, para o draft ter equipas mais equilibradas.', 'Fila', 'analise', 41, 19),
    sug('Estatísticas por mapa no perfil', 'Ver a percentagem de vitórias, o KDA e o ACS em cada mapa da pool.', 'Perfil', 'planeada', 33, 14),
    sug('Torneios ao fim de semana', 'Um torneio de equipas de 5 ao sábado, com inscrições no site e chaves automáticas.', 'Eventos', 'recebida', 28, 9),
    sug('Penalização maior para quem sai a meio', 'Quem abandona uma partida devia perder mais pontos e ficar mais tempo sem poder entrar na fila.', 'Regras', 'analise', 24, 7),
    sug('Escolher o lado inicial depois dos bans', 'A equipa que não baniu o último mapa escolhe se começa a atacar ou a defender.', 'Partida', 'planeada', 19, 5),
    sug('Histórico de confrontos com amigos', 'Ver quantas vezes joguei com e contra cada amigo e quem ganhou mais.', 'Amigos', 'recebida', 12, 3),
    sug('Recompensas de fim de temporada', 'Um distintivo no perfil para quem acaba a temporada no top 10.', 'Ranking', 'recebida', 9, 1),
  ]

  const denuncias: DenunciaGuardada[] = [
    { id: 'd-1', denuncianteId: ids[3], alvoId: ids[21], motivo: 'Abandono', detalhes: 'Saiu da partida na ronda 6 e não voltou.', estado: 'aberta', criadaEm: new Date(agora - 5 * 3_600_000).toISOString() },
    { id: 'd-2', denuncianteId: ids[8], alvoId: ids[40], motivo: 'Resultado falso', detalhes: 'O capitão submeteu 13-9 a favor da equipa dele, mas perdemos 9-13.', estado: 'aberta', criadaEm: new Date(agora - 26 * 3_600_000).toISOString() },
    { id: 'd-3', denuncianteId: ID_DEMO, alvoId: ids[52], motivo: 'Comportamento', detalhes: 'Insultos constantes no chat de voz durante a partida toda.', estado: 'aberta', criadaEm: new Date(agora - 2 * dia).toISOString() },
  ]

  return { perfis, partidas, amizades, sugestoes, denuncias }
}

/** Volta atrás nos pontos de uma partida, para a reaproveitar como disputa ou partida encravada. */
function desfazer(p: PartidaGuardada, perfis: Record<string, Perfil>) {
  for (const j of p.jogadores) {
    const perfil = perfis[j.perfilId]
    if (!perfil || j.deltaPontos == null) continue
    if (p.fila === 'ranked') {
      perfil.pontosRanked -= j.deltaPontos
      if (j.equipa === p.vencedor) perfil.vitoriasRanked--
      else perfil.derrotasRanked--
    } else {
      perfil.pontos -= j.deltaPontos
      if (j.equipa === p.vencedor) perfil.vitorias--
      else perfil.derrotas--
    }
    Object.assign(j, { kills: null, deaths: null, assists: null, acs: null, firstBloods: null, mvp: false, deltaPontos: null, pontosDepois: null, trades: null, hsPct: null, kastPct: null, rangifyScore: null, deltaDesempenho: null, agente: null })
  }
  p.resultadoA = null
  p.resultadoB = null
  p.vencedor = null
  p.terminouEm = null
  p.estatisticas = false
}
