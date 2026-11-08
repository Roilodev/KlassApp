"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { SchoolRecess } from "../school-recess";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface RecessSettingsProps {
  initialRecess: SchoolRecess;
}

export function RecessSettings({ initialRecess }: RecessSettingsProps) {
  const [enabled, setEnabled] = useState(Boolean(initialRecess.startsAt && initialRecess.endsAt));
  const [startsAt, setStartsAt] = useState(initialRecess.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(initialRecess.endsAt ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function saveRecess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/settings/school-recess`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: enabled ? startsAt : null,
          endsAt: enabled ? endsAt : null,
        }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setError("Sua sessão expirou. Entre novamente para continuar.");
        } else if (response.status === 403) {
          setError("Somente a administração pode alterar as configurações.");
        } else {
          const result = await response.json().catch(() => null);
          setError(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível salvar o horário do recreio.",
          );
        }
        return;
      }

      const saved = (await response.json()) as SchoolRecess;
      setEnabled(Boolean(saved.startsAt && saved.endsAt));
      setStartsAt(saved.startsAt ?? "");
      setEndsAt(saved.endsAt ?? "");
      setMessage(saved.startsAt ? "Horário do recreio salvo." : "Horário do recreio removido.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="class-list-panel" aria-labelledby="recess-settings-title">
      <div className="section-heading class-list-heading">
        <div>
          <p className="card-kicker">ROTINA ESCOLAR</p>
          <h2 id="recess-settings-title">Recreio escolar</h2>
        </div>
      </div>
      <p className="student-create-hint">
        Defina um horário comum de descanso para os dias úteis. Ele aparecerá na distribuição semanal das turmas.
      </p>
      <form className="school-recess-form" onSubmit={saveRecess}>
        <label className="school-recess-toggle">
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>Configurar horário do recreio</span>
        </label>
        <div className="school-recess-times">
          <label>
            Início do recreio
            <input
              disabled={!enabled}
              onChange={(event) => setStartsAt(event.target.value)}
              required={enabled}
              type="time"
              value={startsAt}
            />
          </label>
          <label>
            Fim do recreio
            <input
              disabled={!enabled}
              onChange={(event) => setEndsAt(event.target.value)}
              required={enabled}
              type="time"
              value={endsAt}
            />
          </label>
        </div>
        <p className="school-recess-note">Este intervalo será mostrado de segunda a sexta-feira.</p>
        <div className="class-form-actions">
          <button className="class-submit" disabled={submitting} type="submit">
            {submitting ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
      </form>
    </section>
  );
}
