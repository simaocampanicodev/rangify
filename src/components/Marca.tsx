/** O símbolo do Rangify (o "R" com o raio) e o nome com as duas letras. */

export function Simbolo({ tamanho = 38, className = '' }: { tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho * (42 / 57)} viewBox="12 18 57 42" aria-hidden className={className}>
      <path
        d="M23 19.5H66.25L55 35.4H67.5L40 58.75L51.25 41.25H40.25L50.6 28H27C24 28 22 30.5 22 33.75C22 37 24 39.75 27 39.75H38.2L23.1 58.5H13.1L23.1 46.25C17 46.25 13.5 40.5 13.5 33C13.5 25.5 17.5 19.5 23 19.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** "Rang" em Geist pesado e "ify" em Instrument Serif itálico, sempre que o nome aparece. */
export function NomeRangify({ className = '' }: { className?: string }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <span className="font-bold">Rang</span>
      <span className="font-serif text-[1.18em] font-normal italic">ify</span>
    </span>
  )
}

export function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 text-texto">
      <Simbolo className="shrink-0 text-laranja" />
      {!compacta && (
        <span className="flex flex-col gap-[3px]">
          <span className="flex items-center gap-[7px]">
            <span className="text-[23px] leading-none whitespace-nowrap text-laranja">
              <span className="font-extrabold tracking-[-0.045em]">Rang</span>
              <span className="font-serif text-[1.22em] font-normal tracking-[-0.01em] italic">ify</span>
            </span>
            <span className="rounded-[4px] bg-laranja px-[5px] py-[2px] font-mono text-[9.5px] font-bold tracking-[0.04em] text-escuro-laranja">HUB</span>
          </span>
          <span className="font-mono text-[10.5px] text-mudo">v0.1.0 · beta</span>
        </span>
      )}
    </span>
  )
}
