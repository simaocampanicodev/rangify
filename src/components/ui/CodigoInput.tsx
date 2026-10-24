import { useRef, useState } from 'react'
import { limparCodigo } from '@/lib/regras'

/**
 * O campo do código do grupo, em seis caixas (ideia do OTP Input do EasyUI). Por baixo há um só campo de texto, por isso
 * colar, apagar, o teclado do telemóvel e o preenchimento automático funcionam como num campo normal; as caixas só mostram
 * o que lá está. Cada letra nova entra com um pequeno salto e a caixa seguinte fica com o cursor.
 */
export function CodigoInput({ valor, aoMudar, id, ajudaId, invalido = false }: {
  valor: string; aoMudar: (v: string) => void; id: string; ajudaId?: string; invalido?: boolean
}) {
  const campo = useRef<HTMLInputElement>(null)
  const [foco, setFoco] = useState(false)
  const ativa = Math.min(valor.length, 5)
  return (
    <div className="relative min-w-0 flex-[1_1_300px]" onClick={() => campo.current?.focus()}>
      <input
        ref={campo}
        id={id}
        value={valor}
        onChange={(e) => aoMudar(limparCodigo(e.target.value))}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={6}
        aria-describedby={ajudaId}
        aria-invalid={invalido || undefined}
        className="absolute inset-0 z-10 size-full cursor-text opacity-0"
      />
      <div aria-hidden className="flex gap-2 sm:gap-2.5">
        {Array.from({ length: 6 }, (_, i) => {
          const c = valor[i]
          const aqui = foco && i === ativa
          return (
            <span
              key={i}
              className={`relative grid h-[72px] min-w-0 flex-1 place-items-center rounded-[14px] border bg-[rgba(9,9,11,0.6)] font-mono text-[34px] font-bold transition-[border-color,box-shadow] duration-200 ${aqui ? 'border-laranja/80' : c ? 'border-laranja/32' : 'border-white/12'} ${invalido && c ? '!border-derrota/50' : ''}`}
              style={{ boxShadow: aqui ? '0 0 0 3px rgba(255,91,31,0.16), inset 0 0 24px rgba(255,91,31,0.12)' : c ? 'inset 0 0 24px rgba(255,91,31,0.1)' : undefined }}
            >
              {c ? <span key={`${i}${c}`} className="salta inline-block">{c}</span> : aqui ? <span className="cursor-pisca h-8 w-[2px] rounded bg-laranja" /> : <span className="text-white/15">·</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}
