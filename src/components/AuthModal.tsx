import React, { useEffect, useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useApp } from '../context/AppContext';
import { CALI_BARRIOS } from '../data/initialData';
import { UserRole } from '../types';
import { X, UserPlus, Heart, CheckCircle2, LogIn } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleMessage?: string;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  titleMessage,
  onSuccess,
}) => {
  const { registerUser } = useApp();
  const { openSignIn } = useClerk();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+57 3');
  const [barrio, setBarrio] = useState(CALI_BARRIOS[0]);
  const [role, setRole] = useState<UserRole>('ciudadano');
  const [organization, setOrganization] = useState('');
  const [error, setError] = useState('');

  // Al reabrir no se arrastra el mensaje de error de un intento anterior.
  useEffect(() => {
    if (isOpen) setError('');
  }, [isOpen]);

  // Escape cierra el modal (convención de accesibilidad).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /**
   * Entrar con la sesión de Clerk (la identidad real) en vez de crear una
   * cuenta local: se cierra **este** modal primero para no dejar dos capas
   * apiladas y se descarta la acción pendiente (`onClose` → `closeAuthModal`).
   * Al volver, `ClerkSync` alinea el perfil local con la sesión.
   */
  const handleSignIn = () => {
    onClose();
    openSignIn();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!phone.trim() || phone.length < 8) {
      setError('Ingresa un teléfono o WhatsApp de contacto válido.');
      return;
    }

    registerUser({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      barrio,
      role,
      organization: organization.trim(),
    });

    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20 shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                Crear Cuenta Comunitaria
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {titleMessage || 'Para registrar ayudas o comentar, activa tu cuenta en Cali'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informative notice */}
        <div className="px-5 pt-3">
          <div className="p-3 bg-orange-50/70 border border-orange-200/60 rounded-2xl flex items-center gap-2.5 text-xs text-orange-950">
            <Heart className="w-4 h-4 text-orange-600 shrink-0" />
            <span>
              La cuenta permite verificar la legitimidad de los reportes y comentarios solidarios en Cali.
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-800 mb-1">Nombre Completo *</label>
            <input
              type="text"
              required
              placeholder="Ej. Andrés Morales / Dra. Marcela"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-800 mb-1">Correo Electrónico *</label>
              <input
                type="email"
                required
                placeholder="ejemplo@correo.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-800 mb-1">Teléfono / WhatsApp *</label>
              <input
                type="tel"
                required
                placeholder="+57 315 123 4567"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError('');
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-800 mb-1">Barrio en Cali *</label>
              <select
                value={barrio}
                onChange={(e) => setBarrio(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                {CALI_BARRIOS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-800 mb-1">Rol en la Comunidad</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                <option value="ciudadano">Ciudadano Solidario</option>
                <option value="voluntario">Voluntario Activo / Brigadista</option>
                <option value="coordinador">Coordinador de Punto</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-800 mb-1">Organización o Colectivo (Opcional)</label>
            <input
              type="text"
              placeholder="Ej. Fundación Huellitas, JAC Siloé, Cruz Roja, Independiente"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold transition-colors shadow-md shadow-orange-600/20 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Activar mi Cuenta</span>
            </button>
          </div>

          {/* Cuentas existentes: entrar con la sesión de Clerk en lugar de
              rellenar el formulario de registro comunitario. */}
          <div>
            <button
              type="button"
              onClick={handleSignIn}
              title="Iniciar sesión con tu cuenta existente"
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-200 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span>
                ¿Ya tienes cuenta? <span className="text-orange-700">Ingresa con tu cuenta</span>
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
