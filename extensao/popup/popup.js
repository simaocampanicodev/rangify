// O popup da extensão: a roda da fila, entrar/sair e as definições do som. Só mostra o que o service worker
// guardou em chrome.storage e manda-lhe os pedidos (entrar, sair, iniciar sessão...).
import { CONFIG } from '../config.js'
import { atualizarHtml } from '../lib/morph.js'
import { rodaSvg } from '../lib/roda.js'
import { agoraServidor, banAtivo, esc, pedir, relogio, textoBan } from '../lib/util.js'

const raiz = document.getElementById('raiz')
let estado = {}
let aTrabalhar = false
let erro = null
let verLogin = false
// O que já foi escrito no formulário de entrada sobrevive aos redesenhos (o utilizador não se apaga depois de um erro).
let utilizadorEscrito = ''

const configurado = !!CONFIG.supabaseUrl && !!CONFIG.supabaseKey

async function carregar() {
  estado = await chrome.storage.local.get(null)
}

/** Corre um pedido ao service worker, com o botão ocupado e o erro (se houver) à vista. */
async function correr(mensagem, depois) {
  aTrabalhar = true
  erro = null
  render()
  try {
    const r = await pedir(mensagem)
    await depois?.(r)
  } catch (e) {
    erro = e.message
    // Faltou o Discord: pede uma verificação ao bot para mostrar o convite e o botão "Já entrei".
    if (/servidor de Discord/.test(e.message)) pedir({ tipo: 'discord', verificar: true }).catch(() => {})
  }
  aTrabalhar = false
  await carregar()
  render()
}

// ------------------------------------------------------------ vistas

const topo = (perfil) => `
  <div class="topo">
    <img src="../icones/icone-48.png" alt="">
    <div class="grow"><div class="nome">Rangify</div></div>
    ${perfil ? `<span class="chip">${esc((perfil.regiao ?? 'eu').toUpperCase())}</span>` : ''}
  </div>`

function vistaSemConfig() {
  return `${topo()}
    <h1 class="titulo">Falta configurar a extensão</h1>
    <p class="texto" style="text-align:left">Esta cópia da extensão não sabe onde está o Rangify. Corre <b>npm run extensao</b> na pasta do projeto e carrega a pasta <b>extensao/dist</b> no browser (ver extensao/LEIA-ME.md).</p>`
}

function vistaLogin() {
  return `${topo()}
    <h1 class="titulo">Entra para veres a fila</h1>
    <p class="texto" style="text-align:left">Com a extensão, a roda da fila e o aviso de partida encontrada ficam sempre contigo, mesmo noutro separador.</p>
    ${erro ? `<p class="erro">${esc(erro)}</p>` : ''}
    <div class="acoes">
      <button class="btn btn-primario btn-largo" data-acao="login-discord" ${aTrabalhar ? 'disabled' : ''}>${aTrabalhar ? 'A entrar…' : 'Entrar com o Discord'}</button>
      <details ${verLogin ? 'open' : ''}>
        <summary>Entrar com utilizador e palavra-passe</summary>
        <form class="form" id="form-login" style="margin-top:8px">
          <input class="campo" name="utilizador" placeholder="Utilizador" autocomplete="username" value="${esc(utilizadorEscrito)}" required>
          <input class="campo" name="password" type="password" placeholder="Palavra-passe" autocomplete="current-password" required>
          <button class="btn btn-fantasma btn-largo" type="submit" ${aTrabalhar ? 'disabled' : ''}>Entrar</button>
        </form>
      </details>
      <button class="link" data-acao="abrir-site">Abrir o Rangify</button>
    </div>`
}

