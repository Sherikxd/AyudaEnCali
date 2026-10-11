import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { HelpNeed, NeedsResponse, UserCoordinates, UserProfile } from '../types';
import { apiFetch } from '../services/api';
import { mergeById } from '../utils/sync';
import { barrioLabel, formatKm, needDistanceKm, sameBarrio } from '../utils/proximity';
import { logger } from '../utils/logger';
import { MAX_ALERTED_NEEDS, NEED_ALERT_POLL_MS, SEED_IDS, STORAGE_KEYS } from './appConstants';
import type { ListsMirror, NotifyFn } from './appTypes';
import { loadJSON, saveJSON } from '../utils/storage';

export interface NeedAlertsApi {
  /** Suscripción optativa a avisos de nuevas necesidades cerca (MEJ-03). */
  needAlertsEnabled: boolean;
  setNeedAlertsEnabled: (enabled: boolean) => void;
}

export interface NeedAlertsDeps {
  listsRef: RefObject<ListsMirror>;
  setHelpNeeds: Dispatch<SetStateAction<HelpNeed[]>>;
  notify: NotifyFn;
  userLocation: UserCoordinates | null;
  userProfile: UserProfile;
}

/**
 * Alertas locales por barrio (MEJ-03): suscripción **optativa** que
 * sondea el `GET /api/needs` existente cada `NEED_ALERT_POLL_MS` y avisa
 * con un `Toast` (región `aria-live`) de las necesidades NUEVAS del
 * barrio del usuario —o de las más cercanas si hay ubicación—.
 *
 * - La petición es un GET simple: **no** se envía ninguna coordenada a
 *   ningún sitio; el filtrado por barrio/distancia ocurre en este
 *   dispositivo sobre el centroide (`src/utils/proximity.ts`).
 * - Deduplicación por ID (`alertedNeedIdsRef` + los ya conocidos): cada
 *   necesidad se anuncia como mucho una vez.
 * - Con la pestaña oculta no se sondea (no hay nadie que ver el aviso).
 */
export function useNeedAlerts(deps: NeedAlertsDeps): NeedAlertsApi {
  const { listsRef, setHelpNeeds, notify, userLocation, userProfile } = deps;

  /**
   * Alertas locales por barrio (MEJ-03): suscripción **optativa** y
   * persistida en el dispositivo. Por defecto apagada: nadie recibe avisos
   * sin haberlos pedido.
   */
  const [needAlertsEnabled, setNeedAlertsEnabledState] = useState<boolean>(
    () => loadJSON<boolean>(STORAGE_KEYS.NEED_ALERTS, false) === true,
  );
  const setNeedAlertsEnabled = useCallback((enabled: boolean) => {
    saveJSON(STORAGE_KEYS.NEED_ALERTS, enabled);
    setNeedAlertsEnabledState(enabled);
  }, []);

  const alertedNeedIdsRef = useRef<Set<string>>(new Set());
  const alertBarrio = userLocation?.barrio || userProfile.barrio;

  useEffect(() => {
    if (!needAlertsEnabled) return undefined;
    let cancelled = false;

    /** Novedades que merecen aviso: primero mi barrio; si no, las más cercanas. */
    const pickAlertworthy = (
      fresh: readonly HelpNeed[],
    ): { list: HelpNeed[]; mode: 'barrio' | 'cercana' | 'tablon'; km: number | null } => {
      const inMyBarrio = fresh.filter((need) => sameBarrio(need.barrio, alertBarrio));
      if (inMyBarrio.length > 0) {
        return { list: inMyBarrio.slice(0, MAX_ALERTED_NEEDS), mode: 'barrio', km: null };
      }
      if (userLocation) {
        const ranked: { need: HelpNeed; index: number; km: number }[] = [];
        fresh.forEach((need, index) => {
          const km = needDistanceKm(userLocation, need);
          if (km !== null) ranked.push({ need, index, km });
        });
        ranked.sort((a, b) => (a.km === b.km ? a.index - b.index : a.km - b.km));
        if (ranked.length > 0) {
          return {
            list: ranked.slice(0, MAX_ALERTED_NEEDS).map((entry) => entry.need),
            mode: 'cercana',
            km: ranked[0].km,
          };
        }
      }
      return { list: fresh.slice(0, MAX_ALERTED_NEEDS), mode: 'tablon', km: null };
    };

    const buildMessage = (
      fresh: readonly HelpNeed[],
      picked: ReturnType<typeof pickAlertworthy>,
    ): string => {
      const shown = picked.list.map((need) => `«${need.title}»`).join(' y ');
      const more =
        fresh.length > picked.list.length ? ` (y ${fresh.length - picked.list.length} más)` : '';
      if (picked.mode === 'barrio') {
        const label = barrioLabel(alertBarrio);
        const where = label !== '' ? ` en tu barrio (${label})` : '';
        return fresh.length === 1
          ? `Nueva necesidad${where}: ${shown}. Ábrela en el tablón para apoyarla.`
          : `${fresh.length} nuevas necesidades${where}: ${shown}${more}.`;
      }
      if (picked.mode === 'cercana' && picked.km !== null) {
        return fresh.length === 1
          ? `Nueva necesidad cerca de ti (≈${formatKm(picked.km)}, aproximado): ${shown}.`
          : `${fresh.length} nuevas necesidades cerca de ti (distancia aproximada): ${shown}${more}.`;
      }
      return fresh.length === 1
        ? `Nueva necesidad en el tablón: ${shown}.`
        : `${fresh.length} nuevas necesidades en el tablón: ${shown}${more}.`;
    };

    const scan = async (announce: boolean): Promise<void> => {
      // Con la pestaña oculta no se sondea; la línea base (sin anuncio) sí.
      if (announce && typeof document !== 'undefined' && document.visibilityState === 'hidden')
        return;
      try {
        const data = await apiFetch<NeedsResponse>('/api/needs');
        if (cancelled) return;
        const remote = Array.isArray(data.needs) ? data.needs : [];
        if (remote.length === 0) return;

        const known = new Set(listsRef.current.needs.map((need) => need.id));
        const fresh = remote.filter(
          (need) => !known.has(need.id) && !alertedNeedIdsRef.current.has(need.id),
        );
        // Misma fusión que el sync: la novedad se ve en el tablón en el
        // momento en que el aviso la anuncia.
        setHelpNeeds((prev) => mergeById(prev, remote, SEED_IDS.NEEDS));
        if (fresh.length === 0) return;
        for (const need of fresh) alertedNeedIdsRef.current.add(need.id);
        if (!announce) return; // línea base al activar: no avisa de lo ya existente

        const picked = pickAlertworthy(fresh);
        if (picked.list.length === 0) return;
        notify(buildMessage(fresh, picked), 'info');
      } catch (error) {
        if (!cancelled) logger.debug('No se pudieron revisar nuevas necesidades:', error);
      }
    };

    // Línea base al activar (nada de avisos por lo que ya existía) + sondeo.
    void scan(false);
    const timer = window.setInterval(() => {
      void scan(true);
    }, NEED_ALERT_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // `alertBarrio` resume el barrio vigente: con él en las deps basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needAlertsEnabled, alertBarrio, userLocation, notify, setHelpNeeds, listsRef]);

  return { needAlertsEnabled, setNeedAlertsEnabled };
}
