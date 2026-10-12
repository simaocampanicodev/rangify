/**
 * Modo a sério: Supabase. A lógica toda vive na base de dados (RPCs
 * "security definer" que fazem de máquina de estados) e as funções devolvem
 * já o JSON com os nomes que as páginas usam, por isso aqui é quase só passar.
 * O que precisa de chaves secretas (Henrik Dev API, login por utilizador)
 * passa pelas Edge Functions.
 */
import { supabase } from '../supabase'
import { PADRAO_RIOT_ID } from '../regras'
import type {
  Amizade, Dados, Denuncia, EstadoFila, EstatisticasPerfil, Missao, Partida, Perfil, PontoForma, ResumoPartida, Sugestao,
} from './tipos'

function cliente() {
  if (!supabase) throw new Error('O Supabase não está configurado.')
  return supabase
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().rpc(nome, args)
  if (error) throw new Error(error.message)
  return data as T
}

async function funcao<T>(nome: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().functions.invoke(nome, { body })
  if (error) {
    // As Edge Functions devolvem { erro } com a mensagem em português.
    const ctx = (error as { context?: Response }).context
    try {
      const j = ctx ? await ctx.json() : null
      if (j?.erro) throw new Error(j.erro)
    } catch (e) {
      if (e instanceof Error && e.message) throw e
    }
    throw new Error('O servidor não respondeu. Tenta outra vez.')
  }
  return data as T
}

// A confirmação pela Henrik Dev API é pedida por quem estiver a ver a partida, no máximo a cada 20 s.
const ultimoProcessamento = new Map<string, number>()
function processar(id: string) {
  const agora = Date.now()
  if ((ultimoProcessamento.get(id) ?? 0) > agora - 20_000) return
  ultimoProcessamento.set(id, agora)
  cliente().functions.invoke('processar-partida', { body: { matchId: id } }).catch(() => {})
}

async function depoisDeAvancar(p: Partida | null) {
  if (p && p.estado === 'PROCESSING_API' && !p.simulada) processar(p.id)
  return p
}