/** O que a roda diz e o que o botão faz, conforme a fila, o ban, o castigo e a partida. */
function situacao() {
  const { fila, partida, perfil, discord, desvio } = estado
  const agora = agoraServidor(desvio)
  const contagem = Math.min(10, fila?.contagem ?? 0)
  const naFila = !!fila?.naFila
  const ban = banAtivo(fila, agora)
  const castigo = !ban && fila?.cooldownAte ? Math.max(0, (Date.parse(fila.cooldownAte) - agora) / 1000) : 0
  const base = { contagem, naFila, viva: naFila }

  if (partida?.estado === 'READY_CHECK' && partida.participo && !partida.euAceitei && !partida.automatica) {
    const restante = Math.max(0, (Date.parse(partida.prazo) - agora) / 1000)
    return { ...base, contagem: 10, legenda: `ACEITA EM ${Math.ceil(restante)}s`, viva: true, texto: '<b>Partida encontrada!</b> Abre o Rangify e aceita.', botao: { rotulo: 'Abrir o Rangify e aceitar', acao: 'abrir-site', primario: true } }
  }
  if (partida) {
    return { ...base, contagem: 10, legenda: 'AO VIVO', viva: true, texto: `Tens a partida <b>${esc(partida.codigo)}</b> a decorrer.`, botao: { rotulo: 'Voltar à partida', acao: 'abrir-site', primario: true } }
  }
  if (naFila) {
    const espera = fila.desde ? Math.max(0, (agora - Date.parse(fila.desde)) / 1000) : 0
    const faltam = 10 - contagem
    return { ...base, legenda: `NA FILA ${relogio(espera)}`, texto: `Faltam <b>${faltam}</b> ${faltam === 1 ? 'jogador' : 'jogadores'}. Quando a sala encher, ouves o aviso aqui.`, botao: { rotulo: 'Sair da fila', acao: 'sair', primario: false } }
  }
  if (ban) {
    return { ...base, legenda: 'BANIDO', viva: false, texto: `Estás banido da fila <b>${esc(textoBan(ban))}</b>.${ban.mensagem ? ` Motivo: ${esc(ban.mensagem)}` : ''}`, botao: { rotulo: 'Banido da fila', desativado: true } }
  }
  if (perfil && !perfil.riotId) {
    return { ...base, legenda: 'SEM RIOT ID', texto: 'Liga o teu Riot ID no site para entrares na fila.', botao: { rotulo: 'Abrir o Rangify', acao: 'abrir-site', primario: true } }
  }
  if (discord?.obrigatorio && discord.membro === false) {
    return { ...base, legenda: 'SEM DISCORD', texto: 'Para entrares na fila tens de estar no servidor de Discord do Rangify, com a conta com que entraste.', discordBloqueado: discord }
  }
  if (castigo > 0) {
    return { ...base, legenda: `CASTIGO ${relogio(castigo)}`, texto: `Não aceitaste a última partida. Podes voltar à fila daqui a <b>${relogio(castigo)}</b>.`, botao: { rotulo: relogio(castigo), desativado: true } }
  }
  return { ...base, legenda: 'À ESPERA DE TI', texto: `${contagem} ${contagem === 1 ? 'jogador está' : 'jogadores estão'} na fila da tua região.`, botao: { rotulo: 'Entrar na fila', acao: 'entrar', primario: true } }
}

