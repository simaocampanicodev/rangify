/**
 * Os tipos que as páginas usam. Os nomes estão em português; o Supabase
 * guarda em inglês (como no PRD) e o adaptador faz a tradução.
 */

import type { CategoriaLoja, Cosmeticos } from '../loja'

export type Funcao = 'owner' | 'dev' | 'mod' | 'verified' | 'user'
export type Regiao = 'eu' | 'na' | 'ap' | 'kr' | 'latam' | 'br'
export type Equipa = 'A' | 'B'
export type FuncaoJogo = 'Duelista' | 'Controlador' | 'Iniciador' | 'Sentinela'

/** A máquina de estados do PRD (secções 2 e 3), mais disputa e cancelamento. */
export type EstadoPartida =
  | 'READY_CHECK'
  | 'DRAFT_PHASE'
  | 'MAP_BAN'
  | 'LOBBY_CREATION'
  | 'IN_PROGRESS'
  | 'RESULT_SUBMISSION'
  | 'DISPUTE'
  | 'PROCESSING_API'
  | 'COMPLETED'
  | 'CANCELLED'

export interface Perfil {
  id: string
  utilizador: string
  avatarUrl: string | null
  riotId: string | null
  regiao: Regiao
  /** Tier oficial da Riot (0 = sem rank, 3 = Ferro 1 ... 27 = Radiante). */
  tier: number
  rr: number | null
  rankAtualizadoEm: string | null
  /** Pontos, vitórias e derrotas da fila aberta (são os de sempre). Os da ranked vêm a seguir. */
  pontos: number
  vitorias: number
  derrotas: number
  pontosRanked: number
  vitoriasRanked: number
  derrotasRanked: number
  funcao: Funcao
  funcaoJogo: FuncaoJogo | null
  bot: boolean
  cooldownAte: string | null
  tourVistoEm: string | null
  temPassword: boolean
  criadoEm: string
}

/** Um aviso para o canal de avisos do Discord. O texto aceita a formatação do Discord (negrito, itálico, listas...). */
export interface AnuncioDiscord { titulo: string; mensagem: string; imagem: string; avisar: 'nao' | 'everyone' | 'here' }
export interface ResultadoAnuncio { canal: string; canalCriado: boolean; semMember: boolean; link: string; mensagem?: string }

/** As duas filas: a aberta (qualquer rank) e a ranked (Ascendente 1 ou mais). */
export type FilaTipo = 'aberta' | 'ranked'

export interface JogadorPartida {
  perfilId: string
  utilizador: string
  riotId: string | null
  avatarUrl: string | null
  tier: number
  pontos: number
  funcaoJogo: FuncaoJogo | null
  bot: boolean
  equipa: Equipa | null
  capitao: boolean
  aceitou: boolean
  ordemEscolha: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  acs: number | null
  firstBloods: number | null
  mvp: boolean
  deltaPontos: number | null
  /** Kills de troca: mataste quem tinha acabado de matar um colega (até 5 s). */
  trades: number | null
  /** Percentagem de tiros na cabeça. */
  hsPct: number | null
  /** Rondas com kill, assistência, sobrevivência ou troca, em percentagem. */
  kastPct: number | null
  /** Rangify Score: a nota de desempenho, 100 é a média da partida. */
  rangifyScore: number | null
  /** A parte dos pontos que veio do desempenho (de -6 a +6). */
  deltaDesempenho: number | null
  /** O agente que jogou (vem da Henrik Dev API). */
  agente: string | null
}

export interface BanMapa { mapa: string; equipa: Equipa; ordem: number }
/** O voto de um capitão: a equipa que diz ter ganho. Só confirma que o jogo acabou; o resultado vem da API. */
export interface Submissao { capitaoId: string; vencedor: Equipa; em: string }
export type Lado = 'ataque' | 'defesa'
/** Depois do último ban, a equipa que não o fez escolhe o lado em que começa. */
export interface EscolhaLado { equipa: Equipa; escolha: Lado | null }
/**
 * A votação para cancelar a partida (alguém caiu ou não pode jogar). Aberta enquanto o grupo
 * é criado e nos primeiros 10 minutos de jogo; com 7 jogadores de 10, a partida cai.
 */
export interface Cancelamento { votos: number; necessarios: number; euVotei: boolean; aberto: boolean }
/** O que os colegas do capitão sugerem na vez atual (um mapa a banir, ou o lado). */
export interface SugestaoMapa { perfilId: string; valor: string }

export interface Partida {
  id: string
  codigo: string
  estado: EstadoPartida
  regiao: Regiao
  /** A fila onde a partida nasceu: é a tabela a que os pontos vão. */
  fila: FilaTipo
  mapa: string | null
  capitaoA: string | null
  capitaoB: string | null
  codigoGrupo: string | null
  resultadoA: number | null
  resultadoB: number | null
  vencedor: Equipa | null
  simulada: boolean
  /** Os mapas da rotação quando a partida nasceu: os bans vão até sobrar um destes. */
  pool: string[]
  /** Simulação de teste em que o motor joga também pelo utilizador. */
  automatica: boolean
  prazoConfirmacao: string | null
  inicioFase: string | null
  prazoFase: string | null
  comecouEm: string | null
  terminouEm: string | null
  estatisticas: boolean
  criadaEm: string
  atualizadaEm: string
  jogadores: JogadorPartida[]
  bans: BanMapa[]
  submissoes: Submissao[]
  lado: EscolhaLado | null
  /** Só a equipa que está a decidir as vê. */
  sugestoes: SugestaoMapa[]
  /** Só na fase do código e nos primeiros minutos de jogo. */
  cancelamento: Cancelamento | null
}

/** O ban da fila de agora, dado pela staff. Sem data, é para sempre. */
export interface BanFila {
  ate: string | null
  permanente: boolean
  mensagem: string | null
}

/** O que o Discord fez ao acertar o cargo Ranked: quantos o ganharam, perderam ou não estão no servidor. */
export interface ResumoCargosRanked {
  total: number; feitos: number; dados: number; tirados: number; foraDoServidor: number; semDiscord: number; falhas: number; incompleto: boolean
}

