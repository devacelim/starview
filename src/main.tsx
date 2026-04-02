import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './components/App';
import AuthGate from './components/AuthGate';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
