# Log — frontend (04/10/2026)

## En qué trabajé
- Petición directa del usuario (sin ID de tablero): eliminar dos elementos de UI que consideró sobrantes.

## Cambios realizados
- `src/components/MapView.tsx:695` → el `<h1>` "Centros de acopio y albergues en Cali" que
  se mostraba sobre la barra de búsqueda pasa a `className="sr-only"`: deja de verse pero
  la vista del mapa conserva su H1 (SEO-07 · QW-02).
- `src/App.tsx` → borrado el `<footer>` completo (marca + descripción + 8 enlaces) y el
  import de `TabLink` que quedaba sin usar. El BottomNav/BottomNav mobile no se toca.
- `src/components/Header.tsx:120-137` →
  - icono FAQ (`HelpCircle`): ahora `hidden sm:flex` (en móvil se llega desde Mi perfil,
    `ProfileView.tsx:548`);
  - botón `tel:123`: ya no se oculta en móvil (`hidden sm:inline-flex` → `inline-flex`);
    el texto "Línea 123" es `hidden sm:inline`, así que en pantallas <640px queda solo el
    icono, con `aria-label="Línea de emergencias 123"`.
- `src/components/FaqPage.tsx:120-135` → el pie de la FAQ conserva lo importante que se
  perdía al borrar el pie de la app: se añaden los enlaces
  `https://www.cali.gov.co/` y `https://www.cali.gov.co/gestiondelriesgo/`
  (antes solo existían en el footer de `App.tsx`).
- `scripts/test-authmodal.mjs:291-295` → el check "los enlaces de la app apuntan a la ruta
  independiente del FAQ" leía `App.tsx` (el href estaba en el pie borrado); ahora lee
  `Header.tsx`, donde vive el enlace. **Toca fichero de área backend** — autorizado por el
  usuario en esta sesión.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ (TODO OK) |
| `npm run verify:rls` | n/a (no toqué `supabase/`) |

## Decisiones tomadas (y por qué)
- **Borrar el pie entero** (no una versión mínima): decisión del usuario. Con ello desaparece
  el landmark `<footer>` de la app principal; la FAQ (`FaqPage.tsx:120`) lo conserva.
- **H1 → `sr-only`** en vez de borrarlo: el usuario eligió preservar el H1 de la vista para
  accesibilidad/SEO (QW-02) sin mostrarlo en la UI.
- **123 visible en móvil**: el header reservaba el slot del FAQ en móvil y escondía el 123
  (`hidden sm:inline-flex`). Se invierte: el 123 nunca se esconde; el FAQ en móvil se apoya
  en el atajo de Mi perfil.
- El pie era requisito SEO (T36 en `docs/agentes/seo/plan-seo.md`): su retirada es una
  decisión de producto del usuario, no una regresión accidental.

## Riesgos y deuda que dejo
- `scripts/test-authmodal.mjs` modificado (área backend): si el dueño de `scripts/**`
  prefiere otra formulación del check, puede volver a apuntar a cualquier fuente que
  contenga `href="/preguntas-frecuentes/"` (Header, FaqPage o ProfileView).
- Header en móvil queda: wordmark + icono 123 + "Reportar" + auth. Si en pantallas de
  360px se queda muy justo, alternativa: recortar el texto del botón de reporte.
- La descripción larga de la plataforma ya no se muestra en la app (solo en el shell
  estático de `index.html` para crawlers sin JS).

## Para el siguiente agente
- No reintroducir el pie sin consenso: fue retirado a petición explícita del usuario.
- Los enlaces oficiales a la Alcaldía ahora viven en el pie de `FaqPage.tsx`.
