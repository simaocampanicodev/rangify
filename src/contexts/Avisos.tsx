import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { traduzirErro } from '@/lib/erros'
import { l } from '@/lib/idioma'

type Tipo = 'ok' | 'erro'
interface Aviso { id: number; texto: string; tipo: Tipo }

const Contexto = createContext<(texto: string, tipo?: Tipo) => void>(() => {})

/** Mensagens curtas no canto do ecrã, para erros e confirmações. */
export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([])

  const avisar = useCallback((texto: string, tipo: Tipo = 'ok') => {
    const id = Date.now() + Math.random()
    // Os erros vêm do servidor em português; em inglês traduzem-se aqui.
    setLista((v) => [...v.slice(-3), { id, texto: tipo === 'erro' ? traduzirErro(texto) : texto, tipo }])
    window.setTimeout(() => setLista((v) => v.filter((a) => a.id !== id)), tipo === 'erro' ? 6000 : 3500)
  }, [])

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[80] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        {lista.map((a) => (
          <div key={a.id} role={a.tipo === 'erro' ? 'alert' : 'status'} className="painel entra pointer-events-auto flex items-start gap-3 !rounded-xl px-4 py-3 text-[13.5px] shadow-2xl">
            {a.tipo === 'erro'
              ? <CircleAlert size={18} className="mt-px shrink-0 text-derrota" aria-hidden />
              : <CircleCheck size={18} className="mt-px shrink-0 text-laranja" aria-hidden />}
            <span className="flex-1 leading-snug text-marfim">{a.texto}</span>
            <button type="button" aria-label={l('Fechar aviso', 'Close notice')} onClick={() => setLista((v) => v.filter((x) => x.id !== a.id))} className="-m-1 grid size-7 place-items-center rounded-md text-mudo hover:text-texto">
              <X size={15} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}

export function useAvisos() {
  return useContext(Contexto)
}

/** Corre uma ação e mostra o erro, se houver. */
export function useAcao() {
  const avisar = useAvisos()
  return useCallback(async <T,>(f: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    try {
      const r = await f()
      if (ok) avisar(ok)
      return r
    } catch (e) {
      avisar(e instanceof Error ? e.message : l('Algo correu mal. Tenta outra vez.', 'Something went wrong. Try again.'), 'erro')
      return undefined
    }
  }, [avisar])
}
