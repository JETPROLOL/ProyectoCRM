// Tipos y constantes comunes a todas las secciones de RRHH
export type Perfil = { es_rrhh: boolean; empleado_id: string | null };
export const SIN_PERFIL: Perfil = { es_rrhh: false, empleado_id: null };
