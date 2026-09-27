import React from 'react';
import { logger } from '../utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Límite de errores de la aplicación.
 *
 * Evita que una excepción dentro de un árbol rompa toda la pantalla: muestra
 * un mensaje recuperable con la opción de recargar.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error('Error no controlado en la UI:', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white max-w-md w-full rounded-3xl border border-slate-100 shadow-sm p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 text-xl">
            !
          </div>
          <h1 className="text-base font-extrabold text-slate-900 mb-2">
            Algo salió mal en AyudaEnCali
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed mb-1">
            Tu reporte es importante: si el problema persiste, recarga la página o contáctanos.
          </p>
          {this.state.message && (
            <p className="text-[11px] text-slate-400 font-mono break-words mb-4">
              {this.state.message}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors"
            >
              Recargar app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
