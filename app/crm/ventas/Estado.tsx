import { ESTADOS_PRESUPUESTO, ETIQUETA_ESTADO, EstadoPresupuesto } from "@/lib/ventas/presupuestos";

// El estado se indica siempre con texto (y además con forma y color), nunca solo con color
export default function Estado({ estado }: { estado: EstadoPresupuesto }) {
  return <span className="ventas-estado" data-estado={estado}>{ETIQUETA_ESTADO[estado]}</span>;
}
export { ESTADOS_PRESUPUESTO };
