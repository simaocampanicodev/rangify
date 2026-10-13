// Réplicas dos ecrãs do site para o vídeo "plano sequência": as mesmas classes,
// medidas, cores e textos de src/components (Fila, Confirmar, Draft, Mapas,
// TabelaPartida) e de src/pages/Ranking. Tudo é desenhado em função do tempo.
/* global $, $$, limitar, prog, misturar, suave, sair, salto */

// ------------------------------------------------------------------ peças comuns
const CORES_RANK = ['#9a9a9a', '#c08a5a', '#c9d2d8', '#f2c14e', '#4fc6d6', '#c58cff', '#3ed38a', '#ff4d6a']
const NOMES_RANK = ['Ferro', 'Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Ascendente', 'Imortal']
const nomeRank = (t) => (t >= 27 ? 'Radiante' : `${NOMES_RANK[Math.floor((t - 3) / 3)]} ${((t - 3) % 3) + 1}`)
const corRank = (t) => (t >= 27 ? '#ffe08a' : CORES_RANK[Math.floor((t - 3) / 3)])
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }
const iniciais = (n) => n.slice(0, 2).toUpperCase()

function rankBadge(tier, pequeno = true) {
  const c = corRank(tier)
  return `<span style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid ${rgba(c, 0.35)};background:${rgba(c, 0.1)};color:#f1ece6;font-family:var(--mono);white-space:nowrap;${pequeno ? 'height:24px;padding:0 8px;font-size:10.5px' : 'height:28px;padding:0 10px;font-size:11.5px'}"><svg width="${pequeno ? 10 : 12}" height="${pequeno ? 10 : 12}" viewBox="0 0 12 12"><path d="M6 0.8 11 4.2 9.1 11.2H2.9L1 4.2Z" fill="${c}"/></svg>${nomeRank(tier)}</span>`
}
function quad(nome, eq, tam = 34) {
  const fundo = eq === 'A' ? 'linear-gradient(135deg,#5b2a17,#b0461c)' : eq === 'B' ? 'linear-gradient(135deg,#1c1a19,#3d3632)' : '#202024'
  return `<span style="display:grid;place-items:center;flex-shrink:0;width:${tam}px;height:${tam}px;border-radius:${Math.round(tam * 0.27)}px;font-size:${Math.max(10, tam * 0.34)}px;font-weight:800;color:#fff3ec;background:${fundo};${eq === 'B' ? 'border:1px solid rgba(255,255,255,0.12)' : ''}">${iniciais(nome)}</span>`
}
function relogioSvg(id, tam, esp = 6) {
  const r = tam / 2 - esp - 0.5
  return `<div style="position:relative;flex-shrink:0;width:${tam}px;height:${tam}px">
    <svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" style="overflow:visible;filter:drop-shadow(0 0 7px rgba(255,91,31,.45))">
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${esp}"/>
      <circle id="${id}-arco" cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="#ff5b1f" stroke-width="${esp}" stroke-linecap="round" stroke-dasharray="${2 * Math.PI * r}" stroke-dashoffset="0" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>
    </svg>
    <span style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px"><span id="${id}-n" class="mono" style="line-height:1;font-weight:600;letter-spacing:-0.05em;font-size:${tam * 0.29}px">15</span><span id="${id}-leg" style="font-size:12px;color:#8a857e"></span></span>
  </div>`
}
function relogio(id, restante, total, tam, esp = 6, cor = '#ff5b1f') {
  const r = tam / 2 - esp - 0.5, c = 2 * Math.PI * r
  const frac = limitar(restante / total, 0, 1), s = Math.ceil(restante), urgente = s <= 5
  const arco = $(`#${id}-arco`); arco.setAttribute('stroke-dashoffset', String(c * (1 - frac))); arco.setAttribute('stroke', urgente ? '#ff7d8f' : cor)
  const n = $(`#${id}-n`); n.textContent = String(Math.max(0, s)); n.style.color = urgente ? '#ff7d8f' : '#f3f0eb'
}
const PAINEL = 'background:rgba(16,16,19,0.78);border:1px solid rgba(255,255,255,0.07);border-radius:18px;backdrop-filter:blur(16px)'
const FASES = ['Confirmar', 'Draft', 'Mapas', 'Código', 'Em jogo', 'Resultado']
function progresso(id) {
  return `<nav style="${PAINEL};border-radius:16px;display:flex;align-items:center;gap:16px;padding:12px 16px">
    <span class="mono" style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#ffb592"><span style="width:8px;height:8px;border-radius:50%;background:#ff5b1f"></span>RG-4821</span>
    <ol style="margin:0;padding:0;list-style:none;display:flex;align-items:center;gap:6px;flex:1">
      ${FASES.map((f, i) => `${i ? `<span class="${id}-sep" style="height:1px;width:16px;background:rgba(255,255,255,0.1)"></span>` : ''}<li class="${id}-fase" style="display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:999px;border:1px solid transparent;font-size:12px;font-weight:600;color:#8a857e"><span class="ck" style="display:none;color:#ff5b1f">✓</span>${f}</li>`).join('')}
    </ol>
  </nav>`
}
function faseAtual(id, atual) {
  $$(`.${id}-fase`).forEach((el, i) => {
    const feita = i < atual, agora = i === atual
    el.style.borderColor = agora ? 'rgba(255,91,31,0.6)' : 'transparent'
    el.style.background = agora ? 'rgba(255,91,31,0.15)' : 'transparent'
    el.style.color = agora ? '#ffd2bd' : feita ? '#b4afa8' : '#8a857e'
    $('.ck', el).style.display = feita ? 'inline' : 'none'
  })
  $$(`.${id}-sep`).forEach((el, i) => (el.style.background = i < atual ? 'rgba(255,91,31,0.6)' : 'rgba(255,255,255,0.1)'))
}
const cabecalho = (migalhas, titulo, desc, acoes = '') => `<header style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px">
  <div style="display:flex;flex-direction:column;gap:10px"><nav style="display:flex;align-items:center;gap:8px;font-size:13px;color:#8a857e">${migalhas.map((m, i) => `${i ? '<span>›</span>' : ''}<span style="${i === migalhas.length - 1 ? 'font-weight:600;color:#f3f0eb' : ''}">${m}</span>`).join('')}</nav>
  <h1 style="margin:0;font-size:46px;line-height:1.02;font-weight:800;letter-spacing:-0.045em">${titulo}</h1>${desc ? `<p style="margin:0;max-width:600px;font-size:15px;line-height:1.55;color:#b4afa8">${desc}</p>` : ''}</div>${acoes}</header>`
const segmentado = (opcoes, ativa, id = '') => `<div ${id ? `id="${id}"` : ''} style="display:inline-flex;gap:4px;border-radius:12px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.035);padding:4px">${opcoes.map((o, i) => `<span style="height:36px;padding:0 14px;border-radius:8px;border:1px solid ${i === ativa ? 'rgba(255,91,31,0.32)' : 'transparent'};background:${i === ativa ? 'rgba(255,91,31,0.14)' : 'transparent'};color:${i === ativa ? '#ffd2bd' : '#b4afa8'};font-size:13px;font-weight:600;display:inline-flex;align-items:center">${o}</span>`).join('')}</div>`
const BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:11px;font-size:14px;font-weight:700;white-space:nowrap'
const BTN_PRIM = `${BTN};background:#ff5b1f;color:#170802;box-shadow:0 12px 32px -14px rgba(255,91,31,0.6)`
const BTN_FANT = `${BTN};background:rgba(255,255,255,0.03);color:#e6e1da;border:1px solid rgba(255,255,255,0.11);font-weight:600`

