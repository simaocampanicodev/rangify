/**
 * Modo a sério: Supabase. A lógica toda vive na base de dados (RPCs
 * "security definer" que fazem de máquina de estados) e as funções devolvem
 * já o JSON com os nomes que as páginas usam, por isso aqui é quase só passar.
 * O que precisa de chaves secretas (Henrik Dev API, login por utilizador)
 * passa pelas Edge Functions.
 */
import { chaveSupabase, supabase, urlSupabase } from '../supabase'
import { avisarMudanca, type Mudanca } from './eventos'
import { PADRAO_RIOT_ID } from '../regras'
import type { Cosmeticos } from '../loja'
import type {
  Amizade, Dados, Denuncia, EstadoDiscord, EstadoLoja, RecargaPartida, RankingRs, EstadoFila, EstatisticasPerfil, Experiencia, LinhaNivel, Missao, Novidade, TesteApi, Partida, Perfil, PaginaPartidas, PontoForma, Sugestao,
} from './tipos'

/**
 * O token da sessão, guardado à parte: quando o separador está a fechar já não dá tempo
 * de o pedir (é assíncrono) e o pedido de saída da fila precisa dele.
 */
let token: string | null = null
if (supabase) {
  supabase.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null }).catch(() => {})
  supabase.auth.onAuthStateChange((_evento, s) => { token = s?.access_token ?? null })
}

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

/** Partidas com RS precisas para entrar na tabela do Rangify Score. */
const MINIMO_RS = 1

