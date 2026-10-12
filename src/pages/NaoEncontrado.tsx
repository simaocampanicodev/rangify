import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Vazio } from '@/components/ui'

export function NaoEncontrado() {
  return (
    <Vazio
      icone={<Compass size={22} />}
      titulo="Esta página não existe"
      texto="O endereço pode estar errado ou a página mudou de sítio."
      acao={<Link to="/" className="btn btn-primario">Voltar ao dashboard</Link>}
    />
  )
}
