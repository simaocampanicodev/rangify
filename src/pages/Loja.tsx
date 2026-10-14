import { Check, Eye, FlaskConical, ImagePlay, Lock, RotateCcw, ShoppingBag, Sparkles, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BannerPerfil, DecoracaoAvatar, FundoBanner, DecoracaoMvp, ExtraLinha, TituloJogador, useClassesCosmeticos } from '@/components/Cosmeticos'
import { NomeRangify } from '@/components/Marca'
import { Avatar, BotaoSegurar, Cabecalho, Carregando, Chip, Painel, SeloMvp, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useAgora } from '@/hooks/useAgora'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type LojaAberta, type Perfil } from '@/lib/dados'
import { l } from '@/lib/idioma'
import {
  CATEGORIAS_LOJA, COINS_POR_MARCO, COINS_POR_MVP, COINS_POR_NIVEL, COINS_POR_SEMANAL, COR_RARIDADE, ITEM_POR_ID, ITENS_LOJA, NOME_RARIDADE,
  formatarCoins, gifValida, type CategoriaLoja, type Cosmeticos, type ItemLoja,
} from '@/lib/loja'
import { nomeJogador, tagJogador } from '@/lib/partida'

const lg = (par: [string, string]) => l(par[0], par[1])
const nomeCategoria = (c: CategoriaLoja) => lg(CATEGORIAS_LOJA.find((x) => x.id === c)!.uma)

/** A moeda do Rangify: o símbolo do "R" dentro de um círculo laranja. */
export function Moeda({ tamanho = 16 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="#ff5b1f" />
      <g transform="translate(5.2 7) scale(0.24)">
        <path transform="translate(-12 -18)" d="M23 19.5H66.25L55 35.4H67.5L40 58.75L51.25 41.25H40.25L50.6 28H27C24 28 22 30.5 22 33.75C22 37 24 39.75 27 39.75H38.2L23.1 58.5H13.1L23.1 46.25C17 46.25 13.5 40.5 13.5 33C13.5 25.5 17.5 19.5 23 19.5Z" fill="#170802" />
      </g>
    </svg>
  )
}

function relogioAte(alvo: string, agora: number) {
  const s = Math.max(0, Math.floor((Date.parse(alvo) - agora) / 1000))
  const d = Math.floor(s / 86400)
  const p = (n: number) => String(n).padStart(2, '0')
  if (d >= 1) return l(`${d} ${d === 1 ? 'dia' : 'dias'} e ${Math.floor((s % 86400) / 3600)} h`, `${d} ${d === 1 ? 'day' : 'days'} ${Math.floor((s % 86400) / 3600)} h`)
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

/** O que se vê: o que está equipado, com o item que estás a experimentar por cima. */
function cosmeticosVistos(loja: LojaAberta, ver: ItemLoja | null): Cosmeticos {
  const base: Cosmeticos = { ...loja.equipados }
  if (base.gif) base.gif = loja.avatarGif ?? 'gif'
  if (!ver) return base
  return { ...base, [ver.categoria]: ver.categoria === 'gif' ? loja.avatarGif ?? 'gif' : ver.id }
}

// ------------------------------------------------------------ a montra de cada item

function FotoNyx({ perfil, tamanho, cos }: { perfil: Perfil; tamanho: number; cos: Cosmeticos }) {
  return (
    <DecoracaoAvatar cos={cos} tamanho={tamanho} raio={Math.round(tamanho * 0.27)}>
      <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} tamanho={tamanho} destaque />
    </DecoracaoAvatar>
  )
}

function Nome({ perfil, tamanho = 14 }: { perfil: Perfil; tamanho?: number }) {
  return <span className="cz-nome truncate font-bold" style={{ fontSize: tamanho }}>{nomeJogador(perfil)}</span>
}

