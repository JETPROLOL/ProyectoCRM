import { ESTILO_PROVEEDOR, ETIQUETA_PROVEEDOR, EstadoProveedor } from "@/lib/ventas/facturasProveedor";

// Igual que en el resto de Ventas: el estado va siempre en texto, además de forma y color
export default function EstadoFacturaProveedor({ estado }: { estado: EstadoProveedor }) {
  return <span className="ventas-estado" data-estado={ESTILO_PROVEEDOR[estado]}>{ETIQUETA_PROVEEDOR[estado]}</span>;
}
