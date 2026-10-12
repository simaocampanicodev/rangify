import { useId } from 'react'
import { l, mudarIdioma, useIdioma, type Idioma } from '@/lib/idioma'

/** Bandeira do Reino Unido, desenhada (os emojis de bandeira não aparecem no Windows). */
function BandeiraReinoUnido() {
  const corte = useId()
  return (
    <svg viewBox="0 0 60 30" width="20" height="13" aria-hidden className="shrink-0 rounded-[2px]">
      <clipPath id={corte}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${corte})`} stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

/** Bandeira de Portugal: verde e vermelho, com a esfera armilar e o escudo simplificados. */
function BandeiraPortugal() {
  return (
    <svg viewBox="0 0 30 20" width="20" height="13" aria-hidden className="shrink-0 rounded-[2px]">
      <rect width="12" height="20" fill="#046A38" />
      <rect x="12" width="18" height="20" fill="#DA291C" />
      <circle cx="12" cy="10" r="4.6" fill="none" stroke="#FFE900" strokeWidth="1.3" />
      <path d="M9.9 7.6 h4.2 v3.3 a2.1 2.1 0 0 1 -4.2 0 z" fill="#fff" stroke="#DA291C" strokeWidth="0.9" />
    </svg>
  )
}

const OPCOES: { idioma: Idioma; nome: string; bandeira: () => React.ReactElement }[] = [
  { idioma: 'en', nome: 'english', bandeira: BandeiraReinoUnido },
  { idioma: 'pt', nome: 'português', bandeira: BandeiraPortugal },
]

/** Os dois botões de língua, no mesmo estilo do botão das notificações. */
export function SeletorIdioma() {
  const atual = useIdioma()
  return (
    <div role="group" aria-label={l('Língua do site', 'Site language')} className="flex gap-1.5">
      {OPCOES.map(({ idioma, nome, bandeira: Bandeira }) => {
        const ativo = idioma === atual
        return (
          <button
            key={idioma}
            type="button"
            lang={idioma === 'en' ? 'en' : 'pt-PT'}
            aria-pressed={ativo}
            onClick={() => mudarIdioma(idioma)}
            className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-[11px] border px-3 text-[13.5px] font-semibold transition-colors ${ativo ? 'border-white/16 bg-white/10 text-texto' : 'border-white/8 bg-white/[0.03] text-[#d9d4cd] hover:bg-white/8'}`}
          >
            <Bandeira />{nome}
          </button>
        )
      })}
    </div>
  )
}
