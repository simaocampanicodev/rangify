import { Bot, FastForward, FlaskConical, LockOpen, UserPlus, Users, Zap } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { dados } from '@/lib/dados'
import { l } from '@/lib/idioma'

/**
 * Ferramentas de teste: só aparecem a Owner e Dev. As partidas criadas aqui
 * ficam marcadas como simuladas, mas contam como as outras: removê-las devolve tudo.
 */
export function FerramentasDev() {
  const { podeTestar, perfil } = useSessao()
  const { partida, ativa, fila, atualizar } = usePartida()
  const acao = useAcao()
  const navegar = useNavigate()
  const [serCapitao, setSerCapitao] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  if (!podeTestar) return null
  // No Supabase só as partidas simuladas aceitam atalhos; no modo demo todas são de bots.
  const podeAcelerar = !!partida && (partida.simulada || dados.modo === 'demo')

  const correr = async (f: () => Promise<void>, ok?: string, irJogar = false) => {
    setOcupado(true)
    const r = await acao(async () => { await f(); return true }, ok)
    await atualizar()
    setOcupado(false)
    if (r && irJogar) navegar('/jogar')
  }

  return (
    <section aria-labelledby="rg-dev" className="painel flex flex-col gap-4 border-dashed !border-laranja/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><FlaskConical size={18} aria-hidden /></span>
          <div className="flex flex-col gap-0.5">
            <h2 id="rg-dev" className="m-0 text-[16px] font-bold">{l('Ferramentas de teste', 'Test tools')}</h2>
            <span className="text-[12.5px] text-mudo">{l('Só visível para Owner e Dev', 'Only visible to Owner and Dev')} ({perfil?.funcao}). {l('As partidas de teste contam pontos e estatísticas; remove-as na página da partida para voltar atrás.', 'Test matches count points and stats; remove them on the match page to undo.')}</span>
          </div>
        </div>
      </div>

      {!ativa ? (
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-suave">
            <input type="checkbox" checked={serCapitao} onChange={(e) => setSerCapitao(e.target.checked)} className="size-4 accent-[#ff5b1f]" />
            {l('Ser o Capitão A (para testar o draft, os bans e o código)', 'Be Captain A (to test the draft, bans and code)')}
          </label>
          <div className="flex flex-wrap gap-2">
            {fila?.naFila && (
              <button type="button" disabled={ocupado} className="btn btn-primario" onClick={() => correr(() => dados.devCompletarFila({ serCapitao }), l('Fila completa: tu, os teus amigos na fila e bots. Aceita a partida!', 'Queue full: you, your friends in the queue and bots. Accept the match!'), true)}>
                <UserPlus size={16} aria-hidden />{l('Completar fila com bots', 'Fill queue with bots')}
              </button>
            )}
            <button type="button" disabled={ocupado} className="btn btn-suave" onClick={() => correr(() => dados.devEncherFila({ serCapitao }), l('Fila cheia com bots. Aceita a partida!', 'Queue filled with bots. Accept the match!'), true)}>
              <Users size={16} aria-hidden />{l('Simular fila cheia', 'Simulate full queue')}
            </button>
            <button type="button" disabled={ocupado} className="btn btn-fantasma" onClick={() => correr(() => dados.devSimularPartida(), l('A simular uma partida completa.', 'Simulating a full match.'), true)}>
              <Bot size={16} className="text-laranja" aria-hidden />{l('Simular partida completa', 'Simulate full match')}
            </button>
          </div>
          <p className="m-0 text-[12.5px] leading-normal text-mudo">
            {fila?.naFila
              ? l('"Completar fila com bots" junta-te aos teus amigos que estão na fila (da mesma região) e preenche o resto com bots. Quem não é teu amigo continua na fila. ', '"Fill queue with bots" puts you with your friends in the queue (same region) and fills the rest with bots. Anyone who is not your friend stays in the queue. ')
              : l('Para testar com amigos: entrem os dois na fila e depois carrega em "Completar fila com bots". ', 'To test with friends: both join the queue and then press "Fill queue with bots". ')}
            {l('"Simular fila cheia" põe-te sozinho com 9 bots e "Simular partida completa" corre tudo sozinha em poucos segundos. Estas partidas contam pontos e estatísticas; remove-as na página da partida para voltar atrás.', '"Simulate full queue" puts you alone with 9 bots and "Simulate full match" plays everything by itself in a few seconds. These matches count points and stats; remove them on the match page to undo.')}
          </p>
        </div>
      ) : partida && (
        <div className="flex flex-col gap-3">
          {podeAcelerar ? <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado} className="btn btn-suave" onClick={() => correr(() => dados.devAcelerar(partida.id), l('Os bots jogaram já.', 'The bots have played.'))}>
              <FastForward size={16} aria-hidden />{l('Acelerar bots', 'Speed up bots')}
            </button>
            {partida.estado === 'IN_PROGRESS' && (
              <button type="button" disabled={ocupado} className="btn btn-fantasma" onClick={() => correr(() => dados.devSaltarBloqueio(partida.id), l('Bloqueio de 15 minutos saltado.', '15-minute lock skipped.'))}>
                <LockOpen size={16} className="text-laranja" aria-hidden />{l('Saltar bloqueio de 15 min', 'Skip 15-min lock')}
              </button>
            )}
          </div> : <p className="m-0 text-[12.5px] text-mudo">{l('Esta partida é real: as ferramentas de teste só aceleram partidas simuladas.', 'This is a real match: the test tools only speed up simulated matches.')}</p>}
          <p className="m-0 flex items-center gap-2 text-[12.5px] text-mudo"><Zap size={14} className="text-laranja" aria-hidden />{l('Partida', 'Match')} {partida.codigo} · {partida.simulada ? l('simulada', 'simulated') : l('real', 'real')} · {partida.estado}</p>
        </div>
      )}
    </section>
  )
}
