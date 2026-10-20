import { Ban, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useIntervalo } from '@/hooks/useVisivel'
import { dados, type AvisoStaff } from '@/lib/data'
import { l } from '@/lib/idioma'
import { textoDuracaoBan } from '@/lib/tempo'

/**
 * O aviso ou ban que a staff te deu, por cima de qualquer página. Tem de ser confirmado;
 * se houver vários, aparecem um a um, do mais antigo para o mais recente. Quem não estava no
 * site na altura vê-o na visita seguinte (a mensagem fica guardada até a confirmares).
 */
export function AvisoStaffPopup() {
  const { perfil } = useSessao()
  const acao = useAcao()
  const perfilId = perfil?.id ?? null
  const [aviso, setAviso] = useState<AvisoStaff | null>(null)
  const [aEnviar, setAEnviar] = useState(false)

  const carregar = useCallback(() => {
    if (!perfilId) return
    dados.avisoPendente().then(setAviso).catch(() => {})
  }, [perfilId])

  useEffect(() => {
    if (!perfilId) { setAviso(null); return }
    carregar()
    return dados.aoMudarAvisos(perfilId, carregar)
  }, [perfilId, carregar])
  // Reserva se o Realtime falhar; ao voltar ao separador corre logo.
  useIntervalo(carregar, perfilId ? 120_000 : null)

  if (!aviso) return null
  const ban = aviso.tipo === 'ban'
  const confirmar = async () => {
    setAEnviar(true)
    const ok = await acao(async () => { await dados.confirmarAviso(aviso.id); return true })
    setAEnviar(false)
    if (!ok) return
    setAviso(null)
    carregar()
  }

  return (
    <Modal
      aberto
      semFechar
      onFechar={() => {}}
      largura={520}
      eyebrow={ban ? l('BAN DA FILA', 'QUEUE BAN') : l('AVISO DA STAFF', 'STAFF WARNING')}
      titulo={(
        <span className="flex items-center gap-2.5">
          {ban ? <Ban size={22} className="text-derrota" aria-hidden /> : <TriangleAlert size={22} className="text-laranja" aria-hidden />}
          {ban ? l('Foste banido da fila', 'You were banned from the queue') : l('Recebeste um aviso', 'You received a warning')}
        </span>
      )}
    >
      <p className="m-0 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[14.5px] leading-[1.55] break-words whitespace-pre-wrap text-marfim">{aviso.mensagem}</p>
      {ban ? (
        <p className="m-0 text-[13.5px] leading-[1.55] text-suave">
          {l('Não podes entrar na fila', 'You cannot join the queue')} <strong className="text-texto">{textoDuracaoBan({ ate: aviso.banAte, permanente: aviso.permanente })}</strong>.{' '}
          {l('Se já estás numa partida, ela não é afetada. A tua conta, os teus pontos e o histórico ficam como estão.', 'If you are already in a match, it is not affected. Your account, points and history stay as they are.')}
        </p>
      ) : (
        <p className="m-0 text-[13.5px] leading-[1.55] text-suave">{l('Lê com atenção. Se isto se repetir, a staff pode banir-te da fila.', 'Read it carefully. If this happens again, the staff may ban you from the queue.')}</p>
      )}
      <button type="button" className="btn btn-primario !min-h-11 self-end" disabled={aEnviar} onClick={confirmar} autoFocus>
        {l('Percebi', 'Understood')}
      </button>
    </Modal>
  )
}
