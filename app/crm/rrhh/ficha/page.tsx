"use client";
import "./ficha.css";
import { usePerfil } from "../../PerfilContext";
import ListaFichas from "./ListaFichas";
import MiFicha from "./MiFicha";

// RRHH ve y edita toda la plantilla; el resto de usuarios solo ve su propia ficha
export default function Ficha() {
  const { es_rrhh, empleado_id, cargando } = usePerfil();
  if (cargando) return null;
  return es_rrhh ? <ListaFichas /> : <MiFicha empleadoId={empleado_id} />;
}
