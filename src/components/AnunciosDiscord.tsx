import { Bold, Code, ExternalLink, Italic, Link2, List, Megaphone, Quote, Strikethrough, Underline } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAcao } from '@/contexts/Avisos'
import { dados, type AnuncioDiscord } from '@/lib/data'
import { TextoDiscord } from '@/lib/discordMarkdown'
import { l } from '@/lib/idioma'
import { Segmentado } from './ui'

const MAX_TITULO = 256
const MAX_MENSAGEM = 4000
const ICONE = 'https://cdn.discordapp.com/emojis/1559320107606614087.png'
/** O aviso do rodapé: igual ao que o bot escreve (supabase/functions/_shared/discord-anuncio.ts). */
const RODAPE = 'Rangify Hub é um projeto independente: não é afiliado, desenvolvido nem apoiado pela Riot Games.'

/** As formas de escrever: o que se digita e o que aparece no Discord. */
const GUIA: { escreves: string; aparece: string }[] = [
  { escreves: '**texto**', aparece: '**texto**' },
  { escreves: '*texto*  ou  _texto_', aparece: '*texto*' },
  { escreves: '***texto***', aparece: '***texto***' },
  { escreves: '__texto__', aparece: '__texto__' },
  { escreves: '~~texto~~', aparece: '~~texto~~' },
  { escreves: '`código`', aparece: '`código`' },
  { escreves: '||texto||', aparece: '||spoiler (passa o rato)||' },
  { escreves: '[texto](https://…)', aparece: '[um link](https://discord.com)' },
  { escreves: '> citação', aparece: '> citação' },
  { escreves: '- item', aparece: '- item\n- outro item' },
  { escreves: '1. item', aparece: '1. primeiro\n2. segundo' },
  { escreves: '# Título', aparece: '# Título grande' },
  { escreves: '## Título', aparece: '## Título médio' },
  { escreves: '-# texto', aparece: '-# texto pequeno e cinzento' },
  { escreves: '```bloco```', aparece: '```\nbloco de código\n```' },
]

const hora = () => new Date().toLocaleTimeString(l('pt-PT', 'en-GB'), { hour: '2-digit', minute: '2-digit' })

