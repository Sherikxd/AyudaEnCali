import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { resolveClerkPublishableKey } from './config/clerk.ts';
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

/** Pantalla corta mientras se resuelve la clave pública (bundle o API). */
function BootScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6" aria-busy="true">
      <div className="h-9 w-9 rounded-full border-[3px] border-slate-200 border-t-slate-900 animate-spin" />
    </div>
  );
}

/** Instrucciones cuando no hay ninguna clave pública de Clerk configurada. */
function MissingAuthNotice() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white max-w-md w-full rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
        <h1 className="text-base font-extrabold text-slate-900 mb-2">
          Falta configurar la autenticación
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          Define la clave pública de Clerk (empieza con <span className="font-mono font-bold">pk_</span>):
        </p>
        <ul className="text-xs text-slate-500 leading-relaxed mt-3 space-y-2 text-left">
          <li>
            <span className="font-semibold text-slate-700">En despliegue:</span> variable de entorno{' '}
            <span className="font-mono font-bold">VITE_CLERK_PUBLISHABLE_KEY</span> (o{' '}
            <span className="font-mono font-bold">CLERK_PUBLISHABLE_KEY</span>) del servicio (Cloud Run,
            Vercel…) y vuelve a desplegar. El servidor la sirve en <span className="font-mono">/api/config</span>.
          </li>
          <li>
            <span className="font-semibold text-slate-700">En local:</span> copia{' '}
            <span className="font-mono font-bold">.env.example</span> a{' '}
            <span className="font-mono font-bold">.env</span> y ponla ahí.
          </li>
        </ul>
      </div>
    </div>
  );
}

root.render(<BootScreen />);

// La clave puede venir del bundle o, si el build no la incluyó, del servidor:
// así desplegar solo requiere definir la variable de entorno, sin recompilar.
resolveClerkPublishableKey()
  .then((publishableKey) => {
    root.render(
      publishableKey ? (
        <ClerkProvider publishableKey={publishableKey}>{app}</ClerkProvider>
      ) : (
        <MissingAuthNotice />
      ),
    );
  })
  .catch(() => {
    root.render(<MissingAuthNotice />);
  });
