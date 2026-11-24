// Las 3 plantillas del módulo Sitio web. Cada una es un diseño distinto (CSS en app/crm/sitio/plantillas.css)
// más un contenido de partida. Como el contenido tiene siempre el mismo formato, el usuario puede cambiar de plantilla
// más adelante sin perder lo que ha escrito (solo cambia el aspecto).
import { Ajustes, Contenido, PlantillaId, crearBloque } from "./tipos";

export type InfoPlantilla = {
  id: PlantillaId; nombre: string; descripcion: string; ideal: string[];
  crear: () => Contenido;
};

const ajustesBase: Ajustes = {
  nombre: "Meridiano Logística", eslogan: "Transporte y distribución", logoUrl: "", logoAlt: "",
  telefono: "+34 976 000 000", email: "hola@meridiano-logistica.es",
  direccion: "Polígono Plaza, Calle Logística 12, 50197 Zaragoza", horario: "Lunes a viernes, de 8:00 a 19:00",
  pie: "© 2026 Meridiano Logística. Todos los derechos reservados.",
};

export const PLANTILLAS: InfoPlantilla[] = [
  {
    id: "corporativa",
    nombre: "Corporativa",
    descripcion: "Clásica y sobria. Transmite solidez y confianza: portada dividida, cifras destacadas y tarjetas de servicios.",
    ideal: ["Empresa consolidada", "Clientes B2B", "Mucha información"],
    crear: () => ({
      tema: { color: "#1c5cab", fuente: "sans", modo: "claro" },
      ajustes: { ...ajustesBase },
      bloques: [
        crearBloque("hero", "Inicio"),
        crearBloque("cifras"),
        crearBloque("servicios", "Servicios"),
        crearBloque("sobre", "Nosotros"),
        crearBloque("testimonios", "Clientes"),
        crearBloque("cta"),
        crearBloque("contacto", "Contacto"),
      ],
    }),
  },
  {
    id: "moderna",
    nombre: "Moderna",
    descripcion: "Oscura y dinámica. Portada centrada con brillo de color, bordes redondeados y botones en forma de píldora.",
    ideal: ["Imagen innovadora", "Tecnología y seguimiento", "Captar clientes nuevos"],
    crear: () => ({
      tema: { color: "#2dd4bf", fuente: "sans", modo: "oscuro" },
      ajustes: { ...ajustesBase },
      bloques: [
        crearBloque("hero", "Inicio", true, {
          etiqueta: "Seguimiento en tiempo real", titulo: "Logística inteligente para negocios que no se detienen",
          texto: "Controla cada envío desde que sale del almacén hasta que llega a su destino.", botonTexto: "Hablar con un experto", botonEnlace: "mail", imagen: "", imagenAlt: "",
        }),
        crearBloque("servicios", "Servicios"),
        crearBloque("cifras"),
        crearBloque("cta"),
        crearBloque("testimonios", "Opiniones"),
        crearBloque("contacto", "Contacto"),
        crearBloque("sobre", "Nosotros", false),
      ],
    }),
  },
  {
    id: "minimalista",
    nombre: "Minimalista",
    descripcion: "Mucho espacio en blanco y tipografía protagonista. Pocas secciones, lectura tranquila y esquinas rectas.",
    ideal: ["Servicio cercano y de confianza", "Pocas secciones", "Marca elegante"],
    crear: () => ({
      tema: { color: "#9a3412", fuente: "serif", modo: "claro" },
      ajustes: { ...ajustesBase },
      bloques: [
        crearBloque("hero", "Inicio", true, {
          etiqueta: "Desde 2008 en Zaragoza", titulo: "Transportamos lo que importa, con calma y precisión",
          texto: "Un equipo pequeño, rutas bien pensadas y trato directo con cada cliente.", botonTexto: "Escríbenos", botonEnlace: "mail", imagen: "", imagenAlt: "",
        }),
        crearBloque("servicios", "Servicios"),
        crearBloque("sobre", "Nosotros"),
        crearBloque("contacto", "Contacto"),
        crearBloque("cifras", "", false),
        crearBloque("testimonios", "", false),
        crearBloque("cta", "", false),
      ],
    }),
  },
];

export const plantillaPorId = (id: string) => PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[0];
