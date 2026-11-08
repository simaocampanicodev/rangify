/**
 * Modo a sério: Supabase. A lógica toda vive na base de dados (RPCs
 * "security definer" que fazem de máquina de estados) e as funções devolvem
 * já o JSON com os nomes que as páginas usam, por isso aqui é quase só passar.
 * O que precisa de chaves secretas (Henrik Dev API, login por utilizador)
 * passa pelas Edge Functions.
 */
import { chaveSupabase, supabase, urlSupabase } from '../supabase'
import { avisarMudanca } from './eventos'
import { PADRAO_RIOT_ID } from '../jogo/regras'
import type { Cosmeticos } from '../personalizacao/loja'
import type { Saude, SaudeResumo } from './tipos'
import type {
  ConviteTorneio, JogadorSugerido, TorneioDetalhe, TorneioResumo,
  Amizade, AvisoStaff, ConvitesInfo, ResumoCargosRanked, Dados, DivulgacaoEstado, OverlayDados, StreamerAoVivo, TwitchConta, Denuncia, EstadoDiscord, EstadoLoja, JogadorStaff, RecargaPartida, RankingAgentes, RankingRs, EstadoFila, FilasFechadas, EstatisticasPerfil, Experiencia, LinhaNivel, Missao, Novidade, TesteApi, Partida, Perfil, PaginaPartidas, PontoForma, ResultadoAnuncio, ResumoEstatisticas, Sugestao,
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

/** Só envia p_fila quando há fila: sem ela as funções usam o seu valor por omissão. */
const argFila = (fila?: string | null) => (fila ? { p_fila: fila } : {})

async function depoisDeAvancar(p: Partida | null) {
  if (p && p.estado === 'PROCESSING_API' && !p.simulada) processar(p.id)
  return p
}

export const dadosSupabase: Dados = {
  modo: 'supabase',
  realtime: true,

  async sessao() {
    const { data } = await cliente().auth.getSession()
    if (!data.session) return null
    const p = await rpc<Perfil | null>('meu_perfil')
    return p ? { perfilId: p.id, incompleta: !p.riotId } : null
  },

  aoMudarSessao(cb) {
    // O supabase-js repete o SIGNED_IN sempre que o separador volta a ficar à frente. Cada repetição recarregava o perfil e
    // apagava as decorações de toda a gente (centenas de pedidos por hora): só conta quando a conta muda de facto.
    let conta: string | null | undefined
    const { data } = cliente().auth.onAuthStateChange((evento, sessao) => {
      const id = sessao?.user?.id ?? null
      if (evento === 'INITIAL_SESSION') { conta = id; return }
      if (evento === 'USER_UPDATED') { cb(); return }
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') {
        if (id === conta) return
        conta = id
        cb()
      }
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
  estatisticasResumo: (ids) => rpc<Record<string, ResumoEstatisticas>>('estatisticas_resumo', { p_ids: ids }),
  estatisticas: (perfilId, fila) => rpc<EstatisticasPerfil>('estatisticas_perfil', { p_perfil: perfilId, ...argFila(fila) }),
  forma: (perfilId, n, fila) => rpc<PontoForma[]>('forma_perfil', { p_perfil: perfilId, p_n: n, ...argFila(fila) }),

  async ranking({ cursor, limite = 50, soAmigos = false, pesquisa = '', fila }) {
    const inicio = cursor ? Number(cursor) : 0
    const r = await rpc<{ linhas: PaginaLinhas; total: number }>('ranking', { p_offset: inicio, p_limite: limite, p_so_amigos: soAmigos, p_pesquisa: pesquisa, ...argFila(fila) })
    return { linhas: r.linhas, total: r.total, cursor: inicio + limite < r.total ? String(inicio + limite) : null }
  },

  posicao: (perfilId, fila) => rpc<number>('posicao', { p_perfil: perfilId, ...argFila(fila) }),

  estadoFila: () => rpc<EstadoFila>('estado_fila'),
  async entrarFila(fila = 'aberta') {
    const args = { p_fila: fila }
    try {
      await rpc('entrar_fila', args)
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('servidor de Discord')) throw e
      // A verificação vale 30 minutos: se expirou, pergunta outra vez ao Discord e tenta de novo.
      const d = await dadosSupabase.estadoDiscord(true)
      if (!d.membro) throw e
      await rpc('entrar_fila', args)
    }
  },
  definirFilaFechada: (fila, fechada, motivo) => rpc<FilasFechadas>('definir_fila_fechada', { p_fila: fila, p_fechada: fechada, p_motivo: motivo?.trim() || null }),
  async sairFila() { await rpc('sair_fila') },
  async batimentoFila() {
    await rpc('fila_batimento').catch(() => {}) // o próximo batimento repete
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
    const r = await rpc<{ fila: EstadoFila; partida: Partida | null }>('situacao', { p_partida: ultima })
    return { fila: r.fila, partida: await depoisDeAvancar(r.partida) }
  },
  async responderConfirmacao(id, aceita) { await rpc('responder_confirmacao', { p_match: id, p_aceita: aceita }) },
  async escolherJogador(id, perfilId) { await rpc('escolher_jogador', { p_match: id, p_jogador: perfilId }) },
  async banirMapa(id, mapa) { await rpc('banir_mapa', { p_match: id, p_mapa: mapa }) },
  async escolherLado(id, lado) { await rpc('escolher_lado', { p_match: id, p_lado: lado }) },
  async sugerirMapa(id, valor) { await rpc('sugerir_mapa', { p_match: id, p_valor: valor }) },
  async votarCancelar(id, voto) { await rpc('votar_cancelar', { p_match: id, p_voto: voto }) },
  async definirCodigo(id, codigo) { await rpc('definir_codigo', { p_match: id, p_codigo: codigo.trim().toUpperCase() }) },
  async submeterResultado(id, vencedor) { await rpc('submeter_resultado', { p_match: id, p_vencedor: vencedor }) },

  async devEncherFila({ serCapitao, fila }) { await rpc('dev_encher_fila', { p_ser_capitao: serCapitao, ...argFila(fila) }) },
  async devCompletarFila({ serCapitao }) { await rpc('dev_completar_fila', { p_ser_capitao: serCapitao }) },
  async devSimularPartida() { await rpc('dev_simular_partida') },
  async devSaltarBloqueio(id) { await rpc('dev_saltar_bloqueio', { p_match: id }) },
  async devAcelerar(id) { await rpc('dev_acelerar', { p_match: id }) },

  partidas: ({ minhas, cursor, mapa, perfilId, limite, fila }) => rpc<PaginaPartidas>('historico', {
    p_perfil: perfilId ?? null, p_minhas: minhas, p_mapa: mapa ?? null, p_offset: cursor ? Number(cursor) : 0,
    ...(limite ? { p_limite: limite } : {}), ...argFila(fila),
  }),

  async jogadoresDaPartida(id) {
    const p = await rpc<Partida | null>('partida_detalhe', { p_match: id })
    return p?.jogadores ?? []
  },

  missoes: () => rpc<Missao[]>('missoes'),
  experiencia: (perfilId) => rpc<Experiencia>('experiencia', { p_perfil: perfilId ?? null }),
  rankingNivel: (limite = 50) => rpc<LinhaNivel[]>('ranking_nivel', { p_limite: limite }),
  rankingRs: (limite = 50) => rpc<RankingRs>('ranking_rs', { p_limite: limite, p_minimo: MINIMO_RS }),
  rankingAgentes: (opts) => rpc<RankingAgentes>('ranking_agentes', { p_minimo: opts?.minimo ?? 1, p_top: opts?.top ?? 5 }),
  resetarMissoes: () => rpc<Missao[]>('resetar_missoes'),
  amigos: () => rpc<Amizade[]>('amigos'),
  aoMudarJogo(perfilId, partidaId, cb) {
    let canal = cliente().channel(`jogo-${perfilId}-${partidaId ?? 'fila'}`)
    if (partidaId) {
      // Dentro de uma partida só interessa a própria partida (escolhas, bans, código, resultado). A fila e as salas dos
      // outros não: cada aviso a mais era uma verificação de permissões no Realtime e uma pergunta a mais à base de dados.
      canal = canal.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${partidaId}` }, cb)
    } else {
      canal = canal
        // Alguém entrou ou saiu da fila (a contagem muda).
        .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, cb)
        // A sala encheu e entraste numa partida.
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_players', filter: `profile_id=eq.${perfilId}` }, cb)
    }
    canal.subscribe()
    return () => { cliente().removeChannel(canal) }
  },
  sala(partidaId, perfilId, o) {
    // Um canal privado por partida (só os 10 jogadores entram, ver a migração 0040). Se o canal não abrir, ninguém
    // fica pior: cada jogador continua a perguntar por conta própria.
    const canal = cliente().channel(`partida:${partidaId}`, { config: { private: true, presence: { key: perfilId }, broadcast: { self: false } } })
    const desde = Date.now()
    const marcar = () => { canal.track({ desde, visivel: document.visibilityState !== 'hidden' }).catch(() => {}) }
    canal
      .on('presence', { event: 'sync' }, () => {
        const estado = canal.presenceState() as Record<string, { desde?: number; visivel?: boolean }[]>
        o.aoPresencas(Object.fromEntries(Object.entries(estado).map(([id, ps]) => [id, ps.map((x) => ({ desde: Number(x.desde), visivel: x.visivel !== false }))])))
      })
      .on('broadcast', { event: 'estado' }, ({ payload }) => { if (payload && typeof payload === 'object') o.aoReceber(payload as Partida) })
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') { o.aoLigado(true); marcar() }
        else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') o.aoLigado(false)
      })
    document.addEventListener('visibilitychange', marcar)
    return {
      transmitir: (p) => { canal.send({ type: 'broadcast', event: 'estado', payload: p }).catch(() => {}) },
      marcar,
      sair: () => { document.removeEventListener('visibilitychange', marcar); cliente().removeChannel(canal) },
    }
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
    const base = await rpc<EstadoDiscord>('discord_fila')
    if (!verificar || !base.obrigatorio) return base
    const r = await funcao<{ membro: boolean }>('verificar-discord', {})
    return { ...base, membro: r.membro, verificadoEm: new Date().toISOString() }
  },
  definirDiscordFila: (obrigatorio, convite) => rpc<EstadoDiscord>('definir_discord_fila', { p_obrigatorio: obrigatorio, p_convite: convite }),
  publicarPingDiscord: () => funcao<{ mensagem: string; editada: boolean }>('discord-ping', { canal: 'ping' }),
  publicarFilaDiscord: () => funcao<{ mensagem: string; editada: boolean }>('discord-ping', { canal: 'fila' }),
  publicarFilaRankedDiscord: () => funcao<{ mensagem: string; editada: boolean }>('discord-ping', { canal: 'fila-ranked' }),
  publicarAnuncioDiscord: (a) => funcao<ResultadoAnuncio>('discord-anuncio', { ...a }),
  criarCanalAnunciosDiscord: () => funcao<ResultadoAnuncio>('discord-anuncio', { acao: 'canal' }),
  acertarCargosRanked: async () => (await funcao<{ cargos: ResumoCargosRanked }>('discord-ping', { canal: 'cargos' })).cargos,
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
  async submeterResultadoStaff(id, vencedor) { await rpc('staff_submeter_resultado', { p_match: id, p_vencedor: vencedor }) },
  partidasAoVivo: () => rpc<Partida[]>('partidas_ao_vivo'),
  async cancelarPartida(id) { await rpc('cancelar_partida', { p_match: id }) },
  async removerPartida(id) { await rpc('remover_partida', { p_match: id }) },
  async recarregarPartida(id, simulada) {
    if (simulada) return { ...(await rpc<Omit<RecargaPartida, 'fonte'>>('recalcular_partida', { p_match: id })), fonte: 'teste' }
    return funcao<RecargaPartida>('recarregar-partida', { matchId: id })
  },
  async definirPontos(perfilId, pontos, fila) { await rpc('definir_pontos', { p_perfil: perfilId, p_pontos: pontos, ...argFila(fila) }) },
  denuncias: () => rpc<Denuncia[]>('denuncias'),
  async tratarDenuncia(id, estado) { await rpc('tratar_denuncia', { p_id: id, p_estado: estado }) },
  pesquisarJogadores: (q) => rpc<JogadorStaff[]>('pesquisar_jogadores', { p_q: q }),
  async definirFuncao(perfilId, f) { await rpc('definir_funcao', { p_perfil: perfilId, p_funcao: f }) },
  contarJogadores: () => rpc<number>('contar_jogadores'),
  saude: (periodo) => rpc<Saude>('saude', { p_periodo: periodo }),
  saudeResumo: () => rpc<SaudeResumo>('saude_resumo'),
  avisarJogador: (perfilId, mensagem) => rpc<AvisoStaff>('avisar_jogador', { p_perfil: perfilId, p_mensagem: mensagem }),
  banirDaFila: (perfilId, mensagem, horas) => rpc<AvisoStaff>('banir_da_fila', { p_perfil: perfilId, p_mensagem: mensagem, p_horas: horas }),
  async levantarBan(perfilId) { await rpc('levantar_ban', { p_perfil: perfilId }) },
  avisosDoJogador: (perfilId) => rpc<AvisoStaff[]>('avisos_do_jogador', { p_perfil: perfilId }),

  avisoPendente: () => rpc<AvisoStaff | null>('aviso_pendente').catch(() => null),
  async confirmarAviso(id) { await rpc('confirmar_aviso', { p_id: id }) },
  streamersVisivel: () => rpc<boolean>('streamers_visivel').then((v) => !!v).catch(() => false),
  meuOverlay: () => rpc<{ chave: string }>('meu_overlay'),
  renovarOverlay: () => rpc<{ chave: string }>('renovar_overlay'),
  overlayDados: (chave, fila) => rpc<OverlayDados | null>('overlay_dados', { p_chave: chave, ...(fila ? { p_fila: fila } : {}) }),
  minhaTwitch: () => rpc<TwitchConta | null>('minha_twitch').catch(() => null),
  async twitchUrlLigar() {
    const r = await funcao<{ url: string }>('twitch-ligar', { accao: 'url', retorno: window.location.origin })
    return r.url
  },
  async desligarTwitch() { await rpc('desligar_twitch') },
  streamersAoVivo: () => rpc<StreamerAoVivo[]>('streamers_ao_vivo').catch(() => []),
  meuConvite: () => rpc<ConvitesInfo>('meu_convite'),
  usarConvite: (codigo) => rpc<{ convidador: string; moedas: number }>('usar_convite', { p_codigo: codigo }),
  divulgacaoEstado: () => rpc<DivulgacaoEstado>('divulgacao_estado'),
  definirStreamersPublico: (publico) => rpc<DivulgacaoEstado>('definir_streamers_publico', { p_publico: publico }),

  // ---------------------------------------------------------------- torneios
  torneiosVisivel: () => rpc<boolean>('torneios_visivel').catch(() => false),
  torneiosAreaAberta: () => rpc<boolean>('torneio_area_aberta'),
  torneiosDefinirArea: (aberta) => rpc<boolean>('torneio_definir_area', { p_aberta: aberta }),
  torneiosLista: () => rpc<TorneioResumo[]>('torneios_lista'),
  torneioDetalhe: (id) => rpc<TorneioDetalhe>('torneio_detalhe', { p_torneio: id }),
  meusConvitesTorneio: () => rpc<ConviteTorneio[]>('meus_convites_torneio').catch(() => []),
  torneioProcurarJogadores: (q) => rpc<JogadorSugerido[]>('torneio_procurar_jogadores', { p_q: q }),
  torneioCriarEquipa: (torneio, nome, funcao = 'jogador') => rpc<string>('torneio_criar_equipa', { p_torneio: torneio, p_nome: nome, p_funcao: funcao }),
  async torneioRenomearEquipa(equipa, nome) { await rpc('torneio_renomear_equipa', { p_equipa: equipa, p_nome: nome }) },
  torneioConvidar: (equipa, nome, funcao) => rpc<JogadorSugerido>('torneio_convidar', { p_equipa: equipa, p_nome: nome, p_funcao: funcao }),
  async torneioResponderConvite(equipa, aceitar) { await rpc('torneio_responder_convite', { p_equipa: equipa, p_aceitar: aceitar }) },
  async torneioRemoverMembro(equipa, perfil) { await rpc('torneio_remover_membro', { p_equipa: equipa, p_perfil: perfil }) },
  async torneioMudarFuncao(equipa, perfil, funcao) { await rpc('torneio_mudar_funcao', { p_equipa: equipa, p_perfil: perfil, p_funcao: funcao }) },
  async torneioSairEquipa(equipa) { await rpc('torneio_sair_equipa', { p_equipa: equipa }) },
  async torneioApagarEquipa(equipa) { await rpc('torneio_apagar_equipa', { p_equipa: equipa }) },
  async torneioAbrirJogo(jogo, codigo) { await rpc('torneio_abrir_jogo', { p_jogo: jogo, p_codigo: codigo }) },
  async torneioVetoIniciar(jogo) { await rpc('torneio_veto_iniciar', { p_jogo: jogo }) },
  async torneioVetoAgir(jogo, valor) { await rpc('torneio_veto_agir', { p_jogo: jogo, p_valor: valor }) },
  async torneioVetoAvancar(jogo) {
    const jogou = await rpc<boolean>('torneio_veto_avancar', { p_jogo: jogo })
    if (jogou) avisarMudanca('torneios')
    return jogou
  },
  async torneioVetoConcluir(jogo) { await rpc('torneio_veto_concluir', { p_jogo: jogo }) },
  async torneioVetoReiniciar(jogo) { await rpc('torneio_veto_reiniciar', { p_jogo: jogo }) },
  async torneioProcessarJogo(jogo) {
    // No máximo uma vez a cada 20 s por jogo (o servidor ainda limita a 1 consulta por minuto à API).
    const agora = Date.now()
    if ((ultimoProcessamento.get(jogo) ?? 0) > agora - 20_000) return
    ultimoProcessamento.set(jogo, agora)
    try {
      const r = await funcao<{ estado?: string }>('processar-torneio', { jogoId: jogo })
      if (r?.estado === 'concluido') avisarMudanca('torneios')
    } catch { /* o servidor volta a tentar sozinho a cada minuto */ }
  },
  torneioCriar: (p) => rpc<string>('torneio_criar', { p }),
  async torneioEditar(id, p) { await rpc('torneio_editar', { p_torneio: id, p }) },
  async torneioMudarEstado(id, estado) { await rpc('torneio_mudar_estado', { p_torneio: id, p_estado: estado }) },
  async torneioApagar(id) { await rpc('torneio_apagar', { p_torneio: id }) },
  torneioAcesso: (id, nome, dar) => rpc<JogadorSugerido>('torneio_acesso', { p_torneio: id, p_nome: nome, p_dar: dar }),
  torneioAcessos: (id) => rpc<JogadorSugerido[]>('torneio_acessos_lista', { p_torneio: id }),
  torneioStaffAdicionar: (equipa, nome, funcao) => rpc<JogadorSugerido>('torneio_staff_adicionar', { p_equipa: equipa, p_nome: nome, p_funcao: funcao }),
  torneioSortear: (id, seed) => rpc<{ grupos: number; equipas: number; seed: number }>('torneio_sortear', { p_torneio: id, p_seed: seed ?? null }),
  async torneioAgendar(jogo, quando, mapa, presencial, melhorDe) {
    await rpc('torneio_agendar', { p_jogo: jogo, p_quando: quando, p_mapa: mapa ?? null, p_presencial: presencial ?? null, p_melhor_de: melhorDe ?? null })
  },
  torneioAgendarVarios: (itens) => rpc<number>('torneio_agendar_varios', { p_itens: itens }),
  async torneioResolverJogo(jogo, a, b) { await rpc('torneio_resolver_jogo', { p_jogo: jogo, p_a: a, p_b: b }) },
  async torneioWalkover(jogo, vencedor) { await rpc('torneio_walkover', { p_jogo: jogo, p_vencedor: vencedor }) },
  async torneioDesfazerJogo(jogo) { await rpc('torneio_desfazer_jogo', { p_jogo: jogo }) },
  async torneioGerarPlayoffs(id) { await rpc('torneio_gerar_playoffs', { p_torneio: id }) },
  torneioTesteEquipas: (id, n) => rpc<number>('torneio_teste_equipas', { p_torneio: id, p_n: n }),
  torneioTestePreencher: (equipa, completo = false) => rpc<number>('torneio_teste_preencher', { p_equipa: equipa, p_completo: completo }),
  async torneioTesteSimular(jogo) { await rpc('torneio_teste_simular', { p_jogo: jogo }) },
  torneioTesteSimularTudo: (id, soGrupos = false) => rpc<number>('torneio_teste_simular_tudo', { p_torneio: id, p_so_grupos: soGrupos }),
  async torneioTesteReiniciar(id) { await rpc('torneio_teste_reiniciar', { p_torneio: id }) },

  aoMudarAvisos(perfilId, cb) {
    const canal = cliente().channel(`avisos-${perfilId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_avisos', filter: `target_id=eq.${perfilId}` }, cb)
      .subscribe()
    return () => { cliente().removeChannel(canal) }
  },
}

type PaginaLinhas = Awaited<ReturnType<Dados['ranking']>>['linhas']
