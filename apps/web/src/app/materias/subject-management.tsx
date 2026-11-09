"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { EntryFormDialog } from "../entry-form-dialog";
import type { SchoolSubject } from "../horarios/schedule-management";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface SubjectManagementProps {
  initialSubjects: SchoolSubject[];
  readOnly?: boolean;
}

export function SubjectManagement({
  initialSubjects,
  readOnly = false,
}: SubjectManagementProps) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [name, setName] = useState("");
  const [weeklyFrequency, setWeeklyFrequency] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function openNewSubject() {
    setEditingId(null);
    setName("");
    setWeeklyFrequency("");
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  function editSubject(subject: SchoolSubject) {
    setEditingId(subject.id);
    setName(subject.name);
    setWeeklyFrequency(String(subject.weeklyFrequency ?? ""));
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  async function saveSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch(
        `${apiUrl}/subjects${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, weeklyFrequency: Number(weeklyFrequency) }),
        },
      );
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível salvar a matéria.");
        return;
      }
      const saved = (await response.json()) as SchoolSubject;
      setSubjects((current) => [
        ...current.filter((subject) => subject.id !== saved.id),
        saved,
      ].sort((left, right) => left.name.localeCompare(right.name)));
      setIsFormOpen(false);
      setMessage(editingId ? "Matéria atualizada." : "Matéria cadastrada.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeSubject(subject: SchoolSubject) {
    if (!window.confirm(`Excluir a matéria ${subject.name}?`)) {
      return;
    }
    setError("");
    setMessage("");
    setDeletingId(subject.id);
    try {
      const response = await fetch(`${apiUrl}/subjects/${subject.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível excluir a matéria.");
        return;
      }
      setSubjects((current) => current.filter((item) => item.id !== subject.id));
      setMessage("Matéria excluída.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <>
      {!readOnly && isFormOpen && (
        <EntryFormDialog
          description="As matérias cadastradas podem ser usadas nos horários semanais e nas avaliações."
          eyebrow="CATÁLOGO DA ESCOLA"
          icon="▤"
          isBusy={submitting}
          onClose={() => setIsFormOpen(false)}
          title={editingId ? "Edite a matéria" : "Cadastre uma matéria"}
          titleId="save-subject-title"
        >
          <form className="subject-form" onSubmit={saveSubject}>
            <label>
              Nome da matéria
              <input
                autoFocus
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Matemática"
                required
                value={name}
              />
            </label>
            <label>
              Frequência semanal por turma
              <input
                max="40"
                min="1"
                onChange={(event) => setWeeklyFrequency(event.target.value)}
                required
                type="number"
                value={weeklyFrequency}
              />
              <small>Quantidade de aulas desta matéria por semana em cada turma.</small>
            </label>
            <div className="dialog-form-actions">
              <button className="class-submit" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar matéria"}
              </button>
              <button
                className="class-cancel-edit"
                disabled={submitting}
                onClick={() => setIsFormOpen(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
            {error && <p className="form-message form-error" role="alert">{error}</p>}
          </form>
        </EntryFormDialog>
      )}

      <section className="class-list-panel" aria-labelledby="subject-list-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">CATÁLOGO ACADÊMICO</p>
            <h2 id="subject-list-title">Matérias cadastradas</h2>
          </div>
          <div className="class-list-actions">
            {!readOnly && (
              <button className="class-submit" onClick={openNewSubject} type="button">
                Nova matéria
              </button>
            )}
            <span className="class-count">{subjects.length}</span>
          </div>
        </div>
        {error && !isFormOpen && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
        {subjects.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">▤</span>
            <strong>O catálogo ainda está vazio</strong>
            <p>Cadastre matérias para relacioná-las aos horários e às avaliações.</p>
          </div>
        ) : (
          <ul className="subject-list">
            {subjects.map((subject) => (
              <li className="subject-list-item" key={subject.id}>
                <div className="subject-list-copy">
                  <strong>{subject.name}</strong>
                  <div className="subject-card-stats">
                    <span>
                      <strong>
                        {subject.weeklyFrequency === null
                          ? "Definir frequência"
                          : `${subject.weeklyFrequency} aulas/semana por turma`}
                      </strong>
                    </span>
                    <span><strong>{subject.scheduleCount}</strong> horários</span>
                    <span><strong>{subject.assessmentCount}</strong> avaliações</span>
                  </div>
                </div>
                {!readOnly && (
                  <div className="subject-list-actions">
                    <button
                      className="subject-action dialog-edit-button"
                      onClick={() => editSubject(subject)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className="subject-action subject-delete"
                      disabled={deletingId === subject.id}
                      onClick={() => void removeSubject(subject)}
                      type="button"
                    >
                      {deletingId === subject.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function showRequestError(
  response: Response,
  setError: (message: string) => void,
  fallback: string,
) {
  const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
  setError(message || fallback);
}