export interface EstadoFila {
  naFila: boolean
  /** A fila em que estás (null se não estás em nenhuma). */
  fila: FilaTipo | null
  desde: string | null
  /** Quantos há na tua fila (na aberta, se não estás em nenhuma). */
  contagem: number
  contagemAberta: number
  contagemRanked: number
  /** O teu rank oficial chega para a fila ranked (Ascendente 1 ou mais)? */
  rankedPermitido: boolean
  regiao: Regiao
  cooldownAte: string | null
  /** Hora do servidor, para acertar as contagens com o relógio dele. */
  agora?: string | null
  /** Banido da fila pela staff: mostra-se em vez do castigo de 5 minutos. */
  ban?: BanFila | null
}

/** Um jogador na lista da staff: o perfil e o ban da fila de agora. */
export interface JogadorStaff extends Perfil {
  ban: BanFila | null
}

/** Um aviso ou ban dado pela staff (o popup do jogador e o histórico no cartão dele). */
export interface AvisoStaff {
  id: string
  tipo: 'aviso' | 'ban'
  mensagem: string
  /** Só nos bans: quando acaba. */
  banAte: string | null
  permanente: boolean
  criadoEm: string
  lidoEm: string | null
  levantadoEm: string | null
  /** Só para a staff: quem escreveu e como correu a mensagem privada no Discord. */
  autor?: string | null
  dm?: 'enviada' | 'falhou' | 'sem_discord' | null
}

export interface LinhaRanking {
  posicao: number
  perfil: Perfil
  forma: ('V' | 'D')[]
}

export interface PaginaRanking {
  linhas: LinhaRanking[]
  cursor: string | null
  total: number
}

export interface ResumoPartida {
  id: string
  codigo: string
  /** A fila em que foi jogada. */
  fila?: FilaTipo
  mapa: string | null
  estado: EstadoPartida
  resultadoA: number | null
  resultadoB: number | null
  vencedor: Equipa | null
  terminouEm: string | null
  simulada: boolean
  capitaoA: string
  capitaoB: string
  tierMedioA: number
  tierMedioB: number
  duracaoMin: number | null
  mvp: string | null
  /** Só quando a lista é "as minhas". */
  minha: {
    equipa: Equipa
    venceu: boolean
    deltaPontos: number | null
    kills: number | null
    deaths: number | null
    assists: number | null
    acs: number | null
    mvp: boolean
    rangifyScore: number | null
    agente: string | null
    tierAdversario: number
  } | null
}

export interface PaginaPartidas {
  linhas: ResumoPartida[]
  cursor: string | null
}

export interface PontoForma {
  partidaId: string
  /** A fila em que foi jogada. */
  fila?: FilaTipo
  data: string
  mapa: string
  adversario: string
  venceu: boolean
  resultado: string
  pontos: number
  delta: number
  kda: number | null
  acs: number | null
  /** Rangify Score dessa partida. */
  rs: number | null
  mvp: boolean
}

export interface EstatisticasMapa { mapa: string; partidas: number; vitorias: number; acs: number | null; rs: number | null }
export interface EstatisticasAgente { agente: string; partidas: number; vitorias: number; acs: number | null; rs: number | null }

export interface EstatisticasPerfil {
  partidas: number
  vitorias: number
  kda: number | null
  /** Kills a dividir por mortes. */
  kd: number | null
  acs: number | null
  /** Rangify Score médio (100 é a média das partidas). */
  rangifyScore: number | null
  melhorRs: number | null
  killsMedia: number | null
  mortesMedia: number | null
  assistMedia: number | null
  hsPct: number | null
  kastPct: number | null
  tradesMedia: number | null
  fbMedia: number | null
  mvps: number
  firstBloods: number
  melhorAcs: number | null
  maisKills: number | null
  melhorSequencia: number
  /** Positivo: vitórias seguidas agora; negativo: derrotas seguidas. */
  sequenciaAtual: number
  capitao: { partidas: number; vitorias: number }
  porMapa: EstatisticasMapa[]
  porAgente: EstatisticasAgente[]
  /** Posição e total na tabela da fila aberta. */
  posicao: number
  totalJogadores: number
  /** O mesmo na tabela ranked (0 enquanto não jogou nela). */
  posicaoRanked?: number
  totalRanked?: number
}

export type TipoMissao =
  | 'jogos' | 'vitorias' | 'vitorias_acima' | 'first_bloods' | 'mvp' | 'sequencia' | 'acs' | 'pontos'
  | 'kills' | 'assists' | 'trades' | 'capitao' | 'vitorias_capitao' | 'mapas'

export interface Missao {
  id: string
  titulo: string
  descricao: string
  tipo: TipoMissao
  alvo: number
  ambito: 'diaria' | 'semanal' | 'temporada'
  /** XP que a missão dá ao ficar completa (uma vez por rotação). */
  xp: number
  progresso: number
  concluida: boolean
}

/** Rangify Experience de um jogador. */
export interface Experiencia {
  xp: number
  nivel: number
  xpNoNivel: number
  xpParaProximo: number
  xpSemana: number
  posicao: number
  total: number
}

export interface LinhaNivel {
  posicao: number
  perfil: Perfil
  xp: number
  nivel: number
  xpNoNivel: number
  xpParaProximo: number
}

/** Uma linha da tabela do Rangify Score: a média de RS das partidas do jogador. */
export interface LinhaRankingRs {
  posicao: number
  perfil: Perfil
  media: number
  melhor: number
  partidas: number
}

export interface RankingRs {
  /** Partidas com RS precisas para entrar na tabela. */
  minimo: number
  linhas: LinhaRankingRs[]
  /** O próprio jogador; posicao null enquanto não tiver partidas suficientes. */
  eu: { posicao: number | null; media: number; melhor: number; partidas: number } | null
}

/** Um jogador na tabela de um agente: a média de Rangify Score com esse agente. */
export interface JogadorAgente {
  posicao: number
  perfil: Perfil
  media: number
  melhor: number
  partidas: number
  vitorias: number
  acs: number | null
  kda: number | null
}