export const dadosSupabase: Dados = {
  modo: 'supabase',

  async sessao() {
    const { data } = await cliente().auth.getSession()
    if (!data.session) return null
    const p = await rpc<Perfil | null>('meu_perfil')
    return p ? { perfilId: p.id, incompleta: !p.riotId } : null
  },

  aoMudarSessao(cb) {
    const { data } = cliente().auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') cb()
    })
    return () => data.subscription.unsubscribe()
  },

  async entrarComDiscord() {
    const { error } = await cliente().auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin } })
    if (error) throw new Error('Não foi possível abrir o Discord. Tenta outra vez.')
  },

  async entrarComPassword(utilizador, password) {
    const s = await funcao<{ access_token: string; refresh_token: string }>('entrar', { utilizador, password })
    const { error } = await cliente().auth.setSession(s)
    if (error) throw new Error('Utilizador ou palavra-passe errados.')
  },

  async definirPassword(password) {
    const p = await rpc<Perfil>('meu_perfil')
    if (password.length < 10) throw new Error('A palavra-passe precisa de 10 caracteres ou mais.')
    if (p && password.toLowerCase().includes(p.utilizador.toLowerCase())) throw new Error('A palavra-passe não pode conter o teu utilizador.')
    const { error } = await cliente().auth.updateUser({ password })
    if (error) throw new Error('Não foi possível guardar a palavra-passe.')
    await rpc('marcar_password')
  },

  async ligarRiotId(riotId, regiao) {
    if (!PADRAO_RIOT_ID.test(riotId.trim())) throw new Error('O Riot ID tem o formato Nome#TAG, por exemplo Nyx#4521.')
    const r = await funcao<{ perfil: Perfil }>('sincronizar-rank', { riotId: riotId.trim(), regiao })
    return r.perfil
  },

  async definirAvatar(imagem) {
    const sb = cliente()
    const { data } = await sb.auth.getUser()
    const uid = data.user?.id
    if (!uid) throw new Error('Tens de entrar na tua conta.')
    const pasta = sb.storage.from('avatars')
    // Cada utilizador só escreve na própria pasta (avatars/<id>/), e o bucket só aceita PNG, JPG e WebP.
    const antigos = (await pasta.list(uid)).data?.map((f) => `${uid}/${f.name}`) ?? []
    let url: string | null = null
    if (imagem) {
      const ext = imagem.type === 'image/webp' ? 'webp' : imagem.type === 'image/png' ? 'png' : 'jpg'
      const caminho = `${uid}/${Date.now()}.${ext}`
      const { error } = await pasta.upload(caminho, imagem, { contentType: imagem.type, upsert: false })
      if (error) throw new Error('Não foi possível enviar a imagem. Usa PNG, JPG ou WebP até 1 MB.')
      url = pasta.getPublicUrl(caminho).data.publicUrl
    }
    const perfil = await rpc<Perfil>('definir_avatar', { p_url: url })
    if (antigos.length) await pasta.remove(antigos).catch(() => {})
    return perfil
  },

  async sair() {
    await rpc('sair_fila').catch(() => {})
    await cliente().auth.signOut()
  },

  meuPerfil: () => rpc<Perfil | null>('meu_perfil'),
  perfilPorRiotId: (riotId) => rpc<Perfil | null>('perfil_por_riot', { p_riot: riotId }),

  atualizarPerfil: (alt) => rpc<Perfil>('atualizar_perfil', {
    p_regiao: alt.regiao ?? null,
    p_funcao_jogo: alt.funcaoJogo ?? null,
    p_mudar_funcao_jogo: alt.funcaoJogo !== undefined,
  }),

  async marcarTourVisto(visto) { await rpc('marcar_tour', { p_visto: visto }) },
  sincronizarRank: () => funcao('sincronizar-rank', {}),
  estatisticas: (perfilId) => rpc<EstatisticasPerfil>('estatisticas_perfil', { p_perfil: perfilId }),
  forma: (perfilId, n) => rpc<PontoForma[]>('forma_perfil', { p_perfil: perfilId, p_n: n }),

  async ranking({ cursor, limite = 50, soAmigos = false, pesquisa = '' }) {
    const inicio = cursor ? Number(cursor) : 0
    const r = await rpc<{ linhas: PaginaLinhas; total: number }>('ranking', { p_offset: inicio, p_limite: limite, p_so_amigos: soAmigos, p_pesquisa: pesquisa })
    return { linhas: r.linhas, total: r.total, cursor: inicio + limite < r.total ? String(inicio + limite) : null }
  },

  posicao: (perfilId) => rpc<number>('posicao', { p_perfil: perfilId }),

  estadoFila: () => rpc<EstadoFila>('estado_fila'),
  async entrarFila() { await rpc('entrar_fila') },
  async sairFila() { await rpc('sair_fila') },
  partidaAtiva: () => rpc<Partida | null>('partida_ativa'),
  partida: (id) => rpc<Partida | null>('partida_detalhe', { p_match: id }),
  avancarPartida: async (id) => depoisDeAvancar(await rpc<Partida | null>('avancar_partida', { p_match: id })),
  async responderConfirmacao(id, aceita) { await rpc('responder_confirmacao', { p_match: id, p_aceita: aceita }) },
  async escolherJogador(id, perfilId) { await rpc('escolher_jogador', { p_match: id, p_jogador: perfilId }) },
  async banirMapa(id, mapa) { await rpc('banir_mapa', { p_match: id, p_mapa: mapa }) },
  async definirCodigo(id, codigo) { await rpc('definir_codigo', { p_match: id, p_codigo: codigo.trim().toUpperCase() }) },
  async submeterResultado(id, a, b) { await rpc('submeter_resultado', { p_match: id, p_a: a, p_b: b }) },

  async devEncherFila({ serCapitao }) { await rpc('dev_encher_fila', { p_ser_capitao: serCapitao }) },
  async devCompletarFila({ serCapitao }) { await rpc('dev_completar_fila', { p_ser_capitao: serCapitao }) },
  async devSimularPartida() { await rpc('dev_simular_partida') },
  async devSaltarBloqueio(id) { await rpc('dev_saltar_bloqueio', { p_match: id }) },
  async devAcelerar(id) { await rpc('dev_acelerar', { p_match: id }) },

  partidas: ({ minhas, cursor, mapa, perfilId }) => rpc<{ linhas: ResumoPartida[]; cursor: string | null }>('historico', {
    p_perfil: perfilId ?? null, p_minhas: minhas, p_mapa: mapa ?? null, p_offset: cursor ? Number(cursor) : 0,
  }),

  async jogadoresDaPartida(id) {
    const p = await rpc<Partida | null>('partida_detalhe', { p_match: id })
    return p?.jogadores ?? []
  },

  missoes: () => rpc<Missao[]>('missoes'),
  amigos: () => rpc<Amizade[]>('amigos'),
  async pedirAmizade(alvo) { await rpc('pedir_amizade', { p_alvo: alvo }) },
  async responderAmizade(perfilId, aceitar) { await rpc('responder_amizade', { p_perfil: perfilId, p_aceitar: aceitar }) },
  async removerAmigo(perfilId) { await rpc('remover_amigo', { p_perfil: perfilId }) },

  sugestoes: (ordem) => rpc<Sugestao[]>('sugestoes', { p_ordem: ordem }),
  async criarSugestao({ titulo, categoria, descricao }) { await rpc('criar_sugestao', { p_titulo: titulo, p_categoria: categoria, p_descricao: descricao }) },
  async votar(id) { await rpc('votar', { p_sugestao: id }) },
  async denunciar(perfilId, motivo, detalhes) { await rpc('denunciar', { p_alvo: perfilId, p_motivo: motivo, p_detalhes: detalhes }) },

  disputas: () => rpc<Partida[]>('disputas'),
  async resolverDisputa(id, r) { await rpc('resolver_disputa', { p_match: id, p_a: r?.a ?? null, p_b: r?.b ?? null }) },
  partidasEncravadas: () => rpc<Partida[]>('partidas_encravadas'),
  async cancelarPartida(id) { await rpc('cancelar_partida', { p_match: id }) },
  async removerPartida(id) { await rpc('remover_partida', { p_match: id }) },
  async definirPontos(perfilId, pontos) { await rpc('definir_pontos', { p_perfil: perfilId, p_pontos: pontos }) },
  denuncias: () => rpc<Denuncia[]>('denuncias'),
  async tratarDenuncia(id, estado) { await rpc('tratar_denuncia', { p_id: id, p_estado: estado }) },
  pesquisarJogadores: (q) => rpc<Perfil[]>('pesquisar_jogadores', { p_q: q }),
  async definirFuncao(perfilId, f) { await rpc('definir_funcao', { p_perfil: perfilId, p_funcao: f }) },
}

type PaginaLinhas = Awaited<ReturnType<Dados['ranking']>>['linhas']
