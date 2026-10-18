import { Check, Copy, ExternalLink, Gift, Link2, Megaphone, MonitorPlay, RefreshCw, Sparkles, Unlink } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { IconeTwitch } from '@/components/AoVivo'
import { BotaoSegurar, Cabecalho, Carregando, Chip, Painel, Segmentado, TituloPainel } from '@/components/ui'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type ConvidadoLinha } from '@/lib/dados'
import { linkConvite } from '@/lib/convites'
import { l } from '@/lib/idioma'
import { haQuanto } from '@/lib/tempo'

const CORES: { id: string; hex: string; nome: [string, string] }[] = [
  { id: 'laranja', hex: '#ff5b1f', nome: ['Laranja', 'Orange'] },
  { id: 'azul', hex: '#3b9eff', nome: ['Azul', 'Blue'] },
  { id: 'verde', hex: '#3ddc97', nome: ['Verde', 'Green'] },
  { id: 'rosa', hex: '#ff5c9d', nome: ['Rosa', 'Pink'] },
  { id: 'roxo', hex: '#9146ff', nome: ['Roxo', 'Purple'] },
  { id: 'ouro', hex: '#f2c14e', nome: ['Ouro', 'Gold'] },
  { id: 'branco', hex: '#f3f0eb', nome: ['Branco', 'White'] },
]
const CAMPOS: { id: string; nome: [string, string] }[] = [
  { id: 'rank', nome: ['Rank e pontos', 'Rank and points'] },
  { id: 'hoje', nome: ['O dia (V, D, pontos)', 'Today (W, L, points)'] },
  { id: 'estado', nome: ['Fila ou partida', 'Queue or match'] },
  { id: 'ultima', nome: ['Última partida', 'Last match'] },
  { id: 'fim', nome: ['Aviso de fim de partida', 'Match-end banner'] },
]

interface Preferencias { estilo: 'cartao' | 'barra'; cor: string; campos: string[]; escala: number }
const PADRAO: Preferencias = { estilo: 'cartao', cor: 'laranja', campos: CAMPOS.map((c) => c.id), escala: 100 }
const CHAVE_PREFS = 'rangify:overlay-opcoes'

function lerPreferencias(): Preferencias {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFS) ?? 'null')
    if (p && (p.estilo === 'cartao' || p.estilo === 'barra') && Array.isArray(p.campos)) return { ...PADRAO, ...p }
  } catch { /* sem preferências guardadas */ }
  return PADRAO
}

/** Um quadriculado para se ver o fundo transparente do overlay. */
const XADREZ = { backgroundImage: 'conic-gradient(#1a1a1f 25%, #111115 0 50%, #1a1a1f 0 75%, #111115 0)', backgroundSize: '20px 20px' }

/** Mostra uma página do overlay no tamanho que ela tem no OBS, encolhida para caber na largura do painel. */
function Previsao({ src, titulo, largura, altura }: { src: string; titulo: string; largura: number; altura: number }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setK(Math.min(1, el.clientWidth / largura))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [largura])
  return (
    <div ref={caixa} className="overflow-hidden rounded-xl border border-white/10" style={{ ...XADREZ, height: altura * k }}>
      <iframe key={src} src={src} title={titulo} style={{ width: largura, height: altura, transform: `scale(${k})`, transformOrigin: 'top left', border: 0, display: 'block' }} />
    </div>
  )
}

function useCopiar() {
  const avisar = useAvisos()
  return async (texto: string, mensagem: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      avisar(mensagem)
    } catch {
      avisar(l('Não foi possível copiar. Seleciona o texto à mão.', 'Could not copy. Select the text manually.'), 'erro')
    }
  }
}

function CampoLink({ valor, aoCopiar, rotulo }: { valor: string; aoCopiar: () => void; rotulo: string }) {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <input readOnly value={valor} aria-label={rotulo} onFocus={(e) => e.currentTarget.select()} className="campo min-w-0 flex-[1_1_260px] font-mono text-[12.5px]" />
      <button type="button" onClick={aoCopiar} className="btn btn-primario"><Copy size={16} aria-hidden />{l('Copiar', 'Copy')}</button>
    </div>
  )
}

// ------------------------------------------------------------ overlay do OBS

