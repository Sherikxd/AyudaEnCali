/**
 * Test interactivo del modal de registro (`AuthModal`) con jsdom: no hace
 * falta navegador. Monta el mismo árbol que usa la app (ClerkProvider →
 * AppProvider → Header + AuthModal + ReportModal) y simula los clics reales.
 *
 *   npm run test:ui
 *
 * Cubre: abrir desde "Reportar Ayuda", cerrar con Escape y con Cancelar
 * descartando la acción pendiente, validación del formulario, alta de cuenta
 * que dispara el callback, acceso de cuentas existentes ("Ingresa con tu
 * cuenta") y apertura directa del reportero cuando ya hay cuenta.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- 1. DOM */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
});
const win = dom.window;

// APIs que jsdom no trae y que la app o Clerk podrían tocar.
win.matchMedia ??= (media) => ({
  matches: false,
  media,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});
win.scrollTo ??= () => {};
if (!win.ResizeObserver) {
  win.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!win.IntersectionObserver) {
  win.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

const defineGlobal = (key, value) =>
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });

for (const key of [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLButtonElement',
  'HTMLFormElement', 'HTMLAnchorElement', 'SVGElement', 'Element', 'Node', 'DocumentFragment',
  'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'MutationObserver', 'FileReader',
  'DOMParser', 'Image', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
]) {
  if (key in win) defineGlobal(key, win[key]);
}

// React exige este indicador para aceptar `act()`.
defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// Sin red: al montar la app pide /api/config, /api/points… y los fallos se
// tragan con logger.warn, pero así no hay ruido ni promesas rechazadas.
defineGlobal('fetch', async () => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => ({}),
  text: async () => '',
  arrayBuffer: async () => new ArrayBuffer(0),
}));

/* -------------------------------------------------- 2. React + app (Vite) */
const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  console.error('Falta VITE_CLERK_PUBLISHABLE_KEY (ejecuta con --env-file-if-exists=.env).');
  process.exit(1);
}

