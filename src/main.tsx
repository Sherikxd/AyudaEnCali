import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { CLERK_PUBLISHABLE_KEY, isClerkConfigured } from './config/clerk.ts';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el contenedor #root en index.html');

const root = createRoot(container);

const app = (
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

root.render(
  isClerkConfigured ? (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>{app}</ClerkProvider>
  ) : (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white max-w-md w-full rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <h1 className="text-base font-extrabold text-slate-900 mb-2">
          Falta configurar la autenticación
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          Copia <span className="font-mono font-bold">.env.example</span> a{' '}
          <span className="font-mono font-bold">.env</span> y define{' '}
          <span className="font-mono font-bold">VITE_CLERK_PUBLISHABLE_KEY</span> con tu clave
          pública de Clerk para habilitar el inicio de sesión.
        </p>
      </div>
    </div>
  ),
);
