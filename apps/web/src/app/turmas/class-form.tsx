"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { EntryFormDialog } from "../entry-form-dialog";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface SchoolClass {
  id: string;
  year: number;
  grade: string;
  name: string;
  students?: Array<{ id: string; fullName: string }>;
  teachers?: Array<{ id: string; fullName: string }>;
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
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const selectedClass = classes.find((schoolClass) => schoolClass.id === selectedClassId);
  const classesByGrade = new Map<string, SchoolClass[]>();
  for (const schoolClass of classes) {
    const gradeClasses = classesByGrade.get(schoolClass.grade) ?? [];
    gradeClasses.push(schoolClass);
    classesByGrade.set(schoolClass.grade, gradeClasses);
  }

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
    setSelectedClassId(schoolClass.id);
    setError("");
    setSuccess("");
  }

  function openClassDetails(schoolClass: SchoolClass) {
    setSelectedClassId(schoolClass.id);
    setError("");
    setSuccess("");
  }

  function closeClassDetails() {
    setSelectedClassId(null);
    setEditingClassId(null);
  }

  function openCreateDialog() {
    resetForm();
    setError("");
    setSuccess("");
    setCreateDialogOpen(true);
  }

  function closeCreateDialog() {
    setCreateDialogOpen(false);
    resetForm();
    setError("");
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

      const savedClass = (await response.json()) as SchoolClass;
      const existingClass = classes.find((item) => item.id === savedClass.id);
      const updatedClass = {
        ...savedClass,
        students: savedClass.students ?? existingClass?.students ?? [],
      };
      setClasses((current) => [
        updatedClass,
        ...current.filter((item) => item.id !== updatedClass.id),
      ].sort((a, b) => b.year - a.year || a.grade.localeCompare(b.grade) || a.name.localeCompare(b.name)));
      const wasEditing = Boolean(editingClassId);
      resetForm();
      setSuccess(wasEditing ? "Turma atualizada com sucesso." : "Turma cadastrada com sucesso.");
      if (!wasEditing) {
        setCreateDialogOpen(false);
      }
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {createDialogOpen && (
        <EntryFormDialog
          description="Informe o ano letivo, o ano escolar e a identificação da turma."
          eyebrow="ORGANIZAÇÃO ESCOLAR"
          icon="✎"
          isBusy={submitting}
          onClose={closeCreateDialog}
          title="Cadastrar turma"
          titleId="create-class-title"
        >
          <form className="class-form class-create-dialog-form" onSubmit={saveClass}>
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
                {submitting ? "Salvando..." : "Cadastrar turma"}
              </button>
              <button
                className="class-cancel-edit"
                disabled={submitting}
                onClick={closeCreateDialog}
                type="button"
              >
                Cancelar
              </button>
            </div>
            {error && <p className="form-message form-error" role="alert">{error}</p>}
          </form>
        </EntryFormDialog>
      )}

      {selectedClass && !editingClassId && (
        <EntryFormDialog
          description={`Ano letivo ${selectedClass.year}`}
          eyebrow="DETALHES DA TURMA"
          icon="▦"
          isBusy={false}
          onClose={closeClassDetails}
          className="class-details-print-dialog"
          title={`${selectedClass.grade} · Turma ${selectedClass.name}`}
          titleId="class-details-title"
        >
          <div className="class-details">
            <section aria-labelledby="class-roster-title">
              <div className="class-details-roster-heading">
                <h3 id="class-roster-title">Alunos</h3>
                <span>{selectedClass.students?.length ?? 0}</span>
              </div>
              {selectedClass.students?.length ? (
                <ul className="class-details-roster">
                  {selectedClass.students.map((student) => (
                    <li key={student.id}>{student.fullName}</li>
                  ))}
                </ul>
              ) : (
                <p className="class-details-empty">Nenhum aluno matriculado nesta turma.</p>
              )}
            </section>
            <section aria-labelledby="class-teachers-title">
              <div className="class-details-roster-heading">
                <h3 id="class-teachers-title">Professores</h3>
                <span>{selectedClass.teachers?.length ?? 0}</span>
              </div>
              {selectedClass.teachers?.length ? (
                <ul className="class-details-roster">
                  {selectedClass.teachers.map((teacher) => (
                    <li key={teacher.id}>{teacher.fullName}</li>
                  ))}
                </ul>
              ) : (
                <p className="class-details-empty">Nenhum professor vinculado a esta turma.</p>
              )}
            </section>
            <div className="class-details-actions">
              <button
                className="class-cancel-edit"
                onClick={() => window.print()}
                type="button"
              >
                Imprimir
              </button>
              <button
                className="class-submit"
                onClick={() => editClass(selectedClass)}
                type="button"
              >
                Editar turma
              </button>
              <button
                className="class-cancel-edit"
                onClick={closeClassDetails}
                type="button"
              >
                Fechar
              </button>
            </div>
          </div>
        </EntryFormDialog>
      )}

      {selectedClass && editingClassId && (
        <EntryFormDialog
          description="Atualize os dados da turma. Se já houver matrículas ou avaliações, o ano letivo não poderá ser alterado."
          eyebrow="ORGANIZAÇÃO ESCOLAR"
          icon="✎"
          isBusy={submitting}
          onClose={closeClassDetails}
          title="Editar turma"
          titleId="edit-class-title"
        >
          <form className="class-form class-edit-dialog-form" onSubmit={saveClass}>
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
                {submitting ? "Salvando..." : "Salvar alterações"}
              </button>
              <button
                className="class-cancel-edit"
                disabled={submitting}
                onClick={resetForm}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="class-cancel-edit"
                disabled={submitting}
                onClick={closeClassDetails}
                type="button"
              >
                Fechar
              </button>
            </div>
            {error && <p className="form-message form-error" role="alert">{error}</p>}
          </form>
        </EntryFormDialog>
      )}

      <section className="class-list-panel" aria-labelledby="classes-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">TURMAS CADASTRADAS</p>
            <h2 id="classes-title">Sua escola, organizada</h2>
          </div>
          <div className="class-list-actions">
            <button className="class-submit" onClick={openCreateDialog} type="button">
              Cadastrar turma
            </button>
            <span className="class-count">{classes.length}</span>
          </div>
        </div>

        {success && <p className="form-message form-success" role="status">{success}</p>}

        {classes.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">✿</span>
            <strong>Suas turmas aparecerão aqui</strong>
            <p>Cadastre o primeiro ano escolar e sua turma para começar.</p>
          </div>
        ) : (
          <div className="class-grade-groups">
            {[...classesByGrade.entries()]
              .sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB))
              .map(([grade, gradeClasses]) => (
                <section
                  aria-labelledby={`class-grade-${grade}`}
                  className="class-grade-group"
                  key={grade}
                >
                  <h3 id={`class-grade-${grade}`}>{grade}</h3>
                  <ul className="class-list class-card-grid">
                    {gradeClasses.map((schoolClass) => (
                      <li className="class-list-item" key={schoolClass.id}>
                        <button
                          aria-label={`Ver detalhes da turma ${schoolClass.name}, ${grade}`}
                          className="class-card-button"
                          onClick={() => openClassDetails(schoolClass)}
                          type="button"
                        >
                          <span className="class-list-icon" aria-hidden="true">▦</span>
                          <span className="class-list-copy">
                            <strong>Turma {schoolClass.name}</strong>
                            <small>Ano letivo {schoolClass.year}</small>
                          </span>
                          <span className="class-list-tag">
                            {schoolClass.students?.length ?? 0} alunos
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        )}
      </section>
    </>
  );
}
