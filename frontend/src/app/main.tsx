import React from 'react';
import { createRoot } from 'react-dom/client';
import { NotebookMindmapShellDemo } from './components/NotebookShell';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('<div id="root">를 app.html에서 찾을 수 없습니다.');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <NotebookMindmapShellDemo />
  </React.StrictMode>
);
