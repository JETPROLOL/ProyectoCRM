export const ESTADOS = ["nueva", "contactada", "propuesta", "ganada", "perdida"] as const;
export type Estado = (typeof ESTADOS)[number];

export type Oportunidad = {
  id: string; created_at: string; nombre: string; empresa: string | null; email: string;
  telefono: string | null; servicio: string; mensaje: string | null; estado: Estado;
  valor_estimado: number | null; empleado_id: string | null;
};
export type Empresa = { id: string; nombre: string; ubicacion: string };
export type Empleado = { id: string; nombre: string; email: string; telefono: string; empresa_id: string | null };

export const euros = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