/** Os melhores jogadores de um agente, do melhor para o pior. */
export interface RankingAgente { agente: string; jogadores: JogadorAgente[] }

export interface RankingAgentes {
  /** Partidas com o agente precisas para entrar na tabela dele. */
  minimo: number
  /** Só os agentes que alguém já jogou, por ordem alfabética. */
  agentes: RankingAgente[]
}

/** Novidade do Dashboard, publicada pela staff. */
export interface Novidade {
  id: string
  /** Dia mostrado no canto (AAAA-MM-DD). */
  data: string
  titulo: string
  texto: string
  criadaEm: string
}

/** O que a Henrik Dev API devolveu do último jogo personalizado (teste da Staff). */
export interface TesteApi {
  riotId: string
  encontrado: boolean
  modo?: string | null
  mapa?: string
  inicio?: string
  /** Rondas da equipa vermelha e da azul, "13-7". */
  resultado?: string
  rondas?: number
  mortes?: number
  jogadores: {
    riotId: string; equipa: string; agente?: string | null; kills: number; deaths: number; assists: number; acs: number
    firstBloods: number; trades: number; hsPct: number | null; kastPct: number
  }[]
  avisos: string[]
}

export type EstadoAmizade = 'pendente' | 'aceite'

export interface Amizade {
  perfil: Perfil
  estado: EstadoAmizade
  /** Num pedido pendente: quem o enviou. */
  direcao: 'recebido' | 'enviado' | null
  atividade: 'fila' | 'jogo' | null
  ultimaPartida: string | null
  desde: string
}

export type EstadoSugestao = 'recebida' | 'analise' | 'planeada' | 'feita'

export interface Sugestao {
  id: string
  titulo: string
  descricao: string
  categoria: string
  estado: EstadoSugestao
  autor: string
  criadaEm: string
  votos: number
  votei: boolean
}

export interface Denuncia {
  id: string
  denunciante: string
  alvo: Perfil
  motivo: string
  detalhes: string
  estado: 'aberta' | 'resolvida' | 'arquivada'
  criadaEm: string
}

export interface Sessao {
  perfilId: string
  /** Conta acabada de criar: ainda sem Riot ID ligado. */
  incompleta: boolean
}

/** O que mudou ao recarregar os dados de uma partida terminada. */
export interface RecargaPartida {
  codigo: string
  /** api: lida outra vez na Henrik Dev API; teste: recalculada com o que já tinha. */
  fonte: 'api' | 'teste'
  jogadores: { nome: string; antes: number | null; depois: number; rangifyScore: number | null; agente: string | null }[]
  avisos?: string[]
}

export interface EstadoDiscord {
  obrigatorio: boolean
  convite: string | null
  /** null: ainda não verificado (ou o bot não está configurado). */
  membro: boolean | null
  verificadoEm: string | null
}

/** A loja de Rangify Coins, para quem a pode ver (Owner e Dev, ou todos quando é pública). */
export interface LojaAberta {
  visivel: true
  publica: boolean
  /** Owner e Dev: compram tudo (para testar), dão coins a si próprios, sorteiam a loja e devolvem itens. */
  staff: boolean
  moedas: number
  ganhas: { nivel: number; porNivel: number; porMarcos: number; porDiarias: number; porSemanais: number; porMvp: number; testes: number; porConvites?: number }
  hoje: { dia: string; diarios: string[]; semanais: string[]; destaque: string | null; mudaEm: string; semanaisAte: string; destaqueAte: string }
  inventario: string[]
  equipados: Partial<Record<CategoriaLoja, string>>
  avatarGif: string | null
}
export type EstadoLoja = { visivel: false } | LojaAberta

/** O que o draft mostra de cada jogador: só estes números, numa única chamada para todos. */
export type ResumoEstatisticas = Pick<EstatisticasPerfil, 'partidas' | 'vitorias' | 'kda' | 'acs'>

/** O que o overlay do OBS mostra: o jogador, o dia, o estado e a última partida. */
export interface OverlayDados {
  nome: string
  riotId: string | null
  avatarUrl: string | null
  tier: number
  rr: number | null
  /** A fila de que o overlay fala: a de agora, a da última partida, ou a que o endereço fixou. */
  filaTipo: FilaTipo
  /** Os pontos, o registo e a posição são os da tabela dessa fila (posição 0 enquanto não jogou nela). */
  pontos: number
  vitorias: number
  derrotas: number
  posicao: number
  hoje: { vitorias: number; derrotas: number; delta: number }
  estado: 'livre' | 'fila' | 'partida'
  fila: { contagem: number; desde: string } | null
  partida: { estado: EstadoPartida; codigo: string; mapa: string | null; equipa: Equipa | null; comecouEm: string | null; fila?: FilaTipo } | null
  ultima: { codigo: string; mapa: string | null; venceu: boolean; rondasFeitas: number | null; rondasSofridas: number | null; delta: number | null; terminouEm: string | null; fila?: FilaTipo } | null
  twitch: string | null
  codigoConvite: string | null
  agora: string
}

/** A conta da Twitch ligada ao perfil e o que se sabe da live. */
export interface TwitchConta { login: string; nome: string; ligadaEm: string; aoVivo: boolean; titulo: string | null; jogo: string | null; espetadores: number | null }

/** Um jogador em direto na Twitch (o site mostra "AO VIVO" e o botão da live ao lado dele). */
export interface StreamerAoVivo { perfilId: string; utilizador: string; canal: string; nome: string; titulo: string | null; jogo: string | null; espetadores: number | null; desde: string | null }

export interface ConviteValores { convidador: number; convidado: number; marcoACada: number; bonusMarco: number; limiteMes: number; diasParaUsar: number }
export interface ConvidadoLinha { perfilId: string; utilizador: string; avatarUrl: string | null; estado: 'pendente' | 'premiado' | 'limite'; desde: string; premiadoEm: string | null; moedas: number }
export interface ConvitesInfo {
  codigo: string
  valores: ConviteValores
  convidados: ConvidadoLinha[]
  premiados: number
  moedas: number
  /** Quem te convidou, se usaste um convite. */
  conviteDe: { utilizador: string; estado: 'pendente' | 'premiado' | 'limite'; moedas: number } | null
}

