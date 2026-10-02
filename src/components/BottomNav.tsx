import React from 'react';
import { useApp } from '../context/AppContext';
import { Map, MessageSquare, User, PlusCircle, Newspaper } from 'lucide-react';
import { TabLink } from './TabLink';

export const BottomNav: React.FC = () => {
  const { 
    activeTab, 
    setIsReportModalOpen, 
    setReportModalType, 
    userProfile, 
    openAuthModal 
  } = useApp();

  const handleOpenReport = () => {
    if (!userProfile.isRegistered) {
      openAuthModal('Para reportar un centro o necesidad de ayuda en Cali debes crear una cuenta.', () => {
        setReportModalType('point');
        setIsReportModalOpen(true);
      });
      return;
    }
    setReportModalType('point');
    setIsReportModalOpen(true);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 px-2 py-1 safe-area-bottom">
      <div className="grid grid-cols-5 items-center h-14">
        {/* Tab 1: Mapa */}
        <TabLink
          tab="map"
          className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 transition-colors ${
            activeTab === 'map' ? 'text-orange-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Map className="w-5 h-5" strokeWidth={activeTab === 'map' ? 2.5 : 2} />
          <span className="text-[10px] tracking-tight mt-0.5">Mapa</span>
        </TabLink>

        {/* Tab 2: Tablón */}
        <TabLink
          tab="blog"
          className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 transition-colors ${
            activeTab === 'blog' ? 'text-orange-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Newspaper className="w-5 h-5" strokeWidth={activeTab === 'blog' ? 2.5 : 2} />
          <span className="text-[10px] tracking-tight mt-0.5">Tablón</span>
        </TabLink>

        {/* Tab 3: Reportar (Center button) */}
        <button
          onClick={handleOpenReport}
          className="flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 text-orange-600 focus:outline-none group"
        >
          <div className="w-9 h-9 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/30 group-active:scale-95 transition-transform">
            <PlusCircle className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <span className="text-[10px] font-bold text-orange-600 mt-0.5">Reportar</span>
        </button>

        {/* Tab 4: Asistente IA */}
        <TabLink
          tab="chat"
          className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 transition-colors relative ${
            activeTab === 'chat' ? 'text-orange-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-5 h-5" strokeWidth={activeTab === 'chat' ? 2.5 : 2} />
          <span className="text-[10px] tracking-tight mt-0.5">Asistente</span>
          <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
        </TabLink>

        {/* Tab 5: Perfil */}
        <TabLink
          tab="profile"
          className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] py-1 transition-colors ${
            activeTab === 'profile' ? 'text-orange-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="w-5 h-5" strokeWidth={activeTab === 'profile' ? 2.5 : 2} />
          <span className="text-[10px] tracking-tight mt-0.5">Perfil</span>
        </TabLink>
      </div>
    </nav>
  );
};
