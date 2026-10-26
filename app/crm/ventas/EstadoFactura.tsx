import { ETIQUETA_FACTURA, EstadoVisible } from "@/lib/ventas/facturas";

// Igual que en presupuestos: el estado va siempre en texto, además de forma y color
export default function EstadoFactura({ estado }: { estado: EstadoVisible }) {
  return <span className="ventas-estado" data-estado={estado}>{ETIQUETA_FACTURA[estado]}</span>;
}
