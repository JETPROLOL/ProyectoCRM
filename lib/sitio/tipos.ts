// Módulo "Sitio web": tipos, definición de bloques y utilidades de color (contraste WCAG).
// Todo el contenido de un sitio se guarda en la columna jsonb "contenido" de public.sitios_web.

export type PlantillaId = "corporativa" | "moderna" | "minimalista";
export type FuenteId = "sans" | "serif" | "redondeada";
export type ModoId = "claro" | "oscuro";

export type Tema = { color: string; fuente: FuenteId; modo: ModoId };

// Datos de la empresa: los usan la cabecera, el bloque de contacto y el pie
export type Ajustes = {
  nombre: string; eslogan: string; logoUrl: string; logoAlt: string;
  telefono: string; email: string; direccion: string; horario: string; pie: string;
};

export type Datos = Record<string, unknown>;
export type TipoBloque = "hero" | "servicios" | "sobre" | "cifras" | "testimonios" | "cta" | "contacto";
export type Bloque = { id: string; tipo: TipoBloque; visible: boolean; menu: string; datos: Datos };

export type Contenido = { tema: Tema; ajustes: Ajustes; bloques: Bloque[] };
export type Sitio = Contenido & { id: string; nombre: string; plantilla: PlantillaId; created_at: string; updated_at: string };
export type FilaSitio = { id: string; nombre: string; plantilla: PlantillaId; contenido: Contenido; created_at: string; updated_at: string };

