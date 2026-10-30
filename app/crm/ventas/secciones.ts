// Apartados de Ventas: se muestran como desplegable dentro del menú lateral del CRM.
// Añadir aquí una línea es lo único que hay que tocar para colgar una sección nueva en Ventas.
export const SECCIONES_VENTAS = [
  { href: "/crm/ventas/presupuestos", nombre: "Presupuestos" },
  { href: "/crm/ventas/facturas", nombre: "Facturas emitidas" },
  { href: "/crm/ventas/a-pagar", nombre: "Facturas a pagar" },
  { href: "/crm/ventas/servicios", nombre: "Servicios" },
] as const;
