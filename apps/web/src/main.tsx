import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components'
import Home from './pages/Home'
import RepoDetail from './pages/RepoDetail'
import RunDetail from './pages/RunDetail'
import Settings from './pages/Settings'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
})

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="repos/:id" element={<RepoDetail />} />
              <Route path="runs/:id" element={<RunDetail />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
}
