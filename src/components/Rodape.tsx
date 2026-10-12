import { NomeRangify } from './Marca'

/**
 * O aviso legal fica sempre no fundo do ecrã, a toda a largura da área
 * principal: o layout é uma coluna com altura mínima de 100vh e o rodapé
 * empurra-se para baixo com margin-top: auto.
 */
export function Rodape() {
  return (
    <footer className="mt-auto w-full border-t border-white/6 bg-[rgba(9,9,11,0.55)] px-[clamp(16px,3.2vw,48px)] py-4 backdrop-blur-[10px]">
      <p className="m-0 text-[12px] leading-normal text-mudo">
        <NomeRangify className="text-laranja-claro" /> é um projeto independente e não é desenvolvido nem apoiado pela Riot Games.
      </p>
    </footer>
  )
}
