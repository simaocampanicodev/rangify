/**
 * Os tipos que as páginas usam. Os nomes estão em português; o Supabase
 * guarda em inglês (como no PRD) e o adaptador faz a tradução.
 */

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
  pontos: number
  vitorias: number
  derrotas: number
  funcao: Funcao
  funcaoJogo: FuncaoJogo | null
  bot: boolean
  cooldownAte: string | null
  tourVistoEm: string | null
  temPassword: boolean
  criadoEm: string
}

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
}

export interface BanMapa { mapa: string; equipa: Equipa; ordem: number }
export interface Submissao { capitaoId: string; a: number; b: number; em: string }

export interface Partida {
  id: string
  codigo: string
  estado: EstadoPartida
  regiao: Regiao
  mapa: string | null
  capitaoA: string | null
  capitaoB: string | null
  codigoGrupo: string | null
  resultadoA: number | null
  resultadoB: number | null
  vencedor: Equipa | null
  simulada: boolean
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
}

export interface EstadoFila {
  naFila: boolean
  desde: string | null
  contagem: number
  regiao: Regiao
  cooldownAte: string | null
  /** Hora do servidor, para acertar as contagens com o relógio dele. */
  agora?: string | null
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
    tierAdversario: number
  } | null
}

export interface PaginaPartidas {
  linhas: ResumoPartida[]
  cursor: string | null
}

export interface PontoForma {
  partidaId: string
  data: string
  mapa: string
  adversario: string
  venceu: boolean
  resultado: string
  pontos: number
  delta: number
  kda: number | null
  mvp: boolean
}

export interface EstatisticasPerfil {
  partidas: number
  vitorias: number
  kda: number | null
  acs: number | null
  mvps: number
  firstBloods: number
  posicao: number
  totalJogadores: number
}

export interface Missao {
  id: string
  titulo: string
  descricao: string
  tipo: 'jogos' | 'vitorias' | 'vitorias_acima' | 'first_bloods' | 'mvp' | 'sequencia' | 'acs' | 'pontos'
  alvo: number
  ambito: 'semanal' | 'temporada'
  progresso: number
  concluida: boolean
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

export interface Dados {
  modo: 'demo' | 'supabase'

  // Sessão e conta
  sessao(): Promise<Sessao | null>
  aoMudarSessao(cb: () => void): () => void
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
  estatisticas(perfilId: string): Promise<EstatisticasPerfil>
  forma(perfilId: string, n: number): Promise<PontoForma[]>

  // Ranking (paginação por cursor, 50 de cada vez)
  ranking(opts: { cursor?: string | null; limite?: number; soAmigos?: boolean; pesquisa?: string }): Promise<PaginaRanking>
  posicao(perfilId: string): Promise<number>

  // Fila e partida
  estadoFila(): Promise<EstadoFila>
  entrarFila(): Promise<void>
  sairFila(): Promise<void>
  partidaAtiva(): Promise<Partida | null>
  partida(id: string): Promise<Partida | null>
  /** Aplica prazos e jogadas automáticas e devolve a partida atualizada. */
  avancarPartida(id: string): Promise<Partida | null>
  responderConfirmacao(id: string, aceita: boolean): Promise<void>
  escolherJogador(id: string, perfilId: string): Promise<void>
  banirMapa(id: string, mapa: string): Promise<void>
  definirCodigo(id: string, codigo: string): Promise<void>
  submeterResultado(id: string, a: number, b: number): Promise<void>

  // Ferramentas de teste (só owner e dev)
  devEncherFila(opts: { serCapitao: boolean }): Promise<void>
  devSimularPartida(): Promise<void>
  devSaltarBloqueio(id: string): Promise<void>
  devAcelerar(id: string): Promise<void>
  /** Só no modo demo: muda a função da conta para testar permissões. */
  devMudarFuncao?(funcao: Funcao): Promise<void>
  /** Só no modo demo: apaga tudo e volta aos dados de exemplo. */
  reporDemo?(): Promise<void>

  // Histórico
  partidas(opts: { minhas: boolean; cursor?: string | null; mapa?: string | null; perfilId?: string }): Promise<PaginaPartidas>
  jogadoresDaPartida(id: string): Promise<JogadorPartida[]>

  // Missões
  missoes(): Promise<Missao[]>

  // Amigos
  amigos(): Promise<Amizade[]>
  pedirAmizade(alvo: string): Promise<void>
  responderAmizade(perfilId: string, aceitar: boolean): Promise<void>
  removerAmigo(perfilId: string): Promise<void>

  // Sugestões
  sugestoes(ordem: 'votos' | 'recentes'): Promise<Sugestao[]>
  criarSugestao(s: { titulo: string; categoria: string; descricao: string }): Promise<void>
  votar(id: string): Promise<void>

  // Denúncias
  denunciar(perfilId: string, motivo: string, detalhes: string): Promise<void>

  // Staff
  disputas(): Promise<Partida[]>
  resolverDisputa(id: string, resultado: { a: number; b: number } | null): Promise<void>
  partidasEncravadas(): Promise<Partida[]>
  cancelarPartida(id: string): Promise<void>
  /** Owner e Dev: apaga uma partida terminada ou cancelada (os pontos dela são devolvidos). */
  removerPartida(id: string): Promise<void>
  /** Owner e Dev: acerta os pontos de um jogador à mão. */
  definirPontos(perfilId: string, pontos: number): Promise<void>
  denuncias(): Promise<Denuncia[]>
  tratarDenuncia(id: string, estado: 'resolvida' | 'arquivada'): Promise<void>
  pesquisarJogadores(q: string): Promise<Perfil[]>
  definirFuncao(perfilId: string, funcao: Funcao): Promise<void>
}