function PainelOverlay() {
  const acao = useAcao()
  const copiar = useCopiar()
  const chave = useCarregar(() => dados.meuOverlay(), [], ['streamers'])
  const [prefs, setPrefs] = useState(lerPreferencias)
  useEffect(() => { try { localStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs)) } catch { /* só uma comodidade */ } }, [prefs])
  const k = chave.valor?.chave
  if (!k) return <Painel className="p-[22px]"><Carregando /></Painel>

  const q = new URLSearchParams()
  if (prefs.estilo !== 'cartao') q.set('estilo', prefs.estilo)
  if (prefs.cor !== 'laranja') q.set('cor', prefs.cor)
  if (prefs.campos.length !== CAMPOS.length) q.set('mostrar', prefs.campos.join(','))
  if (prefs.escala !== 100) q.set('escala', String(prefs.escala))
  const resto = q.toString() ? `?${q}` : ''
  const url = `${window.location.origin}/overlay/${k}${resto}`
  // Com o aviso de fim de partida ligado, o overlay reserva uns 66 px por cima para ele aparecer.
  const comAviso = prefs.campos.includes('fim')
  const tamanho = prefs.estilo === 'barra' ? [1050, 104 + (comAviso ? 66 : 0)] : [360, 304 + (comAviso ? 66 : 0)]
  const largura = Math.round((tamanho[0] * prefs.escala) / 100)
  const altura = Math.round((tamanho[1] * prefs.escala) / 100)
  const alternar = (id: string) => setPrefs((p) => ({ ...p, campos: p.campos.includes(id) ? (p.campos.length > 1 ? p.campos.filter((c) => c !== id) : p.campos) : CAMPOS.map((c) => c.id).filter((c) => c === id || p.campos.includes(c)) }))

  return (
    <Painel aria-labelledby="rg-div-overlay" className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 p-[22px]">
      <TituloPainel eyebrow="OBS" titulo={l('Overlay da live', 'Stream overlay')} id="rg-div-overlay" direita={<MonitorPlay size={20} className="text-laranja" aria-hidden />} />
      <p className="m-0 text-[13px] leading-normal text-mudo">
        {l('Mostra o teu rank, o dia, se estás na fila ou numa partida e a última partida. Atualiza sozinho: põe o link no OBS e esquece.', 'Shows your rank, today\'s results, whether you are in the queue or a match and your last match. It updates by itself: put the link in OBS and forget it.')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[#d0cbc4]">{l('Formato', 'Layout')}</span>
          <Segmentado rotulo={l('Formato', 'Layout')} valor={prefs.estilo} onChange={(estilo) => setPrefs((p) => ({ ...p, estilo }))} pequeno opcoes={[{ valor: 'cartao', texto: l('Cartão', 'Card') }, { valor: 'barra', texto: l('Barra', 'Bar') }]} />
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
          {l('Tamanho', 'Size')}: {prefs.escala}%
          <input type="range" min={50} max={200} step={10} value={prefs.escala} onChange={(e) => setPrefs((p) => ({ ...p, escala: Number(e.target.value) }))} className="accent-[#ff5b1f]" />
        </label>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-semibold text-[#d0cbc4]">{l('Cor de destaque', 'Accent colour')}</legend>
        <div className="flex flex-wrap gap-2">
          {CORES.map((c) => (
            <button key={c.id} type="button" onClick={() => setPrefs((p) => ({ ...p, cor: c.id }))} aria-pressed={prefs.cor === c.id} title={l(c.nome[0], c.nome[1])} aria-label={l(c.nome[0], c.nome[1])}
              className={`grid size-9 place-items-center rounded-full border-2 transition-transform hover:scale-110 ${prefs.cor === c.id ? 'border-white' : 'border-white/15'}`} style={{ background: c.hex }}>
              {prefs.cor === c.id && <Check size={16} className="text-black" aria-hidden />}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-semibold text-[#d0cbc4]">{l('O que mostrar', 'What to show')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {CAMPOS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-[13px] text-suave">
              <input type="checkbox" checked={prefs.campos.includes(c.id)} onChange={() => alternar(c.id)} className="size-4 accent-[#ff5b1f]" />{l(c.nome[0], c.nome[1])}
            </label>
          ))}
        </div>
      </fieldset>
      <Previsao src={url} titulo={l('Pré-visualização do overlay', 'Overlay preview')} largura={largura} altura={altura} />
      <CampoLink valor={url} rotulo={l('Link do overlay', 'Overlay link')} aoCopiar={() => copiar(url, l('Link do overlay copiado.', 'Overlay link copied.'))} />
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-normal text-suave">
        <li>{l('No OBS, em Fontes carrega em +, escolhe', 'In OBS, under Sources press +, choose')} <b className="text-texto">{l('Navegador', 'Browser')}</b>.</li>
        <li>{l('Cola o link em', 'Paste the link in')} <b className="text-texto">URL</b> {l('e põe', 'and set')} <b className="text-texto">{largura} × {altura}</b> ({l('largura × altura', 'width × height')}).</li>
        <li>{l('O fundo já é transparente. Não uses o link nos outros: tem uma chave só tua.', 'The background is already transparent. Do not share the link: it has a key that is only yours.')}</li>
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-3.5">
        <span className="max-w-[360px] text-[12px] text-mudo">{l('Se alguém ficar com o teu link, renova-o: o antigo deixa de funcionar e tens de pôr o novo no OBS.', 'If someone gets your link, renew it: the old one stops working and you have to put the new one in OBS.')}</span>
        <BotaoSegurar rotulo={l('Segura para renovar a chave', 'Hold to renew the key')} className="btn btn-fantasma" onConfirmar={() => acao(async () => { chave.setValor(await dados.renovarOverlay()) }, l('Chave renovada. Atualiza o link no OBS.', 'Key renewed. Update the link in OBS.'))}>
          <RefreshCw size={16} aria-hidden />{l('Renovar a chave', 'Renew the key')}
        </BotaoSegurar>
      </div>
    </Painel>
  )
}

// ------------------------------------------------------------ marca animada

function PainelMarca() {
  const copiar = useCopiar()
  const chave = useCarregar(() => dados.meuOverlay(), [], ['streamers'])
  const k = chave.valor?.chave
  // O link de convite só aparece na marca depois de o código existir (a página dos convites cria-o).
  const [cor, setCor] = useState(() => lerPreferencias().cor)
  const url = k ? `${window.location.origin}/overlay/${k}/marca${cor !== 'laranja' ? `?cor=${cor}` : ''}` : ''
  return (
    <Painel aria-labelledby="rg-div-marca" className="flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-[22px]">
      <TituloPainel eyebrow={l('PARA UM CANTINHO', 'FOR A CORNER')} titulo={l('Marca animada', 'Animated badge')} id="rg-div-marca" direita={<Sparkles size={20} className="text-laranja" aria-hidden />} />
      <p className="m-0 text-[13px] leading-normal text-mudo">
        {l('Um cartão animado para pores num canto da live, com o endereço do Rangify e o teu link de convite inteiro. Três mensagens trocam-se sozinhas: o Rangify, o endereço do site e o bónus de quem se regista. É uma página a correr no OBS e não um GIF, por isso mexe-se com a fluidez da própria live, e o fundo é transparente.', 'An animated card for a corner of your stream, with the Rangify address and your full invite link. Three messages swap by themselves: Rangify, the site address and the bonus new players get. It is a page running in OBS rather than a GIF, so it moves as smoothly as the stream itself, on a transparent background.')}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={l('Cor', 'Colour')}>
        {CORES.map((c) => (
          <button key={c.id} type="button" onClick={() => setCor(c.id)} aria-pressed={cor === c.id} aria-label={l(c.nome[0], c.nome[1])} className={`size-6 rounded-full border-2 ${cor === c.id ? 'border-white' : 'border-white/15'}`} style={{ background: c.hex }} />
        ))}
      </div>
      {url ? (
        <>
          <Previsao src={url} titulo={l('Pré-visualização da marca', 'Badge preview')} largura={460} altura={140} />
          <CampoLink valor={url} rotulo={l('Link da marca', 'Badge link')} aoCopiar={() => copiar(url, l('Link da marca copiado.', 'Badge link copied.'))} />
          <span className="text-[12px] text-mudo">{l('No OBS: Fontes › + › Navegador, cola o link e põe 460 de largura e 140 de altura.', 'In OBS: Sources › + › Browser, paste the link and set 460 wide and 140 high.')}</span>
        </>
      ) : <Carregando />}
    </Painel>
  )
}

// ------------------------------------------------------------ Twitch

function PainelTwitch() {
  const acao = useAcao()
  const avisar = useAvisos()
  const [q, setQ] = useSearchParams()
  const twitch = useCarregar(() => dados.minhaTwitch(), [], ['streamers'])
  const [canal, setCanal] = useState('')
  const [aLigar, setALigar] = useState(false)
  const demo = !!dados.twitchLigarDemo

  // A Twitch devolve a pessoa a /divulgar?twitch=ok (ou erro, com a mensagem).
  useEffect(() => {
    const r = q.get('twitch')
    if (!r) return
    if (r === 'ok') avisar(l('Twitch ligada.', 'Twitch linked.'))
    else avisar(q.get('msg') ?? l('Não foi possível ligar a Twitch.', 'Could not link Twitch.'), 'erro')
    q.delete('twitch'); q.delete('msg')
    setQ(q, { replace: true })
    twitch.recarregar()
  }, [q, setQ, avisar, twitch])

  const ligar = async () => {
    setALigar(true)
    if (demo) await acao(() => dados.twitchLigarDemo!(canal), l('Canal ligado (demo).', 'Channel linked (demo).'))
    else {
      const url = await acao(() => dados.twitchUrlLigar())
      if (url) { window.location.assign(url); return }
    }
    setALigar(false)
  }
  const t = twitch.valor

  return (
    <Painel aria-labelledby="rg-div-twitch" className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 p-[22px]">
      <TituloPainel eyebrow="TWITCH" titulo={l('A tua live no Rangify', 'Your stream on Rangify')} id="rg-div-twitch" direita={<span className="text-[#b48bff]"><IconeTwitch size={22} /></span>} />
      <p className="m-0 text-[13px] leading-normal text-mudo">
        {l('Liga o teu canal e, quando estiveres em direto, aparece "AO VIVO" ao lado do teu nome no Rangify (tabela, perfil e partidas) com um botão para abrirem a tua live. Não pedimos nenhuma permissão à Twitch: só ficamos a saber qual é o canal.', 'Link your channel and, when you are live, "LIVE" shows next to your name on Rangify (leaderboard, profile and matches) with a button to open your stream. We ask Twitch for no permissions: we only learn which channel it is.')}
      </p>
      {twitch.carregando ? <Carregando /> : t ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
            <span className="text-[#b48bff]"><IconeTwitch size={18} /></span>
            <a href={`https://www.twitch.tv/${encodeURIComponent(t.login)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold text-texto no-underline hover:text-pessego">{t.nome}<ExternalLink size={13} aria-hidden /></a>
            {t.aoVivo ? <Chip tom="derrota">{l('EM DIRETO', 'LIVE')}{t.espetadores != null ? ` · ${t.espetadores}` : ''}</Chip> : <Chip>{l('Offline', 'Offline')}</Chip>}
            <span className="ml-auto text-[12px] text-mudo">{l('ligado', 'linked')} {haQuanto(t.ligadaEm)}</span>
          </div>
          {t.aoVivo && t.titulo && <span className="text-[12.5px] text-suave">{t.titulo}{t.jogo ? ` · ${t.jogo}` : ''}</span>}
          <p className="m-0 text-[12px] text-mudo">{l('O "AO VIVO" atualiza ao fim de cerca de um minuto depois de começares ou acabares a live.', 'The "LIVE" tag updates about a minute after you start or end your stream.')}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            {demo && <button type="button" className="btn btn-suave" onClick={() => acao(() => dados.twitchAoVivoDemo!(!t.aoVivo))}>{t.aoVivo ? l('Simular que acabou a live', 'Simulate the stream ending') : l('Simular que estou em direto', 'Simulate going live')}</button>}
            <BotaoSegurar rotulo={l('Segura para desligar a Twitch', 'Hold to unlink Twitch')} className="btn btn-fantasma" onConfirmar={() => acao(() => dados.desligarTwitch(), l('Twitch desligada.', 'Twitch unlinked.'))}>
              <Unlink size={16} aria-hidden />{l('Desligar', 'Unlink')}
            </BotaoSegurar>
          </div>
        </div>
      ) : demo ? (
        <form className="flex flex-wrap items-stretch gap-2.5" onSubmit={(e) => { e.preventDefault(); ligar() }}>
          <input className="campo min-w-0 flex-[1_1_200px]" value={canal} onChange={(e) => setCanal(e.target.value)} placeholder={l('O teu canal (demo)', 'Your channel (demo)')} aria-label={l('Nome do canal da Twitch', 'Twitch channel name')} maxLength={25} />
          <button type="submit" className="btn btn-primario" disabled={aLigar || canal.trim().length < 3}>{l('Ligar canal (demo)', 'Link channel (demo)')}</button>
        </form>
      ) : (
        <div><button type="button" className="btn btn-primario" disabled={aLigar} onClick={ligar}><IconeTwitch size={16} />{aLigar ? l('A abrir a Twitch…', 'Opening Twitch…') : l('Ligar a Twitch', 'Link Twitch')}</button></div>
      )}
    </Painel>
  )
}

// ------------------------------------------------------------ convites

const ESTADO_CONVIDADO: Record<ConvidadoLinha['estado'], { tom: 'neutro' | 'vitoria' | 'laranja'; texto: [string, string] }> = {
  pendente: { tom: 'neutro', texto: ['À espera da 1.ª partida', 'Waiting for the 1st match'] },
  premiado: { tom: 'vitoria', texto: ['Pago', 'Paid'] },
  limite: { tom: 'laranja', texto: ['Limite do mês', 'Monthly limit'] },
}

function PainelConvites() {
  const acao = useAcao()
  const copiar = useCopiar()
  const info = useCarregar(() => dados.meuConvite(), [], ['streamers', 'loja'])
  const loja = useCarregar(() => dados.lojaVisivel(), [], ['loja', 'staff'])
  if (!info.valor) return <Painel className="p-[22px]"><Carregando /></Painel>
  const c = info.valor
  const v = c.valores
  const link = linkConvite(c.codigo)
  const noMarco = c.premiados % v.marcoACada

  return (
    <Painel aria-labelledby="rg-div-convites" className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 p-[22px]">
      <TituloPainel eyebrow={l('CONVITES', 'INVITES')} titulo={l('Traz amigos e ganha coins', 'Bring friends and earn coins')} id="rg-div-convites" direita={<Gift size={20} className="text-laranja" aria-hidden />} />
      <p className="m-0 text-[13px] leading-normal text-mudo">
        {l(`Quando alguém que convidaste jogar a primeira partida, tu ganhas ${v.convidador} coins e essa pessoa ${v.convidado}. A cada ${v.marcoACada} convidados que jogam há mais ${v.bonusMarco}. O máximo são ${v.limiteMes} convites pagos por mês.`, `When someone you invited plays their first match, you earn ${v.convidador} coins and they get ${v.convidado}. Every ${v.marcoACada} invited players who play gives ${v.bonusMarco} more. The limit is ${v.limiteMes} paid invites a month.`)}
      </p>
      {c.conviteDe && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-laranja/30 bg-laranja/8 px-3.5 py-2.5 text-[13px]">
          <Gift size={16} className="text-laranja" aria-hidden />
          {c.conviteDe.estado === 'premiado'
            ? l(`Foste convidado por ${c.conviteDe.utilizador} e já recebeste ${c.conviteDe.moedas} coins.`, `You were invited by ${c.conviteDe.utilizador} and already received ${c.conviteDe.moedas} coins.`)
            : l(`Foste convidado por ${c.conviteDe.utilizador}: recebes ${v.convidado} coins quando acabares a tua primeira partida.`, `You were invited by ${c.conviteDe.utilizador}: you get ${v.convidado} coins when you finish your first match.`)}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{l('O TEU CÓDIGO', 'YOUR CODE')}</span>
        <span className="font-mono text-[30px] leading-none font-bold tracking-[0.18em]">{c.codigo}</span>
        <CampoLink valor={link} rotulo={l('Link de convite', 'Invite link')} aoCopiar={() => copiar(link, l('Link de convite copiado.', 'Invite link copied.'))} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
        {([[l('Convidados', 'Invited'), c.convidados.length], [l('Convites pagos', 'Invites paid'), c.premiados], [l('Coins ganhas', 'Coins earned'), c.moedas]] as [string, number][]).map(([nome, n]) => (
          <div key={nome} className="flex flex-col gap-0.5 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
            <span className="font-mono text-[22px] leading-none font-semibold">{n}</span>
            <span className="text-[12px] text-mudo">{nome}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5" role="status">
        <span className="flex items-center justify-between text-[12px] text-mudo"><span>{l('Para o próximo bónus', 'To the next bonus')} (+{v.bonusMarco})</span><span className="font-mono">{noMarco}/{v.marcoACada}</span></span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-white/8"><span className="block h-full rounded-full bg-laranja transition-[width] duration-300" style={{ width: `${(noMarco / v.marcoACada) * 100}%` }} /></span>
      </div>
      {loja.valor === false && <p className="m-0 text-[12px] text-mudo">{l('A loja de coins ainda não abriu ao público: as coins ficam guardadas na tua conta até abrir.', 'The coin shop is not open to the public yet: coins stay saved on your account until it opens.')}</p>}
      {c.convidados.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {c.convidados.map((x) => (
            <li key={x.perfilId} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2 text-[13.5px]">
              <span className="min-w-0 flex-1 truncate font-semibold">{x.utilizador}</span>
              <Chip tom={ESTADO_CONVIDADO[x.estado].tom}>{l(ESTADO_CONVIDADO[x.estado].texto[0], ESTADO_CONVIDADO[x.estado].texto[1])}{x.estado === 'premiado' ? ` +${x.moedas}` : ''}</Chip>
              <span className="font-mono text-[11.5px] text-mudo">{haQuanto(x.desde)}</span>
            </li>
          ))}
        </ul>
      )}
      {dados.conviteConvidadoDemo && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/7 pt-3.5">
          <button type="button" className="btn btn-suave" onClick={() => acao(() => dados.conviteConvidadoDemo!(), l('Convidado de teste criado e pago.', 'Test invitee created and paid.'))}>{l('Simular um convidado que jogou', 'Simulate an invitee who played')}</button>
          <span className="text-[12px] text-mudo">{l('Só no modo demo: faz de conta que alguém registou-se pelo teu link e jogou a primeira partida.', 'Demo mode only: pretends someone signed up through your link and played their first match.')}</span>
        </div>
      )}
    </Painel>
  )
}

// ------------------------------------------------------------ página

export function Divulgar() {
  const { perfil, eStaff } = useSessao()
  const navegar = useNavigate()
  const visivel = useCarregar(() => dados.streamersVisivel(), [perfil?.id], ['streamers', 'staff'])
  const publico = useCarregar(() => (eStaff ? dados.divulgacaoEstado().then((e) => e.publico) : Promise.resolve(true)), [eStaff], ['staff', 'streamers'])
  if (!perfil || visivel.carregando) return <Carregando />
  if (!visivel.valor) return <Navigate to="/" replace />
  return (
    <>
      <Cabecalho
        migalhas={[l('Comunidade', 'Community'), l('Divulgar', 'Share')]}
        titulo={l('Divulgar o Rangify', 'Spread the word')}
        descricao={l('O overlay para a tua live, a marca animada, a ligação à Twitch e os teus convites com recompensa.', 'The overlay for your stream, the animated badge, the Twitch link and your invites with a reward.')}
      />
      {publico.valor === false && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-laranja/30 bg-laranja/8 px-4 py-3 text-[13px]" role="note">
          <Megaphone size={18} className="text-laranja" aria-hidden />
          <span className="min-w-0 flex-1">{l('Esta área ainda está fechada: só Owner e Dev a veem. Quando estiver tudo testado, abre-a a toda a gente em Staff › Divulgação.', 'This area is still closed: only Owner and Dev see it. When everything is tested, open it to everyone in Staff › Promotion.')}</span>
          <button type="button" className="btn btn-fantasma" onClick={() => navegar('/admin')}><Link2 size={15} aria-hidden />{l('Ir para a Staff', 'Go to Staff')}</button>
        </div>
      )}
      <div className="flex flex-wrap items-stretch gap-4">
        <PainelOverlay />
        <PainelMarca />
      </div>
      <div className="flex flex-wrap items-stretch gap-4">
        <PainelTwitch />
        <PainelConvites />
      </div>
    </>
  )
}
