import React, { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useApp } from '../context/AppContext';
import { CALI_BARRIOS_DATA } from '../data/caliLocations';
import type { UserRole } from '../types';

/**
 * Sincroniza la sesión de Clerk con el perfil local de la app (y con la
 * ubicación por defecto del usuario). Renderiza nada: va montado dentro de
 * `AppProvider`.
 *
 * Diseño:
 *  - Solo escribe cuando algo cambió de verdad, así nunca entra en bucles.
 *  - Toda la metadata que llega de Clerk se valida antes de usarse (rol y
 *    barrio solo si pertenecen a los conjuntos conocidos).
 *  - Al cerrar sesión limpia el perfil local solo si éste vino de Clerk
 *    (los perfiles locales usan el prefijo `usr-cali-`, los de Clerk `user_`).
 */
const USER_ROLES: UserRole[] = ['ciudadano', 'voluntario', 'coordinador'];

interface ClerkMetadata {
  barrio?: string;
  role?: string;
  phone?: string;
}

function pickRole(value: unknown, fallback: UserRole): UserRole {
  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : fallback;
}

function pickBarrio(value: unknown, fallback: string): string {
  return typeof value === 'string' && Boolean(CALI_BARRIOS_DATA[value]) ? value : fallback;
}

export const ClerkSync: React.FC = () => {
  const { isLoaded, isSignedIn, user } = useUser();
  const { userProfile, updateUserProfile, setUserBarrioLocation, userLocation, logoutUser } = useApp();

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isLoaded) return;

    // Sesión cerrada: retiramos el perfil local solo si lo originó Clerk.
    if (!isSignedIn || !userId || !user) {
      if (userProfile.id.startsWith('user_')) logoutUser();
      return;
    }

    const metadata = (user.unsafeMetadata ?? {}) as ClerkMetadata;
    const email = user.primaryEmailAddress?.emailAddress ?? '';
    const name =
      user.fullName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      email.split('@')[0] ||
      'Usuario Cali';

    const barrio = pickBarrio(metadata.barrio, userProfile.barrio);
    const role = pickRole(metadata.role, userProfile.role);
    const phone =
      typeof metadata.phone === 'string' && metadata.phone.trim() ? metadata.phone : userProfile.phone;

    const hasChanges =
      userProfile.id !== userId ||
      userProfile.name !== name ||
      userProfile.email !== email ||
      userProfile.phone !== phone ||
      userProfile.barrio !== barrio ||
      userProfile.role !== role ||
      !userProfile.isRegistered;

    if (hasChanges) {
      updateUserProfile({ id: userId, name, email, phone, barrio, role, isRegistered: true });
    }

    // Si la ubicación sigue en el valor por defecto, usamos el barrio declarado.
    if (userLocation?.source === 'default' && Boolean(CALI_BARRIOS_DATA[barrio])) {
      setUserBarrioLocation(barrio);
    }
  }, [
    isLoaded,
    isSignedIn,
    user,
    userId,
    userProfile,
    userLocation,
    updateUserProfile,
    setUserBarrioLocation,
    logoutUser,
  ]);

  return null;
};
