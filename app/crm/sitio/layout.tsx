"use client";
import "./sitio.css";
import { ReactNode } from "react";
import { usePerfil } from "../PerfilContext";

// Solo ventas, finanzas y admin (es_ventas). Es cosmético: la seguridad real son las políticas RLS de sitios_web
export default function SitioLayout({ children }: { children: ReactNode }) {
  const { es_ventas, cargando } = usePerfil();
  if (cargando) return null;
  if (!es_ventas) {
    return (
      <>
        <div className="cab"><h1>Sitio web</h1></div>
        <p className="vacio" role="alert">No tienes permiso para ver esta sección. Pide a un administrador el rol de ventas.</p>
      </>
    );
  }
  return <>{children}</>;
}