/** Staff: o estado da área de streamers e convites. */
export interface DivulgacaoEstado {
  publico: boolean
  twitchLigadas: number
  aoVivo: number
  overlays: number
  convidados: number
  premiados: number
  moedasDadas: number
  top: { perfilId: string; utilizador: string; convidados: number; premiados: number }[]
}

// ---------------------------------------------------------------- torneios

export type EstadoTorneio = 'rascunho' | 'inscricoes' | 'grupos' | 'playoffs' | 'concluido' | 'cancelado'
export type FuncaoEquipaTorneio = 'jogador' | 'coach' | 'suplente'
/** 'veto' = os capitães estão a banir e a escolher o mapa. */
export type EstadoJogoTorneio = 'pendente' | 'agendado' | 'veto' | 'a_decorrer' | 'concluido'
/**
 * O formato de um jogo: à melhor de 1, 3 ou 5 mapas. À melhor de 1 banem à vez até sobrar um mapa (quem não baniu
 * por último escolhe o lado). À melhor de 3 e 5: ban, ban, picks (cada um com o lado escolhido pela outra equipa),
 * bans se sobrarem mapas e o decisivo.
 */
export type MelhorDe = 1 | 3 | 5
/** Um passo dos picks e bans; "alvo" é o n.º do mapa a que o pick ou o lado se refere. */
export type PassoVetoTorneio = { tipo: 'ban' | 'pick' | 'lado'; equipa: 'A' | 'B'; alvo?: number }
export interface JogadaVetoTorneio extends PassoVetoTorneio {
  ordem: number
  /** O mapa banido ou escolhido; no lado, 'ataque' ou 'defesa'. */
  valor: string
  /** Jogada feita pelo tempo ou por um bot, não por um capitão. */
  auto: boolean
}
export interface VetoJogoTorneio {
  melhorDe: MelhorDe
  /** Os mapas em jogo (fixados quando o veto começa). */
  pool: string[]
  /** A ordem completa, mesmo do que ainda não aconteceu. */
  passos: PassoVetoTorneio[]
  feitos: JogadaVetoTorneio[]
  /** Quando acaba o tempo da vez; passado, joga-se ao calhas. */
  prazo: string | null
  ladoEquipa: 'A' | 'B' | null
  ladoEscolha: 'ataque' | 'defesa' | null
  /** O mapa foi posto pela staff: não há picks e bans neste jogo. */
  mapaStaff: boolean
}
/** Como se soube o resultado: API da Riot, staff, simulado (testes), falta de comparência ou folga na chave. */
export type ComoJogoTorneio = 'api' | 'staff' | 'simulado' | 'walkover' | 'bye'

export interface TorneioResumo {
  id: string
  nome: string
  descricao: string | null
  estado: EstadoTorneio
  /** Visível a toda a gente quando a área de torneios está aberta (senão só a staff, quem foi convidado a testar e os membros das equipas). */
  publico: boolean
  /** Torneio de teste: a staff tem ferramentas com bots. */
  teste: boolean
  tamanhoGrupo: number
  passamPorGrupo: number
  finalPresencial: boolean
  /** Picks e bans de mapas antes de cada jogo. */
  vetoMapas: boolean
  /** O formato de cada jogo por defeito (a staff muda-o jogo a jogo). */
  melhorDe: MelhorDe
  /** Os mapas escolhidos para este torneio (null = a rotação do hub). */
  poolMapas: string[] | null
  /** Os mapas que realmente entram: os escolhidos ou a rotação do hub. */
  poolEfetiva: string[]
  /** Jogadores da API que têm de estar num jogo para o darmos como do torneio. */
  minJogadores: number
  inscricoesAte: string
  inicio: string | null
  maxEquipas: number | null
  sorteadoEm: string | null
  inscricoesAbertas: boolean
  equipas: number
  completas: number
  campeao: { id: string; nome: string } | null
  minhaEquipa: { id: string; nome: string; funcao: FuncaoEquipaTorneio; capitao: boolean } | null
  /** Convites por aceitar neste torneio. */
  convites: number
  gerir: boolean
  /** A seed do sorteio (só a staff a vê). */
  seed?: number | null
}

export interface TorneioMembro {
  perfilId: string
  utilizador: string
  riotId: string | null
  avatarUrl: string | null
  bot: boolean
  funcao: FuncaoEquipaTorneio
  estado: 'convidado' | 'aceite'
  capitao: boolean
}

export interface TorneioEquipa {
  id: string
  nome: string
  capitaoId: string
  estado: 'inscrita' | 'desqualificada'
  /** 1, 2, 3... (A, B, C...) depois do sorteio. */
  grupo: number | null
  ordem: number | null
  /** 5 jogadores aceites. */
  completa: boolean
  membros: TorneioMembro[]
}

export interface TorneioJogadorJogo {
  /** Em que mapa da série (sempre 1 à melhor de 1). */
  mapaOrdem: number
  perfilId: string
  equipaId: string
  utilizador: string
  agente: string | null
  kills: number | null
  deaths: number | null
  assists: number | null
  acs: number | null
  firstBloods: number | null
  trades: number | null
  hsPct: number | null
  kastPct: number | null
}

/** De onde vem uma equipa que ainda não se sabe: um lugar num grupo ou o vencedor de outro jogo. */
export type OrigemEquipaTorneio = { tipo: 'grupo'; grupo: number; posicao: number } | { tipo: 'vencedor'; ronda: number; ordem: number }

/** Um mapa de uma série à melhor de 3 ou 5. */
export interface MapaSerieTorneio {
  ordem: number
  mapa: string
  escolhidaPor: 'A' | 'B' | 'decisivo'
  ladoEquipa: 'A' | 'B' | null
  ladoEscolha: 'ataque' | 'defesa' | null
  estado: 'pendente' | 'a_decorrer' | 'concluido'
  scoreA: number | null
  scoreB: number | null
  vencedorId: string | null
  como: 'api' | 'staff' | 'simulado' | null
  comecouEm: string | null
  terminouEm: string | null
}

