"use client";

import { useState } from "react";
import type { FormEvent } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ClassSessionPeriod {
  startsAt: string;
  endsAt: string;
}

export interface SchoolClassSessions {
  morning: ClassSessionPeriod[];
  afternoon: ClassSessionPeriod[];
}

interface ClassSessionSettingsProps {
  initialSessions: SchoolClassSessions;
}

const sessionOptions = [
  { key: "morning", label: "Manhã" },
  { key: "afternoon", label: "Tarde" },
] as const;

export function ClassSessionSettings({ initialSessions }: ClassSessionSettingsProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updatePeriod(
    session: keyof SchoolClassSessions,
    index: number,
    field: keyof ClassSessionPeriod,
    value: string,
  ) {
    setSessions((current) => ({
      ...current,
      [session]: current[session].map((period, periodIndex) =>
        periodIndex === index ? { ...period, [field]: value } : period,
      ),
    }));
  }

  function addPeriod(session: keyof SchoolClassSessions) {
    setSessions((current) => ({
      ...current,
      [session]: [...current[session], { startsAt: "", endsAt: "" }],
    }));
    setError("");
    setMessage("");
  }

  function removePeriod(session: keyof SchoolClassSessions, index: number) {
    setSessions((current) => ({
      ...current,
      [session]: current[session].filter((_, periodIndex) => periodIndex !== index),
    }));
    setError("");
    setMessage("");
  }

  async function saveSessions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/settings/class-sessions`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessions),
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
              : "Não foi possível salvar os turnos das sessões.",
          );
        }
        return;
      }

      const saved = (await response.json()) as SchoolClassSessions;
      setSessions(saved);
      setMessage("Turnos das sessões salvos.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="class-list-panel" aria-labelledby="class-session-settings-title">
      <div className="section-heading class-list-heading">
        <div>
          <p className="card-kicker">ROTINA ESCOLAR</p>
          <h2 id="class-session-settings-title">Turnos de aula</h2>
        </div>
      </div>
      <p className="student-create-hint">
        Configure os turnos da manhã e da tarde. As aulas do horário semanal devem corresponder a um dos turnos definidos para a sessão de cada turma.
      </p>
      <form className="class-session-settings-form" onSubmit={saveSessions}>
        <div className="class-session-grid">
          {sessionOptions.map(({ key, label }) => (
            <section className="class-session-card" key={key} aria-labelledby={`${key}-session-title`}>
              <div className="class-session-card-heading">
                <h3 id={`${key}-session-title`}>{label}</h3>
                <button
                  className="class-session-add"
                  disabled={submitting}
                  onClick={() => addPeriod(key)}
                  type="button"
                >
                  + Adicionar turno
                </button>
              </div>
              {sessions[key].length > 0 ? (
                <ol className="class-session-period-list">
                  {sessions[key].map((period, index) => (
                    <li key={`${key}-${index}`}>
                      <strong>Turno {index + 1}</strong>
                      <label>
                        Início
                        <input
                          disabled={submitting}
                          onChange={(event) => updatePeriod(key, index, "startsAt", event.target.value)}
                          required
                          type="time"
                          value={period.startsAt}
                        />
                      </label>
                      <label>
                        Fim
                        <input
                          disabled={submitting}
                          onChange={(event) => updatePeriod(key, index, "endsAt", event.target.value)}
                          required
                          type="time"
                          value={period.endsAt}
                        />
                      </label>
                      <button
                        aria-label={`Remover turno ${index + 1} da sessão ${label}`}
                        className="class-session-remove"
                        disabled={submitting}
                        onClick={() => removePeriod(key, index)}
                        type="button"
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="class-session-empty">Nenhum turno configurado para esta sessão.</p>
              )}
            </section>
          ))}
        </div>
        <p className="school-recess-note">
          Os horários dos turnos não podem se sobrepor entre si nem entre as sessões.
        </p>
        <div className="class-form-actions">
          <button className="class-submit recess-save-button" disabled={submitting} type="submit">
            {submitting ? "Salvando..." : "Salvar turnos"}
          </button>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
      </form>
    </section>
  );
}
