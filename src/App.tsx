import React, { Suspense, lazy, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ClerkSync } from './components/ClerkSync';
import { ReportModal } from './components/ReportModal';
import { LocationModal } from './components/LocationModal';
import { AuthModal } from './components/AuthModal';
import { FaqModal } from './components/FaqModal';
import { FaqSection } from './components/FaqSection';
import { CookieConsent } from './components/CookieConsent';
import { TabLink } from './components/TabLink';
import { ToastRegion } from './components/Toast';
import { PAGE_META, updatePageMeta } from './utils/seo';

// Code splitting por pestaña: solo se descarga la vista que el usuario abre
// (Leaflet, por ejemplo, solo viaja con la vista del mapa).
const MapView = lazy(() => import('./components/MapView').then((m) => ({ default: m.MapView })));
const BlogView = lazy(() => import('./components/BlogView').then((m) => ({ default: m.BlogView })));
const ChatView = lazy(() => import('./components/ChatView').then((m) => ({ default: m.ChatView })));
const ProfileView = lazy(() => import('./components/ProfileView').then((m) => ({ default: m.ProfileView })));

const ViewFallback: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <span
      className="w-8 h-8 rounded-full border-2 border-orange-200 border-t-orange-600 animate-spin"
      role="status"
      aria-label="Cargando vista"
    />
  </div>
);

const AppContent: React.FC = () => {
  const {
    activeTab,
    isLocationModalOpen,
    setIsLocationModalOpen,
    isAuthModalOpen,
    closeAuthModal,
    completeAuthModal,
    authModalMessage,
    isFaqOpen,
    closeFaq,
    faqSection,
    openFaq,
  } = useApp();

  // Sin enrutador (decisión 2026-09-29), el `<title>` y las metadatos de
  // compartir van detrás de la pestaña visible; desde T38 esa pestaña tiene
  // además su hash en la URL (`#mapa`, `#tablon`, `#asistente`, `#perfil`).
  useEffect(() => {
    updatePageMeta(PAGE_META[activeTab]);
  }, [activeTab]);

  // Enlace profundo `/#preguntas-frecuentes` (lo usa la página 404): abre el
  // modal una sola vez y limpia el hash para no reabrirlo en re-renderizaciones.
  // NO es un hash de pestaña: `AppContext` lo deja pasar sin cambiar la vista.
  // Al cerrarlo, el usuario queda sobre la sección (T37), así que además
  // scrollamos: en la carga inicial el navegador no llega a anclarse porque la
  // sección se pinta después del parseo del shell.
  useEffect(() => {
    if (window.location.hash !== '#preguntas-frecuentes') return;
    openFaq();
    window.history.replaceState(null, '', window.location.pathname);
    document
      .getElementById('preguntas-frecuentes')
      ?.scrollIntoView?.({ block: 'start' });
    // Se ejecuta solo al montar, sobre el `openFaq` de la primera pasada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* Sin UI: mantiene el perfil local y la ubicación alineados con Clerk. */}
      <ClerkSync />
      <Header />

      <main className="flex-1 w-full">
        <Suspense fallback={<ViewFallback />}>
          {activeTab === 'map' && <MapView />}
          {activeTab === 'blog' && <BlogView />}
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'profile' && <ProfileView />}
        </Suspense>

        {/* FAQ pública en el flujo normal, visible en todas las pestañas. El
            shell estático de index.html conserva una versión útil sin JS; el
            modal (`FaqModal`) sigue siendo la ayuda contextual. */}
        <FaqSection />
      </main>

      {/* Navegación por texto en el pie; los hashes comparten estados de la
          SPA, no páginas independientes. */}
      <footer className="border-t border-slate-100 bg-white px-4 lg:px-8 py-6 pb-24 md:pb-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-start md:justify-between gap-5 text-xs">
          <div className="max-w-xl">
            <p className="text-sm font-extrabold text-slate-900">
              AyudaEn<span className="text-orange-600">Cali</span>
            </p>
            <p className="text-slate-500 leading-relaxed mt-1.5">
              Plataforma comunitaria de emergencias de Santiago de Cali: mapa con centros de
              acopio y albergues, tablón de necesidades y asistente de IA, mantenida entre
              vecinos. No sustituye a los servicios oficiales: en una emergencia real llama al 123.
            </p>
          </div>
          <nav aria-label="Enlaces de pie de página" className="flex flex-col gap-2 md:items-end">
            <TabLink
              tab="map"
              className="font-semibold text-slate-600 hover:text-orange-600 transition-colors"
            >
              Mapa de recursos
            </TabLink>
            <TabLink
              tab="blog"
              className="font-semibold text-slate-600 hover:text-orange-600 transition-colors"
            >
              Tablón de necesidades
            </TabLink>
            <TabLink
              tab="chat"
              className="font-semibold text-slate-600 hover:text-orange-600 transition-colors"
            >
              Asistente IA
            </TabLink>
            <TabLink
              tab="profile"
              className="font-semibold text-slate-600 hover:text-orange-600 transition-colors"
            >
              Mi perfil
            </TabLink>
            <a
              href="/#preguntas-frecuentes"
              className="font-semibold text-slate-600 hover:text-orange-600 transition-colors"
            >
              Preguntas frecuentes
            </a>
            <a
              href="tel:123"
              className="font-semibold text-rose-700 hover:text-rose-800 transition-colors"
            >
              Línea de emergencias 123
            </a>
            <a
              href="https://www.cali.gov.co/"
              className="font-semibold text-slate-600 hover:text-orange-600 transition-colors"
            >
              Alcaldía de Cali (sitio oficial)
            </a>
            <a
              href="https://www.cali.gov.co/gestiondelriesgo/"
              className="font-semibold text-slate-600 hover:text-orange-600 transition-colors"
            >
              Gestión del Riesgo — Alcaldía de Cali
            </a>
          </nav>
        </div>
      </footer>

      <BottomNav />
      <ReportModal />
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
      />
      {/* Registro comunitario: lo piden las acciones que exigen cuenta
          (publicar necesidad, reportar punto, comentar…). Cancelar descarta
          la escritura en cola; completarlo la conserva (`onDismiss`). */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        onDismiss={completeAuthModal}
        titleMessage={authModalMessage}
      />
      {/* Ayuda contextual (abre en la sección pedida, p. ej. «cookies»). */}
      <FaqModal isOpen={isFaqOpen} onClose={closeFaq} initialSection={faqSection} />
      {/* Consentimiento de cookies: solo aparece hasta que se responde. */}
      <CookieConsent />
      {/* Éxitos, errores y avisos (T7): región `aria-live="polite"`. */}
      <ToastRegion />
      {/* Vercel Web Analytics */}
      <Analytics />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