export interface TorneioJogo {
  id: string
  fase: 'grupo' | 'playoff'
  grupo: number | null
  /** Jornada (grupos) ou ronda da chave (playoffs, 1 = a primeira). */
  ronda: number
  ordem: number
  /** 'jornada', 'oitavos', 'quartos', 'meias', 'final' ou 'ronda'. */
  rotulo: string
  equipaA: { id: string; nome: string } | null
  equipaB: { id: string; nome: string } | null
  origemA: OrigemEquipaTorneio | null
  origemB: OrigemEquipaTorneio | null
  agendadoPara: string | null
  /** O mapa do jogo: o que saiu dos picks e bans ou o que a staff fixou. */
  mapa: string | null
  presencial: boolean
  estado: EstadoJogoTorneio
  /** À melhor de 1, 3 ou 5 (os picks e bans já começados guardam o que valia na altura). */
  melhorDe: MelhorDe
  /** Mapas ganhos por cada equipa (só conta à melhor de 3 ou 5). */
  serieA: number
  serieB: number
  /** Os mapas da série, na ordem em que se jogam (vazio à melhor de 1: aí o mapa é o do jogo). */
  mapas: MapaSerieTorneio[]
  /** Picks e bans (null se o torneio os desligou ou se o jogo é presencial). */
  veto: VetoJogoTorneio | null
  comecouEm: string | null
  terminouEm: string | null
  scoreA: number | null
  scoreB: number | null
  vencedorId: string | null
  como: ComoJogoTorneio | null
  /** A decorrer há mais de 1 hora sem resultado da API: a staff põe-no à mão. */
  semResultadoAuto: boolean
  /** O código do grupo: só aparece aos jogadores das duas equipas e à staff. */
  codigo: string | null
  jogadores: TorneioJogadorJogo[]
}

export interface TorneioLinhaClassificacao {
  equipaId: string
  nome: string
  jogos: number
  vitorias: number
  derrotas: number
  rondasGanhas: number
  rondasPerdidas: number
  diferenca: number
  posicao: number
  passa: boolean
}

export interface TorneioDetalhe {
  torneio: TorneioResumo
  equipas: TorneioEquipa[]
  jogos: TorneioJogo[]
  classificacao: { grupo: number; equipas: TorneioLinhaClassificacao[] }[]
  agora: string
}

export interface ConviteTorneio {
  equipaId: string
  equipaNome: string
  torneioId: string
  torneioNome: string
  funcao: FuncaoEquipaTorneio
  convidadoPor: string | null
  inscricoesAte: string
  em: string
}

export interface JogadorSugerido { perfilId: string; utilizador: string; riotId: string | null; avatarUrl: string | null }

export interface DadosNovoTorneio {
  nome: string
  descricao?: string | null
  tamanhoGrupo?: number
  passamPorGrupo?: number
  finalPresencial?: boolean
  vetoMapas?: boolean
  melhorDe?: MelhorDe
  /** Vazio ou ausente = a rotação do hub. */
  poolMapas?: string[] | null
  minJogadores?: number
  inscricoesAte: string
  inicio?: string | null
  maxEquipas?: number | null
  teste?: boolean
  publico?: boolean
}

export interface ItemCalendarioTorneio { jogo: string; quando: string | null; mapa?: string | null; presencial?: boolean | null; melhorDe?: MelhorDe | null }

export interface Dados {
  modo: 'demo' | 'supabase'

  // Sessão e conta
  sessao(): Promise<Sessao | null>
  aoMudarSessao(cb: () => void): () => void
  /** Chama cb logo que um pedido de amizade chega, é aceite ou removido (no site real, pelo Realtime). */
  aoMudarAmizades(perfilId: string, cb: () => void): () => void
  /**
   * Chama cb quando a fila muda, quando entras numa partida nova ou quando a partida
   * partidaId avança (no site real, pelo Realtime; no demo não faz nada).
   */
  aoMudarJogo(perfilId: string, partidaId: string | null, cb: () => void): () => void
  entrarComDiscord(): Promise<void>
  entrarComPassword(utilizador: string, password: string): Promise<void>
  /** Só no modo demo: entra na conta de exemplo com histórico. */
  entrarDemo?(): Promise<void>
  definirPassword(password: string): Promise<void>
  /** Liga o Riot ID no primeiro acesso ou muda-o depois (fora da fila e de partidas). */
  ligarRiotId(riotId: string, regiao: Regiao): Promise<Perfil>
  /** Foto de perfil já preparada (256x256, PNG/JPG/WebP); null volta à do Discord. */
  definirAvatar(imagem: Blob | null): Promise<Perfil>
  sair(): Promise<void>

  // Perfis
  meuPerfil(): Promise<Perfil | null>
  perfilPorRiotId(riotId: string): Promise<Perfil | null>
  atualizarPerfil(alteracoes: { funcaoJogo?: FuncaoJogo | null; regiao?: Regiao }): Promise<Perfil>
  marcarTourVisto(visto: boolean): Promise<void>
  sincronizarRank(): Promise<{ perfil: Perfil; atualizado: boolean; proximaEm: string | null }>
  /** As estatísticas de um jogador. Com fila, só das partidas dessa fila; sem ela, das duas juntas. */
  estatisticas(perfilId: string, fila?: FilaTipo | null): Promise<EstatisticasPerfil>
  forma(perfilId: string, n: number, fila?: FilaTipo | null): Promise<PontoForma[]>
  /** Partidas, vitórias, KDA e ACS de vários jogadores de uma vez (até 20), para o draft. Mais leve do que pedir o perfil inteiro de cada um. */
  estatisticasResumo(perfilIds: string[]): Promise<Record<string, ResumoEstatisticas>>

  // Ranking (paginação por cursor, 50 de cada vez)
  /** A tabela de pontos de uma fila (a aberta, se não disseres). */
  ranking(opts: { cursor?: string | null; limite?: number; soAmigos?: boolean; pesquisa?: string; fila?: FilaTipo }): Promise<PaginaRanking>
  /** A posição na tabela de pontos de uma fila (0 enquanto não jogou nela). */
  posicao(perfilId: string, fila?: FilaTipo): Promise<number>

