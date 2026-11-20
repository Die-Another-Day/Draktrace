import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/ui'; // Ateeb: Command Center uses useToast()
// Fonts are bundled (latin subset, woff2 only), so the app looks the same offline
import './styles/fonts.css';
import './styles/global.css';
import './styles/integration.css'; // glue for the teammates' modules (loaded last)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