function vistaPrincipal() {
  const { perfil, som } = estado
  const s = situacao()
  const ocupado = aTrabalhar ? 'disabled' : ''
  const volume = som?.volume ?? 70
  const ligado = som?.ligado ?? true

  let acoes = ''
  if (s.discordBloqueado) {
    acoes = `
      <div class="linha">
        ${s.discordBloqueado.convite ? `<a class="btn btn-primario" href="${esc(s.discordBloqueado.convite)}" target="_blank" rel="noreferrer">Entrar no Discord</a>` : ''}
        <button class="btn btn-fantasma" data-acao="ja-entrei" ${ocupado}>Já entrei</button>
      </div>`
  } else if (s.botao) {
    acoes = `<button class="btn btn-largo ${s.botao.primario ? 'btn-primario' : 'btn-fantasma'}" data-acao="${s.botao.acao ?? ''}" ${s.botao.desativado || aTrabalhar ? 'disabled' : ''}>${esc(s.botao.rotulo)}</button>`
  }

  return `
    ${topo(perfil)}
    <div class="roda"><div class="caixa" style="width:196px;height:196px">
      ${rodaSvg({ tamanho: 196, contagem: s.contagem, naFila: s.naFila })}
      <div class="centro"><span class="numero">${s.contagem}<small>/10</small></span><span class="legenda ${s.viva ? 'viva respira' : ''}">${esc(s.legenda)}</span></div>
    </div></div>
    <p class="texto">${s.texto}</p>
    ${erro || estado.erro ? `<p class="erro">${esc(erro ?? estado.erro)}</p>` : ''}
    <div class="acoes">
      ${acoes}
      <div class="linha">
        <button class="btn btn-fantasma" data-acao="abrir-site">Abrir o Rangify</button>
        <button class="btn btn-fantasma" data-acao="logout" title="${esc(perfil?.utilizador ?? '')}">Terminar sessão</button>
      </div>
    </div>
    <div class="som">
      <label><input type="checkbox" id="som-ligado" ${ligado ? 'checked' : ''}> Som aqui</label>
      <input type="range" id="som-volume" min="0" max="100" value="${volume}" aria-label="Volume do aviso" ${ligado ? '' : 'disabled'}>
      <button class="link" data-acao="testar-som">Testar</button>
    </div>
    <p class="mudo" style="margin:0;text-align:center">${ligado ? 'O aviso toca na extensão, não no site.' : 'Com o som desligado aqui, o aviso toca no site.'}</p>`
}

// ------------------------------------------------------------ ligação

function render() {
  // Atualiza só o que mudou: os botões e a roda são sempre os mesmos elementos (nada pisca, nenhum clique se perde).
  atualizarHtml(raiz, !configurado ? vistaSemConfig() : !estado.sessao ? vistaLogin() : vistaPrincipal())
}

// Abrir ou fechar o "Entrar com utilizador e palavra-passe" lembra-se, para o redesenho não o fechar.
raiz.addEventListener('toggle', (e) => { if (e.target.matches?.('details')) verLogin = e.target.open }, true)

raiz.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-acao]')
  if (!botao || botao.disabled) return
  const acao = botao.dataset.acao
  if (acao === 'login-discord') correr({ tipo: 'login-discord' })
  else if (acao === 'entrar') correr({ tipo: 'entrar' })
  else if (acao === 'sair') correr({ tipo: 'sair' })
  else if (acao === 'logout') correr({ tipo: 'logout' })
  else if (acao === 'ja-entrei') correr({ tipo: 'discord', verificar: true })
  else if (acao === 'testar-som') correr({ tipo: 'testar-som' })
  else if (acao === 'abrir-site') pedir({ tipo: 'abrir-site', caminho: '/jogar' }).then(() => window.close()).catch(() => {})
})

raiz.addEventListener('submit', (e) => {
  if (e.target.id !== 'form-login') return
  e.preventDefault()
  const f = new FormData(e.target)
  verLogin = true
  correr({ tipo: 'login-password', utilizador: f.get('utilizador'), password: f.get('password') })
})

raiz.addEventListener('change', (e) => {
  if (e.target.id === 'som-ligado') pedir({ tipo: 'som', ligado: e.target.checked }).catch(() => {})
})
raiz.addEventListener('input', (e) => {
  if (e.target.name === 'utilizador') utilizadorEscrito = e.target.value
  if (e.target.id === 'som-volume') pedir({ tipo: 'som', volume: e.target.value }).catch(() => {})
})

// O service worker escreve o "atualizadoEm" só para o site saber que está vivo; isso não muda nada do que se vê.
chrome.storage.onChanged.addListener((mudancas) => {
  if (Object.keys(mudancas).every((k) => k === 'atualizadoEm')) return
  carregar().then(render)
})

// As contagens (tempo na fila, castigo, ready check) mexem a cada segundo.
setInterval(() => { if (estado.sessao && !aTrabalhar) render() }, 1000)

await carregar()
render()
if (configurado && estado.sessao) {
  // Dados frescos ao abrir, e o estado do Discord para saber se há convite a mostrar.
  pedir({ tipo: 'atualizar' }).catch(() => {})
  pedir({ tipo: 'discord' }).catch(() => {})
}