const vite = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${name}${detail ? `  :: ${String(detail).slice(0, 200)}` : ''}`);
};

let rootEl = null;

try {
  // Se importan DESPUÉS de montar el DOM (React toma `document` al cargar).
  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const { ClerkProvider } = await import('@clerk/clerk-react');

  const { AppProvider, useApp } = await vite.ssrLoadModule('/src/context/AppContext.tsx');
  const { AuthModal } = await vite.ssrLoadModule('/src/components/AuthModal.tsx');
  const { Header } = await vite.ssrLoadModule('/src/components/Header.tsx');
  const { ReportModal } = await vite.ssrLoadModule('/src/components/ReportModal.tsx');

  /** Misma composición y el mismo cableado que `AppContent` en src/App.tsx. */
  const Harness = () => {
    const { isAuthModalOpen, closeAuthModal, authModalMessage } = useApp();
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Header),
      React.createElement(AuthModal, {
        isOpen: isAuthModalOpen,
        onClose: closeAuthModal,
        titleMessage: authModalMessage,
      }),
      React.createElement(ReportModal),
    );
  };

  /* ------------------------------------------------- 3. Utilidades de test */
  const text = () => document.body.textContent ?? '';
  const visible = (needle) => text().includes(needle);
  const overlay = (needle) =>
    [...document.querySelectorAll('div.fixed.inset-0')].find((d) => (d.textContent ?? '').includes(needle));
  const findButton = (re) =>
    [...document.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''));

  const click = async (el, what = 'elemento') => {
    if (!el) throw new Error(`No se encontró ${what}`);
    await act(async () => {
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };

  const pressEscape = async () => {
    await act(async () => {
      win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
  };

  const setValue = async (el, value) => {
    const proto =
      el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new win.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  };

  const submitForm = async (form) => {
    await act(async () => {
      form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    });
  };

  const authOverlay = () => overlay('Crear Cuenta Comunitaria');
  const reportOverlay = () => overlay('Reportar Centro o Punto de Ayuda');
  const openAuth = () => Boolean(authOverlay());
  const openReport = () => Boolean(reportOverlay());

  /* ------------------------------------------------------------ 4. Render */
  rootEl = createRoot(document.getElementById('root'));
  await act(async () => {
    rootEl.render(
      React.createElement(
        ClerkProvider,
        { publishableKey },
        React.createElement(AppProvider, null, React.createElement(Harness)),
      ),
    );
  });

  check('arranca sin modal de registro', !openAuth());
  check('el botón "Reportar Ayuda" del Header existe', Boolean(findButton(/Reportar Ayuda/)));

  /* ------------------------------- 5. Abrir desde "Reportar Ayuda" -------- */
  await click(findButton(/Reportar Ayuda/), 'botón Reportar Ayuda');
  check('al reportar sin cuenta se abre el registro', openAuth());
  check('muestra el mensaje de la acción', visible('Para reportar un centro de acopio'));
  check('ofrece entrar con cuenta existente', Boolean(findButton(/Ingresa con tu cuenta/)));
  check('no abre todavía el reportero', !openReport());

  /* ---------------------------------------------- 6. Escape lo cierra ----- */
  await pressEscape();
  check('Escape cierra el registro', !openAuth());
  check('Escape no dispara la acción pendiente', !openReport());

  /* ----------------------------------- 7. Cancelar descarta la acción ----- */
  await click(findButton(/Reportar Ayuda/), 'botón Reportar Ayuda');
  await click(findButton(/^Cancelar$/), 'botón Cancelar');
  check('Cancelar cierra el registro', !openAuth());
  check('Cancelar descarta la acción pendiente (no abre el reportero)', !openReport());

  /* ------------------------------------- 8. Validación del formulario ----- */
  await click(findButton(/Reportar Ayuda/), 'botón Reportar Ayuda');
  await submitForm(authOverlay().querySelector('form'));
  check('formulario vacío muestra error', visible('Por favor ingresa tu nombre completo.'));
  check('con error sigue abierto', openAuth());

  /* ------------------------------- 9. Cuentas existentes (ingreso Clerk) -- */
  await click(findButton(/Ingresa con tu cuenta/), 'botón Ingresa con tu cuenta');
  check('"Ingresa con tu cuenta" cierra el modal de registro', !openAuth());
  check('"Ingresa con tu cuenta" no deja acción pendiente', !openReport());

  /* ---------------------------------------- 10. Registro y callback ------- */
  await click(findButton(/Reportar Ayuda/), 'botón Reportar Ayuda');
  await setValue(authOverlay().querySelector('input[type="text"]'), 'Andrés Prueba');
  await setValue(authOverlay().querySelector('input[type="email"]'), 'andres@prueba.co');
  await setValue(authOverlay().querySelector('input[type="tel"]'), '+57 315 555 1234');
  await submitForm(authOverlay().querySelector('form'));

  check('el registro cierra el modal', !openAuth());
  check('el callback del registro abre el reportero', openReport());
  check('el reportero muestra el formulario real', visible('Registra un punto visible en el mapa'));

  let saved = null;
  try {
    saved = JSON.parse(win.localStorage.getItem('ayudaencali_profile_v3') ?? 'null');
  } catch {
    saved = null;
  }
  check(
    'el perfil queda registrado en localStorage',
    saved?.isRegistered === true && saved?.name === 'Andrés Prueba',
    JSON.stringify(saved)?.slice(0, 120),
  );

  /* ------------------------ 11. Con cuenta ya creada, no vuelve a pedirla - */
  await click(reportOverlay().querySelector('button[aria-label="Cerrar"]'), 'cerrar reportero');
  await click(findButton(/Reportar Ayuda/), 'botón Reportar Ayuda');
  check('con cuenta registrada abre el reportero directo', openReport());
  check('con cuenta registrada ya no pide registro', !openAuth());

  /* ------------------- 12. Cableado estático en App y AppContext ---------- */
  const appSource = readFileSync(`${root}/src/App.tsx`, 'utf8');
  check('App.tsx importa AuthModal', /import \{ AuthModal \} from '\.\/components\/AuthModal'/.test(appSource));
  check(
    'App.tsx lo monta con isOpen=isAuthModalOpen',
    /<AuthModal[\s\S]*?isOpen=\{isAuthModalOpen\}/.test(appSource),
  );
  check(
    'App.tsx lo cierra con closeAuthModal',
    /<AuthModal[\s\S]*?onClose=\{closeAuthModal\}/.test(appSource),
  );

  const ctxSource = readFileSync(`${root}/src/context/AppContext.tsx`, 'utf8');
  const closeBody = ctxSource.match(/const closeAuthModal = \(\) => \{([\s\S]*?)\};/)?.[1] ?? '';
  check('closeAuthModal limpia el callback pendiente', closeBody.includes('setAuthCallback(null)'), closeBody.trim());
  check('closeAuthModal cierra el modal', closeBody.includes('setIsAuthModalOpen(false)'), closeBody.trim());

  /* ------------- 13. Cableado de FAQ, cookies, SEO, 404 y rendimiento ----- */
  check(
    'App.tsx importa y monta FaqModal',
    /import \{ FaqModal \} from '\.\/components\/FaqModal'/.test(appSource) &&
      /<FaqModal[\s\S]*?isOpen=\{isFaqOpen\}/.test(appSource) &&
      /initialSection=\{faqSection\}/.test(appSource),
  );
  check(
    'App.tsx monta el banner de cookies',
    /import \{ CookieConsent \} from '\.\/components\/CookieConsent'/.test(appSource) &&
      /<CookieConsent \/>/.test(appSource),
  );
  check(
    'App.tsx actualiza título y metadatos al cambiar de pestaña',
    /updatePageMeta\(PAGE_META\[activeTab\]\)/.test(appSource),
  );
  check(
    'App.tsx abre el FAQ desde el enlace #preguntas-frecuentes',
    /window\.location\.hash !== '#preguntas-frecuentes'/.test(appSource) && /openFaq\(\)/.test(appSource),
  );

  const mainSource = readFileSync(`${root}/src/main.tsx`, 'utf8');
  check('main.tsx aplica el consentimiento de cookies al arrancar', /applyConsent\(readConsent\(\)\)/.test(mainSource));

  const indexHtml = readFileSync(`${root}/index.html`, 'utf8');
  check(
    'index.html tiene og:image y twitter:image para la vista previa',
    /property="og:image"/.test(indexHtml) && /name="twitter:image"/.test(indexHtml),
  );
  check(
    'index.html sin hojas de terceros bloqueantes',
    !/unpkg\.com\/leaflet/.test(indexHtml) && !/fonts\.googleapis\.com\/css2/.test(indexHtml),
    'leaflet.css y Google Fonts',
  );

  const notFoundPage = readFileSync(`${root}/public/404.html`, 'utf8');
  check(
    'la 404 se marca noindex y enlaza al FAQ',
    /noindex/.test(notFoundPage) && /#preguntas-frecuentes/.test(notFoundPage),
  );

  const serverSource = readFileSync(`${root}/server.ts`, 'utf8');
  // La compresión vive en server/app.ts (compartida con la función de Vercel):
  // debe ir ANTES de las rutas y solo fuera de Vercel (el borde ya comprime).
  const serverAppSource = readFileSync(`${root}/server/app.ts`, 'utf8');
  check('server.ts responde la 404 personalizada con estado 404', /status\(404\)/.test(serverSource) && /404\.html/.test(serverSource));
  check('server/app.ts comprime con gzip fuera de Vercel', /app\.use\(compression\(\)\)/.test(serverAppSource) && /process\.env\.VERCEL/.test(serverAppSource));
  check('server.ts cachea /assets como inmutable', /immutable: true/.test(serverSource));

  /* ------------------------ 14. CDN de imágenes (Cloudinary) -------------- */
  check(
    'index.html sirve la vista previa social desde Cloudinary',
    /og:image"[\s\S]{0,40}content="https:\/\/res\.cloudinary\.com\//.test(indexHtml),
    'og:image',
  );
  const imagesCfg = readFileSync(`${root}/src/config/images.ts`, 'utf8');
  check('el cliente solo conoce el cloud name (sin secretos)', /res\.cloudinary\.com/.test(imagesCfg) && !/CLOUDINARY_URL|api_key|apiSecret/.test(imagesCfg));
  const blogSource = readFileSync(`${root}/src/components/BlogView.tsx`, 'utf8');
  check('el héroe del tablón se sirve desde el CDN', /CDN_IMAGES\.blogHero/.test(blogSource));
  check('ningún componente apunta a un JPG local', !/src="\/images\/[^"]+\.jpg"/.test(blogSource));
} catch (error) {
  check('el test se ejecuta sin excepciones', false, error.stack ?? error.message);
} finally {
  try {
    if (rootEl) {
      const { act } = await import('react');
      await act(async () => rootEl.unmount());
    }
  } catch {
    /* el desmontaje es opcional */
  }
  await vite.close();
  dom.window.close();
}

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
