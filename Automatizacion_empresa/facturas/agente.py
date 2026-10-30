import os
import re
import sys
import time
import base64
from datetime import datetime, timedelta, timezone

import requests
import fitz  # librería PyMuPDF: convierte PDF en imágenes
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from validacion import validar            # lo escribió la Persona A

load_dotenv()  # lee las claves del archivo .env

# ---------- CONFIGURACIÓN ----------
# SUPABASE_KEY debe ser la clave SECRETA (sb_secret_... / service_role): el agente se salta RLS.
# Nunca la pongas en el CRM ni en el navegador.
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
TABLA = "facturas_proveedor"          # facturas que tenemos que PAGAR (la tabla "facturas" son las que emitimos nosotros)
BUCKET = "facturas-proveedor"
CABECERAS = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY}
MINUTOS_ATASCADA = 10                 # una factura "leyendo" más tiempo que esto se vuelve a poner en cola
SEGUNDOS_ENTRE_RONDAS = 15            # solo para el modo --vigilar

# ---------- 1) MODELO: Claude a través de OpenRouter ----------
llm = ChatOpenAI(
    model=os.environ["MODELO"],
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    max_tokens=4000,
)

# ---------- 2) PROMPT DEL SISTEMA: las instrucciones fijas ----------
PROMPT = """Eres un asistente de administración.
Lee la factura que te paso (PDF o foto).
Es una factura que NOS ENVÍA un proveedor: el proveedor es quien la emite, no nosotros.
Saca: número, fecha, proveedor, NIF del proveedor, base imponible, IVA (importe en euros, no el porcentaje) y total.
La fecha en formato AAAA-MM-DD. Los importes como números con punto decimal (145.2).
Si un dato no aparece, déjalo vacío.
No inventes nada.
Cuando lo tengas, llama a guardar_factura."""


# ---------- 3) HERRAMIENTA: Claude rellena estos campos y el AGENTE los guarda ----------
class guardar_factura(BaseModel):
    """Guarda los datos leídos de una factura de proveedor."""
    numero: str | None = Field(None, description="Número de factura")
    fecha: str | None = Field(None, description="Fecha de la factura, AAAA-MM-DD")
    proveedor: str | None = Field(None, description="Nombre o razón social del proveedor que emite la factura")
    nif: str | None = Field(None, description="NIF/CIF del proveedor")
    base: float | None = Field(None, description="Base imponible en euros")
    iva: float | None = Field(None, description="Importe del IVA en euros")
    total: float | None = Field(None, description="Total de la factura en euros")


llm_con_herramienta = llm.bind_tools([guardar_factura])


# ---------- Acceso a Supabase ----------
def rest(metodo, ruta, **kw):
    r = requests.request(metodo, f"{SUPABASE_URL}/rest/v1/{ruta}", headers={**CABECERAS, "Content-Type": "application/json", **kw.pop("headers", {})}, timeout=30, **kw)
    r.raise_for_status()
    return r


def ahora():
    return datetime.now(timezone.utc).isoformat()


def liberar_atascadas():
    """Si el agente se cayó a mitad de una factura, vuelve a ponerla en cola."""
    limite = (datetime.now(timezone.utc) - timedelta(minutes=MINUTOS_ATASCADA)).isoformat()
    rest("PATCH", f"{TABLA}?estado=eq.leyendo&lectura_iniciada_en=lt.{limite}",
         json={"estado": "pendiente_lectura", "lectura_iniciada_en": None})


def reclamar():
    """Coge las facturas pendientes de lectura. El PATCH condicionado a estado=pendiente_lectura hace de cerrojo:
    si hubiera dos agentes a la vez, cada factura solo la gana uno."""
    pendientes = rest("GET", f"{TABLA}?estado=eq.pendiente_lectura&select=id,archivo_path,nombre_archivo&order=created_at").json()
    mias = []
    for p in pendientes:
        r = rest("PATCH", f"{TABLA}?id=eq.{p['id']}&estado=eq.pendiente_lectura&select=id",
                 json={"estado": "leyendo", "lectura_iniciada_en": ahora()}, headers={"Prefer": "return=representation"})
        if r.json():
            mias.append(p)
    return mias


