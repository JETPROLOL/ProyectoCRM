"use client";
import "./inicio.css";
import "../ficha/ficha.css"; // FotoTrabajador usa los estilos .ficha-foto
import { usePerfil } from "../../PerfilContext";
import ListaIncorporaciones from "./ListaIncorporaciones";
import MisChecks from "./MisChecks";

// RRHH gestiona las tareas de todos; el resto de usuarios solo ve las suyas
export default function Inicio() {
  const { es_rrhh, empleado_id, cargando } = usePerfil();
  if (cargando) return null;
  return es_rrhh ? <ListaIncorporaciones /> : <MisChecks empleadoId={empleado_id} />;
}
