import type { ReactNode } from 'react'
import { useAgora } from '@/hooks/useAgora'
import type { EstadoJogoTorneio, EstadoTorneio, FuncaoEquipaTorneio, OrigemEquipaTorneio, TorneioJogo, TorneioResumo } from '@/lib/data'
import { emIngles, l, locale } from '@/lib/idioma'
import { Chip } from '@/components/ui'

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']
export const letraGrupo = (g: number | null | undefined) => (g ? LETRAS[g - 1] ?? String(g) : '?')
export const nomeGrupo = (g: number | null | undefined) => `${l('Grupo', 'Group')} ${letraGrupo(g)}`

const NOME_FUNCAO: Record<FuncaoEquipaTorneio, [string, string]> = {
  jogador: ['Jogador', 'Player'],
  coach: ['Coach', 'Coach'],
  suplente: ['Suplente', 'Substitute'],
}
export const nomeFuncao = (f: FuncaoEquipaTorneio) => l(...NOME_FUNCAO[f])

const NOME_ESTADO: Record<EstadoTorneio, [string, string]> = {
  rascunho: ['Rascunho', 'Draft'],
  inscricoes: ['Inscrições abertas', 'Registration open'],
  grupos: ['Fase de grupos', 'Group stage'],
  playoffs: ['Playoffs', 'Playoffs'],
  concluido: ['Concluído', 'Finished'],
  cancelado: ['Cancelado', 'Cancelled'],
}

/** O estado como uma pessoa o lê: as inscrições podem ter fechado sem o sorteio ter acontecido. */
export function estadoLegivel(t: Pick<TorneioResumo, 'estado' | 'inscricoesAbertas'>): string {
  if (t.estado === 'inscricoes' && !t.inscricoesAbertas) return l('Inscrições fechadas', 'Registration closed')
  return l(...NOME_ESTADO[t.estado])
}

export function ChipEstado({ t }: { t: Pick<TorneioResumo, 'estado' | 'inscricoesAbertas'> }) {
  const tom = t.estado === 'inscricoes' && t.inscricoesAbertas ? 'vitoria' : t.estado === 'grupos' || t.estado === 'playoffs' || (t.estado === 'inscricoes') ? 'laranja'
    : t.estado === 'concluido' ? 'ouro' : t.estado === 'cancelado' ? 'derrota' : 'neutro'
  return <Chip tom={tom}>{estadoLegivel(t).toUpperCase()}</Chip>
}

/** "Sáb 14 Nov · 21:00" */
export function dataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const dia = d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\.$/, '').replace(/,/g, '')
  const hora = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${hora}`
}

/** "14 Nov, 23:59" */
export function dataLimite(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }).replace(/\.$/, '')}, ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`
}

/** O que falta até uma data: "5 d 3 h", "2 h 10 min", "12 min" ou null se já passou. */
function faltaPara(iso: string | null | undefined, agora: number): string | null {
  if (!iso) return null
  const s = Math.floor((new Date(iso).getTime() - agora) / 1000)
  if (s <= 0) return null
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${Math.max(1, m)} min`
}

export function Contagem({ ate, vazio }: { ate: string | null | undefined; vazio: string }) {
  const agora = useAgora(30_000)
  return <>{faltaPara(ate, agora) ?? vazio}</>
}

export const nomeMelhorDe = (n: number) => (n > 1 ? `MD${n}` : null)

/** O que se mostra como pontos de cada lado: os mapas ganhos numa série, as rondas num jogo à melhor de 1. */
export function pontosJogo(j: Pick<TorneioJogo, 'melhorDe' | 'serieA' | 'serieB' | 'scoreA' | 'scoreB' | 'estado'>, lado: 'A' | 'B'): number | null {
  if (j.melhorDe > 1) return j.estado === 'concluido' || j.serieA + j.serieB > 0 ? (lado === 'A' ? j.serieA : j.serieB) : null
  return lado === 'A' ? j.scoreA : j.scoreB
}

export const formatoTexto = (t: Pick<TorneioResumo, 'tamanhoGrupo' | 'passamPorGrupo'>) =>
  l(`Grupos de ${t.tamanhoGrupo}, passam ${t.passamPorGrupo}, eliminação simples`, `Groups of ${t.tamanhoGrupo}, top ${t.passamPorGrupo} advance, single elimination`)

const ROTULO_RONDA: Record<string, [string, string]> = {
  jornada: ['Jornada', 'Matchday'],
  oitavos: ['Oitavos de final', 'Round of 16'],
  quartos: ['Quartos de final', 'Quarter-finals'],
  meias: ['Meias-finais', 'Semi-finals'],
  final: ['Final', 'Final'],
  ronda: ['Ronda', 'Round'],
}

export function rotuloJogo(j: Pick<TorneioJogo, 'fase' | 'rotulo' | 'ronda'>): string {
  const base = l(...(ROTULO_RONDA[j.rotulo] ?? ROTULO_RONDA.ronda))
  return j.rotulo === 'jornada' || j.rotulo === 'ronda' ? `${base} ${j.ronda}` : base
}

const ordinal = (n: number) => (emIngles() ? (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`) : `${n}.º`)

/** De onde vem uma equipa que ainda não se sabe: "1.º Grupo A" ou "Vencedor do jogo 2". */
export function origemTexto(o: OrigemEquipaTorneio | null): string {
  if (!o) return l('Por decidir', 'To be decided')
  if (o.tipo === 'grupo') return `${ordinal(o.posicao)} ${nomeGrupo(o.grupo)}`
  return l(`Vencedor do jogo ${o.ordem}`, `Winner of match ${o.ordem}`)
}

const NOME_JOGO_ESTADO: Record<EstadoJogoTorneio, [string, string]> = {
  pendente: ['Por marcar', 'To schedule'],
  agendado: ['Agendado', 'Scheduled'],
  veto: ['Picks e bans', 'Picks and bans'],
  a_decorrer: ['A decorrer', 'In progress'],
  concluido: ['Concluído', 'Finished'],
}

const TOM_JOGO: Partial<Record<EstadoJogoTorneio, 'vitoria' | 'laranja'>> = { concluido: 'vitoria', a_decorrer: 'laranja', veto: 'laranja' }

export function ChipJogo({ j }: { j: Pick<TorneioJogo, 'estado' | 'como'> }) {
  return <Chip tom={TOM_JOGO[j.estado]}>{l(...NOME_JOGO_ESTADO[j.estado]).toUpperCase()}</Chip>
}

export const ehJogoReal = (j: Pick<TorneioJogo, 'como'>) => j.como !== 'bye'

export const rotuloComGrupo = (j: Pick<TorneioJogo, 'fase' | 'grupo' | 'rotulo' | 'ronda'>) => `${j.fase === 'grupo' ? `${nomeGrupo(j.grupo)} · ` : ''}${rotuloJogo(j)}`

export const antesDoSorteio = (estado: EstadoTorneio) => estado === 'rascunho' || estado === 'inscricoes'
export const torneioAcabado = (estado: EstadoTorneio) => estado === 'concluido' || estado === 'cancelado'

/** O texto de como se soube o resultado. */
export function comoTexto(como: TorneioJogo['como']): string | null {
  switch (como) {
    case 'api': return l('lido da API da Riot', 'read from the Riot API')
    case 'staff': return l('posto pela staff', 'entered by staff')
    case 'simulado': return l('simulado (teste)', 'simulated (test)')
    case 'walkover': return l('falta de comparência', 'forfeit')
    case 'bye': return l('folga', 'bye')
    default: return null
  }
}

export function Papel({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-mudo uppercase">{children}</span>
}