/** Fica a true se a base de dados ainda não tiver a função situacao (migração 0009). */
let semSituacao = false

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
  async entrarFila() {
    try {
      await rpc('entrar_fila')
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('servidor de Discord')) throw e
      // A verificação vale 30 minutos: se expirou, pergunta outra vez ao Discord e tenta de novo.
      const d = await dadosSupabase.estadoDiscord(true)
      if (!d.membro) throw e
      await rpc('entrar_fila')
    }
  },
  async sairFila() { await rpc('sair_fila') },
  async batimentoFila() {
    try {
      await rpc('fila_batimento')
    } catch { /* sem a migração 0023 não há sinal de vida, e também ninguém é tirado por falta dele */ }
  },
  sairFilaAoFechar() {
    if (!token || !urlSupabase || !chaveSupabase) return
    // keepalive: o browser conclui o pedido mesmo com o separador já fechado.
    fetch(`${urlSupabase}/rest/v1/rpc/sair_fila`, {
      method: 'POST', keepalive: true, body: '{}',
      headers: { 'Content-Type': 'application/json', apikey: chaveSupabase, Authorization: `Bearer ${token}` },
    }).catch(() => {})
  },
  partidaAtiva: () => rpc<Partida | null>('partida_ativa'),
  partida: (id) => rpc<Partida | null>('partida_detalhe', { p_match: id }),
  avancarPartida: async (id) => depoisDeAvancar(await rpc<Partida | null>('avancar_partida', { p_match: id })),

  async situacao(ultima) {
    if (!semSituacao) {
      try {
        const r = await rpc<{ fila: EstadoFila; partida: Partida | null }>('situacao', { p_partida: ultima })
        return { fila: r.fila, partida: await depoisDeAvancar(r.partida) }
      } catch (e) {
        // Base de dados ainda sem a migração 0009: segue pelo caminho antigo.
        if (!/situacao|PGRST202|Could not find/i.test(e instanceof Error ? e.message : String(e))) throw e
        semSituacao = true
      }
    }
    const [fila, ativa] = await Promise.all([rpc<EstadoFila>('estado_fila'), rpc<Partida | null>('partida_ativa')])
    const id = ativa?.id ?? ultima
    const partida = id ? await depoisDeAvancar(await rpc<Partida | null>('avancar_partida', { p_match: id })) : null
    return { fila, partida }
  },
  async responderConfirmacao(id, aceita) { await rpc('responder_confirmacao', { p_match: id, p_aceita: aceita }) },
  async escolherJogador(id, perfilId) { await rpc('escolher_jogador', { p_match: id, p_jogador: perfilId }) },
  async banirMapa(id, mapa) { await rpc('banir_mapa', { p_match: id, p_mapa: mapa }) },
  async escolherLado(id, lado) { await rpc('escolher_lado', { p_match: id, p_lado: lado }) },
  async sugerirMapa(id, valor) { await rpc('sugerir_mapa', { p_match: id, p_valor: valor }) },
  async votarCancelar(id, voto) { await rpc('votar_cancelar', { p_match: id, p_voto: voto }) },
  async definirCodigo(id, codigo) { await rpc('definir_codigo', { p_match: id, p_codigo: codigo.trim().toUpperCase() }) },
  async submeterResultado(id, a, b) { await rpc('submeter_resultado', { p_match: id, p_a: a, p_b: b }) },

  async devEncherFila({ serCapitao }) { await rpc('dev_encher_fila', { p_ser_capitao: serCapitao }) },
  async devCompletarFila({ serCapitao }) { await rpc('dev_completar_fila', { p_ser_capitao: serCapitao }) },
  async devSimularPartida() { await rpc('dev_simular_partida') },
  async devSaltarBloqueio(id) { await rpc('dev_saltar_bloqueio', { p_match: id }) },
  async devAcelerar(id) { await rpc('dev_acelerar', { p_match: id }) },

  async partidas({ minhas, cursor, mapa, perfilId, limite }) {
    const args = { p_perfil: perfilId ?? null, p_minhas: minhas, p_mapa: mapa ?? null, p_offset: cursor ? Number(cursor) : 0 }
    if (!limite) return rpc<PaginaPartidas>('historico', args)
    // Sem a migração 0022 o servidor não conhece p_limite: pede o padrão (20) e o cursor continua certo.
    return rpc<PaginaPartidas>('historico', { ...args, p_limite: limite }).catch((e) => {
      if (e instanceof Error && /historico|p_limite/.test(e.message)) return rpc<PaginaPartidas>('historico', args)
      throw e
    })
  },

  async jogadoresDaPartida(id) {
    const p = await rpc<Partida | null>('partida_detalhe', { p_match: id })
    return p?.jogadores ?? []
  },

  missoes: () => rpc<Missao[]>('missoes'),
  experiencia: (perfilId) => rpc<Experiencia>('experiencia', { p_perfil: perfilId ?? null }),
  rankingNivel: (limite = 50) => rpc<LinhaNivel[]>('ranking_nivel', { p_limite: limite }),
  rankingRs: (limite = 50) => rpc<RankingRs>('ranking_rs', { p_limite: limite, p_minimo: MINIMO_RS }).catch((e) => {
    // Sem a versão mais recente da migração 0013, a função não existe no servidor.
    if (e instanceof Error && /ranking_rs/.test(e.message)) throw new Error('A tabela do Rangify Score ainda não está ativa no servidor.')
    throw e
  }),
  resetarMissoes: () => rpc<Missao[]>('resetar_missoes'),
  amigos: () => rpc<Amizade[]>('amigos'),
  aoMudarJogo(perfilId, partidaId, cb) {
    let canal = cliente().channel(`jogo-${perfilId}-${partidaId ?? 'fila'}`)
      // Alguém entrou ou saiu da fila (a contagem muda).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, cb)
      // A sala encheu e entraste numa partida.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_players', filter: `profile_id=eq.${perfilId}` }, cb)
    // A tua partida avançou: escolhas, bans, código, resultado.
    if (partidaId) canal = canal.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${partidaId}` }, cb)
    canal.subscribe()
    return () => { cliente().removeChannel(canal) }
  },
  aoMudarAmizades(perfilId, cb) {
    // Pedidos que te chegam e pedidos teus que foram aceites. As remoções não se
    // filtram no servidor: confirma-se aqui se a amizade era tua.
    const canal = cliente().channel(`amizades-${perfilId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friends', filter: `addressee=eq.${perfilId}` }, cb)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friends', filter: `requester=eq.${perfilId}` }, cb)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'friends' }, (m) => {
        const antigo = m.old as { requester?: string; addressee?: string }
        if (antigo.requester === perfilId || antigo.addressee === perfilId) cb()
      })
      .subscribe()
    return () => { cliente().removeChannel(canal) }
  },
  async pedirAmizade(alvo) { await rpc('pedir_amizade', { p_alvo: alvo }) },
  async responderAmizade(perfilId, aceitar) { await rpc('responder_amizade', { p_perfil: perfilId, p_aceitar: aceitar }) },
  async removerAmigo(perfilId) { await rpc('remover_amigo', { p_perfil: perfilId }) },

  sugestoes: (ordem) => rpc<Sugestao[]>('sugestoes', { p_ordem: ordem }),
  async criarSugestao({ titulo, categoria, descricao }) { await rpc('criar_sugestao', { p_titulo: titulo, p_categoria: categoria, p_descricao: descricao }) },
  async votar(id) { await rpc('votar', { p_sugestao: id }) },
  async definirEstadoSugestao(id, estado) { await rpc('definir_estado_sugestao', { p_id: id, p_estado: estado }) },
  async apagarSugestao(id) { await rpc('apagar_sugestao', { p_id: id }) },
  async denunciar(perfilId, motivo, detalhes) { await rpc('denunciar', { p_alvo: perfilId, p_motivo: motivo, p_detalhes: detalhes }) },

  novidades: (limite = 5) => rpc<Novidade[]>('novidades', { p_limite: limite }),
  criarNovidade: (n) => rpc<Novidade[]>('criar_novidade', { p_data: n.data, p_titulo: n.titulo, p_texto: n.texto }),
  apagarNovidade: (id) => rpc<Novidade[]>('apagar_novidade', { p_id: id }),
  testarApi: () => funcao<TesteApi>('testar-api', {}),
  async estadoDiscord(verificar) {
    // Sem a migração 0012, a fila não exige nada.
    const base = (await rpc<EstadoDiscord | null>('discord_fila').catch(() => null))
      ?? { obrigatorio: false, convite: null, membro: null, verificadoEm: null }
    if (!verificar || !base.obrigatorio) return base
    const r = await funcao<{ membro: boolean }>('verificar-discord', {})
    return { ...base, membro: r.membro, verificadoEm: new Date().toISOString() }
  },
  definirDiscordFila: (obrigatorio, convite) => rpc<EstadoDiscord>('definir_discord_fila', { p_obrigatorio: obrigatorio, p_convite: convite }),
  publicarPingDiscord: () => funcao<{ mensagem: string; editada: boolean }>('discord-ping', {}),
  discordPartida: (id) => rpc<{ servidor: string; chat: string; call: string } | null>('discord_partida', { p_match: id }),
  puxarCall: (id) => funcao<{ movido: boolean; foraDaVoz?: boolean }>('puxar-call', { matchId: id }),

  lojaVisivel: () => rpc<boolean>('loja_visivel'),
  loja: () => rpc<EstadoLoja>('loja'),
  comprarItem: (id) => rpc<EstadoLoja>('comprar_item', { p_item: id }),
  equiparItem: (id) => rpc<EstadoLoja>('equipar_item', { p_item: id }),
  desequiparItem: (categoria) => rpc<EstadoLoja>('desequipar_item', { p_categoria: categoria }),
  definirAvatarGif: (url) => rpc<EstadoLoja>('definir_avatar_gif', { p_url: url }),
  cosmeticos: (ids) => rpc<Record<string, Cosmeticos>>('cosmeticos', { p_ids: ids }),
  definirLojaPublica: (publica) => rpc<EstadoLoja>('definir_loja_publica', { p_publica: publica }),
  lojaResetar: () => rpc<EstadoLoja>('loja_resetar'),
  lojaMoedasTeste: (quantidade) => rpc<EstadoLoja>('loja_moedas_teste', { p_quantidade: quantidade }),
  lojaDevolver: (id) => rpc<EstadoLoja>('loja_devolver', { p_item: id }),

  poolMapas: () => rpc<string[]>('pool_mapas'),
  definirPoolMapas: (mapas) => rpc<string[]>('definir_pool_mapas', { p_mapas: mapas }),

  disputas: () => rpc<Partida[]>('disputas'),
  async resolverDisputa(id, r) { await rpc('resolver_disputa', { p_match: id, p_a: r?.a ?? null, p_b: r?.b ?? null }) },
  resultadosPendentes: () => rpc<Partida[]>('resultados_pendentes'),
  async submeterResultadoStaff(id, r) { await rpc('staff_submeter_resultado', { p_match: id, p_a: r.a, p_b: r.b }) },
  partidasAoVivo: () => rpc<Partida[]>('partidas_ao_vivo'),
  async cancelarPartida(id) { await rpc('cancelar_partida', { p_match: id }) },
  async removerPartida(id) { await rpc('remover_partida', { p_match: id }) },
  async recarregarPartida(id, simulada) {
    if (simulada) return { ...(await rpc<Omit<RecargaPartida, 'fonte'>>('recalcular_partida', { p_match: id })), fonte: 'teste' }
    return funcao<RecargaPartida>('recarregar-partida', { matchId: id })
  },
  async definirPontos(perfilId, pontos) { await rpc('definir_pontos', { p_perfil: perfilId, p_pontos: pontos }) },
  denuncias: () => rpc<Denuncia[]>('denuncias'),
  async tratarDenuncia(id, estado) { await rpc('tratar_denuncia', { p_id: id, p_estado: estado }) },
  pesquisarJogadores: (q) => rpc<Perfil[]>('pesquisar_jogadores', { p_q: q }),
  async definirFuncao(perfilId, f) { await rpc('definir_funcao', { p_perfil: perfilId, p_funcao: f }) },
}

