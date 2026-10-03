import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/push-notifications'

// Inicializa o Service Worker do PWA
if (typeof window !== 'undefined') {
  registerServiceWorker().catch((err) => {
    console.debug('Service Worker não inicializado nesta sessão:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
