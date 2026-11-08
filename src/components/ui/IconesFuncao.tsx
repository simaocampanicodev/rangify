import { Crosshair, Eye, Shield, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FuncaoJogo } from '@/lib/data'

export const ICONE_FUNCAO: Record<FuncaoJogo, ReactNode> = {
  Duelista: <Crosshair size={15} aria-hidden />,
  Controlador: <Eye size={15} aria-hidden />,
  Iniciador: <Sparkles size={15} aria-hidden />,
  Sentinela: <Shield size={15} aria-hidden />,
}
