// Apartados de RRHH: se muestran como desplegable dentro del menú lateral del CRM.
// Añadir aquí una línea es lo único que hay que tocar para colgar una sección nueva en RRHH.
export const SECCIONES_RRHH = [
  { href: "/crm/rrhh/ficha", nombre: "Ficha", soloRrhh: false },
  { href: "/crm/rrhh/horarios", nombre: "Horarios", soloRrhh: false },
  { href: "/crm/rrhh/inicio", nombre: "Check de inicio", soloRrhh: false },
  { href: "/crm/rrhh/admision", nombre: "Admisión", soloRrhh: true },
  { href: "/crm/rrhh/evaluaciones", nombre: "Evaluaciones", soloRrhh: false },
  { href: "/crm/rrhh/archivos", nombre: "Archivos", soloRrhh: false },
] as const;