/** O item a ser usado, como aparece no site (o mesmo CSS das decorações a sério). */
function Montra({ item, perfil }: { item: ItemLoja; perfil: Perfil }) {
  const cos: Cosmeticos = { [item.categoria]: item.categoria === 'gif' ? 'gif' : item.id }
  const cz = useClassesCosmeticos(null, cos)
  switch (item.categoria) {
    case 'borda': case 'efeito': case 'gif':
      return <FotoNyx perfil={perfil} tamanho={68} cos={cos} />
    case 'placa':
      return (
        <div className={`flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3 ${cz.placa}`}>
          <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} tamanho={36} destaque />
          <span className="flex min-w-0 flex-col"><Nome perfil={perfil} /><span className="font-mono text-[10.5px] text-mudo">{perfil.riotId ?? perfil.utilizador}</span></span>
        </div>
      )
    case 'banner':
      return (
        <div className="w-full">
          <BannerPerfil cos={cos} className="!h-[74px] !rounded-xl" />
          <span className="relative z-[1] -mt-5 ml-3 flex items-end gap-2"><Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} tamanho={40} destaque /></span>
        </div>
      )
    case 'titulo':
      return (
        <span className="flex items-center gap-3">
          <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} tamanho={46} destaque />
          <span className="flex min-w-0 flex-col gap-1"><Nome perfil={perfil} tamanho={17} /><TituloJogador cos={cos} /></span>
        </span>
      )
    case 'cartao':
      return (
        <div data-assinatura={nomeJogador(perfil)} className={`flex w-full max-w-[220px] flex-col gap-2 rounded-2xl border border-white/10 bg-[rgba(16,16,19,0.88)] p-3 ${cz.cartao}`}>
          <span className="flex items-center gap-2"><Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} tamanho={30} destaque /><Nome perfil={perfil} tamanho={13} /></span>
          <span className="font-mono text-[10.5px] text-suave">KDA 1.34 · VIT 58% · ACS 241</span>
        </div>
      )
    case 'linha':
      return (
        <div className={`flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5 ${cz.linha}`}>
          <span className="font-mono text-[12px] text-laranja">#4</span>
          <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} tamanho={26} destaque />
          <Nome perfil={perfil} tamanho={13.5} /><ExtraLinha />
          <span className="ml-auto font-mono text-[12.5px] font-semibold">{perfil.pontos}</span>
        </div>
      )
    case 'mvp':
      return (
        <div className="cz-loop flex w-full items-center gap-2.5 rounded-xl border border-laranja/22 bg-laranja/6 px-3 py-2.5">
          <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} tamanho={26} destaque />
          <Nome perfil={perfil} tamanho={13.5} />
          <span className="ml-auto font-mono text-[12.5px] font-semibold text-pessego-claro">142</span>
          <DecoracaoMvp cos={cos}><SeloMvp tamanho={22} /></DecoracaoMvp>
        </div>
      )
  }
}

// ------------------------------------------------------------ cartão de um item à venda

