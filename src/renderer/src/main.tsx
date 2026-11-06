import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LanguageProvider } from './i18n'
import '@fontsource/cinzel/latin-500.css'
import '@fontsource/cinzel/latin-700.css'
import './styles.css'
import './theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>
)
