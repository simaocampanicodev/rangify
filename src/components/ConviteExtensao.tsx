import { Puzzle } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { URL_EXTENSAO, aoAparecerExtensao, extensaoPresente } from '@/lib/extensao'
import { l } from '@/lib/idioma'

/**
 * Convida a instalar a extensão do browser (o aviso de partida toca mesmo com outro separador à frente).
 * Só aparece se o site tiver o endereço da extensão (VITE_EXTENSAO_URL) e se ela ainda não estiver instalada.
 */
export function ConviteExtensao({ className = '' }: { className?: string }) {
  const instalada = useSyncExternalStore(aoAparecerExtensao, extensaoPresente, () => false)
  if (!URL_EXTENSAO || instalada) return null
  return (
    <a
      href={URL_EXTENSAO}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2.5 rounded-xl border border-laranja/25 bg-laranja/[0.06] px-3.5 py-2.5 text-[13px] leading-snug text-suave no-underline hover:border-laranja/50 hover:text-texto ${className}`}
    >
      <Puzzle size={16} className="shrink-0 text-laranja" aria-hidden />
      <span>
        <b className="font-semibold text-pessego-claro">{l('Instala a extensão do Rangify', 'Install the Rangify extension')}</b>
        {' '}{l('para ouvires o aviso de partida mesmo com outro separador à frente, no YouTube por exemplo.', 'to hear the match alert even with another tab in front, on YouTube for example.')}
      </span>
    </a>
  )
}
