import { Ban, BellRing, Clock, Gavel, ShieldOff, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Chip, Segmentado } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type AvisoStaff, type Funcao, type JogadorStaff, type Perfil } from '@/lib/dados'
import { l as tx } from '@/lib/idioma'
import { dataHora, haQuanto, textoDuracaoBan } from '@/lib/tempo'

const NIVEL: Record<Funcao, number> = { owner: 4, dev: 3, mod: 2, verified: 1, user: 0 }

/** Só se pune quem tem uma função abaixo da nossa (o servidor faz a mesma conta). */
export function podePunir(eu: Perfil | null, alvo: Perfil) {
  return !!eu && eu.id !== alvo.id && NIVEL[alvo.funcao] < NIVEL[eu.funcao]
}

const MAX_CARACTERES = 500
/** Mesmo limite do servidor: de 1 hora a 1 ano. */
const MAX_HORAS = 24 * 365

const duracoes = () => [
  { id: '1h', horas: 1, texto: tx('1 hora', '1 hour') },
  { id: '24h', horas: 24, texto: tx('24 horas', '24 hours') },
  { id: '7d', horas: 24 * 7, texto: tx('7 dias', '7 days') },
  { id: '30d', horas: 24 * 30, texto: tx('30 dias', '30 days') },
  { id: 'perm', horas: null, texto: tx('Permanente', 'Permanent') },
  { id: 'outro', horas: null, texto: tx('Outro…', 'Custom…') },
] as const

function EstadoDm({ a }: { a: AvisoStaff }) {
  if (dados.modo === 'demo') return null
  if (a.dm === 'enviada') return <Chip tom="vitoria">{tx('DM enviada', 'DM sent')}</Chip>
  if (a.dm === 'falhou') return <Chip tom="derrota">{tx('DM falhou: mensagens privadas fechadas', 'DM failed: private messages closed')}</Chip>
  if (a.dm === 'sem_discord') return <Chip>{tx('Sem Discord ligado', 'No Discord linked')}</Chip>
  // O bot responde em poucos segundos; passado este tempo sem resposta, não há nada a mostrar.
  return Date.now() - Date.parse(a.criadoEm) < 120_000 ? <Chip>{tx('DM a caminho…', 'DM on its way…')}</Chip> : null
}

