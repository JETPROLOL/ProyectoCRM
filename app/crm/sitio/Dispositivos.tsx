"use client";
import Icono from "../Icono";

export type Dispositivo = "ordenador" | "tableta" | "movil";
const OPCIONES: { id: Dispositivo; texto: string; icono: "monitor" | "tablet" | "phone" }[] = [
  { id: "ordenador", texto: "Ordenador", icono: "monitor" },
  { id: "tableta", texto: "Tableta", icono: "tablet" },
  { id: "movil", texto: "Móvil", icono: "phone" },
];

// Cambia el ancho de la vista previa para ver cómo se adapta la web. Son botones de radio nativos: se manejan con flechas.
export default function Dispositivos({ valor, onCambio, nombre = "dispositivo" }: { valor: Dispositivo; onCambio: (d: Dispositivo) => void; nombre?: string }) {
  return (
    <fieldset className="sitio-seg">
      <legend>Tamaño de pantalla de la vista previa</legend>
      {OPCIONES.map((o) => (
        <label key={o.id}>
          <input type="radio" name={nombre} value={o.id} checked={valor === o.id} onChange={() => onCambio(o.id)} />
          <Icono nombre={o.icono} /><span>{o.texto}</span>
        </label>
      ))}
    </fieldset>
  );
}
