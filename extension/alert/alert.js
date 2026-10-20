// A janela que a extensão abre quando a partida é encontrada: a contagem do ready check e um botão que leva ao
// Rangify, onde se aceita. Fecha-se sozinha quando a contagem acaba ou a partida avança.
import { atualizarHtml } from '../lib/morph.js'
import { relogioSvg } from '../lib/roda.js'
import { agoraServidor, esc, pedir } from '../lib/util.js'

const raiz = document.getElementById('raiz')
const TOTAL = 20
let estado = {}
let fechando = false
let fecharEm = null

const carregar = async () => { estado = await chrome.storage.local.get(null) }

function fecharJanela() {
  if (fechando) return
  fechando = true
  window.close()
}

function render() {
  const p = estado.partida
  const agora = agoraServidor(estado.desvio)
  const pendente = p?.estado === 'READY_CHECK' && p.participo && !p.euAceitei
  const restante = p?.prazo ? Math.max(0, (Date.parse(p.prazo) - agora) / 1000) : 0

  if (pendente && restante > 0) {
    // Uma partida nova a meio do fecho: a janela fica aberta.
    if (fecharEm) { clearTimeout(fecharEm); fecharEm = null }
    atualizarHtml(raiz, `
      <span class="selo"><i></i>PARTIDA ENCONTRADA</span>
      <div class="relogio">${relogioSvg({ tamanho: 170, restante, total: TOTAL })}
        <div class="centro"><span class="seg">${Math.ceil(restante)}</span><span class="leg">PARA ACEITAR</span></div></div>
      <h1>A tua partida está pronta</h1>
      <p><b>${p.aceitaram}/10</b> já aceitaram. Abre o Rangify e carrega em <b>Aceitar</b> antes de acabar o tempo.</p>
      <button class="btn btn-primario grande" id="abrir" autofocus>Abrir o Rangify e aceitar</button>`)
    return
  }

  // Já não há nada a aceitar: diz o que aconteceu e fecha.
  let titulo = 'A contagem acabou'
  let texto = 'Se não aceitaste a tempo, voltas a poder entrar na fila passados 5 minutos.'
  if (p && !pendente) { titulo = 'A partida avançou'; texto = 'Aceitaste, ou a sala já seguiu para o draft. Abre o Rangify para continuares.' }
  else if (!p) { titulo = 'A partida foi cancelada'; texto = 'Alguém não aceitou. Se ainda estás na fila, mantens o lugar.' }
  atualizarHtml(raiz, `
    <h1>${esc(titulo)}</h1><p>${esc(texto)}</p>
    <button class="btn btn-fantasma grande" id="abrir">Abrir o Rangify</button>`)
  if (!fecharEm) fecharEm = setTimeout(fecharJanela, 6000)
}

raiz.addEventListener('click', (e) => {
  if (!e.target.closest('#abrir')) return
  pedir({ tipo: 'abrir-site', caminho: '/jogar' }).then(fecharJanela).catch(() => {})
})

chrome.storage.onChanged.addListener(() => { carregar().then(render) })
// A contagem desce a cada segundo.
setInterval(() => { if (!fechando) render() }, 250)

await carregar()
render()
