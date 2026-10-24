import { Link } from 'react-router-dom'
import { l } from '@/lib/idioma'

/** O 404: o número falha de vez em quando, só em laranja e branco (ideia do Glitch Text e do Not Found do EasyUI). */
export function NaoEncontrado() {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <span aria-hidden data-texto="404" className="glitch font-mono text-[clamp(96px,20vw,180px)] leading-none font-extrabold tracking-[-0.07em] text-texto select-none">404</span>
      <div className="flex max-w-[460px] flex-col gap-2">
        <h1 className="m-0 text-[24px] font-extrabold tracking-[-0.03em]">{l('Esta página não existe', 'This page does not exist')}</h1>
        <p className="m-0 text-[14.5px] leading-normal text-suave">{l('O endereço pode estar errado ou a página mudou de sítio.', 'The address may be wrong or the page has moved.')}</p>
      </div>
      <Link to="/" className="btn btn-primario mt-2">{l('Voltar ao painel', 'Back to the dashboard')}</Link>
    </div>
  )
}
