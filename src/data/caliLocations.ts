export interface CaliBarrioInfo {
  name: string;
  lat: number;
  lng: number;
  comuna: string;
  zona: 'Norte' | 'Sur' | 'Centro / Oeste' | 'Oriente' | 'Ladera';
}

export const CALI_BARRIOS_DATA: Record<string, CaliBarrioInfo> = {
  'San Antonio': {
    name: 'San Antonio',
    lat: 3.4475,
    lng: -76.5412,
    comuna: 'Comuna 3',
    zona: 'Centro / Oeste',
  },
  'Granada': {
    name: 'Granada',
    lat: 3.4578,
    lng: -76.5365,
    comuna: 'Comuna 2',
    zona: 'Norte',
  },
  'San Fernando': {
    name: 'San Fernando',
    lat: 3.4315,
    lng: -76.5385,
    comuna: 'Comuna 19',
    zona: 'Sur',
  },
  'Tequendama': {
    name: 'Tequendama',
    lat: 3.4215,
    lng: -76.5398,
    comuna: 'Comuna 19',
    zona: 'Sur',
  },
  'El Peñón': {
    name: 'El Peñón',
    lat: 3.4502,
    lng: -76.5435,
    comuna: 'Comuna 3',
    zona: 'Centro / Oeste',
  },
  'Versalles': {
    name: 'Versalles',
    lat: 3.4610,
    lng: -76.5312,
    comuna: 'Comuna 2',
    zona: 'Norte',
  },
  'Santa Mónica': {
    name: 'Santa Mónica',
    lat: 3.4715,
    lng: -76.5260,
    comuna: 'Comuna 2',
    zona: 'Norte',
  },
  'Chipichape': {
    name: 'Chipichape',
    lat: 3.4760,
    lng: -76.5290,
    comuna: 'Comuna 2',
    zona: 'Norte',
  },
  'Menga': {
    name: 'Menga',
    lat: 3.4880,
    lng: -76.5250,
    comuna: 'Comuna 2',
    zona: 'Norte',
  },
  'Ciudad Jardín': {
    name: 'Ciudad Jardín',
    lat: 3.3645,
    lng: -76.5330,
    comuna: 'Comuna 22',
    zona: 'Sur',
  },
  'Valle del Lili': {
    name: 'Valle del Lili',
    lat: 3.3765,
    lng: -76.5215,
    comuna: 'Comuna 17',
    zona: 'Sur',
  },
  'Meléndez': {
    name: 'Meléndez',
    lat: 3.3850,
    lng: -76.5510,
    comuna: 'Comuna 18',
    zona: 'Sur',
  },
  'Siloé': {
    name: 'Siloé',
    lat: 3.4180,
    lng: -76.5560,
    comuna: 'Comuna 20',
    zona: 'Ladera',
  },
  'Terrón Colorado': {
    name: 'Terrón Colorado',
    lat: 3.4590,
    lng: -76.5620,
    comuna: 'Comuna 1',
    zona: 'Ladera',
  },
  'El Vallado': {
    name: 'El Vallado',
    lat: 3.4090,
    lng: -76.5020,
    comuna: 'Comuna 15',
    zona: 'Oriente',
  },
  'Mariano Ramos': {
    name: 'Mariano Ramos',
    lat: 3.4020,
    lng: -76.5110,
    comuna: 'Comuna 16',
    zona: 'Oriente',
  },
  'Salomia': {
    name: 'Salomia',
    lat: 3.4720,
    lng: -76.5050,
    comuna: 'Comuna 5',
    zona: 'Norte',
  },
  'Alfonso López': {
    name: 'Alfonso López',
    lat: 3.4650,
    lng: -76.4910,
    comuna: 'Comuna 7',
    zona: 'Oriente',
  },
  'San Bosco': {
    name: 'San Bosco',
    lat: 3.4410,
    lng: -76.5330,
    comuna: 'Comuna 3',
    zona: 'Centro / Oeste',
  },
  'La Flora': {
    name: 'La Flora',
    lat: 3.4795,
    lng: -76.5230,
    comuna: 'Comuna 2',
    zona: 'Norte',
  },
  'Pance': {
    name: 'Pance',
    lat: 3.3280,
    lng: -76.5480,
    comuna: 'Comuna 22',
    zona: 'Sur',
  },
};

/**
 * Calculates straight-line distance in km between two lat/lng points.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

/**
 * Finds the nearest Cali barrio to given coordinates.
 */
export function findNearestCaliBarrio(
  lat: number,
  lng: number
): { barrio: CaliBarrioInfo; distanceKm: number } {
  let nearest = CALI_BARRIOS_DATA['San Antonio'];
  let minDistance = Infinity;

  Object.values(CALI_BARRIOS_DATA).forEach((barrio) => {
    const dist = calculateDistanceKm(lat, lng, barrio.lat, barrio.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = barrio;
    }
  });

  return { barrio: nearest, distanceKm: minDistance };
}

/**
 * Attempts reverse geocoding with timeout, fallbacking to nearest Cali neighborhood.
 */
export async function getFriendlyLocationName(
  lat: number,
  lng: number
): Promise<{ barrioName: string; address?: string; isInsideCali: boolean }> {
  // Check distance to Cali center (3.44, -76.53)
  const distToCaliCenter = calculateDistanceKm(lat, lng, 3.4400, -76.5350);
  const isInsideCali = distToCaliCenter <= 35; // within 35 km of Cali center

  const nearest = findNearestCaliBarrio(lat, lng);

  // Try OpenStreetMap Nominatim with a short 2.5s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'es',
        },
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const neighborhood =
          addr.neighbourhood ||
          addr.suburb ||
          addr.quarter ||
          addr.city_district ||
          addr.residential;
        const road = addr.road;
        const city = addr.city || addr.town || addr.village || 'Cali';

        let name = '';
        if (neighborhood) {
          name = neighborhood;
        } else if (road) {
          name = `${road} (${nearest.barrio.name})`;
        } else {
          name = isInsideCali ? nearest.barrio.name : city;
        }

        return {
          barrioName: name,
          address: data.display_name?.split(',').slice(0, 3).join(', '),
          isInsideCali,
        };
      }
    }
  } catch {
    // Ignore network/timeout errors, fallback to closest barrio
  }

  return {
    barrioName: isInsideCali
      ? nearest.barrio.name
      : `Ubicación detectada (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    isInsideCali,
  };
}