function CartaoItem({ item, loja, perfil, vendo, onVer, etiqueta, grande = false }: {
  item: ItemLoja; loja: LojaAberta; perfil: Perfil; vendo: boolean; onVer: () => void; etiqueta?: ReactNode; grande?: boolean
}) {
  const acao = useAcao()
  const [aFazer, setAFazer] = useState(false)
  const tem = loja.inventario.includes(item.id)
  const equipado = loja.equipados[item.categoria] === item.id
  const falta = item.preco - loja.moedas
  const fazer = async (f: () => Promise<unknown>, ok?: string) => { setAFazer(true); await acao(f, ok); setAFazer(false) }

  let botao: ReactNode
  if (equipado) {
    botao = <button type="button" className="btn btn-fantasma" disabled={aFazer} onClick={() => fazer(() => dados.desequiparItem(item.categoria))}>{l('Tirar', 'Unequip')}</button>
  } else if (tem) {
    botao = item.categoria === 'gif' && !loja.avatarGif
      ? <a href="#rg-gif" className="btn btn-suave no-underline">{l('Pôr o link', 'Add link')}</a>
      : <button type="button" className="btn btn-suave" disabled={aFazer} onClick={() => fazer(() => dados.equiparItem(item.id), l(`${item.nome} equipado.`, `${item.nome} equipped.`))}>{l('Equipar', 'Equip')}</button>
  } else if (item.conquista && !loja.staff) {
    botao = <span className="btn btn-fantasma cursor-default opacity-70"><Lock size={14} aria-hidden />{l('Conquista', 'Achievement')}</span>
  } else if (falta > 0) {
    botao = <button type="button" className="btn btn-primario" disabled>{l(`Faltam ${formatarCoins(falta)}`, `${formatarCoins(falta)} short`)}</button>
  } else {
    botao = (
      <button type="button" className="btn btn-primario" disabled={aFazer} onClick={() => fazer(() => dados.comprarItem(item.id), l(`Compraste ${item.nome}.`, `You bought ${item.nome}.`))}>
        {item.conquista ? l('Obter (teste)', 'Get (test)') : l('Comprar', 'Buy')}
      </button>
    )
  }

  return (
    <article className={`painel cartao-hover cz-item flex flex-col overflow-hidden !rounded-2xl [contain-intrinsic-size:auto_330px] [content-visibility:auto] ${vendo ? 'cz-sempre !border-laranja/70 shadow-[0_0_0_3px_rgba(255,91,31,0.15)]' : ''}`}>
      <div className={`relative grid place-items-center border-b border-white/6 bg-[radial-gradient(80%_90%_at_50%_40%,rgba(255,91,31,0.08),transparent_70%)] px-4 ${grande ? 'h-[190px]' : 'h-[150px]'}`}>
        {etiqueta && <span className="absolute top-2.5 left-3 font-mono text-[10px] tracking-[0.14em] text-mudo uppercase">{etiqueta}</span>}
        {tem && (
          <span className="absolute top-2.5 right-3 inline-flex h-[22px] items-center gap-1 rounded-full border border-laranja/35 bg-[rgba(9,9,11,0.7)] px-2 font-mono text-[10.5px] text-pessego">
            <Check size={11} strokeWidth={3} aria-hidden />{equipado ? l('Equipado', 'Equipped') : l('Teu', 'Yours')}
          </span>
        )}
        <Montra item={item} perfil={perfil} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="rotulo">{nomeCategoria(item.categoria)}</span>
          <span className={`font-bold tracking-[-0.01em] ${grande ? 'text-[18px]' : 'text-[15.5px]'}`}>{item.nome}</span>
          {item.conquista && <span className="text-[12.5px] leading-snug text-mudo">{item.conquista}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className={`font-mono text-[10.5px] tracking-[0.12em] uppercase ${COR_RARIDADE[item.raridade]}`}>{lg(NOME_RARIDADE[item.raridade])}</span>
          {!item.conquista && <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-bold"><Moeda tamanho={14} />{formatarCoins(item.preco)}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-fantasma !px-2.5" onClick={onVer} aria-pressed={vendo} aria-label={l(`Experimentar ${item.nome}`, `Try ${item.nome}`)}><Eye size={15} aria-hidden />{l('Ver', 'Try')}</button>
          {botao}
        </div>
        {loja.staff && tem && (
          <button type="button" className="self-start border-0 bg-transparent p-0 text-[12px] font-semibold text-mudo underline-offset-2 hover:text-pessego hover:underline" disabled={aFazer} onClick={() => fazer(() => dados.lojaDevolver(item.id), l('Item devolvido. As coins voltaram.', 'Item returned. Coins refunded.'))}>
            <Undo2 size={12} className="mr-1 inline" aria-hidden />{l('Devolver (teste)', 'Return (test)')}
          </button>
        )}
      </div>
    </article>
  )
}

// ------------------------------------------------------------ página

export function Loja() {
  const { perfil } = useSessao()
  const r = useCarregar(() => dados.loja(), [perfil?.id], ['loja'])
  const [verId, setVerId] = useState<string | null>(null)
  const [vista, setVista] = useState<'hoje' | 'catalogo'>('hoje')
  const [filtro, setFiltro] = useState<CategoriaLoja | 'tudo'>('tudo')
  const agora = useAgora(1000)
  const loja = r.valor && r.valor.visivel ? r.valor : null

  // À meia-noite de Lisboa a loja muda: pede a nova.
  const mudou = !!loja && Date.parse(loja.hoje.mudaEm) <= agora
  const { recarregar } = r
  useEffect(() => { if (mudou) recarregar() }, [mudou, recarregar])

  const ver = verId ? ITEM_POR_ID[verId] ?? null : null
  const vistos = useMemo(() => (loja ? cosmeticosVistos(loja, ver) : {}), [loja, ver])

  if (!perfil || (!r.valor && !r.erro)) return <Carregando />
  if (r.erro) return <Vazio icone={<ShoppingBag size={22} />} titulo={l('Não foi possível abrir a loja.', 'Could not open the shop.')} texto={r.erro} />
  if (!loja) return <Vazio icone={<Lock size={22} />} titulo={l('A loja ainda não abriu.', 'The shop is not open yet.')} texto={l('Está a ser preparada. Vais ver o botão no menu quando abrir.', 'It is being prepared. The menu will show it when it opens.')} />

  const alternar = (id: string) => setVerId((v) => (v === id ? null : id))
  const cartao = (id: string | null, etiqueta?: ReactNode, grande = false) => {
    const item = id ? ITEM_POR_ID[id] : null
    if (!item) return null
    return <CartaoItem key={id} item={item} loja={loja} perfil={perfil} vendo={verId === id} onVer={() => alternar(item.id)} etiqueta={etiqueta} grande={grande} />
  }
  const catalogo = ITENS_LOJA.filter((i) => filtro === 'tudo' || i.categoria === filtro)

  return (
    <>
      <Cabecalho
        migalhas={['Hub', l('Loja', 'Shop')]}
        titulo={<>{l('A loja do ', 'The ')}<NomeRangify className="text-laranja" />{l('', ' shop')}</>}
        descricao={l(
          'Gasta as Rangify Coins que ganhas no Rangify Experience em decorações para o teu perfil, o teu cartão no draft e a tua linha na tabela. Nada aqui dá vantagem em jogo.',
          'Spend the Rangify Coins you earn in the Rangify Experience on decorations for your profile, your draft card and your leaderboard row. Nothing here gives an in-game advantage.',
        )}
        acoes={<>
          <span className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-laranja/32 bg-laranja/10 px-3.5 font-mono text-[15px] font-bold text-pessego-claro">
            <Moeda tamanho={18} />{formatarCoins(loja.moedas)}<span className="font-medium text-mudo">RC</span>
          </span>
          <Link to="/missoes" className="btn btn-fantasma no-underline">{l('Ver o Experience', 'See the Experience')}</Link>
        </>}
      />

      {loja.staff && <PainelTeste loja={loja} />}

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
        <Painel className="flex flex-col gap-4 p-[22px]">
          <span className="eyebrow">{l('O teu saldo', 'Your balance')}</span>
          <span className="flex items-baseline gap-2.5">
            <span className="text-[48px] leading-none font-extrabold tracking-[-0.04em]">{formatarCoins(loja.moedas)}</span>
            <span className="font-serif text-[24px] text-laranja italic">coins</span>
          </span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 font-mono text-[12px] text-mudo">
            <li className="flex justify-between gap-3"><span>{l(`Níveis do Experience (nível ${loja.ganhas.nivel})`, `Experience levels (level ${loja.ganhas.nivel})`)}</span><span className="text-pessego">+{formatarCoins(loja.ganhas.porNivel + loja.ganhas.porMarcos)}</span></li>
            <li className="flex justify-between gap-3"><span>{l('Missões semanais', 'Weekly missions')}</span><span className="text-pessego">+{formatarCoins(loja.ganhas.porSemanais)}</span></li>
            <li className="flex justify-between gap-3"><span>MVP</span><span className="text-pessego">+{formatarCoins(loja.ganhas.porMvp)}</span></li>
            {loja.ganhas.testes !== 0 && <li className="flex justify-between gap-3"><span>{l('Coins de teste', 'Test coins')}</span><span className="text-pessego">{loja.ganhas.testes > 0 ? '+' : ''}{formatarCoins(loja.ganhas.testes)}</span></li>}
          </ul>
        </Painel>
        <Painel className="flex flex-col gap-3.5 p-[22px]">
          <span className="eyebrow">{l('Como ganhas coins', 'How you earn coins')}</span>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[14px]">
            {[
              [l('Cada nível do Experience', 'Each Experience level'), COINS_POR_NIVEL],
              [l('Cada 5.º nível (5, 10, 15…)', 'Every 5th level (5, 10, 15…)'), COINS_POR_MARCO],
              [l('Missão semanal completa', 'Weekly mission completed'), COINS_POR_SEMANAL],
              [l('MVP de uma partida', 'Match MVP'), COINS_POR_MVP],
            ].map(([t, v]) => (
              <li key={String(t)} className="flex items-center justify-between gap-3"><span className="text-suave">{t}</span><span className="font-mono text-[12.5px] font-bold text-pessego">+{v}</span></li>
            ))}
          </ul>
          <span className="mt-auto text-[12.5px] text-mudo">{l('As coins não se compram com dinheiro e não passam de uma conta para outra.', 'Coins cannot be bought with money and cannot be transferred.')}</span>
        </Painel>
      </section>

      <section className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <TituloPainel
            eyebrow={vista === 'hoje' ? l(`LOJA DE HOJE · MUDA EM ${relogioAte(loja.hoje.mudaEm, agora)}`, `TODAY'S SHOP · CHANGES IN ${relogioAte(loja.hoje.mudaEm, agora)}`) : l('CATÁLOGO COMPLETO · SÓ OWNER E DEV', 'FULL CATALOGUE · OWNER AND DEV ONLY')}
            titulo={vista === 'hoje' ? l('Muda todos os dias à meia-noite', 'Changes every day at midnight') : l(`${catalogo.length} itens para testar`, `${catalogo.length} items to test`)}
            direita={loja.staff ? (
              <Segmentado pequeno rotulo={l('Vista da loja', 'Shop view')} valor={vista} onChange={setVista}
                opcoes={[{ valor: 'hoje', texto: l('Loja de hoje', "Today's shop") }, { valor: 'catalogo', texto: l('Catálogo completo', 'Full catalogue') }]} />
            ) : undefined}
          />

          {vista === 'hoje' ? (
            <>
              <div className="cz-calmo grid grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] gap-3.5">
                {cartao(loja.hoje.destaque, <span className="text-ouro">{l(`Destaque · sai em ${relogioAte(loja.hoje.destaqueAte, agora)}`, `Featured · leaves in ${relogioAte(loja.hoje.destaqueAte, agora)}`)}</span>, true)}
                {loja.hoje.semanais.map((id) => cartao(id, l(`Semanal · sai em ${relogioAte(loja.hoje.semanaisAte, agora)}`, `Weekly · leaves in ${relogioAte(loja.hoje.semanaisAte, agora)}`), true))}
              </div>
              <div className="flex flex-col gap-3">
                <span className="rotulo">{l('Diários · um de cada categoria', 'Daily · one per category')}</span>
                <div className="cz-calmo grid grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))] gap-3.5">
                  {loja.hoje.diarios.map((id) => cartao(id, nomeCategoria(ITEM_POR_ID[id]?.categoria ?? 'borda')))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <span className="rotulo">{l('Sempre à venda', 'Always for sale')}</span>
                <div className="cz-calmo grid grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))] gap-3.5">{cartao('gif')}</div>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-end">
                <Segmentado pequeno rotulo={l('Categoria', 'Category')} valor={filtro} onChange={setFiltro}
                  opcoes={[{ valor: 'tudo' as const, texto: l('Tudo', 'All') }, ...CATEGORIAS_LOJA.map((c) => ({ valor: c.id, texto: lg(c.nome) }))]} />
              </div>
              <div className="cz-calmo grid grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))] gap-3.5">
                {catalogo.map((i) => cartao(i.id))}
              </div>
            </>
          )}
        </div>

        <PreVisualizacao perfil={perfil} cos={vistos} ver={ver} repor={() => setVerId(null)} />
      </section>

      <Inventario loja={loja} perfil={perfil} />
    </>
  )
}

// ------------------------------------------------------------ pré-visualização

function PreVisualizacao({ perfil, cos, ver, repor }: { perfil: Perfil; cos: Cosmeticos; ver: ItemLoja | null; repor: () => void }) {
  const cz = useClassesCosmeticos(null, cos)
  return (
    <Painel as="div" aria-label={l('Pré-visualização', 'Preview')} className="flex min-w-0 flex-[1_1_320px] flex-col gap-5 p-5 lg:max-w-[400px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">{l('Pré-visualização', 'Preview')}</span>
          <span className="text-[18px] font-extrabold tracking-[-0.02em]">{l('Assim te ', 'How others ')}<span className="font-serif text-[1.2em] font-normal text-laranja italic">{l('veem', 'see you')}</span></span>
        </div>
        {ver && <button type="button" className="btn btn-fantasma !min-h-[34px] !px-2.5 !text-[12.5px]" onClick={repor}><RotateCcw size={13} aria-hidden />{l('Repor', 'Reset')}</button>}
      </div>
      {ver && <Chip tom="laranja">{l('A experimentar', 'Trying')}: {ver.nome}</Chip>}

      <div className="flex flex-col gap-2">
        <span className="rotulo">{l('Perfil', 'Profile')}</span>
        <FundoBanner cos={cos}>
          <div className={`flex items-center gap-3.5 ${cos.banner ? 'py-2' : 'rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3.5'}`}>
            <FotoNyx perfil={perfil} tamanho={52} cos={cos} />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="cz-nome truncate text-[17px] font-extrabold">{nomeJogador(perfil)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(perfil)}</span></span>
              <TituloJogador cos={cos} />
            </span>
          </div>
        </FundoBanner>
      </div>

      <div className="flex flex-col gap-2">
        <span className="rotulo">{l('Placa, no menu e nos amigos', 'Nameplate, in the menu and friends')}</span>
        <div className={`flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5 ${cz.placa}`}>
          <FotoNyx perfil={perfil} tamanho={36} cos={cos} />
          <span className="flex min-w-0 flex-col"><span className="cz-nome truncate text-[14px] font-semibold">{nomeJogador(perfil)}</span><span className="font-mono text-[11px] text-mudo">{perfil.riotId ?? perfil.utilizador}</span></span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="rotulo">{l('No draft, à espera de ser escolhido', 'In the draft, waiting to be picked')}</span>
        <div data-assinatura={nomeJogador(perfil)} className={`flex flex-col gap-3 rounded-2xl border border-white/10 bg-[rgba(16,16,19,0.88)] p-3.5 ${cz.cartao}`}>
          <span className="flex items-center gap-[11px]">
            <FotoNyx perfil={perfil} tamanho={42} cos={cos} />
            <span className="flex min-w-0 flex-col gap-0.5"><TituloJogador cos={cos} /><span className="cz-nome truncate text-[15px] font-extrabold">{nomeJogador(perfil)}</span></span>
          </span>
          <span className="grid grid-cols-3 gap-px overflow-hidden rounded-[10px] bg-white/6 font-mono">
            {[['KDA', '1.34'], ['VIT', '58%'], ['ACS', '241']].map(([k, v]) => (
              <span key={k} className="flex flex-col gap-0.5 bg-[#121215] px-2.5 py-2"><span className="text-[9.5px] tracking-[0.12em] text-mudo">{k}</span><span className="text-[13px] font-semibold">{v}</span></span>
            ))}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="rotulo">{l('Na tabela', 'On the leaderboard')}</span>
        <div className={`flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5 ${cz.linha}`}>
          <span className="font-mono text-[12px] text-laranja">#4</span>
          <FotoNyx perfil={perfil} tamanho={28} cos={cos} />
          <span className="cz-nome truncate text-[14px] font-semibold">{nomeJogador(perfil)}</span><ExtraLinha />
          <span className="ml-auto font-mono text-[13px] font-semibold">{perfil.pontos}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="rotulo">{l('MVP na scoreboard', 'MVP on the scoreboard')}</span>
        <div className="cz-loop flex items-center gap-2.5 rounded-xl border border-laranja/22 bg-laranja/6 px-3 py-2.5">
          <FotoNyx perfil={perfil} tamanho={28} cos={cos} />
          <span className="truncate text-[13.5px] font-semibold">{nomeJogador(perfil)}</span>
          <span className="ml-auto font-mono text-[12.5px] font-semibold text-pessego-claro">142</span>
          <DecoracaoMvp cos={cos}><SeloMvp tamanho={22} /></DecoracaoMvp>
        </div>
      </div>
    </Painel>
  )
}

// ------------------------------------------------------------ inventário

function Inventario({ loja, perfil }: { loja: LojaAberta; perfil: Perfil }) {
  const acao = useAcao()
  const [gif, setGif] = useState(loja.avatarGif ?? '')
  useEffect(() => setGif(loja.avatarGif ?? ''), [loja.avatarGif])
  const meus = loja.inventario.map((id) => ITEM_POR_ID[id]).filter((i): i is ItemLoja => !!i)
  const temGif = loja.inventario.includes('gif')

  return (
    <Painel aria-labelledby="rg-inventario" className="flex flex-col gap-5 p-[22px]">
      <TituloPainel eyebrow={l('INVENTÁRIO', 'INVENTORY')} id="rg-inventario" titulo={meus.length ? l(`Os teus ${meus.length} itens`, `Your ${meus.length} items`) : l('Ainda não tens itens', 'No items yet')} />
      {!meus.length && <p className="m-0 text-[14px] text-mudo">{l('O que comprares aparece aqui e fica logo equipado. Podes trocar quando quiseres.', 'What you buy shows up here, already equipped. Switch whenever you like.')}</p>}

      {CATEGORIAS_LOJA.map((c) => {
        const daqui = meus.filter((i) => i.categoria === c.id)
        if (!daqui.length) return null
        const equipado = loja.equipados[c.id]
        return (
          <div key={c.id} className="flex flex-col gap-2 border-t border-white/6 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rotulo">{lg(c.nome)}</span>
              {equipado && <button type="button" className="border-0 bg-transparent p-0 text-[12px] font-semibold text-mudo hover:text-pessego" onClick={() => acao(() => dados.desequiparItem(c.id))}>{l('Não usar nenhum', 'Use none')}</button>}
            </div>
            <div className="flex flex-wrap gap-2">
              {daqui.map((i) => {
                const usado = equipado === i.id
                return (
                  <button
                    key={i.id}
                    type="button"
                    aria-pressed={usado}
                    onClick={() => acao(() => (usado ? dados.desequiparItem(c.id) : dados.equiparItem(i.id)))}
                    className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition-colors ${usado ? 'border-laranja/45 bg-laranja/14 text-pessego-claro' : 'border-white/10 bg-white/[0.03] text-suave hover:text-texto'}`}
                  >
                    {usado && <Check size={14} strokeWidth={3} aria-hidden />}{i.nome}
                    <span className={`font-mono text-[9.5px] tracking-[0.12em] uppercase ${COR_RARIDADE[i.raridade]}`}>{lg(NOME_RARIDADE[i.raridade])}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {temGif && (
        <form id="rg-gif" className="flex flex-col gap-2.5 border-t border-white/6 pt-4" onSubmit={(e) => { e.preventDefault(); acao(() => dados.definirAvatarGif(gif.trim() || null), gif.trim() ? l('A tua GIF de perfil está guardada.', 'Your profile GIF is saved.') : undefined) }}>
          <label htmlFor="rg-gif-link" className="flex items-center gap-2 text-[14px] font-semibold"><ImagePlay size={16} className="text-laranja" aria-hidden />{l('Link da tua GIF de perfil', 'Link to your profile GIF')}</label>
          <div className="flex flex-wrap items-center gap-2">
            <FotoNyx perfil={perfil} tamanho={44} cos={gifValida(gif) ? { gif } : {}} />
            <input id="rg-gif-link" className="campo min-w-0 flex-[1_1_260px] font-mono !text-[13px]" value={gif} onChange={(e) => setGif(e.target.value)} placeholder="https://media.tenor.com/…/gif.gif" inputMode="url" />
            <button type="submit" className="btn btn-primario" disabled={!!gif.trim() && !gifValida(gif)}>{l('Guardar', 'Save')}</button>
            {loja.avatarGif && <button type="button" className="btn btn-fantasma" onClick={() => { setGif(''); acao(() => dados.definirAvatarGif(null)) }}>{l('Tirar a GIF', 'Remove GIF')}</button>}
          </div>
          <span className="text-[12.5px] text-mudo">{l('Um link https a acabar em .gif ou .webp, ou do Giphy, Tenor ou Discord. A staff pode tirar GIFs que não respeitem as regras.', 'An https link ending in .gif or .webp, or from Giphy, Tenor or Discord. Staff may remove GIFs that break the rules.')}</span>
        </form>
      )}
    </Painel>
  )
}

// ------------------------------------------------------------ modo de teste (Owner e Dev)

function PainelTeste({ loja }: { loja: LojaAberta }) {
  const acao = useAcao()
  const [qtd, setQtd] = useState('1000')
  const n = Math.trunc(Number(qtd))
  const valido = Number.isFinite(n) && n > 0 && n <= 100000
  return (
    <Painel aria-labelledby="rg-loja-teste" className="flex flex-col gap-4 border-dashed !border-laranja/40 p-[22px]">
      <TituloPainel
        eyebrow={l('MODO DE TESTE · OWNER E DEV', 'TEST MODE · OWNER AND DEV')}
        id="rg-loja-teste"
        titulo={l('Testa a loja à vontade', 'Test the shop freely')}
        direita={<span className="flex flex-wrap items-center gap-2">
          <Chip tom={loja.publica ? 'vitoria' : 'laranja'}>{loja.publica ? l('Aberta a toda a gente', 'Open to everyone') : l('Só Owner e Dev a veem', 'Only Owner and Dev can see it')}</Chip>
          <Link to="/admin" className="text-[12.5px] font-semibold text-pessego no-underline hover:underline">{l('Abrir ou fechar em Staff', 'Open or close in Staff')}</Link>
        </span>}
      />
      <p className="m-0 text-[13.5px] text-mudo">{l(
        'No modo de teste compras qualquer item do catálogo, mesmo os que não estão hoje na loja e os títulos de conquista. As decorações só aparecem a Owner e Dev até a loja abrir.',
        'In test mode you can buy any catalogue item, even ones not in today\'s shop and achievement titles. Decorations are only shown to Owner and Dev until the shop opens.',
      )}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-suave" onClick={() => acao(() => dados.lojaResetar(), l('Loja de hoje sorteada outra vez.', "Today's shop redrawn."))}><RotateCcw size={16} aria-hidden />{l('Sortear a loja de hoje', "Redraw today's shop")}</button>
        <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" aria-hidden />
        <label htmlFor="rg-coins-teste" className="so-leitores">{l('Coins de teste', 'Test coins')}</label>
        <input id="rg-coins-teste" className="campo !h-11 !w-[120px] font-mono" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/[^\d]/g, ''))} />
        <button type="button" className="btn btn-primario" disabled={!valido} onClick={() => acao(() => dados.lojaMoedasTeste(n), l(`+${formatarCoins(n)} coins de teste.`, `+${formatarCoins(n)} test coins.`))}><Sparkles size={16} aria-hidden />{l('Dar coins', 'Add coins')}</button>
        <button type="button" className="btn btn-fantasma" disabled={!valido || loja.ganhas.testes <= 0} onClick={() => acao(() => dados.lojaMoedasTeste(-Math.min(n, loja.ganhas.testes)), l('Coins de teste retiradas.', 'Test coins removed.'))}>{l('Tirar coins', 'Remove coins')}</button>
        <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" aria-hidden />
        <BotaoSegurar
          rotulo={l('Segura para devolver todos os teus itens', 'Hold to return all your items')}
          className="btn btn-fantasma"
          onConfirmar={() => acao(() => dados.lojaDevolver(null), l('Todos os itens devolvidos. As coins voltaram.', 'All items returned. Coins refunded.'))}
        >
          <Undo2 size={16} aria-hidden />{l('Devolver todos os itens', 'Return all items')}
        </BotaoSegurar>
      </div>
      <span className="flex items-center gap-2 text-[12.5px] text-mudo"><FlaskConical size={14} className="text-laranja" aria-hidden />{l('Devolver tira o item do inventário e devolve as coins, para o poderes comprar outra vez. Os títulos ganhos a jogar ficam.', 'Returning removes the item and refunds the coins so you can buy it again. Titles earned by playing stay.')}</span>
    </Painel>
  )
}
