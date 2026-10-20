import { ImagePlus, LoaderCircle, Pencil, Trash } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { dados, type Regiao } from '@/lib/data'
import { ACEITES, prepararAvatar } from '@/lib/imagem'
import { nomeJogador } from '@/lib/partida'
import { REGIOES } from '@/lib/regioes'
import { PADRAO_RIOT_ID } from '@/lib/regras'
import { Avatar, Modal } from './ui'
import { l } from '@/lib/idioma'

/** Botão "Editar perfil" e a janela para mudar a foto e o Riot ID. */
export function EditarPerfil({ pequeno = false, onRiotMudou }: { pequeno?: boolean; onRiotMudou?: (riotId: string) => void }) {
  const { perfil, recarregar } = useSessao()
  const acao = useAcao()
  const avisar = useAvisos()
  const [aberto, setAberto] = useState(false)
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null)
  const [riotId, setRiotId] = useState('')
  const [regiao, setRegiao] = useState<Regiao>('eu')
  const [aGuardar, setAGuardar] = useState<'foto' | 'riot' | null>(null)
  const ficheiro = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!aberto || !perfil) return
    setRiotId(perfil.riotId ?? '')
    setRegiao(perfil.regiao)
    setPreview(null)
  }, [aberto, perfil])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])

  if (!perfil) return null
  const riotValido = PADRAO_RIOT_ID.test(riotId.trim())
  const riotMudou = riotId.trim().toLowerCase() !== (perfil.riotId ?? '').toLowerCase() || regiao !== perfil.regiao

  const escolher = async (f: File | undefined) => {
    if (!f) return
    try {
      const blob = await prepararAvatar(f)
      setPreview({ blob, url: URL.createObjectURL(blob) })
    } catch (e) {
      avisar(e instanceof Error ? e.message : l('Não foi possível usar esta imagem.', 'Could not use this image.'), 'erro')
    } finally {
      if (ficheiro.current) ficheiro.current.value = ''
    }
  }

  const guardarFoto = async (blob: Blob | null) => {
    setAGuardar('foto')
    const ok = await acao(async () => { await dados.definirAvatar(blob); return true }, blob ? l('Foto de perfil atualizada.', 'Profile picture updated.') : l('Foto removida.', 'Picture removed.'))
    setAGuardar(null)
    if (ok) { setPreview(null); await recarregar() }
  }

  const guardarRiot = async () => {
    setAGuardar('riot')
    const novo = await acao(() => dados.ligarRiotId(riotId.trim(), regiao), l('Riot ID atualizado. O rank oficial foi lido outra vez.', 'Riot ID updated. Your official rank was read again.'))
    setAGuardar(null)
    if (novo) {
      await recarregar()
      if (novo.riotId) onRiotMudou?.(novo.riotId)
    }
  }

  return (
    <>
      <button type="button" className={`btn btn-fantasma ${pequeno ? '!min-h-10' : ''}`} onClick={() => setAberto(true)}>
        <Pencil size={16} className="text-laranja" aria-hidden />{l('Editar perfil', 'Edit profile')}
      </button>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo={l('Editar perfil', 'Edit profile')} eyebrow={l('CONTA', 'ACCOUNT')} largura={560}>
        <section aria-labelledby="rg-ed-foto" className="flex flex-col gap-3">
          <h3 id="rg-ed-foto" className="rotulo m-0">{l('Foto de perfil', 'Profile picture')}</h3>
          <div className="flex flex-wrap items-center gap-4">
            {preview
              ? <img src={preview.url} alt={l('Pré-visualização da nova foto', 'Preview of the new picture')} width={84} height={84} className="size-[84px] rounded-[22px] border border-laranja/45 object-cover" />
              : <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} tamanho={84} destaque perfilId={perfil.id} />}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-suave !min-h-10" onClick={() => ficheiro.current?.click()} disabled={!!aGuardar}>
                  <ImagePlus size={16} aria-hidden />{l('Escolher imagem', 'Choose image')}
                </button>
                {preview && (
                  <button type="button" className="btn btn-primario !min-h-10" onClick={() => guardarFoto(preview.blob)} disabled={!!aGuardar}>
                    {aGuardar === 'foto' && <LoaderCircle size={15} className="animate-spin" aria-hidden />}{l('Guardar foto', 'Save picture')}
                  </button>
                )}
                {!preview && perfil.avatarUrl && (
                  <button type="button" className="btn btn-fantasma !min-h-10" onClick={() => guardarFoto(null)} disabled={!!aGuardar}>
                    <Trash size={15} className="text-laranja" aria-hidden />{l('Remover', 'Remove')}
                  </button>
                )}
              </div>
              <span className="text-[12px] leading-normal text-mudo">{l('PNG, JPG ou WebP até 5 MB. GIFs, vídeos e imagens animadas não são aceites. A imagem é recortada ao centro.', 'PNG, JPG or WebP up to 5 MB. GIFs, videos and animated images are not accepted. The image is cropped to the centre.')}</span>
            </div>
            <input ref={ficheiro} type="file" accept={ACEITES} className="so-leitores" tabIndex={-1} aria-hidden onChange={(e) => escolher(e.target.files?.[0])} />
          </div>
        </section>

        <form className="flex flex-col gap-3 border-t border-white/7 pt-4" onSubmit={(e) => { e.preventDefault(); if (riotValido && riotMudou) guardarRiot() }}>
          <h3 className="rotulo m-0">Riot ID</h3>
          <div className="flex flex-wrap gap-2.5">
            <label className="flex min-w-0 flex-[2_1_220px] flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
              {l('Nome#TAG', 'Name#TAG')}
              <input className="campo font-mono" value={riotId} onChange={(e) => setRiotId(e.target.value)} autoComplete="off" spellCheck={false} placeholder={l('Nome#TAG', 'Name#TAG')} />
            </label>
            <label className="flex min-w-0 flex-[1_1_150px] flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
              {l('Região', 'Region')}
              <select className="campo" value={regiao} onChange={(e) => setRegiao(e.target.value as Regiao)}>
                {REGIOES.map((r) => <option key={r.valor} value={r.valor}>{r.nome}</option>)}
              </select>
            </label>
          </div>
          <span className={`text-[12px] ${riotId && !riotValido ? 'text-derrota' : 'text-mudo'}`}>
            {riotId && !riotValido
              ? l('Usa o formato Nome#TAG, por exemplo Nyx#4521.', 'Use the Name#TAG format, for example Nyx#4521.')
              : l('Mudaste de nome no Valorant? Atualiza aqui. Os teus pontos e o histórico ficam iguais; o rank oficial é lido outra vez.', 'Changed your name in Valorant? Update it here. Your points and history stay the same; your official rank is read again.')}
          </span>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-fantasma" onClick={() => setAberto(false)}>{l('Fechar', 'Close')}</button>
            <button type="submit" className="btn btn-primario" disabled={!riotValido || !riotMudou || !!aGuardar}>
              {aGuardar === 'riot' && <LoaderCircle size={15} className="animate-spin" aria-hidden />}{l('Guardar Riot ID', 'Save Riot ID')}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}
