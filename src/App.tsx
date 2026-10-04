import React, { Suspense, lazy, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ClerkSync } from './components/ClerkSync';
import { ReportModal } from './components/ReportModal';
import { LocationModal } from './components/LocationModal';
import { AuthModal } from './components/AuthModal';
import { FaqPage } from './components/FaqPage';
import { CookieConsent } from './components/CookieConsent';
import { ToastRegion } from './components/Toast';
import { FAQ_PAGE_META, PAGE_META, updatePageMeta } from './utils/seo';

// Code splitting por pestaña: solo se descarga la vista que el usuario abre
// (Leaflet, por ejemplo, solo viaja con la vista del mapa).
const MapView = lazy(() => import('./components/MapView').then((m) => ({ default: m.MapView })));
const BlogView = lazy(() => import('./components/BlogView').then((m) => ({ default: m.BlogView })));
const ChatView = lazy(() => import('./components/ChatView').then((m) => ({ default: m.ChatView })));
const ProfileView = lazy(() => import('./components/ProfileView').then((m) => ({ default: m.ProfileView })));
const FAQ_PATH = '/preguntas-frecuentes';

const isFaqPath = (pathname: string): boolean =>
  pathname === FAQ_PATH || pathname === `${FAQ_PATH}/`;

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
  } = useApp();

  const isFaqPage = isFaqPath(window.location.pathname);

  // Sin enrutador, las pestañas siguen usando hash y el FAQ tiene una ruta
  // propia para no aparecer como una sección repetida en cada vista.
  useEffect(() => {
    updatePageMeta(isFaqPage ? FAQ_PAGE_META : PAGE_META[activeTab]);
  }, [activeTab, isFaqPage]);

  if (isFaqPage) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <FaqPage />
        <CookieConsent />
        <ToastRegion />
        <Analytics />
      </div>
    );
  }

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

      </main>

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
