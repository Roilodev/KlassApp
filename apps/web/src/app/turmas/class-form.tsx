"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { EntryFormDialog } from "../entry-form-dialog";
import type { SchoolRecess } from "../school-recess";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const weekdays = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
];

export interface SchoolClass {
  id: string;
  year: number;
  grade: string;
  name: string;
  students?: Array<{ id: string; fullName: string }>;
  teachers?: Array<{ id: string; fullName: string }>;
}

export interface ClassSchedule {
  id: string;
  classId: string;
  teacherId: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  teacherName: string | null;
}

interface ClassFormProps {
  initialClasses: SchoolClass[];
  initialSchedules: ClassSchedule[];
  recess: SchoolRecess;
}

function printWeeklySchedule() {
  const pageStyle = document.createElement("style");
  pageStyle.dataset.weeklySchedulePrint = "true";
  pageStyle.textContent = "@page { size: A4 landscape; margin: 10mm 5mm 5mm; }";
  document.head.append(pageStyle);
  document.body.classList.add("printing-weekly-schedule");

  const cleanup = () => {
    document.body.classList.remove("printing-weekly-schedule");
    pageStyle.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}

export function ClassForm({ initialClasses, initialSchedules, recess }: ClassFormProps) {
  const [classes, setClasses] = useState(initialClasses);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [grade, setGrade] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [scheduleClassId, setScheduleClassId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const selectedClass = classes.find((schoolClass) => schoolClass.id === selectedClassId);
  const scheduleClass = classes.find((schoolClass) => schoolClass.id === scheduleClassId);
  const scheduleRows = scheduleClass
    ? initialSchedules.filter(
      (schedule) => schedule.classId === scheduleClass.id && schedule.dayOfWeek <= weekdays.length,
    )
    : [];
  const scheduleTimes = new Set(
    scheduleRows.map((schedule) => `${schedule.startsAt}|${schedule.endsAt}`),
  );
  const teachersInSchedule = new Map<
    string,
    { name: string; subjects: Set<string> }
  >();
  for (const schedule of scheduleRows) {
    if (!schedule.teacherName) {
      continue;
    }
    const key = schedule.teacherId ?? schedule.teacherName;
    const teacher = teachersInSchedule.get(key) ?? {
      name: schedule.teacherName,
      subjects: new Set<string>(),
    };
    teacher.subjects.add(schedule.subject);
    teachersInSchedule.set(key, teacher);
  }
  const unassignedLessons = scheduleRows.filter((schedule) => !schedule.teacherName);
  if (recess.startsAt && recess.endsAt) {
    scheduleTimes.add(`${recess.startsAt}|${recess.endsAt}`);
  }
  const schoolGrades = [...new Set(classes.map((schoolClass) => schoolClass.grade))].sort(
    (left, right) => left.localeCompare(right),
  );

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

  function returnToClassDetails() {
    resetForm();
    setError("");
    setSuccess("");
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
                className="class-cancel-edit dialog-print-button"
                onClick={() => window.print()}
                type="button"
              >
                Imprimir
              </button>
              <button
                className="class-submit"
                onClick={() => {
                  setScheduleClassId(selectedClass.id);
                  setSelectedClassId(null);
                }}
                type="button"
              >
                Horário
              </button>
              <button
                className="class-submit dialog-edit-button"
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

      {scheduleClass && (
        <EntryFormDialog
          description={`Distribuição semanal de ${scheduleClass.grade} · Turma ${scheduleClass.name} · ${scheduleClass.year}.`}
          eyebrow="SEMANA ESCOLAR"
          icon="◷"
          isBusy={false}
          onClose={() => {
            setScheduleClassId(null);
            setSelectedClassId(scheduleClass.id);
          }}
          className="weekly-schedule-dialog"
          title="Horário semanal"
          titleId="weekly-schedule-title"
        >
          <div className="weekly-schedule-sheet">
            <h2 className="weekly-schedule-print-heading weekly-schedule-print-only">
              Distribuição semanal · {scheduleClass.grade} · Turma {scheduleClass.name} · {scheduleClass.year}
            </h2>
            {scheduleRows.length === 0 && !recess.startsAt ? (
              <p className="class-details-empty">Ainda não há horários cadastrados para esta turma.</p>
            ) : (
              <div className="weekly-schedule-scroll">
                <table className="weekly-schedule-table">
                  <thead>
                    <tr>
                      <th scope="col">Horário</th>
                      {weekdays.map((weekday) => <th key={weekday} scope="col">{weekday}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...scheduleTimes].sort((left, right) => left.localeCompare(right)).map((timeSlot) => {
                      const [startsAt, endsAt] = timeSlot.split("|");
                      return (
                        <tr key={timeSlot}>
                          <th scope="row">
                            <time dateTime={startsAt}>{startsAt}</time>
                            <span>{endsAt}</span>
                          </th>
                          {weekdays.map((weekday, index) => {
                            const schedule = scheduleRows.find(
                              (item) =>
                                item.dayOfWeek === index + 1 &&
                                item.startsAt === startsAt &&
                                item.endsAt === endsAt,
                            );
                            const isRecess = index < weekdays.length &&
                              recess.startsAt === startsAt &&
                              recess.endsAt === endsAt;

                            if (isRecess) {
                              return (
                                <td className="weekly-schedule-recess" key={weekday}>
                                  <strong>Recreio escolar</strong>
                                  <span>Intervalo de descanso</span>
                                </td>
                              );
                            }
                            return schedule ? (
                              <td key={weekday}>
                                <strong>{schedule.subject}</strong>
                                <span>{schedule.teacherName ?? "Professor não definido"}</span>
                              </td>
                            ) : (
                              <td className="weekly-schedule-empty" key={weekday} aria-label={`${weekday}: sem aula`} />
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <section
              className="weekly-schedule-teachers weekly-schedule-print-only"
              aria-labelledby="weekly-schedule-teachers-title"
            >
              <h3 id="weekly-schedule-teachers-title">Professores envolvidos</h3>
              {teachersInSchedule.size > 0 ? (
                <ul>
                  {[...teachersInSchedule.entries()]
                    .sort(([, left], [, right]) => left.name.localeCompare(right.name))
                    .map(([teacherId, teacher]) => (
                      <li key={teacherId}>
                        <strong>{teacher.name}</strong>
                        <span>{[...teacher.subjects].sort((left, right) => left.localeCompare(right)).join(" · ")}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="class-details-empty">Nenhum professor atribuído às aulas desta turma.</p>
              )}
              {unassignedLessons.length > 0 && (
                <p className="weekly-schedule-unassigned">
                  {unassignedLessons.length === 1
                    ? "1 aula sem professor atribuído."
                    : `${unassignedLessons.length} aulas sem professor atribuído.`}
                </p>
              )}
            </section>
            <div className="weekly-schedule-actions">
              <button className="schedule-print-button" onClick={printWeeklySchedule} type="button">
                Imprimir horário
              </button>
              <button
                className="class-cancel-edit"
                onClick={() => {
                  setScheduleClassId(null);
                  setSelectedClassId(scheduleClass.id);
                }}
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
          onClose={returnToClassDetails}
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
                onClick={returnToClassDetails}
                type="button"
              >
                Cancelar
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
          <ul className="class-list class-card-grid">
            {[...classes]
              .sort((left, right) =>
                right.year - left.year ||
                left.grade.localeCompare(right.grade) ||
                left.name.localeCompare(right.name),
              )
              .map((schoolClass) => {
                const gradeColorIndex = schoolGrades.indexOf(schoolClass.grade);
                const gradeHue = Math.round((gradeColorIndex * 360) / schoolGrades.length);
                return (
                  <li
                    className="class-list-item"
                    key={schoolClass.id}
                    style={{
                      backgroundColor: `hsl(${gradeHue} 64% 94%)`,
                      borderColor: `hsl(${gradeHue} 48% 78%)`,
                    }}
                  >
                    <button
                      aria-label={`Ver detalhes da turma ${schoolClass.name}, ${schoolClass.grade}, ${schoolClass.year}`}
                      className="class-card-button"
                      onClick={() => openClassDetails(schoolClass)}
                      type="button"
                    >
                      <span
                        className="class-list-icon"
                        aria-hidden="true"
                        style={{
                          backgroundColor: `hsl(${gradeHue} 62% 78%)`,
                          color: `hsl(${gradeHue} 48% 30%)`,
                        }}
                      >
                        ▦
                      </span>
                      <span className="class-list-copy">
                        <strong>Turma {schoolClass.name}</strong>
                        <small>{schoolClass.grade} · Ano letivo {schoolClass.year}</small>
                      </span>
                      <span className="class-list-tag">
                        {schoolClass.students?.length ?? 0} alunos
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </>
  );
}
