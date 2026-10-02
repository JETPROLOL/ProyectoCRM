export type CheckInicio = {
  id: string; created_at: string; empleado_id: string; titulo: string; orden: number;
  completada: boolean; completada_en: string | null; completada_por: string | null;
};

export function ordenar(tareas: CheckInicio[]) {
  return [...tareas].sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"));
}

export function progreso(tareas: CheckInicio[]) {
  return { hechas: tareas.filter((t) => t.completada).length, total: tareas.length };
}
