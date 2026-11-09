"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { SchoolRecess } from "../school-recess";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface RecessSettingsProps {
  initialRecess: SchoolRecess;
}

export function RecessSettings({ initialRecess }: RecessSettingsProps) {
  const [morningEnabled, setMorningEnabled] = useState(Boolean(initialRecess.startsAt && initialRecess.endsAt));
  const [startsAt, setStartsAt] = useState(initialRecess.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(initialRecess.endsAt ?? "");
  const [afternoonEnabled, setAfternoonEnabled] = useState(
    Boolean(initialRecess.afternoonStartsAt && initialRecess.afternoonEndsAt),
  );
  const [afternoonStartsAt, setAfternoonStartsAt] = useState(initialRecess.afternoonStartsAt ?? "");
  const [afternoonEndsAt, setAfternoonEndsAt] = useState(initialRecess.afternoonEndsAt ?? "");
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
          startsAt: morningEnabled ? startsAt : null,
          endsAt: morningEnabled ? endsAt : null,
          afternoonStartsAt: afternoonEnabled ? afternoonStartsAt : null,
          afternoonEndsAt: afternoonEnabled ? afternoonEndsAt : null,
        }),
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
              : "Não foi possível salvar o horário do recreio.",
          );
        }
        return;
      }

      const saved = (await response.json()) as SchoolRecess;
      setMorningEnabled(Boolean(saved.startsAt && saved.endsAt));
      setStartsAt(saved.startsAt ?? "");
      setEndsAt(saved.endsAt ?? "");
      setAfternoonEnabled(Boolean(saved.afternoonStartsAt && saved.afternoonEndsAt));
      setAfternoonStartsAt(saved.afternoonStartsAt ?? "");
      setAfternoonEndsAt(saved.afternoonEndsAt ?? "");
      setMessage("Horários dos recreios salvos.");
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
        Defina os horários de recreio para as sessões da manhã e da tarde.
      </p>
      <form className="school-recess-form" onSubmit={saveRecess}>
        <div className="school-recess-sessions">
          <section className="school-recess-session" aria-labelledby="morning-recess-title">
            <h3 id="morning-recess-title">Sessão da manhã</h3>
            <label className="school-recess-toggle">
              <input
                checked={morningEnabled}
                onChange={(event) => setMorningEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>Configurar recreio da manhã</span>
            </label>
            <div className="school-recess-times">
              <label>
                Início do recreio
                <input
                  disabled={!morningEnabled}
                  onChange={(event) => setStartsAt(event.target.value)}
                  required={morningEnabled}
                  type="time"
                  value={startsAt}
                />
              </label>
              <label>
                Fim do recreio
                <input
                  disabled={!morningEnabled}
                  onChange={(event) => setEndsAt(event.target.value)}
                  required={morningEnabled}
                  type="time"
                  value={endsAt}
                />
              </label>
            </div>
          </section>
          <section className="school-recess-session" aria-labelledby="afternoon-recess-title">
            <h3 id="afternoon-recess-title">Sessão da tarde</h3>
            <label className="school-recess-toggle">
              <input
                checked={afternoonEnabled}
                onChange={(event) => setAfternoonEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>Configurar recreio da tarde</span>
            </label>
            <div className="school-recess-times">
              <label>
                Início do recreio
                <input
                  disabled={!afternoonEnabled}
                  onChange={(event) => setAfternoonStartsAt(event.target.value)}
                  required={afternoonEnabled}
                  type="time"
                  value={afternoonStartsAt}
                />
              </label>
              <label>
                Fim do recreio
                <input
                  disabled={!afternoonEnabled}
                  onChange={(event) => setAfternoonEndsAt(event.target.value)}
                  required={afternoonEnabled}
                  type="time"
                  value={afternoonEndsAt}
                />
              </label>
            </div>
          </section>
        </div>
        <p className="school-recess-note">Os horários serão aplicados de segunda a sexta-feira e não podem coincidir com aulas ou entre si.</p>
        <div className="class-form-actions">
          <button className="class-submit recess-save-button" disabled={submitting} type="submit">
            {submitting ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
      </form>
    </section>
  );
}
