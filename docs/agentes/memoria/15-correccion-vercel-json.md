# Log — corrección de `vercel.json` para el primer deploy (2026-09-30)

## En qué trabajé
- Sin ID de tablero: arreglo *hotfix* del fallo de deploy reportado por la
  persona ("Invalid route source pattern" / "Invalid route destination
  segment" en el deployment de Vercel hacia GitHub Actions).

## Cambios realizados
- `vercel.json` → **header** de caché de imágenes: la alternancia RegExp
  `(png|jpg|…)` es sintaxis prohibida en `path-to-regexp`; se sustituyó por el
  grupo **no capturante** `(?:png|jpg|…)`.
  Patrón final: `/(.*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|woff2|woff))`.
- `vercel.json` → **rewrite catch-all**: el destino `?_orig=:path*` llevaba
  el modificador `*` en el **destino** (Vercel: *"Invalid route destination
  segment"* / `Can not repeat "path" without a prefix and suffix`). Se cambió
  a `?_orig=:path` (el modificador solo vive en el `source`).
  - `source` sigue siendo `/api/:path*`; la ruta regex resultante es
    **idéntica** a la intención original: `dest = /api/index?_orig=$1&path=$1`
    (la comprobé con el propio transformador, antes y después dan lo mismo).
- Sin cambios de claves ni de semántica: los otros 3 rewrites y el header de
  `/assets` quedan intactos.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| Validador oficial `@vercel/routing-utils` (`getTransformedRoutes`) sobre el `vercel.json` completo | ✅ `error: NINGUNO` (antes: 2 errores, uno por fichero) |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ (`built in 711ms`) |
| `npm run test:ui` | ✅ (40/40, «TODO OK») |
| `npm run smoke:vercel` | ✅ (35/35, «TODO OK») |
| Claves de `vercel.json` contra el schema oficial | ✅ fuera de schema: ninguna |
| `npm run verify:rls` | n/a (no se tocó `supabase/schema.sql`) |

### Cómo se reprodujo el error en local
El validador que usa el build de Vercel es `@vercel/routing-utils`, publicado
en npm. Se instaló **fuera del repo** (`/tmp/opencode/vercel-route-check`, no
toca `package.json` ni `bun.lock`) y se le pasó nuestro `vercel.json`:

```js
const { getTransformedRoutes } = require('@vercel/routing-utils');
getTransformedRoutes({ rewrites: config.rewrites, headers: config.headers });
```

Ambos fallos de Vercel se reprodujeron **exactamente** antes del arreglo y
desaparecieron después. Este truco sirve para validar cualquier cambio futuro
de `vercel.json` **sin gastar un deploy**.

## Decisiones tomadas (y por qué)
- Mantener `source: "/api/:path*"` (expansión multi-segmento correcta:
  `/api/a/b` → `_orig=a/b`) y solo quitar el `*` del destino. Alternativa
  probada y descartada por menos explícita: `source: "/api/(.*)"` con
  `destino ?_orig=$1` (también válida, pero `:path*` es la sintaxis
  documentada de Vercel en el `source`).
- El parámetro extra `path=$1` que el transformador añade al destino es
  **preexistente** (estaba también con el `:path*` original) y ningún handler
  lo lee (solo se usa `_orig`, ver `server/vercel.ts:46-51`): sin impacto.

## Riesgos y deuda que dejo
- Si Vercel cambia su versión de `path-to-regexp`, los patrones pueden volver
  a fallar: volver a pasar `vercel.json` por `getTransformedRoutes` en local
  es la red de seguridad barata.
- `?_orig=supabase/sql` se transforma a `_orig=supabase%2Fsql`; lo decodifica
  `URLSearchParams` y el humo (35/35) lo cubre.

## Para el siguiente agente
- El repo tenía **2 cambios sin commitear al empezar**; uno ya lo commiteó la
  persona (`45e279d arreglando actions` = fix del CI) y este `vercel.json`
  queda pendiente de su commit+push (los agentes no hacen commit).
- Tras el push: comprobar en el panel de Vercel que el build pasa y lanzar
  `SMOKE_BASE_URL=https://<app>.vercel.app npm run smoke:vercel` para cerrar
  los hallazgos *PENDIENTE-DEPLOY* de la T14.
