import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProvedorAjuda } from './components/Ajuda'
import { FilaPorLink } from './components/FilaPorLink'
import { Layout } from './components/Layout'
import { ProvedorAvisos } from './contexts/Avisos'
import { ProvedorPartida } from './contexts/Partida'
import { ProvedorSessao } from './contexts/Sessao'
import { BemVindo } from './pages/BemVindo'
import { Dashboard } from './pages/Dashboard'
import { Entrar } from './pages/Entrar'
import { Jogar } from './pages/Jogar'

// As páginas menos usadas só descarregam quando são abertas.
const Ranking = lazy(() => import('./pages/Ranking').then((m) => ({ default: m.Ranking })))
const Partidas = lazy(() => import('./pages/Partidas').then((m) => ({ default: m.Partidas })))
const Perfil = lazy(() => import('./pages/Perfil').then((m) => ({ default: m.Perfil })))
const Missoes = lazy(() => import('./pages/Missoes').then((m) => ({ default: m.Missoes })))
const Amigos = lazy(() => import('./pages/Amigos').then((m) => ({ default: m.Amigos })))
const Sugestoes = lazy(() => import('./pages/Sugestoes').then((m) => ({ default: m.Sugestoes })))
const Loja = lazy(() => import('./pages/Loja').then((m) => ({ default: m.Loja })))
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })))
const Definicoes = lazy(() => import('./pages/Definicoes').then((m) => ({ default: m.Definicoes })))
const NaoEncontrado = lazy(() => import('./pages/NaoEncontrado').then((m) => ({ default: m.NaoEncontrado })))

export function App() {
  return (
    <BrowserRouter>
      <ProvedorAvisos>
        <ProvedorSessao>
          <ProvedorPartida>
            <ProvedorAjuda>
              <FilaPorLink />
              <Routes>
                <Route path="/entrar" element={<Entrar />} />
                <Route path="/bem-vindo" element={<BemVindo />} />
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="jogar" element={<Jogar />} />
                  <Route path="ranking" element={<Ranking />} />
                  <Route path="partidas" element={<Partidas />} />
                  <Route path="perfil" element={<Perfil />} />
                  <Route path="perfil/:riot" element={<Perfil />} />
                  <Route path="missoes" element={<Missoes />} />
                  <Route path="amigos" element={<Amigos />} />
                  <Route path="sugestoes" element={<Sugestoes />} />
                  <Route path="loja" element={<Loja />} />
                  <Route path="definicoes" element={<Definicoes />} />
                  <Route path="admin" element={<Admin />} />
                  <Route path="*" element={<NaoEncontrado />} />
                </Route>
              </Routes>
            </ProvedorAjuda>
          </ProvedorPartida>
        </ProvedorSessao>
      </ProvedorAvisos>
    </BrowserRouter>
  )
}