// ------------------------------------------------------------------ 01 · fila (Jogar + Partida encontrada)
function ecraFila() {
  const c = 98, r = c - 14
  const seg = Array.from({ length: 10 }, (_, i) => {
    const a0 = ((-90 + i * 36 + 4) * Math.PI) / 180, a1 = ((-90 + (i + 1) * 36 - 4) * Math.PI) / 180
    return `<path class="fila-seg" d="M ${(c + r * Math.cos(a0)).toFixed(1)} ${(c + r * Math.sin(a0)).toFixed(1)} A ${r} ${r} 0 0 1 ${(c + r * Math.cos(a1)).toFixed(1)} ${(c + r * Math.sin(a1)).toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="11" stroke-linecap="round"/>`
  }).join('')
  const chip = 'display:inline-flex;height:30px;align-items:center;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.035);padding:0 12px;font-size:12.5px;color:#d0cbc4'
  const jog = ['Tu', 'Draco', 'Cometa', 'Lumi', 'Pedra', 'Hugo', 'Fenix', 'Orion', 'Tiago', 'Vasco']
  return `
  ${cabecalho(['Hub', 'Jogar'], 'Jogar', 'Entra na fila da tua região. Quando houver 10 jogadores, recebes o alerta para aceitar e segues para o draft.')}
  <section style="${PAINEL};display:flex;align-items:center;gap:40px;padding:30px 34px">
    <div style="position:relative;flex-shrink:0;width:196px;height:196px">
      <svg width="196" height="196" viewBox="0 0 196 196" style="overflow:visible;filter:drop-shadow(0 0 14px rgba(255,91,31,0.35))">${seg}</svg>
      <svg id="fila-gira" width="196" height="196" viewBox="0 0 196 196" style="position:absolute;inset:0;overflow:visible;opacity:0"><circle cx="98" cy="98" r="${r - 18}" fill="none" stroke="rgba(255,181,146,0.35)" stroke-width="1.5" stroke-dasharray="3 9"/></svg>
      <span style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
        <span class="mono" style="font-size:43px;line-height:1;font-weight:600;letter-spacing:-0.05em"><span id="fila-n">3</span><span style="font-size:18.6px;color:#8a857e">/10</span></span>
        <span id="fila-leg" class="mono" style="font-size:11px;letter-spacing:0.1em;color:#8a857e">À ESPERA DE TI</span>
      </span>
    </div>
    <div style="display:flex;flex:1;flex-direction:column;gap:14px">
      <span class="mono" style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:#ff5b1f">RANGIFY HUB · EU</span>
      <h2 id="fila-titulo" style="margin:0;font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-0.035em">Pronto para a próxima?</h2>
      <p id="fila-texto" style="margin:0;max-width:560px;font-size:14.5px;line-height:1.55;color:#b4afa8">Entra na fila da tua região. Com 10 jogadores, aceitas a partida e segues para o draft dos capitães, os bans e o código do grupo.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <span style="${chip};border-color:rgba(255,91,31,0.32);background:rgba(255,91,31,0.12);color:#ffd2bd"><b style="font-weight:700">Rang</b><span class="serif" style="font-size:1.18em">ify</span>&nbsp;Hub · EU</span>
        <span style="${chip}">20 s para aceitar</span><span style="${chip}">2 capitães · 7 mapas</span><span style="${chip}">5 fases até aos pontos</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding-top:4px">
        <span id="fila-botao" style="${BTN_PRIM};height:50px;border-radius:12px;padding:0 24px;font-size:15px;font-weight:800">Entrar na fila →</span>
        <span id="fila-espera" style="font-size:13px;color:#8a857e">3 jogadores estão à espera.</span>
      </div>
    </div>
  </section>
  <div id="conf" style="position:absolute;inset:-20px -40px;display:flex;align-items:center;justify-content:center;background:rgba(5,5,7,0.78);border-radius:26px;opacity:0">
    <section id="conf-caixa" style="position:relative;width:740px;display:flex;flex-direction:column;align-items:center;gap:20px;border-radius:26px;border:1px solid rgba(255,91,31,0.32);background:rgba(13,13,16,0.96);padding:30px;text-align:center;box-shadow:0 40px 120px -40px rgba(255,91,31,0.6)">
      <div style="display:flex;width:100%;align-items:center;justify-content:space-between">
        <span class="mono" style="display:inline-flex;height:32px;align-items:center;gap:10px;border-radius:999px;border:1px solid rgba(255,91,31,0.32);background:rgba(255,91,31,0.12);padding:0 14px 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;color:#ffb592"><span style="width:8px;height:8px;border-radius:50%;background:#ff5b1f"></span>PARTIDA ENCONTRADA</span>
        <span style="font-size:12.5px;color:#a6a19a"><b style="color:#e6e1da">Rang</b><span class="serif" style="color:#e6e1da">ify</span> Hub · EU</span>
      </div>
      ${relogioSvg('conf-rel', 150, 8)}
      <div style="display:flex;flex-direction:column;gap:8px;max-width:520px">
        <h1 id="conf-titulo" style="margin:0;font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-0.04em">A tua partida está pronta</h1>
        <p style="margin:0;font-size:14.5px;line-height:1.55;color:#b4afa8">Dez jogadores encontrados. Aceita para seguir para o draft dos capitães.</p>
      </div>
      <div style="display:grid;width:100%;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px">
        ${jog.map((n, i) => `<div class="conf-j" style="display:flex;min-height:52px;align-items:center;gap:10px;border-radius:12px;border:1px dashed rgba(255,255,255,0.12);background:rgba(255,255,255,0.02);padding:0 10px;text-align:left">
          <span class="conf-av" style="position:relative;display:grid;place-items:center;width:30px;height:30px;flex-shrink:0;border-radius:8px;font-size:11px;font-weight:800;color:#fff3ec;background:#25252a">${iniciais(n === 'Tu' ? 'Nyx' : n)}<span class="conf-ck" style="position:absolute;right:-4px;bottom:-4px;width:14px;height:14px;border-radius:50%;background:#3a3a40;box-shadow:0 0 0 2px #0d0d10;font-size:9px;display:grid;place-items:center;color:#170802"></span></span>
          <span style="display:flex;flex-direction:column;gap:1px;min-width:0"><span style="font-size:13px;font-weight:600">${n}</span><span class="conf-est" style="font-size:11px;color:#8a857e">A decidir</span></span></div>`).join('')}
      </div>
      <span id="conf-aceitar" style="${BTN_PRIM};height:60px;width:380px;border-radius:16px;font-size:18px;font-weight:800;letter-spacing:0.04em">ACEITAR</span>
    </section>
  </div>`
}
function desenharFila(t, T) {
  const clique = T.ini + 0.55
  const naFila = t >= clique
  const n = naFila ? limitar(3 + Math.floor((t - clique - 0.15) * 4.6), 3, 10) : 3
  $$('.fila-seg').forEach((p, i) => p.setAttribute('stroke', i < n ? (naFila && i === 0 ? '#ffb592' : '#ff5b1f') : 'rgba(255,255,255,0.08)'))
  $('#fila-n').textContent = String(n)
  const espera = Math.max(0, t - clique)
  $('#fila-leg').textContent = naFila ? `NA FILA 00:${String(Math.floor(espera * 9)).padStart(2, '0')}` : 'À ESPERA DE TI'
  $('#fila-leg').style.color = naFila ? '#ffb592' : '#8a857e'
  $('#fila-gira').style.opacity = naFila ? '1' : '0'
  $('#fila-gira').style.transform = `rotate(${t * 60}deg)`; $('#fila-gira').style.transformOrigin = '50% 50%'
  $('#fila-titulo').textContent = naFila ? 'À procura de jogadores…' : 'Pronto para a próxima?'
  $('#fila-texto').textContent = naFila ? `Faltam ${10 - n} ${10 - n === 1 ? 'jogador' : 'jogadores'} da tua região. Podes andar pelo site: quando a sala encher, ouves um som e aparece o alerta para aceitar.` : 'Entra na fila da tua região. Com 10 jogadores, aceitas a partida e segues para o draft dos capitães, os bans e o código do grupo.'
  const b = $('#fila-botao')
  b.setAttribute('style', naFila ? `${BTN_FANT};height:50px;border-radius:12px;padding:0 20px` : `${BTN_PRIM};height:50px;border-radius:12px;padding:0 24px;font-size:15px;font-weight:800`)
  b.textContent = naFila ? 'Sair da fila' : 'Entrar na fila →'
  if (t > clique - 0.06 && t < clique + 0.1) b.style.transform = 'scale(0.95)'
  $('#fila-espera').textContent = naFila ? 'Tens 20 segundos para aceitar quando a sala encher.' : '3 jogadores estão à espera.'
  // A janela da partida encontrada.
  const tc = T.encontrada, pc = sair(prog(t, tc, tc + 0.35))
  $('#conf').style.opacity = String(t >= tc ? pc : 0)
  $('#conf-caixa').style.transform = `scale(${0.94 + 0.06 * pc}) translateY(${(1 - pc) * 14}px)`
  const aceitei = t >= T.aceitar
  relogio('conf-rel', 20 - Math.max(0, t - tc) * 2.2, 20, 150, 8)
  $('#conf-rel-leg').textContent = aceitei ? 'à espera' : 'para aceitar'
  // Os bots e os outros aceitam aos poucos; "Tu" aceita no clique.
  const ordem = [T.aceitar, tc + 0.35, tc + 0.6, tc + 0.8, T.aceitar + 0.25, T.aceitar + 0.45, tc + 1.0, T.aceitar + 0.6, T.aceitar + 0.8, T.aceitar + 1.0]
  $$('.conf-j').forEach((el, i) => {
    const ok = t >= ordem[i]
    el.style.border = ok ? '1px solid rgba(255,91,31,0.4)' : '1px dashed rgba(255,255,255,0.12)'
    el.style.background = ok ? 'rgba(255,91,31,0.1)' : 'rgba(255,255,255,0.02)'
    $('.conf-av', el).style.background = ok ? 'linear-gradient(135deg,#5b2a17,#b0461c)' : '#25252a'
    const ck = $('.conf-ck', el); ck.style.background = ok ? '#ff5b1f' : '#3a3a40'; ck.textContent = ok ? '✓' : ''
    const est = $('.conf-est', el); est.textContent = ok ? 'Aceitou' : 'A decidir'; est.style.color = ok ? '#ffb592' : '#8a857e'
  })
  const ac = $('#conf-aceitar')
  const faltam = ordem.filter((q) => t < q).length
  if (aceitei) { ac.setAttribute('style', `display:inline-flex;height:56px;align-items:center;gap:10px;border-radius:16px;border:1px solid rgba(255,91,31,0.32);background:rgba(255,91,31,0.12);padding:0 22px;font-size:15px;font-weight:700;color:#ffd2bd`); ac.textContent = faltam ? `✓ Aceite. À espera de ${faltam}` : '✓ Todos aceitaram' }
  else { ac.setAttribute('style', `${BTN_PRIM};height:60px;width:380px;border-radius:16px;font-size:18px;font-weight:800;letter-spacing:0.04em`); ac.textContent = 'ACEITAR' }
  $('#conf-titulo').textContent = aceitei ? 'Aceitaste. Falta pouco.' : 'A tua partida está pronta'
}

