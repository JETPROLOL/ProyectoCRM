"use client";
import "./horarios.css";
import "../ficha/ficha.css"; // EquipoFichajes reutiliza .ficha-datos
import { useState } from "react";
import { usePerfil } from "../../PerfilContext";
import MiFichaje from "./MiFichaje";
import MisVacaciones from "./MisVacaciones";
import EquipoFichajes from "./EquipoFichajes";
import SolicitudesVacaciones from "./SolicitudesVacaciones";

type Vista = "fichaje" | "vacaciones" | "equipo" | "solicitudes";

// Todos los usuarios con ficha fichan y piden vacaciones; RRHH además ve el equipo y resuelve solicitudes
export default function Horarios() {
  const { es_rrhh, empleado_id, cargando } = usePerfil();
  const [vista, setVista] = useState<Vista | null>(null);
  if (cargando) return null;

  const pestanas: { id: Vista; nombre: string }[] = [
    ...(empleado_id ? [{ id: "fichaje" as const, nombre: "Mi fichaje" }, { id: "vacaciones" as const, nombre: "Mis vacaciones" }] : []),
    ...(es_rrhh ? [{ id: "equipo" as const, nombre: "Fichajes del equipo" }, { id: "solicitudes" as const, nombre: "Solicitudes de vacaciones" }] : []),
  ];

  if (pestanas.length === 0) {
    return <p className="vacio">Tu usuario todavía no está vinculado a una ficha. Pide a RRHH que cree tu ficha con tu mismo correo y vuelve a iniciar sesión.</p>;
  }
  const activa = pestanas.find((p) => p.id === vista)?.id ?? pestanas[0].id;

  return (
    <>
      <div className="horarios-sub" role="tablist" aria-label="Horarios">
        {pestanas.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={activa === p.id} onClick={() => setVista(p.id)}>{p.nombre}</button>
        ))}
      </div>
      {activa === "fichaje" && empleado_id && <MiFichaje empleadoId={empleado_id} />}
      {activa === "vacaciones" && empleado_id && <MisVacaciones empleadoId={empleado_id} />}
      {activa === "equipo" && <EquipoFichajes />}
      {activa === "solicitudes" && <SolicitudesVacaciones />}
    </>
  );
}
