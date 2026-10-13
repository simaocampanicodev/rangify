import { Crosshair, Eye, Shield, Sparkles } from 'lucide-react'
import { urlAvatar } from '@/lib/imagem'
import type { ReactNode } from 'react'
import type { FuncaoJogo, JogadorPartida } from '@/lib/dados'
import { iniciais } from '../ui'
import { DecoracaoAvatar } from '../Cosmeticos'
import { nomeJogador, tagJogador } from '@/lib/partida'
import { nomeRank } from '@/lib/ranks'
import { l, nomeFuncaoJogo } from '@/lib/idioma'

export const ICONE_FUNCAO: Record<FuncaoJogo, ReactNode> = {
  Duelista: <Crosshair size={15} aria-hidden />,
  Controlador: <Eye size={15} aria-hidden />,
  Iniciador: <Sparkles size={15} aria-hidden />,
  Sentinela: <Shield size={15} aria-hidden />,
}

/** Quadrado com iniciais: laranja para a Equipa A, escuro para a B. */
/** Com perfilId, a foto leva as decorações da loja que o jogador tem equipadas. */
export function Iniciais({ nome, equipa, tamanho = 34, url, perfilId }: { nome: string; equipa: 'A' | 'B' | null; tamanho?: number; url?: string | null; perfilId?: string }) {
  return (
    <DecoracaoAvatar perfilId={perfilId} tamanho={tamanho} raio={Math.round(tamanho * 0.27)}>
      <IniciaisBase nome={nome} equipa={equipa} tamanho={tamanho} url={url} />
    </DecoracaoAvatar>
  )
}

function IniciaisBase({ nome, equipa, tamanho, url }: { nome: string; equipa: 'A' | 'B' | null; tamanho: number; url?: string | null }) {
  if (url) {
    return <img src={urlAvatar(url, tamanho)} alt="" width={tamanho} height={tamanho} loading="lazy" decoding="async" className="shrink-0 object-cover" style={{ borderRadius: Math.round(tamanho * 0.27), border: equipa === 'A' ? '1px solid rgba(255,91,31,0.45)' : '1px solid rgba(255,255,255,0.12)' }} />
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center font-extrabold text-[#fff3ec]"
      style={{
        width: tamanho, height: tamanho, borderRadius: Math.round(tamanho * 0.27), fontSize: Math.max(10, tamanho * 0.34),
        background: equipa === 'A' ? 'linear-gradient(135deg,#5b2a17,#b0461c)' : equipa === 'B' ? 'linear-gradient(135deg,#1c1a19,#3d3632)' : '#202024',
        border: equipa === 'B' ? '1px solid rgba(255,255,255,0.12)' : undefined,
      }}
    >
      {iniciais(nome)}
    </span>
  )
}

/** Lista de uma equipa, com lugares vazios a tracejado. */
export function ColunaEquipa({ eq, jogadores, eu, rotulo }: { eq: 'A' | 'B'; jogadores: JogadorPartida[]; eu?: string; rotulo?: string }) {
  const vazios = Math.max(0, 5 - jogadores.length)
  return (
    <section aria-label={`${l('Equipa', 'Team')} ${eq}`} className="painel flex min-w-0 flex-1 basis-[240px] flex-col gap-2 p-4">
      <div className="flex items-center justify-between pb-1.5">
        <span className={`font-mono text-[11px] font-bold tracking-[0.16em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>{rotulo ?? `${l('EQUIPA', 'TEAM')} ${eq}`}</span>
        <span className="font-mono text-[11px] text-mudo">{jogadores.length}/5</span>
      </div>
      {jogadores.map((j) => (
        <div
          key={j.perfilId}
          className={`entra flex min-h-[54px] items-center gap-2.5 rounded-xl border px-2.5 ${j.perfilId === eu ? 'border-laranja/40 bg-laranja/8' : 'border-white/7 bg-white/[0.025]'}`}
        >
          <Iniciais nome={nomeJogador(j)} equipa={eq} url={j.avatarUrl} perfilId={j.perfilId} />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[13.5px] font-bold">
              {nomeJogador(j)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(j)}</span>{j.capitao && <span className="ml-1 font-mono text-[11px] font-bold text-laranja">(C)</span>}
            </span>
            <span className="truncate text-[11.5px] text-mudo">{nomeRank(j.tier)}{j.funcaoJogo ? ` · ${nomeFuncaoJogo(j.funcaoJogo)}` : ''}</span>
          </span>
          {j.capitao
            ? null
            : j.perfilId === eu ? <span className="rounded bg-laranja px-1.5 py-px font-mono text-[9.5px] font-bold text-escuro-laranja">{l('TU', 'YOU')}</span>
            : j.ordemEscolha ? <span className="font-mono text-[10px] font-bold text-mudo">#{j.ordemEscolha}</span> : null}
        </div>
      ))}
      {Array.from({ length: vazios }, (_, i) => (
        <div key={i} className="flex min-h-[54px] items-center justify-center rounded-xl border border-dashed border-white/12 font-mono text-[11px] text-mudo">
          {l('Por escolher', 'To be picked')}
        </div>
      ))}
    </section>
  )
}
