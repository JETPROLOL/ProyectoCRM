"use client";
import "./admision.css";
import SoloRrhh from "../SoloRrhh";
import ListaSolicitudes from "./ListaSolicitudes";

// Solicitudes de empleo que llegan desde la web: RRHH las acepta (se crea el empleado) o las deniega
export default function Admision() {
  return <SoloRrhh><ListaSolicitudes /></SoloRrhh>;
}
