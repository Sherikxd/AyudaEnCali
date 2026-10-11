import { useState, type Dispatch, type SetStateAction } from 'react';
import type { HelpNeed, HelpPoint } from '../types';
import type { TabKey } from '../utils/tabUrl';

export interface UiStateApi {
  selectedPoint: HelpPoint | null;
  setSelectedPoint: Dispatch<SetStateAction<HelpPoint | null>>;
  selectedNeed: HelpNeed | null;
  setSelectedNeed: Dispatch<SetStateAction<HelpNeed | null>>;
  isReportModalOpen: boolean;
  setIsReportModalOpen: (open: boolean) => void;
  reportModalType: 'point' | 'need';
  setReportModalType: (type: 'point' | 'need') => void;
  initialCoordsForNewPoint: [number, number] | null;
  setInitialCoordsForNewPoint: (coords: [number, number] | null) => void;
  /** Centra el mapa en un punto, lo selecciona y salta a la pestaña «Mapa». */
  focusPointOnMap: (point: HelpPoint) => void;
}

export interface UiStateDeps {
  setActiveTab: (tab: TabKey) => void;
  setMapCenter: Dispatch<SetStateAction<[number, number]>>;
  setMapZoom: Dispatch<SetStateAction<number>>;
}

/** Selección y modales del contexto + acciones de navegación del mapa. */
export function useUiState(deps: UiStateDeps): UiStateApi {
  const { setActiveTab, setMapCenter, setMapZoom } = deps;

  const [selectedPoint, setSelectedPoint] = useState<HelpPoint | null>(null);
  const [selectedNeed, setSelectedNeed] = useState<HelpNeed | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalType, setReportModalType] = useState<'point' | 'need'>('point');
  const [initialCoordsForNewPoint, setInitialCoordsForNewPoint] = useState<[number, number] | null>(
    null,
  );

  const focusPointOnMap = (point: HelpPoint) => {
    setSelectedPoint(point);
    setMapCenter([point.lat, point.lng]);
    setMapZoom(16);
    setActiveTab('map');
  };

  return {
    selectedPoint,
    setSelectedPoint,
    selectedNeed,
    setSelectedNeed,
    isReportModalOpen,
    setIsReportModalOpen,
    reportModalType,
    setReportModalType,
    initialCoordsForNewPoint,
    setInitialCoordsForNewPoint,
    focusPointOnMap,
  };
}
