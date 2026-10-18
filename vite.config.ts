import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * Põe no index.html o pedido antecipado das fontes do alfabeto latino. O texto só existe depois de o React desenhar a
 * página, por isso sem isto o browser só descobria as fontes depois de correr o JavaScript todo e o texto trocava de letra.
 */
function precarregarFontes(): Plugin {
  const usadas = [/geist-latin-wght-normal-.*\.woff2$/, /jetbrains-mono-latin-wght-normal-.*\.woff2$/, /instrument-serif-latin-400-italic-.*\.woff2$/]
  return {
    name: 'precarregar-fontes',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return []
        return Object.keys(ctx.bundle)
          .filter((f) => usadas.some((r) => r.test(f)))
          .map((f) => ({ tag: 'link', injectTo: 'head' as const, attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `/${f}` } }))
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precarregarFontes()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 5175),
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
})
