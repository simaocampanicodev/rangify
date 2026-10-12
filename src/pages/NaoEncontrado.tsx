import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Vazio } from '@/components/ui'
import { l } from '@/lib/idioma'

export function NaoEncontrado() {
  return (
    <Vazio
      icone={<Compass size={22} />}
      titulo={l('Esta página não existe', 'This page does not exist')}
      texto={l('O endereço pode estar errado ou a página mudou de sítio.', 'The address may be wrong or the page has moved.')}
      acao={<Link to="/" className="btn btn-primario">{l('Voltar ao painel', 'Back to the dashboard')}</Link>}
    />
  )
}