  // Fila e partida
  estadoFila(): Promise<EstadoFila>
  /** Entra numa fila (a aberta, se não disseres). A ranked pede Ascendente 1 ou mais. */
  entrarFila(fila?: FilaTipo): Promise<void>
  sairFila(): Promise<void>
  /** Sinal de vida de quem está na fila: quem passa 3 minutos sem o dar é tirado dela. */
  batimentoFila(): Promise<void>
  /**
   * O separador está a fechar: tira a pessoa da fila sem esperar por resposta (o browser
   * só deixa pedidos que não precisem de ser esperados).
   */
  sairFilaAoFechar(): void
  partidaAtiva(): Promise<Partida | null>
  partida(id: string): Promise<Partida | null>
  /** Aplica prazos e jogadas automáticas e devolve a partida atualizada. */
  avancarPartida(id: string): Promise<Partida | null>
  /**
   * Tudo o que o site segue a cada segundo, numa só ida ao servidor: a fila e a
   * partida ativa já avançada (ou, sem ativa, a "ultima" que o site está a mostrar).
   */
  situacao(ultima: string | null): Promise<{ fila: EstadoFila; partida: Partida | null }>
  responderConfirmacao(id: string, aceita: boolean): Promise<void>
  escolherJogador(id: string, perfilId: string): Promise<void>
  banirMapa(id: string, mapa: string): Promise<void>
  /** O capitão da equipa que não fez o último ban escolhe Ataque ou Defesa. */
  escolherLado(id: string, lado: Lado): Promise<void>
  /** Um colega do capitão sugere o mapa a banir (ou o lado). Sugerir outra vez o mesmo tira a sugestão. */
  sugerirMapa(id: string, valor: string): Promise<void>
  /** Vota (ou retira o voto) para cancelar a partida, se alguém caiu ou não pode jogar. Com 7 votos de 10 cancela-a, sem pontos nem castigos. */
  votarCancelar(id: string, voto: boolean): Promise<void>
  definirCodigo(id: string, codigo: string): Promise<void>
  /** Um capitão confirma que o jogo acabou e diz que equipa ganhou. A API define o resultado e quem ganhou a sério. */
  submeterResultado(id: string, vencedor: Equipa): Promise<void>

  // Ferramentas de teste (só owner e dev)
  devEncherFila(opts: { serCapitao: boolean; fila?: FilaTipo }): Promise<void>
  /** Estando na fila: junta os teus amigos que também estão na fila e completa com bots. */
  devCompletarFila(opts: { serCapitao: boolean }): Promise<void>
  devSimularPartida(): Promise<void>
  devSaltarBloqueio(id: string): Promise<void>
  devAcelerar(id: string): Promise<void>
  /** Só no modo demo: muda a função da conta para testar permissões. */
  devMudarFuncao?(funcao: Funcao): Promise<void>
  /** Só no modo demo: apaga tudo e volta aos dados de exemplo. */
  reporDemo?(): Promise<void>

  // Histórico
  partidas(opts: { minhas: boolean; cursor?: string | null; mapa?: string | null; perfilId?: string; limite?: number; fila?: FilaTipo | null }): Promise<PaginaPartidas>
  jogadoresDaPartida(id: string): Promise<JogadorPartida[]>

  // Missões
  missoes(): Promise<Missao[]>
  experiencia(perfilId?: string): Promise<Experiencia>
  rankingNivel(limite?: number): Promise<LinhaNivel[]>
  /** Tabela pela média de Rangify Score (só quem tem partidas suficientes). */
  rankingRs(limite?: number): Promise<RankingRs>
  /** O melhor jogador de cada agente (e os seguintes, até `top`), pela média de Rangify Score com ele. */
  rankingAgentes(opts?: { minimo?: number; top?: number }): Promise<RankingAgentes>
  /** Owner e Dev: sorteia já diárias e semanais novas. */
  resetarMissoes(): Promise<Missao[]>

  // Amigos
  amigos(): Promise<Amizade[]>
  pedirAmizade(alvo: string): Promise<void>
  responderAmizade(perfilId: string, aceitar: boolean): Promise<void>
  removerAmigo(perfilId: string): Promise<void>

  // Sugestões
  sugestoes(ordem: 'votos' | 'recentes'): Promise<Sugestao[]>
  criarSugestao(s: { titulo: string; categoria: string; descricao: string }): Promise<void>
  votar(id: string): Promise<void>
  /** Staff: muda o estado de uma sugestão ou apaga-a. */
  definirEstadoSugestao(id: string, estado: EstadoSugestao): Promise<void>
  apagarSugestao(id: string): Promise<void>

  // Denúncias
  denunciar(perfilId: string, motivo: string, detalhes: string): Promise<void>

  // Rotação de mapas (ler: todos; mudar: Owner e Dev)
  poolMapas(): Promise<string[]>
  definirPoolMapas(mapas: string[]): Promise<string[]>