export const FUENTES: Record<FuenteId, { nombre: string; css: string }> = {
  sans: { nombre: "Sans moderna", css: 'var(--f-body), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  serif: { nombre: "Serif elegante", css: 'Georgia, "Times New Roman", Times, serif' },
  redondeada: { nombre: "Redondeada amable", css: 'ui-rounded, "Nunito", "Trebuchet MS", system-ui, sans-serif' },
};

// ---------- Definición de campos de cada bloque (el editor se construye a partir de esto) ----------
type CampoSimple = { clave: string; etiqueta: string; tipo: "texto" | "area" | "enlace"; max?: number; ayuda?: string };
export type Campo =
  | CampoSimple
  | { clave: string; etiqueta: string; tipo: "imagen"; claveAlt: string; ayuda?: string }
  | { clave: string; etiqueta: string; tipo: "lista"; max: number; nombreItem: string; campos: CampoSimple[] };

export type DefBloque = { nombre: string; descripcion: string; campos: Campo[]; nuevo: () => Datos };

export const BLOQUES: Record<TipoBloque, DefBloque> = {
  hero: {
    nombre: "Portada", descripcion: "Titular principal, texto y botón de acción.",
    campos: [
      { clave: "etiqueta", etiqueta: "Texto pequeño sobre el título", tipo: "texto", max: 60 },
      { clave: "titulo", etiqueta: "Título", tipo: "texto", max: 120 },
      { clave: "texto", etiqueta: "Descripción", tipo: "area", max: 400 },
      { clave: "botonTexto", etiqueta: "Texto del botón", tipo: "texto", max: 40 },
      { clave: "botonEnlace", etiqueta: "El botón lleva a", tipo: "enlace" },
      { clave: "imagen", etiqueta: "Imagen", tipo: "imagen", claveAlt: "imagenAlt", ayuda: "Opcional. Si no pones ninguna, se muestra una ilustración de la plantilla." },
    ],
    nuevo: () => ({ etiqueta: "Logística sin sorpresas", titulo: "Tu mercancía, siempre a tiempo", texto: "Transporte, almacenaje y distribución con seguimiento en cada paso.", botonTexto: "Pedir presupuesto", botonEnlace: "mail", imagen: "", imagenAlt: "" }),
  },
  servicios: {
    nombre: "Servicios", descripcion: "Lista de lo que ofrece la empresa.",
    campos: [
      { clave: "titulo", etiqueta: "Título de la sección", tipo: "texto", max: 80 },
      { clave: "intro", etiqueta: "Introducción", tipo: "area", max: 300 },
      { clave: "items", etiqueta: "Servicios", tipo: "lista", max: 6, nombreItem: "servicio", campos: [
        { clave: "titulo", etiqueta: "Nombre", tipo: "texto", max: 60 },
        { clave: "texto", etiqueta: "Descripción", tipo: "area", max: 220 },
      ] },
    ],
    nuevo: () => ({ titulo: "Nuestros servicios", intro: "Soluciones a medida para cada tipo de carga.", items: [
      { titulo: "Transporte nacional", texto: "Rutas diarias a toda la península con entregas en 24 / 48 horas." },
      { titulo: "Almacenaje", texto: "Naves con control de inventario y gestión de pedidos." },
      { titulo: "Última milla", texto: "Entrega final al cliente con aviso previo y confirmación." },
    ] }),
  },
  sobre: {
    nombre: "Sobre nosotros", descripcion: "Quiénes sois, con puntos destacados e imagen opcional.",
    campos: [
      { clave: "titulo", etiqueta: "Título", tipo: "texto", max: 80 },
      { clave: "texto", etiqueta: "Texto (deja una línea en blanco para separar párrafos)", tipo: "area", max: 900 },
      { clave: "puntos", etiqueta: "Puntos destacados", tipo: "lista", max: 6, nombreItem: "punto", campos: [{ clave: "texto", etiqueta: "Punto", tipo: "texto", max: 80 }] },
      { clave: "imagen", etiqueta: "Imagen", tipo: "imagen", claveAlt: "imagenAlt" },
    ],
    nuevo: () => ({ titulo: "Más de 15 años moviendo tu negocio", texto: "Somos un equipo de profesionales de la logística comprometido con la puntualidad y la transparencia.\n\nTrabajamos contigo para que cada envío llegue en el plazo y en perfecto estado.", puntos: [{ texto: "Seguimiento en tiempo real" }, { texto: "Flota propia y revisada" }, { texto: "Atención personal" }], imagen: "", imagenAlt: "" }),
  },
  cifras: {
    nombre: "Cifras", descripcion: "Datos que generan confianza.",
    campos: [{ clave: "items", etiqueta: "Cifras", tipo: "lista", max: 4, nombreItem: "cifra", campos: [
      { clave: "valor", etiqueta: "Valor (p. ej. 98 %)", tipo: "texto", max: 14 },
      { clave: "etiqueta", etiqueta: "Qué significa", tipo: "texto", max: 50 },
    ] }],
    nuevo: () => ({ items: [{ valor: "15+", etiqueta: "Años de experiencia" }, { valor: "98 %", etiqueta: "Entregas a tiempo" }, { valor: "120", etiqueta: "Vehículos en flota" }, { valor: "2.400", etiqueta: "Clientes activos" }] }),
  },
  testimonios: {
    nombre: "Opiniones", descripcion: "Lo que dicen los clientes.",
    campos: [
      { clave: "titulo", etiqueta: "Título de la sección", tipo: "texto", max: 80 },
      { clave: "items", etiqueta: "Opiniones", tipo: "lista", max: 3, nombreItem: "opinión", campos: [
        { clave: "cita", etiqueta: "Opinión", tipo: "area", max: 260 },
        { clave: "autor", etiqueta: "Nombre", tipo: "texto", max: 50 },
        { clave: "cargo", etiqueta: "Cargo y empresa", tipo: "texto", max: 60 },
      ] },
    ],
    nuevo: () => ({ titulo: "Lo que dicen nuestros clientes", items: [
      { cita: "Desde que trabajamos con ellos no hemos tenido ni un solo retraso importante.", autor: "Marta Ruiz", cargo: "Directora de compras, Hogarlux" },
      { cita: "El seguimiento de los envíos nos ahorra decenas de llamadas cada semana.", autor: "Pablo Serrano", cargo: "Responsable logístico, Fruvega" },
    ] }),
  },
  cta: {
    nombre: "Llamada a la acción", descripcion: "Banda destacada con un botón.",
    campos: [
      { clave: "titulo", etiqueta: "Título", tipo: "texto", max: 100 },
      { clave: "texto", etiqueta: "Texto", tipo: "area", max: 240 },
      { clave: "botonTexto", etiqueta: "Texto del botón", tipo: "texto", max: 40 },
      { clave: "botonEnlace", etiqueta: "El botón lleva a", tipo: "enlace" },
    ],
    nuevo: () => ({ titulo: "¿Hablamos de tu próximo envío?", texto: "Cuéntanos qué necesitas y te respondemos en menos de 24 horas.", botonTexto: "Contactar", botonEnlace: "mail" }),
  },
  contacto: {
    nombre: "Contacto", descripcion: "Muestra los datos de contacto de la empresa (se editan en la pestaña Diseño).",
    campos: [
      { clave: "titulo", etiqueta: "Título", tipo: "texto", max: 80 },
      { clave: "intro", etiqueta: "Introducción", tipo: "area", max: 300 },
    ],
    nuevo: () => ({ titulo: "Contacto", intro: "Estamos a tu disposición para resolver cualquier duda." }),
  },
};
export const TIPOS_BLOQUE = Object.keys(BLOQUES) as TipoBloque[];

export const nuevoId = () => "b" + Math.random().toString(36).slice(2, 9);
export function crearBloque(tipo: TipoBloque, menu = "", visible = true, datos?: Datos): Bloque {
  return { id: nuevoId(), tipo, visible, menu, datos: datos ?? BLOQUES[tipo].nuevo() };
}

// Lectores seguros del jsonb (lo guardado puede estar incompleto o haberlo editado alguien a mano)
export const txt = (d: Datos, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
export function lista(d: Datos, k: string): Record<string, string>[] {
  const v = d[k];
  return Array.isArray(v) ? v.filter((x): x is Record<string, string> => !!x && typeof x === "object") : [];
}

// ---------- Color: contraste WCAG 2.2 (1.4.3) ----------
export const esHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
const canales = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const aHex = ([r, g, b]: number[]) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export function luminancia(hex: string) {
  const [r, g, b] = canales(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a: string, b: string) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Color del texto que va SOBRE el color de acento (blanco o casi negro, el que más contraste dé: siempre ≥ 4,5 : 1)
export const textoSobre = (fondo: string) => (contraste(fondo, "#ffffff") >= contraste(fondo, "#0a0a0a") ? "#ffffff" : "#0a0a0a");

// Color de acento usado COMO texto (enlaces, etiquetas): se oscurece o aclara hasta llegar a 4,5 : 1 sobre todos los fondos dados
export function ajustarTexto(hex: string, fondos: string[], minimo = 4.5) {
  const cumple = (c: string) => fondos.every((f) => contraste(c, f) >= minimo);
  if (cumple(hex)) return hex;
  const claro = fondos.every((f) => luminancia(f) < 0.2);
  const destino = claro ? [255, 255, 255] : [0, 0, 0];
  const base = canales(hex);
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = aHex(base.map((v, i) => v + (destino[i] - v) * t));
    if (cumple(c)) return c;
  }
  return claro ? "#ffffff" : "#000000";
}

// Fondos de la página según el modo (los usa el renderizador y la comprobación de contraste del editor)
export const FONDOS: Record<ModoId, { base: string; alt: string }> = {
  claro: { base: "#ffffff", alt: "#f3f5f8" },
  oscuro: { base: "#0d1117", alt: "#161b22" },
};

// Normaliza lo que viene de la base de datos para que el editor nunca se rompa con datos incompletos
export function normalizar(f: FilaSitio, porDefecto: Contenido): Sitio {
  const c = (f.contenido ?? {}) as Partial<Contenido>;
  const bloques = Array.isArray(c.bloques)
    ? c.bloques.filter((b) => b && b.id && b.tipo in BLOQUES).map((b) => ({ id: String(b.id), tipo: b.tipo, visible: b.visible !== false, menu: typeof b.menu === "string" ? b.menu : "", datos: (b.datos ?? {}) as Datos }))
    : porDefecto.bloques;
  return {
    id: f.id, nombre: f.nombre, plantilla: f.plantilla, created_at: f.created_at, updated_at: f.updated_at,
    tema: { ...porDefecto.tema, ...(c.tema ?? {}) }, ajustes: { ...porDefecto.ajustes, ...(c.ajustes ?? {}) }, bloques,
  };
}