// ------------------------------------------------------------------ 02 · draft
const CAP_A = { nome: 'Nyx', tag: '#4521', tier: 24, eq: 'A' }, CAP_B = { nome: 'Draco', tag: '#DRG', tier: 23, eq: 'B' }
const EQ_A0 = [{ nome: 'Cometa', tag: '#CMT', tier: 20, f: 'Duelista', o: 1 }, { nome: 'Fenix', tag: '#PTGS', tier: 17, f: 'Duelista', o: 3 }]
const EQ_B0 = [{ nome: 'Lumi', tag: '#LUM', tier: 19, f: 'Iniciador', o: 2 }, { nome: 'Vasco', tag: '#VSC', tier: 14, f: 'Controlador', o: 4 }]
const LIVRES = [
  { nome: 'Pedra', tag: '#STN', tier: 18, f: 'Sentinela', pts: 1114, kda: '1.42', vit: '58%', acs: 214, eq: 'A' },
  { nome: 'Hugo', tag: '#HGO', tier: 17, f: 'Controlador', pts: 1086, kda: '1.31', vit: '52%', acs: 196, eq: 'B' },
  { nome: 'Tiago', tag: '#TGO', tier: 15, f: 'Sentinela', pts: 1047, kda: '1.18', vit: '49%', acs: 178, eq: 'A' },
  { nome: 'Orion', tag: '#ORN', tier: 16, f: 'Iniciador', pts: 1062, kda: '1.25', vit: '51%', acs: 188, eq: 'B' },
]
function linhaEquipa(j, eq, cap = false) {
  return `<div style="display:flex;min-height:54px;align-items:center;gap:10px;border-radius:12px;border:1px solid ${j.nome === 'Nyx' ? 'rgba(255,91,31,0.4)' : 'rgba(255,255,255,0.07)'};background:${j.nome === 'Nyx' ? 'rgba(255,91,31,0.08)' : 'rgba(255,255,255,0.025)'};padding:0 10px">
    ${quad(j.nome, eq)}<span style="display:flex;min-width:0;flex:1;flex-direction:column;gap:1px"><span style="font-size:13.5px;font-weight:700;white-space:nowrap">${j.nome}<span class="mono" style="font-size:11px;font-weight:500;color:#8a857e">${j.tag}</span>${cap ? '<span class="mono" style="margin-left:4px;font-size:11px;font-weight:700;color:#ff5b1f">(C)</span>' : ''}</span><span style="font-size:11.5px;color:#8a857e;white-space:nowrap">${nomeRank(j.tier)}${j.f ? ` · ${j.f}` : ''}</span></span>
    ${j.o ? `<span class="mono" style="font-size:10px;font-weight:700;color:#8a857e">#${j.o}</span>` : ''}</div>`
}
function ecraDraft() {
  const capCard = (c, eq) => `<div id="cap-${eq}" style="${PAINEL};display:flex;flex:1 1 200px;min-width:0;align-items:center;gap:14px;padding:18px">
    ${quad(c.nome, eq, 58)}<span style="display:flex;min-width:0;flex-direction:column;gap:4px"><span class="mono" style="font-size:10.5px;font-weight:700;letter-spacing:0.16em;color:${eq === 'A' ? '#ff5b1f' : '#e6e1da'}">♛ CAPITÃO ${eq}</span>
    <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;white-space:nowrap">${c.nome}<span class="mono" style="font-size:12px;font-weight:500;color:#8a857e">${c.tag}</span></span><span style="font-size:12.5px;color:#a6a19a">${nomeRank(c.tier)} · média da equipa ${eq === 'A' ? 'Diamante 2' : 'Diamante 1'}</span></span></div>`
  const coluna = (eq) => `<section id="col-${eq}" style="${PAINEL};display:flex;flex:1 1 190px;min-width:0;flex-direction:column;gap:8px;padding:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:6px"><span class="mono" style="font-size:11px;font-weight:700;letter-spacing:0.16em;color:${eq === 'A' ? '#ff5b1f' : '#e6e1da'}">EQUIPA ${eq}</span><span class="mono col-n" style="font-size:11px;color:#8a857e">3/5</span></div>
    <div class="col-lista" style="display:flex;flex-direction:column;gap:8px"></div></section>`
  return `
  ${progresso('pd')}
  <section style="display:flex;align-items:stretch;gap:14px">
    ${capCard(CAP_A, 'A')}
    <div style="${PAINEL};display:flex;flex:1.4 1 380px;min-width:0;align-items:center;gap:20px;padding:18px 22px">
      ${relogioSvg('dr-rel', 92)}
      <div style="display:flex;min-width:0;flex:1;flex-direction:column;gap:10px">
        <span id="dr-vez" class="mono" style="font-size:11px;font-weight:700;letter-spacing:0.16em;color:#ff5b1f">ESCOLHA 5 DE 8 · EQUIPA A</span>
        <h1 id="dr-titulo" style="margin:0;font-size:24px;line-height:1.1;font-weight:800;letter-spacing:-0.03em">É a tua vez de escolher</h1>
        <div style="display:flex;gap:5px">${Array.from({ length: 8 }, (_, i) => `<span class="dr-ordem mono" style="display:grid;place-items:center;width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);font-size:10.5px;font-weight:700">${i % 2 ? 'B' : 'A'}${i + 1}</span>`).join('')}</div>
      </div>
    </div>
    ${capCard(CAP_B, 'B')}
  </section>
  <div style="display:flex;align-items:stretch;gap:14px">
    ${coluna('A')}
    <section style="display:flex;flex:2.4 1 480px;min-width:0;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px"><h2 id="dr-livres" class="mono" style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.16em;color:#ff5b1f">JOGADORES DISPONÍVEIS · 4</h2><span id="dr-dica" style="font-size:12.5px;color:#8a857e">Escolhe um jogador. Se o tempo acabar, entra o rank oficial mais alto.</span></div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${LIVRES.map((j, i) => `<div id="livre-${i}" style="position:relative;display:flex;flex-direction:column;gap:12px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:rgba(16,16,19,0.88);padding:14px">
          <span style="display:flex;align-items:center;gap:11px">${quad(j.nome, null, 46)}<span style="display:flex;min-width:0;flex:1;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:800;white-space:nowrap">${j.nome}<span class="mono" style="font-size:11px;font-weight:500;color:#8a857e">${j.tag}</span></span><span style="font-size:12px;color:#a6a19a">${j.f}</span></span>
          <span style="display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border-radius:9px;border:1px solid rgba(255,91,31,0.32);background:rgba(255,91,31,0.12);color:#ff9466;font-size:14px">${j.f === 'Sentinela' ? '⛨' : j.f === 'Controlador' ? '◉' : '✦'}</span></span>
          <span style="display:flex;align-items:center;justify-content:space-between;gap:8px">${rankBadge(j.tier)}<span class="mono" style="font-size:13px;font-weight:700;color:#ffb592">${j.pts} pts</span></span>
          <span style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;overflow:hidden;border-radius:10px;background:rgba(255,255,255,0.06)">${[['KDA', j.kda], ['VIT', j.vit], ['ACS', j.acs]].map(([k, v]) => `<span style="display:flex;flex-direction:column;gap:2px;background:#121215;padding:8px 10px"><span class="mono" style="font-size:9.5px;letter-spacing:0.12em;color:#8a857e">${k}</span><span class="mono" style="font-size:13px;font-weight:600">${v}</span></span>`).join('')}</span>
          <span class="dr-btn" style="display:flex;height:38px;align-items:center;justify-content:center;gap:8px;border-radius:10px;border:1px solid rgba(255,91,31,0.32);background:rgba(255,91,31,0.12);font-size:13px;font-weight:700;color:#ffd2bd">+ Escolher para a Equipa A</span>
        </div>`).join('')}
      </div>
    </section>
    ${coluna('B')}
  </div>`
}
function desenharDraft(t, T) {
  faseAtual('pd', 1)
  const picks = T.picks // [t5, t6, t7, t8]
  const feitos = picks.filter((q) => t >= q).length
  const n = 4 + feitos
  const vez = n % 2 === 0 ? 'A' : 'B'
  const fim = n >= 8
  const inicioVez = feitos ? picks[feitos - 1] : T.ini - 1.2
  relogio('dr-rel', fim ? 0 : 15 - (t - inicioVez) * 2.2, 15, 92, 6, vez === 'A' ? '#ff5b1f' : '#e6e1da')
  $('#dr-vez').textContent = fim ? 'EQUIPAS FECHADAS' : `ESCOLHA ${n + 1} DE 8 · EQUIPA ${vez}`
  $('#dr-vez').style.color = vez === 'A' || fim ? '#ff5b1f' : '#e6e1da'
  $('#dr-titulo').textContent = fim ? 'As equipas estão feitas' : vez === 'A' ? 'É a tua vez de escolher' : 'Draco está a escolher'
  $$('.dr-ordem').forEach((el, i) => {
    const e = i % 2 ? 'B' : 'A', feita = i < n, atual = i === n
    el.style.background = feita ? (e === 'A' ? 'rgba(255,91,31,0.22)' : 'rgba(255,255,255,0.1)') : atual ? 'rgba(255,91,31,0.12)' : 'transparent'
    el.style.borderColor = atual ? '#ff5b1f' : feita ? 'transparent' : 'rgba(255,255,255,0.1)'
    el.style.color = feita ? (e === 'A' ? '#ffb592' : '#e6e1da') : atual ? '#ffd2bd' : '#8a857e'
  })
  for (const eq of ['A', 'B']) {
    const card = $('#cap-' + eq), ativo = !fim && vez === eq
    card.style.borderColor = ativo ? 'rgba(255,91,31,0.55)' : 'rgba(255,255,255,0.07)'
    card.style.boxShadow = ativo ? '0 0 40px -12px rgba(255,91,31,0.6)' : 'none'
  }
  // Colunas: quem já foi escolhido entra com a ordem da escolha.
  const escolhidos = LIVRES.map((j, i) => ({ ...j, o: 5 + i, t: picks[i] })).filter((j) => t >= j.t)
  const listaA = [CAP_A, ...EQ_A0, ...escolhidos.filter((j) => j.eq === 'A')], listaB = [CAP_B, ...EQ_B0, ...escolhidos.filter((j) => j.eq === 'B')]
  for (const [eq, lista] of [['A', listaA], ['B', listaB]]) {
    const col = $('#col-' + eq), alvo = $('.col-lista', col)
    const assinatura = lista.map((j) => j.nome).join()
    if (alvo.dataset.a !== assinatura) {
      alvo.dataset.a = assinatura
      alvo.innerHTML = lista.map((j, i) => linhaEquipa(j, eq, i === 0)).join('') + Array.from({ length: 5 - lista.length }, () => '<div style="display:flex;min-height:54px;align-items:center;justify-content:center;border-radius:12px;border:1px dashed rgba(255,255,255,0.12)" class="mono"><span style="font-size:11px;color:#8a857e">Por escolher</span></div>').join('')
    }
    $('.col-n', col).textContent = `${lista.length}/5`
  }
  LIVRES.forEach((j, i) => {
    const el = $('#livre-' + i), saiu = t >= picks[i], p = prog(t, picks[i], picks[i] + 0.25)
    el.style.opacity = saiu ? String(1 - p) : '1'
    el.style.transform = saiu ? `scale(${1 - 0.08 * p})` : ''
    el.style.display = p >= 1 ? 'none' : 'flex'
    const meu = !fim && vez === 'A'
    const b = $('.dr-btn', el); b.style.display = meu ? 'flex' : 'none'
    const quente = T.cursorEm(i, t)
    el.style.borderColor = quente ? 'rgba(255,91,31,0.6)' : 'rgba(255,255,255,0.1)'
    b.style.background = quente ? '#ff5b1f' : 'rgba(255,91,31,0.12)'; b.style.color = quente ? '#170802' : '#ffd2bd'
  })
  $('#dr-livres').textContent = `JOGADORES DISPONÍVEIS · ${4 - feitos}`
  $('#dr-dica').textContent = !fim && vez === 'A' ? 'Escolhe um jogador. Se o tempo acabar, entra o rank oficial mais alto.' : 'Acompanha o draft em direto.'
}

