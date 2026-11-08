import type { EstadoSaude } from '@/lib/data'
import { l as tx } from '@/lib/idioma'
import { corSaude, fraseSaude } from '@/lib/saude'

/** O ponto que avisa, no menu e no separador Estado, que o site não está bem. Nada quando está tudo ok. */
export function PontoEstado({ estado, className = '' }: { estado: EstadoSaude | undefined; className?: string }) {
  if (!estado || estado === 'ok') return null
  return (
    <span
      role="img"
      aria-label={fraseSaude(estado)}
      title={`${fraseSaude(estado)} · ${tx('ver Staff > Estado', 'see Staff > Status')}`}
      className={`ao-vivo inline-block size-2 shrink-0 rounded-full ${className}`}
      style={{ background: corSaude(estado) }}
    />
  )
}
