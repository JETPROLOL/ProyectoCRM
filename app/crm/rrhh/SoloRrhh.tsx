"use client";
import { ReactNode } from "react";
import { usePerfil } from "../PerfilContext";

export default function SoloRrhh({ children }: { children: ReactNode }) {
  const { es_rrhh, cargando } = usePerfil();
  if (cargando) return null;
  if (!es_rrhh) return <p className="vacio">Esta sección es solo para el equipo de RRHH.</p>;
  return <>{children}</>;
}
