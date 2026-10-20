import { ChevronsUp, Lock, LockOpen, Users } from 'lucide-react'
import { useState } from 'react'
import { BotaoSegurar, Painel, TituloPainel } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { dados, type FilaTipo } from '@/lib/data'
import { l as tx } from '@/lib/idioma'

/**
 * Fechar e abrir a fila aberta e a ranked (só Owner e Dev), para quando há problemas e é preciso parar de formar partidas.
 * Fechar tira quem está à espera nessa fila; as partidas já formadas continuam e acabam normalmente.
 */
export function StaffFilas() {
  const acao = useAcao()
  const { fila, atualizar } = usePartida()
  const [motivo, setMotivo] = useState('')
  const [aEnviar, setAEnviar] = useState<FilaTipo | null>(null)
  const fechadas = fila?.filasFechadas
  const algumaFechada = !!fechadas && (fechadas.aberta || fechadas.ranked)

  const mudar = async (tipo: FilaTipo, fechar: boolean) => {
    setAEnviar(tipo)
    const nome = tipo === 'ranked' ? 'ranked' : tx('aberta', 'open')
    await acao(
      async () => { await dados.definirFilaFechada(tipo, fechar, fechar ? motivo : undefined); return true },
      fechar ? tx(`Fila ${nome} fechada.`, `The ${nome} queue is closed.`) : tx(`Fila ${nome} aberta.`, `The ${nome} queue is open.`),
    )
    await atualizar()
    setAEnviar(null)
  }

  const linhas: { tipo: FilaTipo; nome: string; icone: React.ReactNode; esperam: number }[] = [
    { tipo: 'aberta', nome: tx('Fila aberta', 'Open queue'), icone: <Users size={17} aria-hidden />, esperam: fila?.contagemAberta ?? 0 },
    { tipo: 'ranked', nome: tx('Fila ranked', 'Ranked queue'), icone: <ChevronsUp size={17} strokeWidth={2.4} aria-hidden />, esperam: fila?.contagemRanked ?? 0 },
  ]

  return (
    <Painel className={`flex flex-col gap-4 p-[22px] ${algumaFechada ? '!border-derrota/35' : ''}`}>
      <TituloPainel
        eyebrow={tx('FILAS', 'QUEUES')}
        titulo={algumaFechada ? tx('Há filas fechadas', 'Some queues are closed') : tx('Abrir e fechar as filas', 'Open and close the queues')}
        direita={<span className="max-w-[420px] text-[12px] text-mudo">{tx('Fechar tira quem está à espera nessa fila e impede novas partidas. As que já estão a decorrer continuam.', 'Closing removes everyone waiting in that queue and stops new matches. Matches already in progress carry on.')}</span>}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3">
        {linhas.map((x) => {
          const fechada = !!fechadas?.[x.tipo]
          return (
            <div key={x.tipo} className={`flex flex-wrap items-center gap-3 rounded-[14px] border p-3.5 ${fechada ? 'border-derrota/30 bg-derrota/[0.04]' : 'border-white/8 bg-white/[0.02]'}`}>
              <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja">{x.icone}</span>
              <span className="flex min-w-[120px] flex-1 flex-col gap-0.5">
                <span className="text-[14.5px] font-bold">{x.nome}</span>
                <span className="text-[12.5px] text-mudo">
                  {fechada ? <span className="font-semibold text-derrota">{tx('FECHADA', 'CLOSED')}</span> : <span className="font-semibold text-pessego-claro">{tx('ABERTA', 'OPEN')}</span>}
                  {' · '}{tx(`${x.esperam} à espera na tua região`, `${x.esperam} waiting in your region`)}
                </span>
              </span>
              {fechada
                ? (
                  <button type="button" className="btn btn-primario !min-h-10" disabled={aEnviar !== null} onClick={() => mudar(x.tipo, false)}>
                    <LockOpen size={15} aria-hidden />{tx('Abrir', 'Open')}
                  </button>
                )
                : (
                  <BotaoSegurar
                    rotulo={tx(`Segura para fechar a ${x.nome.toLowerCase()}`, `Hold to close the ${x.nome.toLowerCase()}`)}
                    className="btn btn-fantasma !min-h-10"
                    onConfirmar={() => mudar(x.tipo, true)}
                  >
                    <Lock size={15} className="text-laranja" aria-hidden />{tx('Segura para fechar', 'Hold to close')}
                  </BotaoSegurar>
                )}
            </div>
          )
        })}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-suave">{tx('Motivo (opcional, os jogadores veem-no quando fechares)', 'Reason (optional, players see it when you close)')}</span>
        <input
          className="campo"
          value={motivo}
          maxLength={140}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={tx('Ex.: Manutenção, voltamos daqui a pouco.', 'E.g. Maintenance, back shortly.')}
        />
      </label>
      {algumaFechada && fechadas?.motivo && <p className="m-0 text-[12.5px] text-mudo">{tx('Motivo à vista dos jogadores: ', 'Reason players see: ')}<span className="text-suave">{fechadas.motivo}</span></p>}
    </Painel>
  )
}
