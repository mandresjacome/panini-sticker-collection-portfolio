/**
 * @fileoverview Layout del panel de administración (vendedores).
 * Envuelve todas las rutas bajo /admin. Requiere sesión activa —
 * si no hay usuario autenticado, redirige a /admin/login.
 * Incluye la barra de navegación entre las vistas de admin.
 */

import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useInventario } from "../../hooks/useInventario";
import type { Inventario } from "../../types";
import { Footer } from "../ui/Footer";

export interface AdminInventory {
  userId: string;
  inventario: Inventario;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * @description Layout protegido para el panel de gestión de vendedores.
 * - Verifica sesión activa. Sin sesión → redirige a /admin/login.
 * - Mientras verifica → pantalla de carga (evita flash de login).
 * - Con sesión → renderiza header con nav + <Outlet> para las sub-rutas.
 *
 * @returns Layout admin o redirección a login
 */
export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const membership = useInventario(user?.id);
  const inventario = membership.data;

  // Mientras se verifica la sesión no renderizar nada para evitar flash
  if (loading || (user && membership.isLoading)) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#FFC72C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Sin sesión → redirigir al login de admin
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!inventario || membership.isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 p-4">
        <p role="alert">
          {membership.isError
            ? "No se pudo verificar tu acceso al inventario."
            : "Tu cuenta no tiene un inventario asignado."}
        </p>
        <button type="button" onClick={logout} className="font-semibold underline">
          Cerrar sesión
        </button>
      </div>
    );
  }

  const inventory: AdminInventory = { userId: user.id, inventario };

  return (
    <div className="min-h-screen bg-gray-100">

      <header className="bg-[#0a0a14] sticky top-0 z-10">

        {/* Barra multicolor superior — paleta FIFA 2026 */}
        <div className="h-1 w-full flex">
          <div className="flex-1 bg-[#E8192C]" />
          <div className="flex-1 bg-[#F7941D]" />
          <div className="flex-1 bg-[#FFC72C]" />
          <div className="flex-1 bg-[#00A651]" />
          <div className="flex-1 bg-[#009EA6]" />
          <div className="flex-1 bg-[#003DA5]" />
          <div className="flex-1 bg-[#8B5CF6]" />
        </div>

        {/* En pantallas estrechas, la navegación ocupa su propia fila. */}
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 sm:flex-nowrap sm:gap-4">

          {/* ── Logo/título ────────────────────────────────────────────── */}
          <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
            <span className="text-xl leading-none">🏆</span>
            <div>
              <h1 className="text-sm font-black leading-tight tracking-tight" style={{ color: '#ffffff' }}>Panel Vendedor</h1>
              <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: '#FFC72C' }}>Panini Sticker Collection</p>
            </div>
          </div>

          {/* ── Nav centrado ────────────────────────────────────────────── */}
          <nav
            className="order-last flex w-full items-center justify-center gap-1 sm:order-none sm:w-auto"
            aria-label="Navegación del panel admin"
          >
            <AdminNavLink to="/admin" label="📋 Matriz" end />
            <AdminNavLink to="/admin/dashboard" label="📊 Dashboard" />
          </nav>

          {/* ── Usuario + logout ────────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400 hidden sm:block truncate max-w-40">
              {user.email}
            </span>
            <button
              onClick={logout}
              className="text-xs text-[#E8192C] hover:text-white border border-[#E8192C] hover:bg-[#E8192C] font-semibold transition-colors px-3 py-1.5 rounded-lg whitespace-nowrap"
            >
              Salir
            </button>
          </div>

        </div>
      </header>

      {/* ── Contenido de la ruta activa ───────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet key={`${user.id}:${inventario}`} context={inventory} />
      </main>
      <Footer />    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente de link de navegación
// ---------------------------------------------------------------------------

/**
 * @description Link de navegación del panel admin con estilo activo automático.
 * @param props.to - Ruta destino
 * @param props.label - Texto del botón (puede incluir emoji)
 * @param props.end - Si true, el match es exacto (para la ruta raíz /admin)
 * @returns Botón de navegación con estilos activo/inactivo
 */
function AdminNavLink({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "px-3 py-1.5 rounded-lg text-sm font-semibold transition-all",
          isActive
            ? "bg-[#FFC72C] text-[#0a0a14] shadow-sm"
            : "text-gray-300 hover:text-white hover:bg-white/10",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}