def descargar_pdf(path):
    r = requests.get(f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}", headers=CABECERAS, timeout=60)
    r.raise_for_status()
    return r.content


# ---------- Convertir el PDF en imágenes que Claude pueda ver ----------
def a_imagenes(datos_pdf: bytes):
    """Devuelve una lista de bytes PNG: una imagen por página (como máximo 3)."""
    imagenes = []
    with fitz.open(stream=datos_pdf, filetype="pdf") as pdf:
        for i, pagina in enumerate(pdf):
            if i >= 3:
                break
            imagenes.append(pagina.get_pixmap(dpi=150).tobytes("png"))
    return imagenes


def fecha_valida(texto):
    """La base de datos solo admite AAAA-MM-DD: si Claude devuelve otra cosa, mejor vacío que un error."""
    if isinstance(texto, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", texto.strip()):
        try:
            datetime.strptime(texto.strip(), "%Y-%m-%d")
            return texto.strip()
        except ValueError:
            pass
    return None


def texto(valor, maximo):
    return valor.strip()[:maximo] if isinstance(valor, str) and valor.strip() else None


# ---------- 4) MEMORIA: ninguna. Cada factura es una conversación nueva ----------
def leer_factura(datos_pdf: bytes) -> dict:
    contenido = [{"type": "text", "text": "Aquí tienes la factura."}]
    for png in a_imagenes(datos_pdf):
        contenido.append({"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png).decode()}})
    respuesta = llm_con_herramienta.invoke([SystemMessage(PROMPT), HumanMessage(content=contenido)])
    if not respuesta.tool_calls:
        raise ValueError(f"El modelo no devolvió datos de factura. Dijo: {str(respuesta.content)[:200]}")
    return respuesta.tool_calls[0]["args"]


def procesar(fila):
    try:
        d = leer_factura(descargar_pdf(fila["archivo_path"]))
        base, iva, total = d.get("base"), d.get("iva"), d.get("total")
        proveedor = texto(d.get("proveedor"), 200)
        correcta = validar(proveedor, base, iva, total)    # "correcta" la calcula nuestro código, no Claude
        rest("PATCH", f"{TABLA}?id=eq.{fila['id']}", json={
            "numero": texto(d.get("numero"), 80), "fecha": fecha_valida(d.get("fecha")), "proveedor": proveedor,
            "nif": texto(d.get("nif"), 30), "base": base, "iva": iva, "total": total, "correcta": correcta,
            "estado": "por_pagar" if correcta else "revisar", "leida_en": ahora(), "error_lectura": None,
        })
        print(f"✔ {fila['nombre_archivo']} → {'por pagar' if correcta else 'REVISAR (datos incompletos o no cuadran)'}")
    except Exception as error:    # si una falla, la marcamos y seguimos con las demás
        print(f"✖ {fila['nombre_archivo']}: {error}")
        try:
            rest("PATCH", f"{TABLA}?id=eq.{fila['id']}", json={"estado": "error_lectura", "error_lectura": str(error)[:500]})
        except Exception as e2:
            print(f"  (además, no se pudo anotar el error: {e2})")


def una_ronda():
    liberar_atascadas()
    filas = reclamar()
    for fila in filas:
        procesar(fila)
    return len(filas)


# ---------- Programa principal ----------
#   python agente.py            → lee las facturas pendientes una vez y termina
#   python agente.py --vigilar  → se queda en marcha y lee las que se vayan subiendo desde el CRM
if __name__ == "__main__":
    if "--vigilar" in sys.argv:
        print(f"Vigilando nuevas facturas cada {SEGUNDOS_ENTRE_RONDAS} s (Ctrl+C para parar)…")
        while True:
            try:
                una_ronda()
            except Exception as error:
                print(f"⚠ Error en la ronda, se reintenta: {error}")
            time.sleep(SEGUNDOS_ENTRE_RONDAS)
    else:
        n = una_ronda()
        print(f"{n} factura(s) procesada(s)." if n else "No hay facturas pendientes de leer.")