/** A pré-visualização do aviso, com o mesmo padrão que o bot publica: barra laranja, "Rangify Hub" no topo e o aviso da Riot no fim. */
function PreVisualizacao({ titulo, mensagem, imagem, avisar }: AnuncioDiscord) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-[#313338] p-3.5 text-[#dbdee1]" aria-label={l('Pré-visualização do aviso', 'Announcement preview')}>
      {avisar !== 'nao' && <span className="text-[14px]"><span className="rounded bg-[#5865f2]/30 px-1 text-[#c9cdfb]">@{avisar}</span></span>}
      <div className="flex max-w-[520px] overflow-hidden rounded-[4px] border-l-4 border-[#ff5b1f] bg-[#2b2d31]">
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-3.5 py-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-white">
            <img src={ICONE} alt="" width={22} height={22} className="size-[22px] rounded-full" />Rangify Hub
          </span>
          {titulo.trim() && <span className="text-[16px] font-bold text-white">{titulo.trim()}</span>}
          <div className="text-[14px] leading-[1.375] break-words">
            {mensagem.trim() ? <TextoDiscord texto={mensagem.trim()} /> : <span className="text-[#949ba4]">{l('A mensagem aparece aqui.', 'The message shows up here.')}</span>}
          </div>
          {imagem.trim().startsWith('https://') && <img src={imagem.trim()} alt="" className="max-h-[300px] max-w-full rounded-[4px] object-contain" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
          <span className="flex items-center gap-1.5 pt-0.5 text-[12px] text-[#b5bac1]">
            <img src={ICONE} alt="" width={20} height={20} className="size-5 shrink-0 rounded-full" />
            <span>{RODAPE} <span className="text-[#949ba4]">• {l('Hoje às', 'Today at')} {hora()}</span></span>
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Staff › Discord: escrever um aviso e o bot publica-o no canal de avisos (que ele cria na primeira vez, visível para o cargo
 * Member e só de leitura). O aviso tem sempre o mesmo padrão; o título, o texto e a imagem são livres.
 */
export function AnunciosDiscord() {
  const acao = useAcao()
  const campo = useRef<HTMLTextAreaElement>(null)
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [imagem, setImagem] = useState('')
  const [avisar, setAvisar] = useState<AnuncioDiscord['avisar']>('nao')
  const [aEnviar, setAEnviar] = useState(false)
  const [ultimo, setUltimo] = useState<{ link: string; canalCriado: boolean; semMember: boolean } | null>(null)

  const pronto = mensagem.trim().length > 0 && mensagem.length <= MAX_MENSAGEM && titulo.length <= MAX_TITULO && (!imagem.trim() || /^https:\/\/\S+$/i.test(imagem.trim()))

  /** Envolve o texto selecionado (ou deixa os símbolos vazios para escrever lá dentro). */
  const envolver = (abre: string, fecha = abre) => {
    const t = campo.current
    if (!t) return
    const [a, b] = [t.selectionStart, t.selectionEnd]
    const meio = mensagem.slice(a, b)
    setMensagem(mensagem.slice(0, a) + abre + meio + fecha + mensagem.slice(b))
    requestAnimationFrame(() => { t.focus(); t.setSelectionRange(a + abre.length, a + abre.length + meio.length) })
  }
  /** Põe o símbolo no início de cada linha selecionada (citação, lista). */
  const prefixo = (p: string) => {
    const t = campo.current
    if (!t) return
    const [a, b] = [t.selectionStart, t.selectionEnd]
    const inicio = mensagem.lastIndexOf('\n', a - 1) + 1
    const bloco = mensagem.slice(inicio, b).split('\n').map((x) => p + x).join('\n')
    setMensagem(mensagem.slice(0, inicio) + bloco + mensagem.slice(b))
    requestAnimationFrame(() => t.focus())
  }

  const enviar = async () => {
    if (avisar !== 'nao' && !window.confirm(l(`Isto avisa @${avisar} no Discord: toda a gente recebe uma notificação. Enviar mesmo assim?`, `This pings @${avisar} on Discord: everyone gets a notification. Send anyway?`))) return
    setAEnviar(true)
    const r = await acao(() => dados.publicarAnuncioDiscord({ titulo: titulo.trim(), mensagem: mensagem.trim(), imagem: imagem.trim(), avisar }), l('Aviso publicado no Discord.', 'Announcement posted on Discord.'))
    setAEnviar(false)
    if (r) {
      setUltimo({ link: r.link, canalCriado: r.canalCriado, semMember: r.semMember })
      setMensagem('')
      setTitulo('')
      setImagem('')
      setAvisar('nao')
    }
  }
  const criarCanal = async () => {
    const r = await acao(() => dados.criarCanalAnunciosDiscord(), l('Canal de avisos pronto.', 'Announcements channel ready.'))
    if (r) setUltimo({ link: r.link, canalCriado: r.canalCriado, semMember: r.semMember })
  }

  const botaoFormato = 'grid size-9 cursor-pointer place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-suave hover:bg-white/10 hover:text-texto'
  return (
    <div className="flex flex-col gap-4">
      <span className="flex flex-col gap-1">
        <span className="max-w-[680px] text-[13px] leading-normal text-mudo">
          {l('Escreve o aviso e carrega em enviar: o bot publica-o no canal de avisos (cria-o na primeira vez, visível para o cargo Member e só de leitura). Todos os avisos levam a barra laranja, "Rangify Hub" no topo e, no fim, a nota de que o hub não é afiliado com a Riot. O título, o texto e a imagem são teus.', 'Write the announcement and click send: the bot posts it in the announcements channel (it creates it the first time, visible to the Member role and read-only). Every announcement has the orange bar, "Rangify Hub" at the top and, at the bottom, the note that the hub is not affiliated with Riot. The title, text and image are yours.')}
        </span>
      </span>

      <div className="@container">
      <div className="grid gap-5 @min-[900px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('Título (opcional)', 'Title (optional)')}
            <input className="campo" value={titulo} maxLength={MAX_TITULO} onChange={(e) => setTitulo(e.target.value)} placeholder={l('Ex.: Novidades da semana', 'E.g.: This week\'s news')} />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-[#d0cbc4]">
              <label htmlFor="rg-anuncio-texto">{l('Mensagem', 'Message')}</label>
              <span className={`font-mono text-[11.5px] font-normal ${mensagem.length > MAX_MENSAGEM ? 'text-derrota' : 'text-mudo'}`}>{mensagem.length}/{MAX_MENSAGEM}</span>
            </span>
            <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label={l('Formatar o texto', 'Format the text')}>
              <button type="button" className={botaoFormato} title={l('Negrito', 'Bold')} aria-label={l('Negrito', 'Bold')} onClick={() => envolver('**')}><Bold size={15} aria-hidden /></button>
              <button type="button" className={botaoFormato} title={l('Itálico', 'Italic')} aria-label={l('Itálico', 'Italic')} onClick={() => envolver('*')}><Italic size={15} aria-hidden /></button>
              <button type="button" className={botaoFormato} title={l('Sublinhado', 'Underline')} aria-label={l('Sublinhado', 'Underline')} onClick={() => envolver('__')}><Underline size={15} aria-hidden /></button>
              <button type="button" className={botaoFormato} title={l('Riscado', 'Strikethrough')} aria-label={l('Riscado', 'Strikethrough')} onClick={() => envolver('~~')}><Strikethrough size={15} aria-hidden /></button>
              <button type="button" className={botaoFormato} title={l('Código', 'Code')} aria-label={l('Código', 'Code')} onClick={() => envolver('`')}><Code size={15} aria-hidden /></button>
              <button type="button" className={botaoFormato} title={l('Citação', 'Quote')} aria-label={l('Citação', 'Quote')} onClick={() => prefixo('> ')}><Quote size={15} aria-hidden /></button>
              <button type="button" className={botaoFormato} title={l('Lista', 'List')} aria-label={l('Lista', 'List')} onClick={() => prefixo('- ')}><List size={15} aria-hidden /></button>
              <button type="button" className={botaoFormato} title={l('Link', 'Link')} aria-label={l('Link', 'Link')} onClick={() => envolver('[', '](https://)')}><Link2 size={15} aria-hidden /></button>
            </div>
            <textarea
              id="rg-anuncio-texto"
              ref={campo}
              className="campo min-h-[190px] resize-y py-3 leading-normal"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder={l('Escreve aqui. Enter muda de linha. Usa os botões acima ou o guia abaixo para o negrito, o itálico e o resto.', 'Write here. Enter starts a new line. Use the buttons above or the guide below for bold, italics and the rest.')}
            />
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('Imagem (opcional)', 'Image (optional)')}
            <input className="campo" value={imagem} onChange={(e) => setImagem(e.target.value)} placeholder="https://…" inputMode="url" />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('Avisar alguém?', 'Ping anyone?')}
            <Segmentado rotulo={l('Avisar alguém', 'Ping anyone')} valor={avisar} onChange={setAvisar} opcoes={[{ valor: 'nao', texto: l('Ninguém', 'Nobody') }, { valor: 'here', texto: '@here' }, { valor: 'everyone', texto: '@everyone' }]} />
            <span className="text-[12px] font-normal text-mudo">{l('@here avisa quem está online; @everyone avisa toda a gente. Sem isto, a mensagem não notifica ninguém.', '@here pings whoever is online; @everyone pings everyone. Without it, the message notifies nobody.')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primario" disabled={!pronto || aEnviar} onClick={enviar}><Megaphone size={15} aria-hidden />{aEnviar ? l('A enviar…', 'Sending…') : l('Enviar para o Discord', 'Send to Discord')}</button>
            <button type="button" className="btn btn-fantasma" onClick={criarCanal}>{l('Criar o canal agora', 'Create the channel now')}</button>
            <span className="text-[12.5px] text-mudo">{l('Precisa da função discord-anuncio e da migração 0034 (ver docs/discord.md).', 'Needs the discord-anuncio function and migration 0034 (see docs/discord.md).')}</span>
          </div>
          {ultimo && (
            <div className="flex flex-col gap-1 rounded-xl border border-laranja/30 bg-laranja/10 px-3.5 py-3 text-[13px]" role="status">
              <a href={ultimo.link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 font-semibold text-pessego-claro no-underline hover:underline"><ExternalLink size={14} aria-hidden />{l('Abrir no Discord', 'Open on Discord')}</a>
              {ultimo.canalCriado && <span className="text-mudo">{l('O canal acabou de ser criado.', 'The channel was just created.')}</span>}
              {ultimo.canalCriado && ultimo.semMember && <span className="text-derrota">{l('Não encontrei um cargo "Member": o canal ficou visível para todos. Para o limitar, mete o ID do cargo no secret DISCORD_CARGO_MEMBER e apaga o canal para ser criado outra vez.', 'I could not find a "Member" role: the channel is visible to everyone. To limit it, set the role ID in the DISCORD_CARGO_MEMBER secret and delete the channel so it gets created again.')}</span>}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-[13px] font-semibold text-[#d0cbc4]">{l('Pré-visualização', 'Preview')}</span>
          <PreVisualizacao titulo={titulo} mensagem={mensagem} imagem={imagem} avisar={avisar} />
          <details className="rounded-xl border border-white/8 bg-white/[0.025] px-3.5 py-3">
            <summary className="cursor-pointer text-[13.5px] font-bold">{l('Como escrever em negrito, itálico e o resto', 'How to write bold, italics and the rest')}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="m-0 text-[12.5px] leading-normal text-mudo">{l('Escreve os símbolos à volta do texto (ou seleciona o texto e usa os botões). A pré-visualização mostra o resultado. Enter muda de linha; duas vezes deixa uma linha em branco.', 'Write the symbols around the text (or select the text and use the buttons). The preview shows the result. Enter starts a new line; twice leaves a blank line.')}</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="text-left"><th className="rotulo pr-3 pb-1.5 font-normal">{l('Escreves', 'You type')}</th><th className="rotulo pb-1.5 font-normal">{l('Aparece', 'You get')}</th></tr>
                  </thead>
                  <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                    {GUIA.map((g) => (
                      <tr key={g.escreves} className="align-top">
                        <td className="py-1.5 pr-3 font-mono text-pessego-claro">{g.escreves.split('\n').map((x, i) => <div key={i}>{x}</div>)}</td>
                        <td className="py-1.5 text-[13px] text-texto"><div className="rounded bg-[#2b2d31] px-2 py-1 text-[#dbdee1]"><TextoDiscord texto={g.aparece} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="m-0 text-[12px] leading-normal text-mudo">{l('Podes misturar: **negrito com _itálico_ lá dentro**. Emojis: escreve o emoji (😀) ou :nome: se for do servidor. Menções a cargos ou canais (<@&ID>, <#ID>) aparecem, mas num embed não notificam ninguém: para notificar, usa o "Avisar alguém".', 'You can mix them: **bold with _italics_ inside**. Emojis: type the emoji (😀) or :name: for server ones. Role or channel mentions (<@&ID>, <#ID>) show up, but inside an embed they notify nobody: to notify, use "Ping anyone".')}</p>
            </div>
          </details>
        </div>
      </div>
      </div>
    </div>
  )
}
