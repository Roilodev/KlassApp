"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { EntryFormDialog } from "../entry-form-dialog";
import type { SchoolSubject } from "../horarios/schedule-management";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface SubjectManagementProps {
  initialSubjects: SchoolSubject[];
  grades: string[];
  readOnly?: boolean;
}

export function SubjectManagement({
  initialSubjects,
  grades,
  readOnly = false,
}: SubjectManagementProps) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [name, setName] = useState("");
  const [gradeFrequencies, setGradeFrequencies] = useState<Array<{
    grade: string;
    weeklyFrequency: string;
  }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function openNewSubject() {
    setEditingId(null);
    setName("");
    setGradeFrequencies([]);
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  function editSubject(subject: SchoolSubject) {
    setEditingId(subject.id);
    setName(subject.name);
    setGradeFrequencies(subject.gradeFrequencies.map((assignment) => ({
      grade: assignment.grade,
      weeklyFrequency: String(assignment.weeklyFrequency ?? ""),
    })));
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
          body: JSON.stringify({
            name,
            gradeFrequencies: gradeFrequencies.map((assignment) => ({
              grade: assignment.grade,
              weeklyFrequency: Number(assignment.weeklyFrequency),
            })),
          }),
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
          description="Associe cada matéria aos anos escolares em que é oferecida e configure sua frequência semanal por ano."
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
            <fieldset className="subject-grade-frequency-list">
              <legend>Anos escolares e frequência semanal</legend>
              {gradeFrequencies.map((assignment, index) => (
                <div className="subject-grade-frequency-row" key={`${assignment.grade}-${index}`}>
                  <label>
                    Ano escolar
                    <select
                      onChange={(event) => setGradeFrequencies((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, grade: event.target.value } : item,
                        ),
                      )}
                      required
                      value={assignment.grade}
                    >
                      <option disabled value="">Selecione um ano</option>
                      {grades.map((grade) => (
                        <option
                          disabled={gradeFrequencies.some(
                            (item, itemIndex) => itemIndex !== index && item.grade === grade,
                          )}
                          key={grade}
                          value={grade}
                        >
                          {grade}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Aulas por semana
                    <input
                      max="40"
                      min="1"
                      onChange={(event) => setGradeFrequencies((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, weeklyFrequency: event.target.value }
                            : item,
                        ),
                      )}
                      required
                      type="number"
                      value={assignment.weeklyFrequency}
                    />
                  </label>
                  <button
                    aria-label={`Remover ${assignment.grade || "ano escolar"} da matéria`}
                    className="subject-grade-remove"
                    onClick={() => setGradeFrequencies((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )}
                    type="button"
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                className="class-cancel-edit subject-grade-add"
                disabled={gradeFrequencies.length >= grades.length}
                onClick={() => {
                  const availableGrade = grades.find(
                    (grade) => !gradeFrequencies.some((assignment) => assignment.grade === grade),
                  );
                  if (availableGrade) {
                    setGradeFrequencies((current) => [
                      ...current,
                      { grade: availableGrade, weeklyFrequency: "" },
                    ]);
                  }
                }}
                type="button"
              >
                Adicionar ano escolar
              </button>
              {grades.length === 0 && (
                <p className="subject-grade-empty">
                  Cadastre uma turma primeiro para criar anos escolares e associar matérias.
                </p>
              )}
            </fieldset>
            <div className="dialog-form-actions">
              <button
                className="class-submit"
                disabled={submitting || grades.length === 0 || gradeFrequencies.length === 0}
                type="submit"
              >
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
                  <div className="subject-grade-frequencies">
                    {subject.gradeFrequencies.length > 0
                      ? subject.gradeFrequencies.map((assignment) => (
                        <span key={assignment.grade}>
                          {assignment.grade}: {assignment.weeklyFrequency === null
                            ? "frequência não definida"
                            : `${assignment.weeklyFrequency} aulas/semana`}
                        </span>
                      ))
                      : <span>Sem ano escolar associado</span>}
                  </div>
                  <div className="subject-card-stats">
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
