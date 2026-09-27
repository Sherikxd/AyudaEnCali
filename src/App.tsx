import React, { Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ClerkSync } from './components/ClerkSync';
import { ReportModal } from './components/ReportModal';
import { LocationModal } from './components/LocationModal';

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
  const { activeTab, isLocationModalOpen, setIsLocationModalOpen } = useApp();

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