  // Novidades (ler: todos; publicar e apagar: Owner e Dev)
  novidades(limite?: number): Promise<Novidade[]>
  criarNovidade(n: { data: string; titulo: string; texto: string }): Promise<Novidade[]>
  apagarNovidade(id: string): Promise<Novidade[]>
  /** Owner e Dev: lê o último jogo personalizado da própria conta na Henrik Dev API. */
  testarApi(): Promise<TesteApi>
  /**
   * Se a fila exige estar no servidor de Discord e se o jogador está lá.
   * Com verificar, pergunta outra vez ao Discord (só quando é obrigatório).
   */
  estadoDiscord(verificar?: boolean): Promise<EstadoDiscord>
  /** Owner e Dev: torna o servidor de Discord obrigatório para a fila e guarda o convite. */
  definirDiscordFila(obrigatorio: boolean, convite: string): Promise<EstadoDiscord>
  /** Owner e Dev: publica no canal de ping a mensagem com o botão "Chamar para a fila" (ou atualiza a que lá está). */
  publicarPingDiscord(): Promise<{ mensagem: string; editada: boolean }>
  /** Owner e Dev: publica no canal da fila a mensagem com a contagem e os botões "Entrar na fila" e "Abrir o site" (ou atualiza a que lá está). */
  publicarFilaDiscord(): Promise<{ mensagem: string; editada: boolean }>
  publicarFilaRankedDiscord(): Promise<{ mensagem: string; editada: boolean }>
  /**
   * Owner e Dev: publica um aviso no canal de avisos do Discord (o bot cria o canal na primeira vez). O embed leva sempre a
   * barra laranja, "Rangify Hub" no topo e o aviso de que o hub não é afiliado com a Riot; o resto é o que se escreve.
   */
  publicarAnuncioDiscord(a: AnuncioDiscord): Promise<ResultadoAnuncio>
  /** Owner e Dev: cria o canal de avisos no Discord (ou diz qual é, se já existe). */
  criarCanalAnunciosDiscord(): Promise<ResultadoAnuncio>
  /** Acerta o cargo Ranked do Discord de toda a gente pelo rank oficial (Ascendente 1 ou mais). */
  acertarCargosRanked(): Promise<ResumoCargosRanked>
  /** Os canais de Discord da partida, para quem a joga (null se ainda não existem). */
  discordPartida(id: string): Promise<{ servidor: string; chat: string; call: string } | null>
  /** Muda-te para a call da tua equipa, se já estiveres numa call do servidor (o Discord não deixa de outra forma). */
  puxarCall(id: string): Promise<{ movido: boolean; foraDaVoz?: boolean }>

  // Loja
  /** Se quem pergunta pode ver a loja (Owner e Dev sempre; os outros quando é pública). */
  lojaVisivel(): Promise<boolean>
  loja(): Promise<EstadoLoja>
  comprarItem(id: string): Promise<EstadoLoja>
  equiparItem(id: string): Promise<EstadoLoja>
  desequiparItem(categoria: CategoriaLoja): Promise<EstadoLoja>
  /** O link da GIF de perfil (precisa da "Foto em GIF"); null tira-a. */
  definirAvatarGif(url: string | null): Promise<EstadoLoja>
  /** O que cada jogador tem equipado (vazio enquanto a loja não for pública, exceto para Owner e Dev). */
  cosmeticos(ids: string[]): Promise<Record<string, Cosmeticos>>
  /** Owner e Dev: abre a loja a toda a gente (ou volta a fechá-la). */
  definirLojaPublica(publica: boolean): Promise<EstadoLoja>
  /** Owner e Dev: sorteia a loja de hoje outra vez. */
  lojaResetar(): Promise<EstadoLoja>
  /** Owner e Dev: coins de teste para si próprio (negativo tira). */
  lojaMoedasTeste(quantidade: number): Promise<EstadoLoja>
  /** Owner e Dev: devolve um item comprado (ou todos, com null) e as coins voltam. */
  lojaDevolver(id: string | null): Promise<EstadoLoja>

  // Staff
  disputas(): Promise<Partida[]>
  resolverDisputa(id: string, resultado: { a: number; b: number } | null): Promise<void>
  /** As partidas a jogar ou à espera do resultado. */
  resultadosPendentes(): Promise<Partida[]>
  /** A staff submete o resultado pelos capitães que ainda não o fizeram. */
  submeterResultadoStaff(id: string, vencedor: Equipa): Promise<void>
  /** Staff: todas as partidas que ainda não acabaram, com os jogadores de cada uma. */
  partidasAoVivo(): Promise<Partida[]>
  cancelarPartida(id: string): Promise<void>
  /** Owner e Dev: apaga uma partida terminada ou cancelada (os pontos dela são devolvidos). */
  removerPartida(id: string): Promise<void>
  /**
   * Owner e Dev: volta a ler os dados de uma partida terminada (agentes e estatísticas
   * da API, nas reais) e refaz o RS, o MVP e os pontos com a fórmula de agora.
   */
  recarregarPartida(id: string, simulada: boolean): Promise<RecargaPartida>
  /** Owner e Dev: acerta os pontos de um jogador à mão. */
  definirPontos(perfilId: string, pontos: number, fila?: FilaTipo): Promise<void>
  denuncias(): Promise<Denuncia[]>
  tratarDenuncia(id: string, estado: 'resolvida' | 'arquivada'): Promise<void>
  pesquisarJogadores(q: string): Promise<JogadorStaff[]>
  definirFuncao(perfilId: string, funcao: Funcao): Promise<void>
  /** Quantas contas humanas há no site. */
  contarJogadores(): Promise<number>
  /** Escreve um aviso a um jogador (popup no site e mensagem privada no Discord). */
  avisarJogador(perfilId: string, mensagem: string): Promise<AvisoStaff>
  /** Bane o jogador da fila: horas null é para sempre. Tira-o da fila já; não cancela uma partida a decorrer. */
  banirDaFila(perfilId: string, mensagem: string, horas: number | null): Promise<AvisoStaff>
  levantarBan(perfilId: string): Promise<void>
  /** Os avisos e bans de um jogador, do mais recente para o mais antigo. */
  avisosDoJogador(perfilId: string): Promise<AvisoStaff[]>

  // Avisos recebidos
  /** O aviso mais antigo que ainda não confirmaste (um de cada vez), ou null. */
  avisoPendente(): Promise<AvisoStaff | null>
  confirmarAviso(id: string): Promise<void>
  /** Chama cb quando a staff te dá um aviso ou um ban (no site real, pelo Realtime). */
  aoMudarAvisos(perfilId: string, cb: () => void): () => void

