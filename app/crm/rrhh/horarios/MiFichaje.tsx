"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Fichaje, cronometro, dia, duracionMs, fechaLarga, hora, horasMin, inicioMes, inicioSemana, sumaMs } from "@/lib/rrhh/horarios";

const MAX_TURNO_MS = 14 * 3600 * 1000; // a partir de aquí se avisa de que quizá falta la salida

// Vista del trabajador: botón de fichar entrada/salida, totales y su historial reciente
export default function MiFichaje({ empleadoId }: { empleadoId: string }) {
  const [lista, setLista] = useState<Fichaje[]>([]);
  const [cargado, setCargado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 62); // cubre el mes en curso y el anterior
    const { data, error: fallo } = await supabase.from("fichajes").select("*").eq("empleado_id", empleadoId)
      .gte("entrada", desde.toISOString()).order("entrada", { ascending: false }).limit(400);
    if (fallo) setError(`No se pudieron cargar tus fichajes. ${fallo.message}`);
    setLista((data as Fichaje[]) ?? []);
    setCargado(true);
  }, [empleadoId]);
  useEffect(() => { cargar(); }, [cargar]);

  const abierto = lista.find((f) => !f.salida) ?? null;

  // El cronómetro solo corre mientras hay un turno abierto
  useEffect(() => {
    if (!abierto) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [abierto?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fichar() {
    setOcupado(true);
    setError("");
    const { error: fallo } = await supabase.rpc(abierto ? "fichar_salida" : "fichar_entrada");
    if (fallo) setError(fallo.message);
    await cargar();
    setOcupado(false);
  }

  const totales = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
    const lunes = inicioSemana(); const sigLunes = new Date(lunes); sigLunes.setDate(sigLunes.getDate() + 7);
    const mes = inicioMes(); const sigMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
    return { hoy: sumaMs(lista, hoy, manana, ahora), semana: sumaMs(lista, lunes, sigLunes, ahora), mes: sumaMs(lista, mes, sigMes, ahora) };
  }, [lista, ahora]);

  // Agrupa por día (el más reciente primero)
  const dias = useMemo(() => {
    const m = new Map<string, Fichaje[]>();
    for (const f of lista) m.set(dia(f.entrada), [...(m.get(dia(f.entrada)) ?? []), f]);
    return [...m.entries()].map(([d, fs]) => ({
      d, inicio: fs[0].entrada, fs: [...fs].reverse(), ms: fs.reduce((s, f) => s + duracionMs(f, ahora), 0),
    }));
  }, [lista, ahora]);

  if (!cargado) return null;
  const transcurrido = abierto ? duracionMs(abierto, ahora) : 0;

  return (
    <>
      <section className="tarjeta horarios-fichar" data-dentro={!!abierto}>
        <div>
          <p className="horarios-estado">{abierto ? "Jornada en curso" : "Fuera de turno"}</p>
          <p className="horarios-crono" aria-live="off">{abierto ? cronometro(transcurrido) : "--:--:--"}</p>
          <p className="tenue">
            {abierto ? `Entrada registrada a las ${hora(abierto.entrada)}` : "Pulsa el botón para registrar tu entrada."}
          </p>
        </div>
        <button type="button" className="btn horarios-boton" onClick={fichar} disabled={ocupado}>
          {ocupado ? "Registrando…" : abierto ? "Fichar salida" : "Fichar entrada"}
        </button>
      </section>

      {abierto && transcurrido > MAX_TURNO_MS && (
        <p className="aviso" data-tipo="error" role="status">
          Llevas más de 14 horas con la jornada abierta. Si olvidaste fichar la salida, ficha ahora y pide a RRHH que corrija la hora.
        </p>
      )}
      {error && <p className="aviso" data-tipo="error" role="alert">{error}</p>}

      <div className="horarios-kpis">
        <div><span>Hoy</span><b>{horasMin(totales.hoy)}</b></div>
        <div><span>Esta semana</span><b>{horasMin(totales.semana)}</b></div>
        <div><span>Este mes</span><b>{horasMin(totales.mes)}</b></div>
      </div>

      <h2 className="subtitulo">Historial reciente</h2>
      {dias.length === 0 ? (
        <p className="vacio">Aún no has fichado. Tu primer registro aparecerá aquí.</p>
      ) : (
        <div className="tabla">
          <table>
            <thead><tr><th>Día</th><th>Fichajes</th><th>Total</th></tr></thead>
            <tbody>
              {dias.map(({ d, inicio, fs, ms }) => (
                <tr key={d}>
                  <td style={{ textTransform: "capitalize", whiteSpace: "nowrap" }}>{fechaLarga(inicio)}</td>
                  <td>
                    {fs.map((f) => (
                      <span key={f.id} className="horarios-tramo" data-abierto={!f.salida}>
                        {hora(f.entrada)} – {f.salida ? hora(f.salida) : "en curso"}
                      </span>
                    ))}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{horasMin(ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
