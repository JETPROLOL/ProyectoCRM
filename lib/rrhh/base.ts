// Tipos y constantes comunes a todas las secciones de RRHH
// es_ventas / es_finanzas los añadió la migración 20261023_A_base_ventas.sql (si aún no se ha ejecutado, llegan como false)
export type Perfil = { es_rrhh: boolean; empleado_id: string | null; es_ventas: boolean; es_finanzas: boolean };
export const SIN_PERFIL: Perfil = { es_rrhh: false, empleado_id: null, es_ventas: false, es_finanzas: false };
