import { ReactLenis } from 'lenis/react'
import 'lenis/dist/lenis.css' 
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <ReactLenis root>
    <App />
  </ReactLenis>
)
