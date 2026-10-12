/**
 * Fotos de perfil: só PNG, JPG ou WebP, sem GIFs, vídeos nem imagens
 * animadas. O tipo é confirmado pelos primeiros bytes do ficheiro (não só pela
 * extensão) e a imagem é recortada ao centro e gravada de novo em 256x256,
 * o que também a deixa leve.
 */
const TIPOS = ['image/png', 'image/jpeg', 'image/webp']
const LADO = 256
const MAX_BYTES = 5 * 1024 * 1024

export const ACEITES = TIPOS.join(',')

function erroFormato(): Error {
  return new Error('Só são permitidas imagens PNG, JPG ou WebP. GIFs e vídeos não.')
}

export async function prepararAvatar(f: File): Promise<Blob> {
  if (f.type.startsWith('video/') || f.type === 'image/gif') throw erroFormato()
  if (!TIPOS.includes(f.type)) throw erroFormato()
  if (f.size > MAX_BYTES) throw new Error('A imagem tem mais de 5 MB. Escolhe uma mais pequena.')

  const cab = new Uint8Array(await f.slice(0, 4096).arrayBuffer())
  const txt = Array.from(cab, (b) => String.fromCharCode(b)).join('')
  const png = cab[0] === 0x89 && txt.slice(1, 4) === 'PNG'
  const jpg = cab[0] === 0xff && cab[1] === 0xd8 && cab[2] === 0xff
  const webp = txt.startsWith('RIFF') && txt.slice(8, 12) === 'WEBP'
  if (txt.startsWith('GIF8') || !(png || jpg || webp)) throw erroFormato()
  // PNG animado (APNG) e WebP animado têm um bloco próprio logo no início do ficheiro.
  if ((png && txt.includes('acTL')) || (webp && txt.includes('ANIM'))) throw new Error('Imagens animadas não são permitidas.')

  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(f)
  } catch {
    throw new Error('Não foi possível ler esta imagem.')
  }
  const lado = Math.min(bmp.width, bmp.height)
  const tela = document.createElement('canvas')
  tela.width = LADO
  tela.height = LADO
  const ctx = tela.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, LADO, LADO)
  bmp.close()

  const webpFinal = await new Promise<Blob | null>((r) => tela.toBlob(r, 'image/webp', 0.86))
  if (webpFinal && webpFinal.type === 'image/webp') return webpFinal
  return new Promise<Blob>((res, rej) => tela.toBlob((b) => (b ? res(b) : rej(new Error('Não foi possível preparar a imagem.'))), 'image/jpeg', 0.88))
}

export function blobParaDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(new Error('Não foi possível ler a imagem.'))
    r.readAsDataURL(b)
  })
}
