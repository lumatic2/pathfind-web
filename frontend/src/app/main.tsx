import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('<div id="root">를 app.html에서 찾을 수 없습니다.')
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
