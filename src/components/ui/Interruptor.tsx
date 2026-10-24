/**
 * O interruptor do site (ideia do Stretch Switch do EasyUI): a bolinha estica enquanto carregas e assenta do outro lado
 * com uma pequena mola. A forma e as cores vêm de `.interruptor` em efeitos.css.
 */
export function Interruptor({ ligado, aoMudar, disabled, ...aria }: {
  ligado: boolean; aoMudar: (v: boolean) => void; disabled?: boolean
} & Pick<React.AriaAttributes, 'aria-label' | 'aria-labelledby'>) {
  return (
    <button type="button" role="switch" aria-checked={ligado} disabled={disabled} className="interruptor" onClick={() => aoMudar(!ligado)} {...aria}>
      <span aria-hidden />
    </button>
  )
}
