"use client";
import "./rrhh.css";
import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePerfil } from "../PerfilContext";

// Añadir aquí una pestaña nueva es lo único que hay que tocar para colgar una sección en RRHH
const PESTANAS = [
  { href: "/crm/rrhh/ficha", nombre: "Ficha", soloRrhh: false },
  { href: "/crm/rrhh/horarios", nombre: "Horarios", soloRrhh: false },
  { href: "/crm/rrhh/inicio", nombre: "Check de inicio", soloRrhh: false },
  { href: "/crm/rrhh/admision", nombre: "Admisión", soloRrhh: true },
  { href: "/crm/rrhh/evaluaciones", nombre: "Evaluaciones", soloRrhh: false },
  { href: "/crm/rrhh/archivos", nombre: "Archivos", soloRrhh: false },
];

export default function RrhhLayout({ children }: { children: ReactNode }) {
  const ruta = usePathname() ?? "";
  const { es_rrhh } = usePerfil();

  return (
    <>
      <div className="cab"><h1>Recursos humanos</h1></div>
      <nav className="rrhh-tabs" aria-label="Secciones de RRHH">
        {PESTANAS.filter((p) => !p.soloRrhh || es_rrhh).map((p) => (
          <Link key={p.href} href={p.href} aria-current={ruta.startsWith(p.href) ? "page" : undefined}>{p.nombre}</Link>
        ))}
      </nav>
      {children}
    </>
  );
}
