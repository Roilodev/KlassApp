"use client";

import { useState } from "react";
import type { FormEvent } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface SchoolClass {
  id: string;
  year: number;
  grade: string;
  name: string;
}

interface ClassFormProps {
  initialClasses: SchoolClass[];
}

export function ClassForm({ initialClasses }: ClassFormProps) {
  const [classes, setClasses] = useState(initialClasses);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [grade, setGrade] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);

  function resetForm() {
    setEditingClassId(null);
    setYear(String(new Date().getFullYear()));
    setGrade("");
    setName("");
  }

  function editClass(schoolClass: SchoolClass) {
    setEditingClassId(schoolClass.id);
    setYear(String(schoolClass.year));
    setGrade(schoolClass.grade);
    setName(schoolClass.name);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch(
        `${apiUrl}/school-structure/classes${editingClassId ? `/${editingClassId}` : ""}`,
        {
        method: editingClassId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), grade, name }),
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          setError("Sua sessão expirou. Entre novamente para continuar.");
        } else if (response.status === 403) {
          setError("Somente a administração pode alterar turmas.");
        } else if (response.status === 429) {
          setError("Muitas tentativas. Aguarde um momento e tente novamente.");
        } else {
          const result = await response.json().catch(() => null);
          setError(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível salvar a turma.",
          );
        }
        return;
      }

      const createdClass = (await response.json()) as SchoolClass;
      setClasses((current) => [
        createdClass,
        ...current.filter((item) => item.id !== createdClass.id),
      ].sort((a, b) => b.year - a.year || a.grade.localeCompare(b.grade) || a.name.localeCompare(b.name)));
      const wasEditing = Boolean(editingClassId);
      resetForm();
      setSuccess(wasEditing ? "Turma atualizada com sucesso." : "Turma cadastrada com sucesso.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="class-panel" aria-labelledby="create-class-title">
        <div className="class-panel-heading">
          <div className="setup-icon" aria-hidden="true">✎</div>
          <div>
            <p className="card-kicker">ORGANIZAÇÃO ESCOLAR</p>
            <h2 id="create-class-title">{editingClassId ? "Edite a turma" : "Cadastre uma turma"}</h2>
            <p>Exemplo: ano escolar 4º ano, turma A.</p>
          </div>
        </div>

        <form className="class-form" onSubmit={saveClass}>
          <label>
            Ano letivo
            <input
              max="2200"
              min="2000"
              onChange={(event) => setYear(event.target.value)}
              required
              type="number"
              value={year}
            />
          </label>
          <label>
            Ano escolar
            <input
              maxLength={80}
              onChange={(event) => setGrade(event.target.value)}
              placeholder="Ex.: 4º ano"
              required
              value={grade}
            />
          </label>
          <label>
            Turma
            <input
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: A"
              required
              value={name}
            />
          </label>
          <div className="class-form-actions">
            <button className="class-submit" disabled={submitting} type="submit">
              {submitting ? "Salvando..." : editingClassId ? "Salvar alterações" : "Cadastrar turma"}
            </button>
            {editingClassId && (
              <button
                className="class-cancel-edit"
                disabled={submitting}
                onClick={resetForm}
                type="button"
              >
                Cancelar
              </button>
            )}
          </div>
          {editingClassId && (
            <p className="class-edit-note">
              O ano letivo não pode ser alterado se a turma já tiver matrículas ou avaliações.
            </p>
          )}
        </form>

        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {success && <p className="form-message form-success" role="status">{success}</p>}
      </section>

      <section className="class-list-panel" aria-labelledby="classes-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">TURMAS CADASTRADAS</p>
            <h2 id="classes-title">Sua escola, organizada</h2>
          </div>
          <span className="class-count">{classes.length}</span>
        </div>

        {classes.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">✿</span>
            <strong>Suas turmas aparecerão aqui</strong>
            <p>Cadastre o primeiro ano escolar e sua turma para começar.</p>
          </div>
        ) : (
          <ul className="class-list">
            {classes.map((schoolClass) => (
              <li className="class-list-item" key={schoolClass.id}>
                <span className="class-list-icon" aria-hidden="true">▦</span>
                <span className="class-list-copy">
                  <strong>{schoolClass.grade} · Turma {schoolClass.name}</strong>
                  <small>Ano letivo {schoolClass.year}</small>
                </span>
                <span className="class-list-tag">ATIVA</span>
                <button
                  aria-label={`Editar turma ${schoolClass.grade} ${schoolClass.name}`}
                  className="class-edit-button"
                  onClick={() => editClass(schoolClass)}
                  type="button"
                >
                  Editar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
