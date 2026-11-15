"use client";

import { useState } from "react";
import type { FormEvent } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface TeacherWorkloadSettingsProps {
  initialMaxWeeklyPeriods: number | null;
}

export function TeacherWorkloadSettings({
  initialMaxWeeklyPeriods,
}: TeacherWorkloadSettingsProps) {
  const [maxWeeklyPeriods, setMaxWeeklyPeriods] = useState(
    initialMaxWeeklyPeriods?.toString() ?? "",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function saveWorkload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/settings/teacher-workload`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxWeeklyPeriods: Number(maxWeeklyPeriods) }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setError("Sua sessão expirou. Entre novamente para continuar.");
        } else if (response.status === 403) {
          setError("Somente a administração pode alterar as configurações.");
        } else if (response.status === 429) {
          setError("Muitas tentativas. Aguarde um momento e tente novamente.");
        } else {
          const result = await response.json().catch(() => null);
          setError(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível salvar a carga máxima dos professores.",
          );
        }
        return;
      }

      const saved = (await response.json()) as { maxWeeklyPeriods: number };
      setMaxWeeklyPeriods(saved.maxWeeklyPeriods.toString());
      setMessage("Carga máxima semanal salva.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="class-list-panel" aria-labelledby="teacher-workload-title">
      <div className="section-heading class-list-heading">
        <div>
          <p className="card-kicker">EQUIPE ESCOLAR</p>
          <h2 id="teacher-workload-title">Carga dos professores</h2>
        </div>
      </div>
      <p className="student-create-hint">
        Defina o máximo de períodos de aula que cada professor pode assumir por semana. Este limite será usado como referência para estimar a necessidade de professores.
      </p>
      <form className="class-session-settings-form" onSubmit={saveWorkload}>
        <label className="teacher-workload-field">
          Períodos por professor, por semana
          <input
            disabled={submitting}
            max="2147483647"
            min="1"
            onChange={(event) => {
              setMaxWeeklyPeriods(event.target.value);
              setError("");
              setMessage("");
            }}
            required
            step="1"
            type="number"
            value={maxWeeklyPeriods}
          />
        </label>
        <p className="school-recess-note">
          A configuração vale para todos os professores e conta períodos, não horas-relógio.
        </p>
        <div className="class-form-actions">
          <button className="class-submit recess-save-button" disabled={submitting} type="submit">
            {submitting ? "Salvando..." : "Salvar carga"}
          </button>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
      </form>
    </section>
  );
}