// ------------------------------------------------------------------ 03 · ban de mapas
const POOL = [['Abyss', 'A/B'], ['Ascent', 'A/B'], ['Bind', 'A/B'], ['Haven', 'A/B/C'], ['Lotus', 'A/B/C'], ['Split', 'A/B'], ['Sunset', 'A/B']]
const BANS_ORDEM = ['Abyss', 'Split', 'Bind', 'Sunset', 'Haven', 'Ascent']
const imgMapa = (m) => `../public/mapas/${m.toLowerCase()}.webp`
function ecraMapas() {
  return `
  ${progresso('pm')}
  <section style="${PAINEL};display:flex;flex-direction:column;gap:18px;padding:20px 22px">
    <div style="display:flex;align-items:center;gap:18px">${relogioSvg('mp-rel', 84)}
      <div style="display:flex;flex-direction:column;gap:6px"><span id="mp-vez" class="mono" style="font-size:11px;font-weight:700;letter-spacing:0.16em;color:#ff5b1f">BAN 1 DE 6 · EQUIPA A</span>
      <h1 id="mp-titulo" style="margin:0;font-size:26px;line-height:1.1;font-weight:800;letter-spacing:-0.03em">Escolhe um mapa para banir</h1>
      <span style="font-size:13.5px;color:#a6a19a">Os capitães banem à vez. O mapa que sobrar é o da partida.</span></div></div>
    <div style="display:flex;gap:6px;border-top:1px solid rgba(255,255,255,0.07);padding-top:16px">
      ${Array.from({ length: 7 }, (_, i) => `<div style="display:flex;width:58px;flex-direction:column;align-items:center;gap:6px"><span class="mp-slot mono" style="position:relative;display:grid;place-items:center;width:58px;height:38px;border-radius:8px;border:1px dashed rgba(255,255,255,0.1);background-size:cover;background-position:center;font-size:11px;font-weight:700;color:#8a857e">${i === 6 ? '?' : i % 2 ? 'B' : 'A'}</span><span class="mp-slot-n mono" style="font-size:9px;letter-spacing:0.06em;color:#8a857e">${i === 6 ? 'DECISIVO' : `BAN ${i + 1}`}</span></div>`).join('')}
    </div>
  </section>
  <section style="display:flex;gap:8px;height:440px">
    ${POOL.map(([m, locais]) => `<div class="ban-c" data-m="${m}" style="position:relative;flex:1 1 0;min-width:52px;overflow:hidden;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:#141417">
      <span class="ban-f" style="position:absolute;inset:0;background:url(${imgMapa(m)}) center/cover"></span>
      <span style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(9,9,11,0.45) 0%,rgba(9,9,11,0.08) 32%,rgba(9,9,11,0.35) 60%,rgba(9,9,11,0.94) 100%)"></span>
      <span class="ban-loc mono" style="position:absolute;top:12px;left:12px;display:inline-flex;height:24px;align-items:center;border-radius:7px;border:1px solid rgba(255,255,255,0.16);background:rgba(9,9,11,0.62);padding:0 8px;font-size:10.5px;font-weight:600;color:#e6e1da;opacity:0">${locais}</span>
      <span class="ban-x" style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:8px"><span style="display:grid;place-items:center;width:40px;height:40px;border-radius:50%;border:2px solid rgba(255,255,255,0.7);background:rgba(9,9,11,0.4);font-size:20px;color:#fff">⦸</span><span class="ban-xe mono" style="font-size:10px;font-weight:800;letter-spacing:0.08em;color:#ffd2bd;white-space:nowrap">EQUIPA A</span></span>
      <span class="ban-v" style="position:absolute;left:50%;bottom:20px;transform:translateX(-50%) rotate(180deg);writing-mode:vertical-rl;font-weight:900;font-size:18px;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap">${m}</span>
      <div class="ban-a" style="position:absolute;left:12px;right:12px;bottom:14px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;opacity:0">
        <span style="font-size:28px;line-height:0.95;font-weight:900;letter-spacing:-0.03em;text-transform:uppercase;white-space:nowrap">${m}</span>
        <span class="ban-est mono" style="font-size:10.5px;font-weight:700;letter-spacing:0.12em;color:#ffb592;white-space:nowrap">É A TUA VEZ</span>
        <span class="ban-btn" style="align-self:stretch;display:flex;height:44px;align-items:center;justify-content:center;gap:8px;border-radius:12px;border:1px solid rgba(255,91,31,0.55);background:rgba(255,91,31,0.18);font-size:14px;font-weight:800;letter-spacing:0.08em;color:#ffd2bd">⦸ BANIR</span>
      </div>
    </div>`).join('')}
  </section>`
}
function desenharMapas(t, T) {
  faseAtual('pm', 2)
  const tb = T.bans // tempos dos 6 bans
  const nb = tb.filter((q) => t >= q).length
  const vez = nb % 2 === 0 ? 'A' : 'B'
  const fechado = nb >= 6
  const inicioVez = nb ? tb[nb - 1] : T.ini - 0.8
  relogio('mp-rel', fechado ? 0 : 20 - (t - inicioVez) * 3, 20, 84, 6, vez === 'A' ? '#ff5b1f' : '#e6e1da')
  $('#mp-vez').textContent = fechado ? 'MAPA DA PARTIDA · LOTUS' : `BAN ${nb + 1} DE 6 · EQUIPA ${vez}`
  $('#mp-vez').style.color = vez === 'A' || fechado ? '#ff5b1f' : '#e6e1da'
  $('#mp-titulo').textContent = fechado ? 'Vai ser Lotus' : vez === 'A' ? 'Escolhe um mapa para banir' : 'Draco está a banir um mapa'
  $$('.mp-slot').forEach((el, i) => {
    const m = i < 6 && i < nb ? BANS_ORDEM[i] : i === 6 && fechado ? 'Lotus' : null
    const atual = i === nb && !fechado
    el.style.backgroundImage = m ? `url(${imgMapa(m)})` : 'none'
    el.style.filter = m && i < 6 ? 'grayscale(1) brightness(0.55)' : ''
    el.style.borderStyle = m || atual ? 'solid' : 'dashed'
    el.style.borderColor = atual ? '#ff5b1f' : i === 6 ? 'rgba(255,91,31,0.4)' : 'rgba(255,255,255,0.1)'
    el.style.color = atual ? '#ffb592' : '#8a857e'
    el.firstChild && (el.firstChild.textContent = m ? '' : i === 6 ? '?' : i % 2 ? 'B' : 'A')
    const nome = $$('.mp-slot-n')[i]; nome.textContent = i === 6 ? (fechado ? 'LOTUS' : 'DECISIVO') : m ? m.toUpperCase() : `BAN ${i + 1}`; nome.style.color = atual ? '#ffb592' : '#8a857e'
  })
  // Cada cartão: aberto (rato por cima ou decisivo), banido ou livre.
  $$('.ban-c').forEach((el) => {
    const m = el.dataset.m, k = BANS_ORDEM.indexOf(m)
    const banido = k >= 0 && t >= tb[k], decisivo = fechado && m === 'Lotus'
    // Abre quando o capitão está a escolher este mapa (para os bans da Equipa A, com o rato).
    const abre = k >= 0 && !banido ? prog(t, tb[k] - 0.42, tb[k] - 0.18) : 0
    const fecha = k >= 0 && banido ? 1 - prog(t, tb[k], tb[k] + 0.25) : 0
    const aberto = decisivo ? sair(prog(t, tb[5] + 0.1, tb[5] + 0.45)) : Math.max(abre, fecha) * (k % 2 === 0 ? 1 : 0.0)
    el.style.flex = `${1 + 2.4 * suave(aberto)} 1 0`
    el.style.borderColor = decisivo ? '#ff5b1f' : aberto > 0.3 ? 'rgba(255,91,31,0.8)' : 'rgba(255,255,255,0.1)'
    el.style.boxShadow = decisivo ? '0 30px 80px -30px rgba(255,91,31,0.8)' : aberto > 0.3 ? '0 30px 70px -30px rgba(255,91,31,0.7)' : 'none'
    $('.ban-f', el).style.filter = banido ? 'grayscale(1) brightness(0.45)' : ''
    $('.ban-f', el).style.transform = `scale(${1 + 0.05 * aberto})`
    $('.ban-v', el).style.opacity = String(1 - aberto)
    $('.ban-v', el).style.color = banido ? 'rgba(243,240,235,0.45)' : '#f3f0eb'
    $('.ban-a', el).style.opacity = String(prog(aberto, 0.6, 1))
    $('.ban-loc', el).style.opacity = String(prog(aberto, 0.6, 1))
    $('.ban-x', el).style.display = banido ? 'flex' : 'none'
    $('.ban-xe', el).textContent = `EQUIPA ${k % 2 ? 'B' : 'A'}`
    $('.ban-est', el).textContent = decisivo ? 'MAPA DA PARTIDA' : 'É A TUA VEZ'
    const btn = $('.ban-btn', el); btn.style.display = decisivo ? 'none' : 'flex'
    const quente = k >= 0 && t > tb[k] - 0.18 && t < tb[k] + 0.05
    btn.style.background = quente ? '#ff5b1f' : 'rgba(255,91,31,0.18)'; btn.style.color = quente ? '#170802' : '#ffd2bd'
  })
}

