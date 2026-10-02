import React from 'react';
import { useApp } from '../context/AppContext';
import { useUser, useClerk, UserButton } from '@clerk/clerk-react';
import { MapPin, Plus, PhoneCall, LogIn, HelpCircle } from 'lucide-react';
import { TabLink } from './TabLink';

export const Header: React.FC = () => {
  const { 
    activeTab, 
    setIsReportModalOpen, 
    setReportModalType, 
    userProfile, 
    openAuthModal,
    openFaq 
  } = useApp();

  const { isSignedIn, isLoaded } = useUser();
  const { openSignIn } = useClerk();

  const handleOpenReport = () => {
    if (!userProfile.isRegistered && !isSignedIn) {
      openAuthModal('Para reportar un centro de acopio o necesidad en Cali debes crear una cuenta comunitaria.', () => {
        setReportModalType('point');
        setIsReportModalOpen(true);
      });
      return;
    }
    setReportModalType('point');
    setIsReportModalOpen(true);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 lg:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Zone 1: Single text element wordmark — enlace al mapa (T38) */}
        <TabLink
          tab="map"
          ariaCurrent={false}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-sm shadow-orange-600/20 group-hover:scale-105 transition-transform">
            <MapPin className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight text-slate-900 font-sans">
              AyudaEn<span className="text-orange-600">Cali</span>
            </span>
          </div>
        </TabLink>

        {/* Zone 2: 4-6 clean text navigation links (T38: enlaces con hash, no botones) */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold">
          <TabLink
            tab="map"
            className={`transition-colors pb-1 relative focus:outline-none ${
              activeTab === 'map'
                ? 'text-orange-600 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mapa de Recursos
            {activeTab === 'map' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-full" />
            )}
          </TabLink>

          <TabLink
            tab="blog"
            className={`transition-colors pb-1 relative focus:outline-none ${
              activeTab === 'blog'
                ? 'text-orange-600 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tablón de Necesidades
            {activeTab === 'blog' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-full" />
            )}
          </TabLink>

          <TabLink
            tab="chat"
            className={`transition-colors pb-1 relative focus:outline-none flex items-center gap-1.5 ${
              activeTab === 'chat'
                ? 'text-orange-600 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Asistente IA</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {activeTab === 'chat' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-full" />
            )}
          </TabLink>

          <TabLink
            tab="profile"
            className={`transition-colors pb-1 relative focus:outline-none ${
              activeTab === 'profile'
                ? 'text-orange-600 font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mi Perfil
            {activeTab === 'profile' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-full" />
            )}
          </TabLink>

          {/* Enlace de texto real (T36/T37): interlinking al FAQ indexable. */}
          <a
            href="/#preguntas-frecuentes"
            className="transition-colors text-slate-500 hover:text-orange-600 focus:outline-none"
          >
            Preguntas frecuentes
          </a>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2.5">
          {/* Ayuda: preguntas frecuentes (visible también en móvil) */}
          <button
            type="button"
            onClick={() => openFaq()}
            aria-label="Preguntas frecuentes"
            title="Preguntas frecuentes"
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <a
            href="tel:123"
            title="Línea de Emergencia 123"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors border border-rose-200/60"
          >
            <PhoneCall className="w-3.5 h-3.5 text-rose-600" />
            <span>Línea 123</span>
          </a>

          <button
            onClick={handleOpenReport}
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 active:scale-95 rounded-xl shadow-sm shadow-orange-600/25 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" strokeWidth={3} />
            <span className="hidden sm:inline">Reportar Ayuda</span>
            <span className="sm:hidden">Reportar</span>
          </button>

          {/* Clerk Auth Section */}
          {isLoaded && (
            isSignedIn ? (
              <div className="flex items-center pl-1">
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: 'w-9 h-9 rounded-xl border-2 border-orange-500 shadow-xs',
                    },
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openSignIn()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors shrink-0"
                title="Iniciar sesión con Clerk"
              >
                <LogIn className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">Ingresar</span>
              </button>
            )
          )}
        </div>
      </div>
    </header>
  );
};