/**
 * Depois de cada ação que muda dados, avisa as páginas que os mostram, como faz o
 * modo demo. Sem isto, o que acabaste de fazer (publicar uma sugestão, votar,
 * resolver uma disputa, aceitar um amigo...) só aparecia depois de recarregar.
 */
const AVISOS: Partial<Record<keyof Dados, Mudanca[]>> = {
  definirPassword: ['perfil'], ligarRiotId: ['perfil'], definirAvatar: ['perfil'], atualizarPerfil: ['perfil'],
  marcarTourVisto: ['perfil'], sincronizarRank: ['perfil'],
  entrarFila: ['fila'], sairFila: ['fila'],
  responderConfirmacao: ['partida'], escolherJogador: ['partida'], banirMapa: ['partida'], escolherLado: ['partida'], sugerirMapa: ['partida'], votarCancelar: ['partida'], definirCodigo: ['partida'],
  submeterResultado: ['partida'], devEncherFila: ['partida'], devCompletarFila: ['partida'], devSimularPartida: ['partida'],
  devSaltarBloqueio: ['partida'], devAcelerar: ['partida'],
  pedirAmizade: ['amigos'], responderAmizade: ['amigos'], removerAmigo: ['amigos'],
  criarSugestao: ['sugestoes'], votar: ['sugestoes'], definirEstadoSugestao: ['sugestoes', 'staff'], apagarSugestao: ['sugestoes', 'staff'], denunciar: ['staff'],
  criarNovidade: ['staff'], apagarNovidade: ['staff'], definirPoolMapas: ['staff'], definirDiscordFila: ['staff'], resetarMissoes: ['staff'],
  resolverDisputa: ['staff', 'partida'], submeterResultadoStaff: ['staff', 'partida'], cancelarPartida: ['staff', 'partida'], removerPartida: ['partida', 'perfil'], recarregarPartida: ['partida', 'perfil', 'staff'],
  definirPontos: ['perfil', 'staff'], tratarDenuncia: ['staff'], definirFuncao: ['staff'],
  comprarItem: ['loja'], equiparItem: ['loja'], desequiparItem: ['loja'], definirAvatarGif: ['loja'], definirLojaPublica: ['loja', 'staff'],
  lojaResetar: ['loja'], lojaMoedasTeste: ['loja'], lojaDevolver: ['loja'],
}
for (const [nome, tipos] of Object.entries(AVISOS)) {
  const tabela = dadosSupabase as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
  const original = tabela[nome]
  tabela[nome] = async (...args) => {
    const r = await original.apply(dadosSupabase, args)
    tipos.forEach(avisarMudanca)
    return r
  }
}

type PaginaLinhas = Awaited<ReturnType<Dados['ranking']>>['linhas']
