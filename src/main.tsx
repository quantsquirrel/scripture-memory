import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { applyTheme, getTheme } from './adapters/theme'
import { required } from './domain/invariant'
import App from './views/App'

applyTheme(getTheme())
registerSW({ immediate: true })

createRoot(required(document.getElementById('root'), '#root 엘리먼트')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