function Historico({ perfilId }: { perfilId: string }) {
  const h = useCarregar(() => dados.avisosDoJogador(perfilId), [perfilId], ['staff'])
  if (!h.valor?.length) return <p className="m-0 text-[12.5px] text-mudo">{tx('Sem avisos nem bans.', 'No warnings or bans.')}</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {h.valor.map((a) => (
        <li key={a.id} className={`flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 ${a.tipo === 'ban' ? 'border-derrota/25 bg-derrota/[0.04]' : 'border-white/8 bg-white/[0.02]'} ${a.levantadoEm ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-mudo">
            <Chip tom={a.tipo === 'ban' ? 'derrota' : 'laranja'}>
              {a.tipo === 'ban' ? <><Ban size={11} aria-hidden />&nbsp;{tx('Ban', 'Ban')} · {textoDuracaoBan({ ate: a.banAte, permanente: a.permanente })}</> : <><TriangleAlert size={11} aria-hidden />&nbsp;{tx('Aviso', 'Warning')}</>}
            </Chip>
            {a.levantadoEm && <Chip>{tx('Levantado', 'Lifted')} {haQuanto(a.levantadoEm)}</Chip>}
            <span title={dataHora(a.criadoEm)}>{haQuanto(a.criadoEm)}</span>
            {a.autor && <span>{tx('por', 'by')} {a.autor}</span>}
            <span className="ml-auto flex items-center gap-1.5">
              <EstadoDm a={a} />
              {a.lidoEm ? <Chip>{tx('Visto', 'Seen')}</Chip> : !a.levantadoEm && <Chip>{tx('Por confirmar no site', 'Not yet seen on the site')}</Chip>}
            </span>
          </div>
          <p className="m-0 text-[13.5px] leading-normal break-words whitespace-pre-wrap text-suave">{a.mensagem}</p>
        </li>
      ))}
    </ul>
  )
}

/**
 * O cartão de moderação de um jogador: avisar, banir da fila (com a duração à escolha),
 * levantar o ban e ver o histórico. Aviso e ban levam sempre uma mensagem escrita pela staff.
 */
export function Moderacao({ jogador, eu, onMudou }: { jogador: JogadorStaff; eu: Perfil | null; onMudou: () => void }) {
  const acao = useAcao()
  const [tipo, setTipo] = useState<'aviso' | 'ban'>('aviso')
  const [mensagem, setMensagem] = useState('')
  const [duracao, setDuracao] = useState<string>('24h')
  const [outro, setOutro] = useState('')
  const [aEnviar, setAEnviar] = useState(false)
  const pode = podePunir(eu, jogador)

  const escolhida = duracoes().find((d) => d.id === duracao)!
  const horasOutro = Number(outro)
  const horasOk = duracao !== 'outro' || (Number.isInteger(horasOutro) && horasOutro >= 1 && horasOutro <= MAX_HORAS)
  const texto = mensagem.trim()
  const valido = texto.length >= 3 && (tipo === 'aviso' || horasOk)

  const enviar = async () => {
    if (!valido) return
    setAEnviar(true)
    const horas = duracao === 'outro' ? horasOutro : escolhida.horas
    const nome = jogador.riotId ?? jogador.utilizador
    const ok = await acao(async () => {
      if (tipo === 'aviso') await dados.avisarJogador(jogador.id, texto)
      else await dados.banirDaFila(jogador.id, texto, horas)
      return true
    }, tipo === 'aviso' ? tx(`Aviso enviado a ${nome}.`, `Warning sent to ${nome}.`) : tx(`${nome} foi banido da fila.`, `${nome} was banned from the queue.`))
    setAEnviar(false)
    if (ok) { setMensagem(''); onMudou() }
  }

  const levantar = async () => {
    const ok = await acao(async () => { await dados.levantarBan(jogador.id); return true }, tx('Ban levantado.', 'Ban lifted.'))
    if (ok) onMudou()
  }

  return (
    <div className="flex basis-full flex-col gap-4 rounded-[14px] border border-white/8 bg-white/[0.02] p-4">
      {jogador.ban && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-derrota/30 bg-derrota/[0.06] px-3.5 py-2.5">
          <Ban size={16} className="shrink-0 text-derrota" aria-hidden />
          <span className="min-w-0 flex-1 text-[13px] leading-snug text-suave">
            <strong className="text-texto">{tx('Banido da fila', 'Banned from the queue')} {textoDuracaoBan(jogador.ban)}.</strong>
            {jogador.ban.mensagem && <> {jogador.ban.mensagem}</>}
          </span>
          {pode && (
            <button type="button" className="btn btn-fantasma !min-h-9 !px-3 !text-[12.5px]" onClick={levantar}>
              <ShieldOff size={14} className="text-laranja" aria-hidden />{tx('Levantar ban', 'Lift ban')}
            </button>
          )}
        </div>
      )}

      {pode ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); enviar() }}>
          <div className="self-start">
            <Segmentado
              pequeno
              rotulo={tx('Tipo', 'Type')}
              valor={tipo}
              onChange={setTipo}
              opcoes={[{ valor: 'aviso', texto: tx('Aviso', 'Warning') }, { valor: 'ban', texto: tx('Banir da fila', 'Queue ban') }]}
            />
          </div>
          <label className="flex flex-col gap-1.5 text-[12.5px] text-mudo">
            {tipo === 'aviso' ? tx('Mensagem do aviso', 'Warning message') : tx('Motivo do ban', 'Ban reason')}
            <textarea
              className="campo min-h-[84px] resize-y py-2.5 text-[14px] leading-normal"
              value={mensagem}
              maxLength={MAX_CARACTERES}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder={tipo === 'aviso' ? tx('O que o jogador fez de errado e o que se espera dele…', 'What the player did wrong and what is expected…') : tx('Porque é banido da fila…', 'Why they are banned from the queue…')}
            />
            <span className="self-end font-mono text-[11px]">{mensagem.length}/{MAX_CARACTERES}</span>
          </label>

          {tipo === 'ban' && (
            <div className="flex flex-col gap-2">
              <span className="rotulo">{tx('Duração do ban', 'Ban length')}</span>
              <div role="group" aria-label={tx('Duração do ban', 'Ban length')} className="flex flex-wrap gap-1.5">
                {duracoes().map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={duracao === d.id}
                    onClick={() => setDuracao(d.id)}
                    className={`h-9 cursor-pointer rounded-lg border px-3 text-[13px] font-semibold transition-colors ${duracao === d.id ? 'border-laranja/40 bg-laranja/14 text-pessego-claro' : 'border-white/10 bg-white/[0.035] text-suave hover:text-texto'}`}
                  >
                    {d.texto}
                  </button>
                ))}
              </div>
              {duracao === 'outro' && (
                <label className="flex items-center gap-2 text-[13px] text-mudo">
                  <Clock size={15} aria-hidden />
                  <input
                    className="campo !h-10 !w-28 font-mono"
                    inputMode="numeric"
                    value={outro}
                    onChange={(e) => setOutro(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="48"
                    aria-label={tx('Horas de ban', 'Ban hours')}
                  />
                  {tx(`horas (de 1 a ${MAX_HORAS})`, `hours (1 to ${MAX_HORAS})`)}
                </label>
              )}
              <p className="m-0 text-[12px] leading-snug text-mudo">
                {tx('O ban tira o jogador da fila já e impede-o de voltar a entrar. Não cancela uma partida a decorrer nem apaga pontos ou histórico.', 'The ban removes the player from the queue right away and stops them from joining again. It does not cancel a match in progress or erase points or history.')}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={`btn !min-h-10 ${tipo === 'ban' ? 'btn-primario' : 'btn-suave'}`} disabled={!valido || aEnviar}>
              {tipo === 'ban' ? <Gavel size={15} aria-hidden /> : <BellRing size={15} aria-hidden />}
              {tipo === 'ban' ? tx('Banir da fila', 'Ban from the queue') : tx('Enviar aviso', 'Send warning')}
            </button>
            <span className="text-[12px] text-mudo">{tx('O jogador vê um popup no site e recebe uma mensagem privada no Discord.', 'The player sees a popup on the site and gets a private message on Discord.')}</span>
          </div>
        </form>
      ) : (
        <p className="m-0 text-[12.5px] text-mudo">{tx('Só podes avisar ou banir jogadores com uma função abaixo da tua.', 'You can only warn or ban players with a role below yours.')}</p>
      )}

      <div className="flex flex-col gap-2 border-t border-white/6 pt-3">
        <span className="rotulo">{tx('Histórico', 'History')}</span>
        <Historico perfilId={jogador.id} />
      </div>
    </div>
  )
}
