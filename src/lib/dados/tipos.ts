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
  /** Rangify Score: a nota de desempenho, 100 é a média da partida. */
  rangifyScore: number | null
  /** A parte dos pontos que veio do desempenho (de -6 a +6). */
  deltaDesempenho: number | null
  /** O agente que jogou (vem da Henrik Dev API). */
  agente: string | null
}

export interface BanMapa { mapa: string; equipa: Equipa; ordem: number }
export interface Submissao { capitaoId: string; a: number; b: number; em: string }
export type Lado = 'ataque' | 'defesa'
/** Depois do último ban, a equipa que não o fez escolhe o lado em que começa. */
export interface EscolhaLado { equipa: Equipa; escolha: Lado | null }
/** O que os colegas do capitão sugerem na vez atual (um mapa a banir, ou o lado). */
export interface SugestaoMapa { perfilId: string; valor: string }

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
  posicao: number
  totalJogadores: number
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
  ganhas: { nivel: number; porNivel: number; porMarcos: number; porDiarias: number; porSemanais: number; porMvp: number; testes: number }
  hoje: { dia: string; diarios: string[]; semanais: string[]; destaque: string | null; mudaEm: string; semanaisAte: string; destaqueAte: string }
  inventario: string[]
  equipados: Partial<Record<CategoriaLoja, string>>
  avatarGif: string | null
}
export type EstadoLoja = { visivel: false } | LojaAberta

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
  definirCodigo(id: string, codigo: string): Promise<void>
  submeterResultado(id: string, a: number, b: number): Promise<void>

  // Ferramentas de teste (só owner e dev)
  devEncherFila(opts: { serCapitao: boolean }): Promise<void>
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
  partidas(opts: { minhas: boolean; cursor?: string | null; mapa?: string | null; perfilId?: string }): Promise<PaginaPartidas>
  jogadoresDaPartida(id: string): Promise<JogadorPartida[]>

  // Missões
  missoes(): Promise<Missao[]>
  experiencia(perfilId?: string): Promise<Experiencia>
  rankingNivel(limite?: number): Promise<LinhaNivel[]>
  /** Tabela pela média de Rangify Score (só quem tem partidas suficientes). */
  rankingRs(limite?: number): Promise<RankingRs>
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
  submeterResultadoStaff(id: string, resultado: { a: number; b: number }): Promise<void>
  partidasEncravadas(): Promise<Partida[]>
  cancelarPartida(id: string): Promise<void>
  /** Owner e Dev: apaga uma partida terminada ou cancelada (os pontos dela são devolvidos). */
  removerPartida(id: string): Promise<void>
  /**
   * Owner e Dev: volta a ler os dados de uma partida terminada (agentes e estatísticas
   * da API, nas reais) e refaz o RS, o MVP e os pontos com a fórmula de agora.
   */
  recarregarPartida(id: string, simulada: boolean): Promise<RecargaPartida>
  /** Owner e Dev: acerta os pontos de um jogador à mão. */
  definirPontos(perfilId: string, pontos: number): Promise<void>
  denuncias(): Promise<Denuncia[]>
  tratarDenuncia(id: string, estado: 'resolvida' | 'arquivada'): Promise<void>
  pesquisarJogadores(q: string): Promise<Perfil[]>
  definirFuncao(perfilId: string, funcao: Funcao): Promise<void>
}
