// Точка входа: подключаю шрифты (Onest для текста, Noto Serif SC для иероглифов) и запускаю приложение.
// Entry point: I load the fonts (Onest for text, Noto Serif SC for hanzi) and start the app.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/noto-serif-sc/500.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
