import { useEffect, useRef } from 'react'

/**
 * O fundo: três fios de luz nas bordas (um U em cima à direita, uma curva à
 * esquerda e outra em baixo), que ondulam devagar e acompanham o rato.
 *
 * Para não pesar, cada fio é desenhado (e desfocado) uma vez só e depois só se
 * mexe com transform e opacity, que a placa gráfica faz sem voltar a pintar.
 * O rato mexe direto no transform das duas camadas, sem passar pelo React.
 */
export function Fundo() {
  const longe = useRef<HTMLDivElement>(null)
  const perto = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let quadro = 0
    const mover = (e: PointerEvent) => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(() => {
        const px = (e.clientX / window.innerWidth) * 2 - 1
        const py = (e.clientY / window.innerHeight) * 2 - 1
        if (longe.current) longe.current.style.transform = `translate3d(${(px * 30).toFixed(1)}px,${(py * 22).toFixed(1)}px,0)`
        if (perto.current) perto.current.style.transform = `translate3d(${(px * 72).toFixed(1)}px,${(py * 50).toFixed(1)}px,0) rotate(${(px * 1.4).toFixed(2)}deg)`
      })
    }
    window.addEventListener('pointermove', mover, { passive: true })
    return () => { window.removeEventListener('pointermove', mover); cancelAnimationFrame(quadro) }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-90">
      <div ref={longe} className="absolute inset-0 will-change-transform" style={{ transition: 'transform 2s cubic-bezier(.16,1,.3,1)' }}>
        <div className="absolute top-[-14%] left-[-12%] h-[900px] w-[62%]" style={{ background: 'radial-gradient(closest-side, rgba(255,91,31,0.07), rgba(255,91,31,0))' }} />
        <div className="absolute top-[380px] right-[-14%] h-[860px] w-[56%]" style={{ background: 'radial-gradient(closest-side, rgba(255,91,31,0.045), rgba(255,91,31,0))' }} />
        <div className="fio fio-b absolute top-0 left-[-60px] h-[720px] w-[360px]">
          <svg viewBox="-60 0 360 720" width="360" height="720" className="block overflow-visible">
            <defs>
              <filter id="rgNevoa" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="28" /></filter>
              <filter id="rgBrilho" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" /></filter>
              <linearGradient id="rgNucleoB" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="660">
                <stop offset="0" stopColor="#ffd9c2" stopOpacity="0" />
                <stop offset="0.18" stopColor="#ffe4d2" stopOpacity="0.95" />
                <stop offset="0.45" stopColor="#ffa577" stopOpacity="0.5" />
                <stop offset="0.72" stopColor="#ffe4d2" stopOpacity="1" />
                <stop offset="1" stopColor="#ffa577" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="rgHaloB" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="660">
                <stop offset="0" stopColor="#ff5b1f" stopOpacity="0" />
                <stop offset="0.18" stopColor="#ff5b1f" stopOpacity="0.9" />
                <stop offset="0.45" stopColor="#ff5b1f" stopOpacity="0.45" />
                <stop offset="0.72" stopColor="#ff5b1f" stopOpacity="0.95" />
                <stop offset="1" stopColor="#ff5b1f" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g fill="none" strokeLinecap="round">
              <path d="M -40 60 C 110 70 225 150 248 268 C 266 360 232 432 160 480 C 92 526 30 566 -40 640" stroke="#ff5b1f" strokeWidth="58" strokeOpacity="0.12" filter="url(#rgNevoa)" />
              <path d="M -40 60 C 110 70 225 150 248 268 C 266 360 232 432 160 480 C 92 526 30 566 -40 640" stroke="url(#rgHaloB)" strokeWidth="8" filter="url(#rgBrilho)" />
              <path d="M -40 60 C 110 70 225 150 248 268 C 266 360 232 432 160 480 C 92 526 30 566 -40 640" stroke="url(#rgNucleoB)" strokeWidth="1.7" />
            </g>
          </svg>
        </div>
        <div className="fio fio-d absolute top-[560px] right-[-80px] h-[520px] w-[280px]">
          <svg viewBox="1240 0 280 520" width="280" height="520" className="block overflow-visible">
            <g fill="none" strokeLinecap="round">
              <path d="M 1500 20 C 1400 90 1370 200 1420 300 C 1452 362 1490 400 1520 480" stroke="#ff5b1f" strokeWidth="40" strokeOpacity="0.08" filter="url(#rgNevoa)" />
              <path d="M 1500 20 C 1400 90 1370 200 1420 300 C 1452 362 1490 400 1520 480" stroke="#ff5b1f" strokeWidth="5" strokeOpacity="0.4" filter="url(#rgBrilho)" />
              <path d="M 1500 20 C 1400 90 1370 200 1420 300 C 1452 362 1490 400 1520 480" stroke="#ffc8a8" strokeWidth="1.1" strokeOpacity="0.45" />
            </g>
          </svg>
        </div>
      </div>

      <div ref={perto} className="absolute inset-0 will-change-transform" style={{ transition: 'transform 1.3s cubic-bezier(.16,1,.3,1)' }}>
        <div className="fio fio-a absolute top-[-60px] right-[-40px] h-[340px] w-[660px]">
          <svg viewBox="820 -60 660 340" width="660" height="340" className="block overflow-visible">
            <defs>
              <linearGradient id="rgNucleoA" gradientUnits="userSpaceOnUse" x1="930" y1="0" x2="1360" y2="0">
                <stop offset="0" stopColor="#ffd9c2" stopOpacity="0.15" />
                <stop offset="0.22" stopColor="#ffe4d2" stopOpacity="1" />
                <stop offset="0.5" stopColor="#ffa577" stopOpacity="0.55" />
                <stop offset="0.8" stopColor="#ffe4d2" stopOpacity="1" />
                <stop offset="1" stopColor="#ffa577" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="rgHaloA" gradientUnits="userSpaceOnUse" x1="930" y1="0" x2="1360" y2="0">
                <stop offset="0" stopColor="#ff5b1f" stopOpacity="0.15" />
                <stop offset="0.22" stopColor="#ff5b1f" stopOpacity="0.95" />
                <stop offset="0.5" stopColor="#ff5b1f" stopOpacity="0.5" />
                <stop offset="0.8" stopColor="#ff5b1f" stopOpacity="0.95" />
                <stop offset="1" stopColor="#ff5b1f" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <g fill="none" strokeLinecap="round">
              <path d="M 940 -40 C 965 40 1020 92 1130 112 C 1250 134 1335 128 1352 70 C 1364 28 1346 -12 1330 -40" stroke="#ff5b1f" strokeWidth="60" strokeOpacity="0.13" filter="url(#rgNevoa)" />
              <path d="M 940 -40 C 965 40 1020 92 1130 112 C 1250 134 1335 128 1352 70 C 1364 28 1346 -12 1330 -40" stroke="url(#rgHaloA)" strokeWidth="9" filter="url(#rgBrilho)" />
              <path d="M 940 -40 C 965 40 1020 92 1130 112 C 1250 134 1335 128 1352 70 C 1364 28 1346 -12 1330 -40" stroke="url(#rgNucleoA)" strokeWidth="1.9" />
              <path d="M 1396 -40 C 1400 30 1418 84 1480 112" stroke="#ff5b1f" strokeWidth="6" strokeOpacity="0.4" filter="url(#rgBrilho)" />
              <path d="M 1396 -40 C 1400 30 1418 84 1480 112" stroke="#ffd2b6" strokeWidth="1.2" strokeOpacity="0.55" />
            </g>
          </svg>
        </div>
        <div className="fio fio-c absolute bottom-[-20px] left-[-60px] h-[320px] w-[780px]">
          <svg viewBox="-60 700 780 320" width="780" height="320" className="block overflow-visible">
            <defs>
              <linearGradient id="rgNucleoC" gradientUnits="userSpaceOnUse" x1="-40" y1="0" x2="660" y2="0">
                <stop offset="0" stopColor="#ffd9c2" stopOpacity="0.1" />
                <stop offset="0.28" stopColor="#ffe4d2" stopOpacity="0.95" />
                <stop offset="0.55" stopColor="#ffa577" stopOpacity="0.5" />
                <stop offset="0.78" stopColor="#ffe4d2" stopOpacity="0.9" />
                <stop offset="1" stopColor="#ffa577" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="rgHaloC" gradientUnits="userSpaceOnUse" x1="-40" y1="0" x2="660" y2="0">
                <stop offset="0" stopColor="#ff5b1f" stopOpacity="0.1" />
                <stop offset="0.28" stopColor="#ff5b1f" stopOpacity="0.9" />
                <stop offset="0.55" stopColor="#ff5b1f" stopOpacity="0.45" />
                <stop offset="0.78" stopColor="#ff5b1f" stopOpacity="0.85" />
                <stop offset="1" stopColor="#ff5b1f" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g fill="none" strokeLinecap="round">
              <path d="M -40 1000 C 90 880 250 830 390 868 C 510 900 580 946 660 1010" stroke="#ff5b1f" strokeWidth="56" strokeOpacity="0.12" filter="url(#rgNevoa)" />
              <path d="M -40 1000 C 90 880 250 830 390 868 C 510 900 580 946 660 1010" stroke="url(#rgHaloC)" strokeWidth="8" filter="url(#rgBrilho)" />
              <path d="M -40 1000 C 90 880 250 830 390 868 C 510 900 580 946 660 1010" stroke="url(#rgNucleoC)" strokeWidth="1.8" />
            </g>
          </svg>
        </div>
      </div>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 55% at 52% 42%, rgba(9,9,11,0.4) 0%, rgba(9,9,11,0) 100%)' }} />
    </div>
  )
}
