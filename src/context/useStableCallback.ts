import { useCallback, useEffect, useRef } from 'react';

/**
 * Devuelve `fn` con identidad estable (T12 · FAL-09): el wrapper se crea
 * una sola vez y siempre delega en la copia del último render. Así el
 * `value` del Provider puede memorizarse sin que las acciones —que se
 * recrean en cada render— invaliden el `memo` ni queden con estado
 * obsoleto. Solo se usa en las acciones expuestas por el contexto; por
 * dentro el resto del código sigue llamando a las funciones originales.
 *
 * El espejo se actualiza en un efecto (nunca durante el render: escribir un
 * `ref` al pintar es un efecto secundario prohibido por React). El wrapper
 * se invoca siempre desde un evento o un efecto, cuando el espejo ya está
 * actualizado con el último render.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A): R => ref.current(...args), []);
}