// ------------------------------------------------------------------ 04 · resultado e scoreboard
const AG = { Omen: '8e253930-4c05-31dd-1b6c-968525494517', Jett: 'add6443a-41bd-e414-f6ad-e58d267f4e95', Raze: 'f94c3b30-42be-e959-889c-5aa313dba261', Killjoy: '1e58de9c-4950-5125-93e9-a0aee9f98746', Cypher: '117ed9e3-49f3-6512-3ccf-0cada7e3823b', Sova: '320b2a48-4d9b-a075-30f1-1f93a9b638fa', Fade: 'dade69b4-4f5a-8528-247b-219e5a1facd6', Viper: '707eab51-4836-f488-046a-cda6bf494859', Breach: '5f8d3a7f-467b-97f3-062c-13acf203c006', Brimstone: '9f0d8ba9-4140-b941-57d3-a7ad57c6b417' }
const iconeAgente = (a) => `https://media.valorant-api.com/agents/${AG[a]}/displayicon.png`
const SCORE = {
  A: [['Nyx', 'Omen', 124, '21/13/9', 268, '81%', '27%', 4, 3, 26, true], ['Cometa', 'Jett', 118, '22/15/3', 281, '74%', '31%', 3, 5, 25], ['Fenix', 'Raze', 107, '18/14/4', 241, '76%', '24%', 2, 3, 23], ['Pedra', 'Killjoy', 101, '15/12/6', 214, '78%', '22%', 3, 1, 22], ['Tiago', 'Cypher', 92, '11/14/5', 171, '69%', '18%', 1, 0, 19]],
  B: [['Draco', 'Sova', 109, '19/16/7', 247, '72%', '26%', 3, 2, -17], ['Lumi', 'Fade', 98, '14/17/9', 198, '68%', '21%', 2, 1, -20], ['Hugo', 'Viper', 94, '12/15/8', 184, '70%', '19%', 2, 0, -21], ['Orion', 'Breach', 88, '11/16/10', 172, '65%', '17%', 1, 1, -22], ['Vasco', 'Brimstone', 79, '9/17/6', 151, '61%', '15%', 1, 0, -24]],
}
const COLS = [['RS', 52], ['K/D/A', 92], ['ACS', 54], ['KAST', 58], ['HS%', 54], ['Trades', 58], ['FB', 42], ['Pontos', 64]]
function ecraResultado() {
  const tabela = (eq) => `<table style="width:100%;table-layout:fixed;border-collapse:collapse"><colgroup><col>${COLS.map(([, w]) => `<col style="width:${w}px">`).join('')}</colgroup>
    <caption class="mono" style="padding-bottom:8px;text-align:left;font-size:11px;font-weight:700;letter-spacing:0.14em;color:${eq === 'A' ? '#ff5b1f' : '#e6e1da'}">EQUIPA ${eq} · ${eq === 'A' ? 13 : 9} RONDAS ${eq === 'A' ? '· VITÓRIA ' : ''}<span style="font-weight:500;color:#8a857e">· MÉDIA ${eq === 'A' ? 'DIAMANTE 2' : 'DIAMANTE 1'}</span></caption>
    <thead><tr class="mono" style="text-align:left;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#8a857e"><th style="padding:6px 0 6px 12px;font-weight:400">Jogador</th>${COLS.map(([c], i) => `<th style="text-align:right;font-weight:400;padding:0 ${i === COLS.length - 1 ? '12px' : '8px'} 0 8px">${c}</th>`).join('')}</tr></thead>
    <tbody>${SCORE[eq].map((j, i) => `<tr class="sc-l" data-i="${i + (eq === 'B' ? 5 : 0)}" style="border-top:1px solid rgba(255,255,255,0.06);${j[0] === 'Nyx' ? 'background:rgba(255,91,31,0.08)' : ''}">
      <td style="padding:8px 8px 8px 12px"><span style="display:flex;align-items:center;gap:10px;min-width:0">${quad(j[0], eq, 28)}<img src="${iconeAgente(j[1])}" alt="" style="width:24px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05)"><span style="font-size:13.5px;font-weight:600;white-space:nowrap">${j[0]}</span>${i === 0 ? '<span class="mono" style="font-size:11px;font-weight:700;color:#ff5b1f">(C)</span>' : ''}${j[10] ? '<span class="sc-mvp" style="display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;border:1px solid rgba(255,91,31,0.6);background:rgba(255,91,31,0.15);color:#ff5b1f;font-size:11px;opacity:0">★</span>' : ''}</span></td>
      <td class="mono sc-rs" data-v="${j[2]}" style="text-align:right;padding:0 8px;font-size:13px;font-weight:600;color:${j[2] >= 100 ? '#ffb592' : '#b4afa8'}">0</td>
      ${[j[3], j[4], j[5], j[6], j[7], j[8]].map((v) => `<td class="mono" style="text-align:right;padding:0 8px;font-size:13px">${v}</td>`).join('')}
      <td class="mono sc-p" data-v="${j[9]}" style="text-align:right;padding:0 12px 0 8px;font-size:13.5px;font-weight:700;color:${j[9] > 0 ? '#5fe3d6' : '#ff7d8f'}">0</td></tr>`).join('')}</tbody></table>`
  return `
  ${progresso('pr')}
  <section style="position:relative;display:flex;min-height:170px;align-items:flex-end;overflow:hidden;border-radius:22px;border:1px solid rgba(255,255,255,0.1);background:#141417 url(${imgMapa('Lotus')}) center/cover">
    <span style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(9,9,11,0.95) 0%,rgba(9,9,11,0.72) 50%,rgba(9,9,11,0.2) 100%)"></span>
    <div style="position:relative;display:flex;width:100%;align-items:flex-end;justify-content:space-between;gap:14px;padding:24px 28px">
      <div style="display:flex;flex-direction:column;gap:8px"><span class="mono" style="font-size:11px;font-weight:700;letter-spacing:0.18em;color:#ffb592">TERMINADA · LOTUS · 34 MIN</span><h1 style="margin:0;font-size:42px;line-height:1.04;font-weight:900;letter-spacing:-0.04em">Vitória, 13-9</h1><span style="font-size:14px;color:#d0cbc4">Resultado confirmado. Os pontos já estão na tabela.</span></div>
      <div id="sc-pontos" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(9,9,11,0.6);padding:12px 20px;opacity:0"><span class="mono" style="font-size:10px;letter-spacing:0.14em;color:#8a857e">OS TEUS PONTOS</span><span class="mono" style="font-size:34px;line-height:1;font-weight:600;color:#5fe3d6">+<span id="sc-pts">0</span></span><span class="mono" style="font-size:11.5px;color:#8a857e">+22 resultado e rank · <span style="color:#ffb592">+4</span> RS 124</span></div>
    </div>
  </section>
  <section style="${PAINEL};display:flex;flex-direction:column;gap:16px;padding:22px">
    <div style="display:flex;align-items:center;justify-content:space-between"><div style="display:flex;flex-direction:column;gap:4px"><span class="mono" style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:#ff5b1f">ESTATÍSTICAS DA PARTIDA</span><span style="font-size:13px;color:#8a857e">Tirados da Henrik Dev API. O Rangify Score (RS) junta o ACS, o KDA, o KAST e os trades: 100 é a média da partida.</span></div>
    <div style="display:flex;gap:8px"><span style="${BTN_FANT};min-height:36px;padding:0 12px;font-size:13px">Ver no histórico</span><span style="${BTN_PRIM};min-height:36px;padding:0 16px;font-size:13px">Voltar à fila</span></div></div>
    ${tabela('A')}${tabela('B')}
  </section>`
}
function desenharResultado(t, T) {
  faseAtual('pr', 6)
  $$('.sc-l').forEach((el) => {
    const i = Number(el.dataset.i), q = T.ini + 0.25 + i * 0.07, p = sair(prog(t, q, q + 0.4))
    el.style.opacity = String(p); el.style.transform = `translateX(${(1 - p) * -24}px)`
  })
  $$('.sc-rs').forEach((el) => (el.textContent = String(Math.round(Number(el.dataset.v) * sair(prog(t, T.ini + 0.6, T.ini + 1.4))))))
  $$('.sc-p').forEach((el) => { const v = Math.round(Number(el.dataset.v) * sair(prog(t, T.pontos, T.pontos + 0.7))); el.textContent = v > 0 ? `+${v}` : String(v) })
  const mvp = $('.sc-mvp'); const pm = salto(prog(t, T.mvp, T.mvp + 0.35)); mvp.style.opacity = t >= T.mvp ? '1' : '0'; mvp.style.transform = `scale(${0.4 + 0.6 * pm})`
  $('#sc-pontos').style.opacity = String(prog(t, T.pontos - 0.2, T.pontos + 0.1))
  $('#sc-pts').textContent = String(Math.round(26 * sair(prog(t, T.pontos, T.pontos + 0.7))))
}