  // Streamers, overlay e convites (fechado a Owner e Dev até a staff abrir a toda a gente)
  /** Se quem pergunta vê a área (Owner e Dev sempre; os outros quando está aberta). */
  streamersVisivel(): Promise<boolean>
  /** A chave secreta da ligação do overlay do OBS (cria-a na primeira vez). */
  meuOverlay(): Promise<{ chave: string }>
  /** Troca a chave: a ligação antiga deixa de funcionar. */
  renovarOverlay(): Promise<{ chave: string }>
  /** O que o overlay mostra. Pública: só precisa da chave. null se a chave não existir ou a área estiver fechada. */
  overlayDados(chave: string, fila?: FilaTipo): Promise<OverlayDados | null>
  minhaTwitch(): Promise<TwitchConta | null>
  /** O endereço da Twitch para onde mandar a pessoa ligar o canal (a Twitch devolve-a ao site). */
  twitchUrlLigar(): Promise<string>
  desligarTwitch(): Promise<void>
  /** Quem está em direto agora (vazio se a área estiver fechada para quem pergunta). */
  streamersAoVivo(): Promise<StreamerAoVivo[]>
  /** Só no modo demo: faz de conta que ligaste o canal (não há OAuth no demo). */
  twitchLigarDemo?(canal: string): Promise<void>
  /** Só no modo demo: põe o teu canal em direto ou fora dele. */
  twitchAoVivoDemo?(aoVivo: boolean): Promise<void>
  /** O teu código de convite, a lista de convidados e o que ganhaste. */
  meuConvite(): Promise<ConvitesInfo>
  /** Usa o código de quem te convidou (só contas novas e sem partidas, uma vez). */
  usarConvite(codigo: string): Promise<{ convidador: string; moedas: number }>
  /** Só no modo demo: um convidado de teste que acabou de jogar a primeira partida. */
  conviteConvidadoDemo?(): Promise<void>
  /** Staff: o estado da área (aberta ou não), as Twitch ligadas e os convites. */
  divulgacaoEstado(): Promise<DivulgacaoEstado>
  /** Owner e Dev: abre a área a toda a gente (ou volta a fechá-la). */
  definirStreamersPublico(publico: boolean): Promise<DivulgacaoEstado>

  // ---------------------------------------------------------------- torneios
  /** O separador aparece a Owner e Dev, a toda a gente quando a área está aberta e a quem tem um torneio para ver (convidado para uma equipa ou a testar). */
  torneiosVisivel(): Promise<boolean>
  /** Staff: a área de torneios está aberta a toda a gente? */
  torneiosAreaAberta(): Promise<boolean>
  /** Staff: abre a área a toda a gente ou volta a fechá-la. Devolve o novo estado. */
  torneiosDefinirArea(aberta: boolean): Promise<boolean>
  torneiosLista(): Promise<TorneioResumo[]>
  torneioDetalhe(id: string): Promise<TorneioDetalhe>
  meusConvitesTorneio(): Promise<ConviteTorneio[]>
  torneioProcurarJogadores(q: string): Promise<JogadorSugerido[]>
  torneioCriarEquipa(torneio: string, nome: string, funcao?: 'jogador' | 'coach'): Promise<string>
  torneioRenomearEquipa(equipa: string, nome: string): Promise<void>
  /** Convida pelo nome (Riot ID ou utilizador): a pessoa tem de aceitar. */
  torneioConvidar(equipa: string, nome: string, funcao: FuncaoEquipaTorneio): Promise<JogadorSugerido>
  torneioResponderConvite(equipa: string, aceitar: boolean): Promise<void>
  torneioRemoverMembro(equipa: string, perfil: string): Promise<void>
  torneioMudarFuncao(equipa: string, perfil: string, funcao: FuncaoEquipaTorneio): Promise<void>
  torneioSairEquipa(equipa: string): Promise<void>
  torneioApagarEquipa(equipa: string): Promise<void>
  /** O capitão partilha o código do grupo: o jogo passa a decorrer e o resultado é detetado na API. */
  torneioAbrirJogo(jogo: string, codigo: string): Promise<void>
  /** Os capitães (ou a staff) começam os picks e bans do jogo. */
  torneioVetoIniciar(jogo: string): Promise<void>
  /** O capitão da vez bane/escolhe um mapa ou escolhe o lado ('ataque' | 'defesa'). */
  torneioVetoAgir(jogo: string, valor: string): Promise<void>
  /** Passou o tempo da vez? Joga ao calhas. Devolve se jogou. */
  torneioVetoAvancar(jogo: string): Promise<boolean>
  /** Staff: despacha o que falta dos picks e bans ao calhas. */
  torneioVetoConcluir(jogo: string): Promise<void>
  /** Staff: apaga os picks e bans para se fazerem de novo. */
  torneioVetoReiniciar(jogo: string): Promise<void>
  /** Pede à API que veja se o jogo já acabou (o servidor também o faz sozinho a cada minuto). */
  torneioProcessarJogo(jogo: string): Promise<void>
  // Staff (Owner e Dev)
  torneioCriar(p: DadosNovoTorneio): Promise<string>
  torneioEditar(id: string, p: Partial<DadosNovoTorneio>): Promise<void>
  torneioMudarEstado(id: string, estado: 'inscricoes' | 'rascunho' | 'cancelado'): Promise<void>
  torneioApagar(id: string): Promise<void>
  torneioAcesso(id: string, nome: string, dar: boolean): Promise<JogadorSugerido>
  torneioAcessos(id: string): Promise<JogadorSugerido[]>
  torneioStaffAdicionar(equipa: string, nome: string, funcao: FuncaoEquipaTorneio): Promise<JogadorSugerido>
  torneioSortear(id: string, seed?: number | null): Promise<{ grupos: number; equipas: number; seed: number }>
  /** mapa: vazio tira o que a staff pôs, ausente deixa como está. melhorDe: o formato deste jogo (1, 3 ou 5). */
  torneioAgendar(jogo: string, quando: string | null, mapa?: string | null, presencial?: boolean | null, melhorDe?: MelhorDe | null): Promise<void>
  torneioAgendarVarios(itens: ItemCalendarioTorneio[]): Promise<number>
  torneioResolverJogo(jogo: string, a: number, b: number): Promise<void>
  torneioWalkover(jogo: string, vencedor: string): Promise<void>
  torneioDesfazerJogo(jogo: string): Promise<void>
  torneioGerarPlayoffs(id: string): Promise<void>
  // Só nos torneios de teste
  torneioTesteEquipas(id: string, n: number): Promise<number>
  torneioTestePreencher(equipa: string, completo?: boolean): Promise<number>
  torneioTesteSimular(jogo: string): Promise<void>
  torneioTesteSimularTudo(id: string, soGrupos?: boolean): Promise<number>
  torneioTesteReiniciar(id: string): Promise<void>
}
