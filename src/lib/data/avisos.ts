import { avisarMudanca, type Mudanca } from './eventos'
import type { Dados } from './tipos'

/**
 * O que cada ação muda, para as páginas que o mostram se atualizarem logo. Vale para os dois modos (demo e Supabase):
 * quem escreve uma ação nova só a acrescenta aqui.
 *
 * Ficam de fora, de propósito:
 * - escolher, banir, sugerir e votar para cancelar: não mudam nada fora da partida (a página já se atualiza sozinha) e
 *   avisar 'partida' recarregava o perfil de cada jogador a cada clique;
 * - torneioVetoAvancar e torneioProcessarJogo: só mudam alguma coisa de vez em quando, e quem as chama avisa nessa altura.
 */
const AVISOS: Partial<Record<keyof Dados, Mudanca[]>> = {
  definirPassword: ['perfil'], ligarRiotId: ['perfil'], definirAvatar: ['perfil'], atualizarPerfil: ['perfil'],
  marcarTourVisto: ['perfil'], sincronizarRank: ['perfil'], devMudarFuncao: ['perfil'],
  entrarFila: ['fila'], sairFila: ['fila'], definirFilaFechada: ['fila', 'staff'],
  responderConfirmacao: ['partida'], definirCodigo: ['partida'],
  submeterResultado: ['partida'], devEncherFila: ['partida'], devCompletarFila: ['partida'], devSimularPartida: ['partida'],
  devSaltarBloqueio: ['partida'], devAcelerar: ['partida'], reporDemo: ['partida'],
  pedirAmizade: ['amigos'], responderAmizade: ['amigos'], removerAmigo: ['amigos'],
  criarSugestao: ['sugestoes'], votar: ['sugestoes'], definirEstadoSugestao: ['sugestoes', 'staff'], apagarSugestao: ['sugestoes', 'staff'], denunciar: ['staff'],
  criarNovidade: ['staff'], apagarNovidade: ['staff'], definirPoolMapas: ['staff'], definirDiscordFila: ['staff'], resetarMissoes: ['staff'],
  avisarJogador: ['staff'], banirDaFila: ['staff', 'fila'], levantarBan: ['staff', 'fila'], confirmarAviso: ['perfil'],
  resolverDisputa: ['staff', 'partida'], submeterResultadoStaff: ['staff', 'partida'], cancelarPartida: ['staff', 'partida'], removerPartida: ['partida', 'perfil'], recarregarPartida: ['partida', 'perfil', 'staff'],
  definirPontos: ['perfil', 'staff'], tratarDenuncia: ['staff'], definirFuncao: ['staff'],
  comprarItem: ['loja'], equiparItem: ['loja'], desequiparItem: ['loja'], definirAvatarGif: ['loja'], definirLojaPublica: ['loja', 'staff'],
  lojaResetar: ['loja'], lojaMoedasTeste: ['loja'], lojaDevolver: ['loja'],
  definirStreamersPublico: ['staff', 'streamers'], desligarTwitch: ['streamers'], renovarOverlay: ['streamers'], usarConvite: ['streamers', 'loja'],
  twitchLigarDemo: ['streamers'], twitchAoVivoDemo: ['streamers'], conviteConvidadoDemo: ['streamers', 'loja'],
  torneiosDefinirArea: ['torneios', 'staff'],
  torneioCriarEquipa: ['torneios'], torneioRenomearEquipa: ['torneios'], torneioConvidar: ['torneios'], torneioResponderConvite: ['torneios'],
  torneioRemoverMembro: ['torneios'], torneioMudarFuncao: ['torneios'], torneioSairEquipa: ['torneios'], torneioApagarEquipa: ['torneios'],
  torneioAbrirJogo: ['torneios'], torneioVetoIniciar: ['torneios'], torneioVetoAgir: ['torneios'], torneioVetoConcluir: ['torneios'], torneioVetoReiniciar: ['torneios'],
  torneioCriar: ['torneios'], torneioEditar: ['torneios'], torneioMudarEstado: ['torneios'], torneioApagar: ['torneios'], torneioAcesso: ['torneios'],
  torneioStaffAdicionar: ['torneios'], torneioSortear: ['torneios'], torneioAgendar: ['torneios'], torneioAgendarVarios: ['torneios'],
  torneioResolverJogo: ['torneios'], torneioWalkover: ['torneios'], torneioDesfazerJogo: ['torneios'], torneioGerarPlayoffs: ['torneios'],
  torneioTesteEquipas: ['torneios'], torneioTestePreencher: ['torneios'], torneioTesteSimular: ['torneios'], torneioTesteSimularTudo: ['torneios'], torneioTesteReiniciar: ['torneios'],
}

/** Uma cópia do adaptador em que cada ação da tabela avisa as páginas quando acaba. */
export function comAvisos(adaptador: Dados): Dados {
  const dados = { ...adaptador } as unknown as Record<string, (...a: unknown[]) => unknown>
  for (const [nome, mudancas] of Object.entries(AVISOS)) {
    const original = dados[nome]
    if (!original) continue
    dados[nome] = async (...args) => {
      const r = await original.apply(adaptador, args)
      mudancas.forEach(avisarMudanca)
      return r
    }
  }
  return dados as unknown as Dados
}