// ------------------------------------------------------------------ 05 · tabela
const TABELA = [
  ['Sombra', '#SMB', 21, 1210, '14-12', '54%', 'VDVVD'], ['Nyx', '#4521', 19, 1193, '21-13', '62%', 'VDVVV', true], ['Bruma', '#BRM', 18, 1180, '12-9', '57%', 'DVVDV'],
  ['Corvo', '#CRV', 17, 1166, '13-11', '54%', 'VVDDV'], ['Maré', '#WAVE', 16, 1151, '10-9', '53%', 'DDVVD'], ['Leo', '#LE07', 18, 1139, '9-9', '50%', 'VDDVD'],
]
const PODIO = [['Kaiser', '#EU0', 24, 1342, '24-9', '73%'], ['Lince', '#LNC', 22, 1288, '19-10', '66%'], ['Morfeu', '#MRF', 21, 1250, '15-11', '58%']]
function ecraTabela() {
  const lug = [['1.º LUGAR', '#ff5b1f', 'rgba(255,91,31,0.26)', 'rgba(255,91,31,0.55)'], ['2.º LUGAR', '#ff9466', 'rgba(255,148,102,0.16)', 'rgba(255,148,102,0.3)'], ['3.º LUGAR', '#ffb592', 'rgba(255,181,146,0.12)', 'rgba(255,181,146,0.22)']]
  const cartao = (i) => { const [n, tag, tier, pts, vd, pc] = PODIO[i], [rot, cor, halo, borda] = lug[i], pri = i === 0
    return `<div style="${PAINEL};position:relative;display:flex;flex-direction:column;gap:14px;overflow:hidden;padding:20px;border-color:${borda};${pri ? 'margin-top:-16px;padding-bottom:28px;box-shadow:0 24px 70px -30px rgba(255,91,31,0.7)' : ''}">
      <span style="position:absolute;top:-80px;right:-64px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,${halo} 0%,rgba(0,0,0,0) 65%)"></span>
      <span class="mono" style="position:absolute;top:8px;right:16px;font-size:60px;line-height:1;font-weight:700;letter-spacing:-0.06em;color:${cor};opacity:0.22">0${i + 1}</span>
      <span class="mono" style="position:relative;font-size:11px;font-weight:600;letter-spacing:0.16em;color:${cor}">${rot}</span>
      <span style="position:relative;display:flex;align-items:center;gap:12px">${quad(n, pri ? 'A' : null, pri ? 60 : 50)}<span style="display:flex;flex-direction:column;gap:4px"><span style="font-size:17px;font-weight:700;white-space:nowrap">${n}<span class="mono" style="font-size:12px;font-weight:500;color:#8a857e">${tag}</span></span>${rankBadge(tier)}</span></span>
      <span style="position:relative;display:flex;align-items:baseline;justify-content:space-between;gap:10px;border-top:1px solid rgba(255,255,255,0.07);padding-top:12px"><span style="display:flex;align-items:baseline;gap:6px"><span class="mono" style="font-size:${pri ? 36 : 30}px;font-weight:600;letter-spacing:-0.04em">${pts}</span><span style="font-size:12px;color:#8a857e">pts</span></span><span class="mono" style="font-size:12px;color:#b4afa8">${vd} · ${pc}</span></span></div>` }
  const forma = (f) => `<span style="display:flex;gap:4px">${f.split('').map((x) => `<span style="width:8px;height:8px;border-radius:50%;background:${x === 'V' ? '#5fe3d6' : '#ff7d8f'}"></span>`).join('')}</span>`
  return `
  ${cabecalho(['Hub', 'Tabela'], 'Tabela da temporada', 'Ordenada pelos pontos do hub. Toda a gente começa a temporada com 1000.', `<div style="display:flex;gap:8px">${segmentado(['Pontos', 'Nível', 'Rangify Score'], 0)}</div>`)}
  <section style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:end;gap:12px">${cartao(1)}${cartao(0)}${cartao(2)}</section>
  <div style="display:flex;align-items:flex-start;gap:16px">
    <section style="${PAINEL};display:flex;flex:2 1 560px;min-width:0;flex-direction:column;gap:12px;padding:22px">
      <div style="display:flex;align-items:flex-end;justify-content:space-between"><div style="display:flex;flex-direction:column;gap:5px"><span class="mono" style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:#ff5b1f">13 JOGADORES</span><h2 style="margin:0;font-size:19px;font-weight:700;letter-spacing:-0.02em">Classificação</h2></div>${segmentado(['Global', 'Só amigos'], 0)}</div>
      <div style="height:46px;border-radius:11px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);display:flex;align-items:center;padding:0 14px;gap:10px;font-size:14.5px;color:#8a857e"><span>⌕</span>Procurar por Riot ID</div>
      <div class="mono" style="display:grid;grid-template-columns:48px minmax(0,1fr) 120px 70px 60px 50px 64px;font-size:10px;letter-spacing:0.14em;color:#8a857e;padding:6px 0"><span style="padding-left:12px">#</span><span>JOGADOR</span><span>RANK OFICIAL</span><span>FORMA</span><span style="text-align:right">V-D</span><span style="text-align:right">VIT.</span><span style="text-align:right;padding-right:12px">PONTOS</span></div>
      <div style="position:relative;height:${TABELA.length * 53}px">
        ${TABELA.map(([n, tag, tier, pts, vd, pc, f, eu], i) => `<div class="tb-l" data-n="${n}" style="position:absolute;left:0;right:0;top:${i * 53}px;height:52px;display:grid;grid-template-columns:48px minmax(0,1fr) 120px 70px 60px 50px 64px;align-items:center;border-top:1px solid rgba(255,255,255,0.06);${eu ? 'background:rgba(255,91,31,0.08)' : ''}">
          <span class="tb-pos mono" style="padding-left:12px;font-size:14px;font-weight:600;color:${eu ? '#ff5b1f' : '#b4afa8'}">#${i + 4}</span>
          <span style="display:flex;align-items:center;gap:10px;min-width:0">${quad(n, eu ? 'A' : null, 32)}<span style="display:flex;flex-direction:column"><span style="font-size:14px;font-weight:600;white-space:nowrap">${n}${eu ? '<span class="mono" style="margin-left:6px;border-radius:4px;background:#ff5b1f;padding:1px 6px;font-size:9.5px;font-weight:700;color:#170802">TU</span>' : ''}</span><span class="mono" style="font-size:11px;color:#8a857e">${tag}</span></span></span>
          <span>${rankBadge(tier)}</span><span>${forma(f)}</span>
          <span class="mono tb-vd" style="text-align:right;font-size:13px;color:#b4afa8">${vd}</span><span class="mono" style="text-align:right;font-size:13px;color:#b4afa8">${pc}</span>
          <span class="mono tb-pts" style="text-align:right;padding-right:12px;font-size:15px;font-weight:600">${pts}</span></div>`).join('')}
      </div>
    </section>
    <div style="display:flex;flex:1 1 300px;min-width:0;flex-direction:column;gap:16px">
      <section style="${PAINEL};display:flex;flex-direction:column;gap:12px;padding:22px"><span class="mono" style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:#ff5b1f">A TUA POSIÇÃO</span>
        <div style="display:flex;align-items:center;gap:12px"><span id="tb-eu" class="mono" style="font-size:40px;line-height:1;font-weight:600;letter-spacing:-0.04em;color:#ff5b1f">#5</span><span style="display:flex;flex-direction:column"><span style="font-size:15px;font-weight:700">Nyx<span class="mono" style="font-size:11px;font-weight:500;color:#8a857e">#4521</span></span><span id="tb-eu-s" class="mono" style="font-size:12px;color:#b4afa8">1193 pts · 21-13 · 62%</span></span></div></section>
      <section style="${PAINEL};display:flex;flex-direction:column;gap:14px;padding:22px"><div style="display:flex;flex-direction:column;gap:5px"><span class="mono" style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:#ff5b1f">SIMULADOR</span><h2 style="margin:0;font-size:19px;font-weight:700;letter-spacing:-0.02em">Quanto ganhas ou perdes</h2></div>
        ${segmentado(['Vitória', 'Derrota'], 0)}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.03);padding:12px"><span style="display:grid;place-items:center;width:40px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,0.12)">−</span><span style="display:flex;flex-direction:column;align-items:center;gap:2px"><span class="mono" style="font-size:18px;font-weight:600">+1 divisão</span><span style="font-size:12px;color:#8a857e">adversários com média Diamante 3</span></span><span style="display:grid;place-items:center;width:40px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,0.12)">+</span></div>
        <div style="display:flex;align-items:baseline;justify-content:space-between"><span style="font-size:13px;color:#b4afa8">+20 de base, +3 pelo rank</span><span class="mono" style="font-size:34px;font-weight:600;color:#5fe3d6">+23</span></div></section>
    </div>
  </div>`
}
function desenharTabela(t, T) {
  const subiu = t >= T.subir
  const pts = Math.round(1193 + 26 * sair(prog(t, T.subir - 0.6, T.subir)))
  const lista = TABELA.map(([n, , , p]) => ({ n, p: n === 'Nyx' ? pts : p }))
  const ordem = [...lista].sort((a, b) => b.p - a.p)
  $$('.tb-l').forEach((el) => {
    const pos = ordem.findIndex((x) => x.n === el.dataset.n)
    el.style.top = `${misturar(Number(el.dataset.top ?? pos * 53), pos * 53, 1)}px`
    el.style.transition = 'none'
    el.style.top = `${pos * 53}px`
    $('.tb-pos', el).textContent = `#${pos + 4}`
    if (el.dataset.n === 'Nyx') $('.tb-pts', el).textContent = String(pts)
  })
  // A troca de lugar desliza (sem depender de transições CSS, para cada fotograma ser exato).
  const nyx = $('.tb-l[data-n="Nyx"]'), sombra = $('.tb-l[data-n="Sombra"]')
  const ps = suave(prog(t, T.subir, T.subir + 0.55))
  nyx.style.top = `${misturar(53, 0, ps)}px`; sombra.style.top = `${misturar(0, 53, ps)}px`
  $('.tb-pos', nyx).textContent = ps > 0.5 ? '#4' : '#5'; $('.tb-pos', sombra).textContent = ps > 0.5 ? '#5' : '#4'
  nyx.style.zIndex = '2'; nyx.style.boxShadow = ps > 0 && ps < 1 ? '0 10px 40px -10px rgba(255,91,31,0.6)' : 'none'
  $('#tb-eu').textContent = ps > 0.5 ? '#4' : '#5'
  $('#tb-eu-s').textContent = `${pts} pts · ${subiu || ps > 0 ? '22-13 · 63%' : '21-13 · 62%'}`
  $('.tb-vd', nyx).textContent = ps > 0 ? '22-13' : '21-13'
}

// ------------------------------------------------------------------ o que o vídeo usa
window.ECRAS = {
  fila: { html: ecraFila, desenhar: desenharFila, h: 640 },
  draft: { html: ecraDraft, desenhar: desenharDraft, h: 720 },
  mapas: { html: ecraMapas, desenhar: desenharMapas, h: 760 },
  resultado: { html: ecraResultado, desenhar: desenharResultado, h: 960 },
  tabela: { html: ecraTabela, desenhar: desenharTabela, h: 900 },
}
window.IMAGENS_ECRAS = [...POOL.map(([m]) => imgMapa(m)), ...Object.keys(AG).map(iconeAgente)]
