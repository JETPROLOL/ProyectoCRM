"use client";
import "./ventas.css";
import { ReactNode } from "react";
import { usePerfil } from "../PerfilContext";

// Los apartados de Ventas (Presupuestos, Facturas...) están en el desplegable del menú lateral: ver ../layout.tsx y ./secciones.ts
export default function VentasLayout({ children }: { children: ReactNode }) {
  const { es_ventas, cargando } = usePerfil();

  // Es solo cosmético: la seguridad real son las políticas RLS de Supabase
  if (cargando) return null;
  if (!es_ventas) {
    return (
      <>
        <div className="cab"><h1>Ventas</h1></div>
        <p className="vacio" role="alert">No tienes permiso para ver esta sección. Pide a un administrador el rol de ventas.</p>
      </>
    );
  }

  return (
    <>
      <div className="cab"><h1>Ventas</h1></div>
      {children}
    </>
  );
}
