import type { CSSProperties, ReactNode } from 'react'
import { useCosmeticos } from '@/lib/cosmeticos'
import { ITEM_POR_ID, type Cosmeticos } from '@/lib/loja'

/**
 * As decorações da loja no resto do site. Cada peça pede o que o jogador tem
 * equipado (useCosmeticos) ou recebe-o já feito (cos), como na pré-visualização da loja.
 * O desenho está todo em src/cosmeticos.css.
 */
function useDe(perfilId: string | null | undefined, cos?: Cosmeticos) {
  const remoto = useCosmeticos(cos ? null : perfilId)
  return cos ?? remoto
}

const classe = (id: string | undefined) => (id ? `cz-${id}` : '')

/** A foto com a borda, o efeito e a GIF por cima. Sem nada equipado, devolve a foto tal e qual. */
export function DecoracaoAvatar({ perfilId, cos, tamanho, raio, children }: {
  perfilId?: string | null; cos?: Cosmeticos; tamanho: number; raio: number; children: ReactNode
}) {
  const c = useDe(perfilId, cos)
  if (!c.borda && !c.efeito && !c.gif) return <>{children}</>
  const p = Math.max(2, Math.round(tamanho * 0.06))
  const vars = { '--s': `${tamanho}px`, '--r': `${raio}px`, '--p': `${p}px` } as CSSProperties
  let foto = children
  if (c.gif === 'gif') {
    // Na loja, antes de haver um link: um gradiente a mexer, com a etiqueta GIF.
    foto = <span aria-hidden className="cz-gif-demo grid shrink-0 place-items-center font-mono text-[10px] font-bold" style={{ width: tamanho, height: tamanho, borderRadius: raio }}>GIF</span>
  } else if (c.gif) {
    foto = <img src={c.gif} alt="" width={tamanho} height={tamanho} loading="lazy" decoding="async" className="shrink-0 object-cover" style={{ width: tamanho, height: tamanho, borderRadius: raio }} />
  }
  return (
    <span className={`cz-ef ${classe(c.efeito)}`} style={vars}>
      <span className={`cz-mo ${classe(c.borda)}`}>{foto}</span>
    </span>
  )
}

/** As classes das decorações que entram em elementos que já existem (placa, cartão, linha). */
export function useClassesCosmeticos(perfilId: string | null | undefined, cos?: Cosmeticos) {
  const c = useDe(perfilId, cos)
  return {
    placa: c.placa ? `cz-placa ${classe(c.placa)}` : '',
    cartao: c.cartao ? `cz-cartao ${classe(c.cartao)}` : '',
    linha: c.linha ? `cz-linha ${classe(c.linha)}` : '',
  }
}

/** O título por baixo do nome, com o estilo da raridade. */
export function TituloJogador({ perfilId, cos, className = '' }: { perfilId?: string | null; cos?: Cosmeticos; className?: string }) {
  const c = useDe(perfilId, cos)
  const t = c.titulo ? ITEM_POR_ID[c.titulo] : null
  if (!t) return null
  return <span className={`cz-tr-${t.raridade} ${className}`}>{t.nome}</span>
}

/** O banner no topo do perfil. */
export function BannerPerfil({ perfilId, cos, className = '', children }: { perfilId?: string | null; cos?: Cosmeticos; className?: string; children?: ReactNode }) {
  const c = useDe(perfilId, cos)
  if (!c.banner) return null
  return <div aria-hidden className={`cz-banner ${classe(c.banner)} ${className}`}>{children}</div>
}

/**
 * O banner como fundo de um bloco (o cabeçalho do perfil): fica por trás de tudo,
 * com um véu escuro do lado do texto para se ler bem. Sem banner, devolve o bloco tal e qual.
 */
export function FundoBanner({ perfilId, cos, children }: { perfilId?: string | null; cos?: Cosmeticos; children: ReactNode }) {
  const c = useDe(perfilId, cos)
  if (!c.banner) return <>{children}</>
  return (
    <div className="relative isolate overflow-hidden rounded-[22px] border border-white/8 px-[clamp(18px,3vw,30px)] py-[clamp(18px,2.6vw,26px)]">
      <div aria-hidden className={`cz-banner ${classe(c.banner)} !absolute inset-0 -z-10 !h-auto !rounded-none !border-0`} />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,0.9)_0%,rgba(9,9,11,0.72)_45%,rgba(9,9,11,0.35)_100%)]" />
      {children}
    </div>
  )
}

/** À volta do selo de MVP, a animação de quem o ganhou. */
export function DecoracaoMvp({ perfilId, cos, children }: { perfilId?: string | null; cos?: Cosmeticos; children: ReactNode }) {
  const c = useDe(perfilId, cos)
  if (!c.mvp) return <>{children}</>
  return <span className={`cz-mvp ${classe(c.mvp)}`}>{children}</span>
}

/** O pedaço que vai ao fim do nome em algumas linhas do ranking (o ponto vivo, a coroa). */
export function ExtraLinha() {
  return <span aria-hidden className="cz-extra" />
}

/** Para listas: as classes das decorações de cada jogador, sem precisar de um componente à parte. */
export function ComCosmeticos({ perfilId, children }: { perfilId: string; children: (cz: ReturnType<typeof useClassesCosmeticos>) => ReactNode }) {
  return <>{children(useClassesCosmeticos(perfilId))}</>
}
