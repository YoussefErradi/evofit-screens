import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Display from './Display';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{window.location.pathname.startsWith('/display') ? <Display /> : <App />}</React.StrictMode>
);
