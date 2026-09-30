/**
 * Arranque de entorno compartido por **todas** las entradas:
 *
 *  - `server/app.ts` → Express (local, Docker, Cloud Run).
 *  - Cada `api/*.ts` → una función por ruta en Vercel.
 *
 * Debe importarse **el primero** desde cada entrada para que las variables de
 * entorno y el cliente de Supabase estén listos antes de que se evalúe ningún
 * núcleo de ruta:
 *
 *  - `dotenv.config()` solo fuera de Vercel: en la plataforma las variables
 *    llegan del panel (Settings → Environment Variables) con `VERCEL=1` ya
 *    definido.
 *  - `initSupabase()` crea el cliente con esas variables. Nunca lanza: sin
 *    configuración, la API responde desde la caché en memoria.
 */
import dotenv from 'dotenv';
import { initSupabase } from './supabase';

if (!process.env.VERCEL) dotenv.config();

initSupabase();
