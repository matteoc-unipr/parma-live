import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'

// Nessuna UI in questa fase: solo il mount point.
createRoot(document.getElementById('root')!).render(<StrictMode />)
