import React from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

const el = document.getElementById("root")
if (!el) throw new Error("index.html 에 <div id=\"root\"> 가 없습니다.")

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
