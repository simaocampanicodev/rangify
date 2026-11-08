/** O evento que pede para mostrar o guia (o Layout descarrega-o a pedido e o próprio guia reinicia-se). */
export const EVENTO_TOUR = 'rangify:tour'

/** Volta a mostrar o guia (por exemplo, a partir das Definições). */
export const reverTour = () => window.dispatchEvent(new Event(EVENTO_TOUR))
