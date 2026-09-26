"use client";
import { ReactNode, useEffect, useRef } from "react";

export default function Modal({ abierto, titulo, onCerrar, children }: {
  abierto: boolean; titulo: string; onCerrar: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog ref={ref} className="modal" onClose={onCerrar}>
      <div className="modal-cab">
        <h2>{titulo}</h2>
        <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar ventana">×</button>
      </div>
      {children}
    </dialog>
  );
}
