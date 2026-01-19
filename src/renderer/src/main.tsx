import './assets/main.css'
import './assets/global.css'
import 'flag-icons/css/flag-icons.min.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './i18n'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

// @ts-expect-error - Define web mode flag
window.VIDBEE_WEB_MODE = true

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
