/** A fase de grupos: a tabela de cada grupo (com quem passa) e os jogos por jornada. */
import { Trophy } from 'lucide-react'
import { Painel, TituloPainel, Vazio } from '@/components/ui'
import type { TorneioDetalhe, TorneioJogo } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { JogoLinha } from './Jogo'
import { nomeGrupo, Papel } from './comum'

export function Grupos({ detalhe, meuId, aoAbrirJogo }: { detalhe: TorneioDetalhe; meuId: string | null; aoAbrirJogo: (j: TorneioJogo) => void }) {
  const t = detalhe.torneio
  if (!detalhe.classificacao.length) {
    return (
      <Painel className="p-[22px]">
        <Vazio
          icone={<Trophy size={22} />}
          titulo={t.estado === 'inscricoes' ? l('Os grupos saem do sorteio', 'Groups come from the draw') : l('Ainda sem grupos', 'No groups yet')}
          texto={t.estado === 'inscricoes'
            ? l('Quando as inscrições fecharem, a staff faz o sorteio e aparecem aqui os grupos e os jogos.', 'Once registration closes, staff runs the draw and the groups and matches show up here.')
            : l('Ainda não houve sorteio.', 'The draw has not happened yet.')}
        />
      </Painel>
    )
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
      {detalhe.classificacao.map((c) => {
        const jogos = detalhe.jogos.filter((j) => j.fase === 'grupo' && j.grupo === c.grupo)
        const jornadas = [...new Set(jogos.map((j) => j.ronda))].sort((a, b) => a - b)
        const feitas = jogos.filter((j) => j.estado === 'concluido').length
        return (
          <Painel key={c.grupo} aria-label={nomeGrupo(c.grupo)} className="flex min-w-0 flex-col gap-3.5 p-[20px]">
            <TituloPainel eyebrow={nomeGrupo(c.grupo).toUpperCase()} direita={<span className="text-[12px] text-mudo">{feitas}/{jogos.length} {l('jogos', 'matches')}</span>} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse">
                <thead>
                  <tr className="font-mono text-[10px] tracking-[0.14em] text-mudo">
                    <th className="px-2 py-1.5 text-left font-semibold">#</th>
                    <th className="px-2 text-left font-semibold">{l('EQUIPA', 'TEAM')}</th>
                    <th className="px-2 text-right font-semibold">J</th>
                    <th className="px-2 text-right font-semibold">{l('V-D', 'W-L')}</th>
                    <th className="px-2 text-right font-semibold">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {c.equipas.map((e) => (
                    <tr key={e.equipaId} className={`border-t border-white/6 ${e.equipaId === meuId ? 'bg-laranja/[0.06]' : ''}`}>
                      <td className={`px-2 py-2 font-mono text-[13px] ${e.passa ? 'text-pessego shadow-[inset_3px_0_0_var(--color-laranja)]' : 'text-mudo'}`}>{e.posicao}</td>
                      <td className="max-w-[180px] truncate px-2 text-[14px] font-bold">{e.nome}</td>
                      <td className="px-2 text-right font-mono text-[13px]">{e.jogos}</td>
                      <td className="px-2 text-right font-mono text-[13px]">{e.vitorias}-{e.derrotas}</td>
                      <td className={`px-2 text-right font-mono text-[13px] ${e.diferenca > 0 ? 'text-vitoria' : e.diferenca < 0 ? 'text-derrota' : 'text-mudo'}`}>{e.diferenca > 0 ? '+' : ''}{e.diferenca}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="m-0 text-[11.5px] leading-normal text-mudo">
              {l(`A marca laranja mostra as ${t.passamPorGrupo} equipas que passam aos playoffs. Desempate: vitórias, confronto direto, diferença de rondas e rondas ganhas.`, `The orange mark shows the ${t.passamPorGrupo} teams that go through to the playoffs. Tie-breakers: wins, head-to-head, round difference and rounds won.`)}
            </p>
            <div className="flex flex-col gap-3 border-t border-white/7 pt-3">
              {jornadas.map((r) => (
                <div key={r} className="flex flex-col gap-1.5">
                  <Papel>{l('JORNADA', 'MATCHDAY')} {r}</Papel>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {jogos.filter((j) => j.ronda === r).sort((a, b) => a.ordem - b.ordem).map((j) => <JogoLinha key={j.id} j={j} meuId={meuId} aoAbrir={aoAbrirJogo} />)}
                  </ul>
                </div>
              ))}
            </div>
          </Painel>
        )
      })}
    </div>
  )
}
