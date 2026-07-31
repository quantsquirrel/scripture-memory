import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import App from './App'
import { required } from './lib/invariant'
import { applyTheme, getTheme } from './lib/theme'

applyTheme(getTheme())
registerSW({ immediate: true })

createRoot(required(document.getElementById('root'), '#root 엘리먼트')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
