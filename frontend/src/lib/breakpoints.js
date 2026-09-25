import { useEffect, useState } from 'react'

// Pontos de quebra da loja. O CSS usa os mesmos números (media query não lê
// variável), sempre assim:
//   celular pequeno   (max-width: 479.98px)
//   celular           (max-width: 767.98px)
//   celular e tablet  (max-width: 1023.98px)   menu, folhas que sobem de baixo
//   até notebook      (max-width: 1279.98px)
//   celular deitado   (max-height: 500px) and (orientation: landscape)
// Todo matchMedia do JS sai daqui, para o CSS e o JS nunca discordarem.
export const BP = { sm: 480, md: 768, lg: 1024, xl: 1280 }

export const MQ = {
  small: '(max-width: 479.98px)',
  phone: '(max-width: 767.98px)',
  wide: '(min-width: 768px)',
  compact: '(max-width: 1023.98px)',
  landscape: '(max-height: 500px) and (orientation: landscape)',
  touch: '(pointer: coarse)',
  hover: '(hover: hover) and (pointer: fine)',
}

// celular em pé ou deitado: onde camadas viram tela cheia
export const MQ_HANDHELD = `${MQ.phone}, ${MQ.landscape}`

export const matches = (query) => typeof window !== 'undefined' && window.matchMedia(query).matches

// Acompanha uma media query (girar o celular, redimensionar a janela).
export function useMedia(query) {
  const [match, setMatch] = useState(() => matches(query))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatch(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return match
}
