"use client";
import "./ventas.css";
import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePerfil } from "../PerfilContext";

// Añadir aquí una pestaña nueva es lo único que hay que tocar para colgar una sección en Ventas
const PESTANAS = [
  { href: "/crm/ventas/presupuestos", nombre: "Presupuestos" },
  { href: "/crm/ventas/servicios", nombre: "Servicios" },
];

export default function VentasLayout({ children }: { children: ReactNode }) {
  const ruta = usePathname() ?? "";
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
      <nav className="ventas-tabs" aria-label="Secciones de Ventas">
        {PESTANAS.map((p) => (
          <Link key={p.href} href={p.href} aria-current={ruta.startsWith(p.href) ? "page" : undefined}>{p.nombre}</Link>
        ))}
      </nav>
      {children}
    </>
  );
}
