"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { EntryFormDialog } from "../entry-form-dialog";
import type { SchoolClass } from "../turmas/class-form";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const weekdays = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

export interface ScheduleRecord {
  id: string;
  classId: string;
  classLabel: string;
  year: number;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  teacherId: string | null;
  teacherName: string | null;
}

export interface ScheduleTeacher {
  id: string;
  displayName: string;
  status: "active" | "inactive" | "pending";
  classes: SchoolClass[];
}

interface ScheduleManagementProps {
  initialSchedules: ScheduleRecord[];
  classes: SchoolClass[];
  teachers: ScheduleTeacher[];
}

function sortSchedules(schedules: ScheduleRecord[]) {
  return [...schedules].sort(
    (left, right) =>
      left.dayOfWeek - right.dayOfWeek ||
      left.startsAt.localeCompare(right.startsAt) ||
      left.classLabel.localeCompare(right.classLabel),
  );
}

export function ScheduleManagement({
  initialSchedules,
  classes,
  teachers,
}: ScheduleManagementProps) {
  const [schedules, setSchedules] = useState(() => sortSchedules(initialSchedules));
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("08:50");
  const [subject, setSubject] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const eligibleTeachers = teachers.filter(
    (teacher) =>
      teacher.status === "active" &&
      teacher.classes.some((assignedClass) => assignedClass.id === classId),
  );
  const pendingTeachersForClass = teachers.filter(
    (teacher) =>
      teacher.status === "pending" &&
      teacher.classes.some((assignedClass) => assignedClass.id === classId),
  );
  const editingSchedule = schedules.find((schedule) => schedule.id === editingScheduleId);

  function resetForm() {
    setEditingScheduleId(null);
    setIsFormOpen(false);
    setClassId(classes[0]?.id ?? "");
    setDayOfWeek("1");
    setStartsAt("08:00");
    setEndsAt("08:50");
    setSubject("");
    setTeacherId("");
  }

  function editSchedule(schedule: ScheduleRecord) {
    setEditingScheduleId(schedule.id);
    setClassId(schedule.classId);
    setDayOfWeek(String(schedule.dayOfWeek));
    setStartsAt(schedule.startsAt);
    setEndsAt(schedule.endsAt);
    setSubject(schedule.subject);
    setTeacherId(schedule.teacherId ?? "");
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  function startNewSchedule() {
    resetForm();
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch(
        `${apiUrl}/schedules${editingScheduleId ? `/${editingScheduleId}` : ""}`,
        {
        method: editingScheduleId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          dayOfWeek: Number(dayOfWeek),
          startsAt,
          endsAt,
          subject,
          teacherId: teacherId || null,
        }),
        },
      );
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível salvar o horário.");
        return;
      }

      const saved = (await response.json()) as ScheduleRecord;
      const wasEditing = Boolean(editingScheduleId);
      setSchedules((current) =>
        sortSchedules([
          ...current.filter((item) => item.id !== saved.id),
          saved,
        ]),
      );
      resetForm();
      setMessage(wasEditing ? "Aula atualizada no horário semanal." : "Aula adicionada ao horário semanal.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeSchedule(schedule: ScheduleRecord) {
    if (!window.confirm(`Remover ${schedule.subject} da turma ${schedule.classLabel}?`)) {
      return;
    }
    setError("");
    setMessage("");
    setDeletingId(schedule.id);
    try {
      const response = await fetch(`${apiUrl}/schedules/${schedule.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível remover o horário.");
        return;
      }
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      setMessage("Aula removida do horário.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <>
      <section className="class-panel student-create-panel" aria-labelledby="schedule-create-heading">
        <div className="student-create-copy">
          <div className="setup-icon" aria-hidden="true">◷</div>
          <div>
            <p className="card-kicker">ROTINA DA TURMA</p>
            <h2 id="schedule-create-heading">Horários semanais</h2>
            <p>Organize aulas por turma, disciplina, dia e professor.</p>
          </div>
        </div>
        <button
          className="class-submit student-create-button"
          disabled={classes.length === 0}
          onClick={startNewSchedule}
          type="button"
        >
          + Novo horário
        </button>
        {classes.length === 0 && (
          <p className="student-create-hint">Cadastre uma turma antes de criar horários. <Link href="/turmas">Ir para Turmas</Link></p>
        )}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
      </section>

      {isFormOpen && (
        <EntryFormDialog
          description="Os horários se repetem toda semana e não podem se sobrepor na mesma turma ou para o mesmo professor."
          eyebrow="ROTINA DA TURMA"
          icon="◷"
          isBusy={submitting}
          onClose={() => setIsFormOpen(false)}
          title={editingScheduleId ? "Edite a aula" : "Adicione uma aula"}
          titleId="create-schedule-title"
        >
          {classes.length === 0 ? (
            <p>Nenhuma turma disponível.</p>
          ) : (
            <form className="schedule-form" onSubmit={saveSchedule}>
            <label>
              Turma
              <select
                onChange={(event) => {
                  setClassId(event.target.value);
                  setTeacherId("");
                }}
                required
                value={classId}
              >
                {classes.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.grade} · Turma {schoolClass.name} · {schoolClass.year}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dia da semana
              <select
                onChange={(event) => setDayOfWeek(event.target.value)}
                value={dayOfWeek}
              >
                {weekdays.map((weekday, index) => (
                  <option key={weekday} value={index + 1}>{weekday}</option>
                ))}
              </select>
            </label>
            <label>
              Disciplina ou atividade
              <input
                maxLength={80}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Ex.: Matemática"
                required
                value={subject}
              />
            </label>
            <label>
              Professor (opcional)
              <select
                onChange={(event) => setTeacherId(event.target.value)}
                value={teacherId}
              >
                <option value="">Sem professor atribuído</option>
                {eligibleTeachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>
                ))}
                {editingSchedule?.teacherId &&
                  !eligibleTeachers.some((teacher) => teacher.id === editingSchedule.teacherId) && (
                    <option value={editingSchedule.teacherId}>
                      {editingSchedule.teacherName ?? "Professor atual"}
                    </option>
                  )}
              </select>
            </label>
            {eligibleTeachers.length === 0 && (
              <div className="schedule-teacher-notice" role="status">
                <span>
                  Nenhum professor ativo atribuído a esta turma.
                  {pendingTeachersForClass.length > 0 &&
                    ` ${pendingTeachersForClass.length} convite(s) pendente(s) aparecerá(ão) após a ativação.`}
                </span>
                <Link href="/professores">Ver professores</Link>
              </div>
            )}
            <label>
              Início
              <input
                onChange={(event) => setStartsAt(event.target.value)}
                required
                type="time"
                value={startsAt}
              />
            </label>
            <label>
              Fim
              <input
                onChange={(event) => setEndsAt(event.target.value)}
                required
                type="time"
                value={endsAt}
              />
            </label>
            <div className="schedule-form-actions">
              <button className="class-submit schedule-submit" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : editingScheduleId ? "Salvar alterações" : "Adicionar ao horário"}
              </button>
              {editingScheduleId && (
                <button
                  className="schedule-cancel-edit"
                  disabled={submitting}
                  onClick={resetForm}
                  type="button"
                >
                  Cancelar
                </button>
              )}
            </div>
            </form>
          )}
          {error && <p className="form-message form-error" role="alert">{error}</p>}
        </EntryFormDialog>
      )}

      <section className="class-list-panel" aria-labelledby="schedule-list-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">SEMANA ESCOLAR</p>
            <h2 id="schedule-list-title">Horários cadastrados</h2>
          </div>
          <span className="class-count">{schedules.length}</span>
        </div>
        {schedules.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">☀</span>
            <strong>A semana ainda está livre</strong>
            <p>Adicione a primeira aula para organizar a rotina da turma.</p>
          </div>
        ) : (
          <div className="schedule-week">
            {weekdays.map((weekday, index) => {
              const daySchedules = schedules.filter((item) => item.dayOfWeek === index + 1);
              if (daySchedules.length === 0) {
                return null;
              }
              return (
                <section className="schedule-day" key={weekday} aria-labelledby={`weekday-${index + 1}`}>
                  <h3 id={`weekday-${index + 1}`}>{weekday}</h3>
                  <ul className="schedule-day-list">
                    {daySchedules.map((schedule) => (
                      <li className="schedule-slot" key={schedule.id}>
                        <time className="schedule-time" dateTime={schedule.startsAt}>
                          <strong>{schedule.startsAt}</strong>
                          <span>{schedule.endsAt}</span>
                        </time>
                        <span className="schedule-slot-icon" aria-hidden="true">✿</span>
                        <span className="schedule-slot-copy">
                          <strong>{schedule.subject}</strong>
                          <small>{schedule.classLabel} · {schedule.year}</small>
                          <small>{schedule.teacherName ?? "Professor não definido"}</small>
                        </span>
                        <span className="schedule-actions">
                          <button
                            aria-label={`Editar ${schedule.subject} de ${schedule.classLabel}`}
                            className="schedule-edit"
                            disabled={Boolean(deletingId) || submitting}
                            onClick={() => editSchedule(schedule)}
                            type="button"
                          >
                            Editar
                          </button>
                          <button
                            aria-label={`Remover ${schedule.subject} de ${schedule.classLabel}`}
                            className="schedule-remove"
                            disabled={Boolean(deletingId) || submitting}
                            onClick={() => removeSchedule(schedule)}
                            type="button"
                          >
                            {deletingId === schedule.id ? "..." : "Remover"}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
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
  if (response.status === 401) {
    setError("Sua sessão expirou. Entre novamente para continuar.");
  } else if (response.status === 403) {
    setError("Somente a administração pode alterar horários.");
  } else if (response.status === 429) {
    setError("Muitas tentativas. Aguarde um momento e tente novamente.");
  } else {
    const result = await response.json().catch(() => null);
    setError(typeof result?.message === "string" ? result.message : fallback);
  }
}
