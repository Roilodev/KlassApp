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
  session?: "morning" | "afternoon";
  students?: Array<{ id: string; fullName: string }>;
  teachers?: Array<{ id: string; fullName: string }>;
}

export interface ClassSessionPeriod {
  startsAt: string;
  endsAt: string;
}

export interface SchoolClassSessions {
  morning: ClassSessionPeriod[];
  afternoon: ClassSessionPeriod[];
}

export interface ClassSchedule {
  id: string;
  classId: string;
  classLabel: string;
  subjectId: string;
  teacherId: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  teacherName: string | null;
}

export interface ClassSubject {
  id: string;
  name: string;
  weeklyFrequency: number | null;
}

export interface ClassScheduleTeacher {
  id: string;
  displayName: string;
  status: "active" | "inactive" | "pending";
  classes: SchoolClass[];
  subjectIds: string[];
}

interface ClassFormProps {
  initialClasses: SchoolClass[];
  initialSchedules: ClassSchedule[];
  subjects: ClassSubject[];
  teachers: ClassScheduleTeacher[];
  recess: SchoolRecess;
  classSessions: SchoolClassSessions;
}

interface SessionTeacherConflict {
  scheduleId: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  teacherName: string;
  conflictingClass: string;
  conflictingSubject: string;
  dayOfWeek: number;
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

function scheduleTimesOverlap(
  firstStartsAt: string,
  firstEndsAt: string,
  secondStartsAt: string,
  secondEndsAt: string,
) {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  return toMinutes(firstStartsAt) < toMinutes(secondEndsAt) &&
    toMinutes(secondStartsAt) < toMinutes(firstEndsAt);
}

function normalizeScheduleTime(time: string) {
  return time.slice(0, 5);
}

function isDeletedScheduleSlot(
  slot: { classId: string; dayOfWeek: number; startsAt: string; endsAt: string },
  classId: string,
  dayOfWeek: number,
  startsAt: string,
  endsAt: string,
) {
  return slot.classId === classId &&
  Number(slot.dayOfWeek) === dayOfWeek &&
  normalizeScheduleTime(slot.startsAt) === normalizeScheduleTime(startsAt) &&
  normalizeScheduleTime(slot.endsAt) === normalizeScheduleTime(endsAt);
}

export function ClassForm({
  initialClasses,
  initialSchedules,
  subjects,
  teachers,
  recess,
  classSessions,
}: ClassFormProps) {
  const [classes, setClasses] = useState(initialClasses);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [teacherRecords, setTeacherRecords] = useState(teachers);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [grade, setGrade] = useState("");
  const [name, setName] = useState("");
  const [session, setSession] = useState<"morning" | "afternoon">("morning");
  const [error, setError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);
  const [deletedSlots, setDeletedSlots] = useState<Array<{
    classId: string;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
  }>>([]);
  const [addingSlot, setAddingSlot] = useState<{
    classId: string;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  const [addSubjectId, setAddSubjectId] = useState("");
  const [addTeacherId, setAddTeacherId] = useState("");
  const [newTeacherId, setNewTeacherId] = useState("");
  const [assigningTeacher, setAssigningTeacher] = useState(false);
  const [teacherAssignmentNotice, setTeacherAssignmentNotice] = useState("");
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [scheduleClassId, setScheduleClassId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const selectedClass = classes.find((schoolClass) => schoolClass.id === selectedClassId);
  const scheduleClass = classes.find((schoolClass) => schoolClass.id === scheduleClassId);
  const scheduleRows = scheduleClass
    ? schedules.filter(
      (schedule) =>
        schedule.classId === scheduleClass.id &&
        Number(schedule.dayOfWeek) >= 1 &&
        Number(schedule.dayOfWeek) <= weekdays.length,
    )
    : [];
  const scheduleFrequencySummary = subjects.flatMap((subject) => {
    if (subject.weeklyFrequency === null) {
      return [];
    }
    const scheduledLessons = scheduleRows.filter((schedule) => schedule.subjectId === subject.id).length;
    const difference = subject.weeklyFrequency - scheduledLessons;
    return difference === 0 ? [] : [{ id: subject.id, name: subject.name, difference }];
  });
  const scheduleMatchesAllFrequencies = subjects.length > 0 &&
    subjects.every((subject) =>
      subject.weeklyFrequency !== null &&
      scheduleRows.filter((schedule) => schedule.subjectId === subject.id).length === subject.weeklyFrequency,
    ) &&
    scheduleRows.every((schedule) => subjects.some((subject) => subject.id === schedule.subjectId));
  const selectedSubjectForNewLesson = subjects.find((subject) => subject.id === addSubjectId);
  const projectedLessonCount = selectedSubjectForNewLesson
    ? scheduleRows.filter((schedule) => schedule.subjectId === selectedSubjectForNewLesson.id).length + 1
    : 0;
  const projectedLessonDifference = selectedSubjectForNewLesson?.weeklyFrequency === null ||
    selectedSubjectForNewLesson?.weeklyFrequency === undefined
    ? null
    : selectedSubjectForNewLesson.weeklyFrequency - projectedLessonCount;
  const sessionPeriods = scheduleClass
    ? classSessions[scheduleClass.session ?? "morning"]
    : [];
  const classRecess = scheduleClass?.session === "afternoon"
    ? { startsAt: recess.afternoonStartsAt, endsAt: recess.afternoonEndsAt }
    : { startsAt: recess.startsAt, endsAt: recess.endsAt };
  const scheduleTimes = new Set(
    scheduleRows.map(
      (schedule) =>
        `${normalizeScheduleTime(schedule.startsAt)}|${normalizeScheduleTime(schedule.endsAt)}`,
    ),
  );
  for (const period of sessionPeriods) {
    scheduleTimes.add(`${period.startsAt}|${period.endsAt}`);
  }
  for (const slot of deletedSlots) {
    if (slot.classId === scheduleClass?.id) {
      scheduleTimes.add(
        `${normalizeScheduleTime(slot.startsAt)}|${normalizeScheduleTime(slot.endsAt)}`,
      );
    }
  }
  const availableTeachers = addingSlot
    ? teacherRecords.filter(
      (teacher) =>
        teacher.status === "active" &&
        teacher.classes.some((assignedClass) => assignedClass.id === addingSlot.classId) &&
        teacher.subjectIds.some((subjectId) => subjects.some((subject) => subject.id === subjectId)) &&
        !schedules.some(
          (schedule) =>
            schedule.teacherId === teacher.id &&
            schedule.dayOfWeek === addingSlot.dayOfWeek &&
            scheduleTimesOverlap(
              schedule.startsAt,
              schedule.endsAt,
              addingSlot.startsAt,
              addingSlot.endsAt,
            ),
        ),
    )
    : [];
  const teachersOutsideClass = addingSlot
    ? teacherRecords.filter(
      (teacher) =>
        (teacher.status === "active" || teacher.status === "pending") &&
        !teacher.classes.some((assignedClass) => assignedClass.id === addingSlot.classId),
    )
    : [];
  const selectedTeacherConflicts = addingSlot && addTeacherId
    ? schedules.filter(
      (schedule) =>
        schedule.teacherId === addTeacherId &&
        schedule.dayOfWeek === addingSlot.dayOfWeek &&
        scheduleTimesOverlap(
          schedule.startsAt,
          schedule.endsAt,
          addingSlot.startsAt,
          addingSlot.endsAt,
        ),
    )
    : [];
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
  if (classRecess.startsAt && classRecess.endsAt) {
    scheduleTimes.add(`${classRecess.startsAt}|${classRecess.endsAt}`);
  }
  const schoolGrades = [...new Set(classes.map((schoolClass) => schoolClass.grade))].sort(
    (left, right) => left.localeCompare(right),
  );

  function resetForm() {
    setEditingClassId(null);
    setYear(String(new Date().getFullYear()));
    setGrade("");
    setName("");
    setSession("morning");
  }

  function editClass(schoolClass: SchoolClass) {
    setEditingClassId(schoolClass.id);
    setYear(String(schoolClass.year));
    setGrade(schoolClass.grade);
    setName(schoolClass.name);
    setSession(schoolClass.session ?? "morning");
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

  async function removeSchedule(schedule: ClassSchedule) {
    if (!window.confirm(`Remover ${schedule.subject} do horário semanal desta turma?`)) {
      return;
    }

    setScheduleError("");
    setDeletingScheduleId(schedule.id);
    try {
      const response = await fetch(`${apiUrl}/schedules/${schedule.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) {
          setScheduleError("Sua sessão expirou. Entre novamente para continuar.");
        } else if (response.status === 403) {
          setScheduleError("Somente a administração pode remover horários.");
        } else if (response.status === 429) {
          setScheduleError("Muitas tentativas. Aguarde um momento e tente novamente.");
        } else {
          const result = await response.json().catch(() => null);
          setScheduleError(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível remover a aula.",
          );
        }
        return;
      }

      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      setDeletedSlots((current) => [
        ...current.filter(
          (slot) =>
            !isDeletedScheduleSlot(
              slot,
              scheduleClass?.id ?? schedule.classId,
              schedule.dayOfWeek,
              schedule.startsAt,
              schedule.endsAt,
            ),
        ),
        {
          classId: scheduleClass?.id ?? schedule.classId,
          dayOfWeek: Number(schedule.dayOfWeek),
          startsAt: normalizeScheduleTime(schedule.startsAt),
          endsAt: normalizeScheduleTime(schedule.endsAt),
        },
      ]);
    } catch {
      setScheduleError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setDeletingScheduleId(null);
    }
  }

  async function openAddSchedule(dayOfWeek: number, startsAt: string, endsAt: string) {
    if (!scheduleClass) {
      return;
    }

    setScheduleError("");
    setAddSubjectId("");
    setAddTeacherId("");
    setNewTeacherId("");
    setTeacherAssignmentNotice("");
    setAddingSlot({
      classId: scheduleClass.id,
      dayOfWeek,
      startsAt,
      endsAt,
    });

    setLoadingTeachers(true);
    try {
      const response = await fetch(`${apiUrl}/teachers`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setScheduleError(
          typeof result?.message === "string"
            ? result.message
            : "Não foi possível atualizar a lista de professores.",
        );
        return;
      }
      setTeacherRecords(await response.json() as ClassScheduleTeacher[]);
    } catch {
      setScheduleError("Não foi possível conectar à KlassApp para atualizar os professores.");
    } finally {
      setLoadingTeachers(false);
    }
  }

  async function assignTeacherToClass(teacherId: string) {
    if (!addingSlot || !scheduleClass || !teacherId) {
      return;
    }

    const teacher = teacherRecords.find((item) => item.id === teacherId);
    if (!teacher) {
      setScheduleError("Não foi possível encontrar o professor selecionado.");
      return;
    }

    setScheduleError("");
    setTeacherAssignmentNotice("");
    setAssigningTeacher(true);
    try {
      const response = await fetch(`${apiUrl}/teachers/${teacher.id}/classes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: addingSlot.classId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setScheduleError(
          typeof result?.message === "string"
            ? result.message
            : "Não foi possível adicionar o professor à turma.",
        );
        return;
      }

      const result = await response.json() as {
        assigned: boolean;
        status: "active" | "pending";
      };
      const locallyAssignedTeacher = {
        ...teacher,
        classes: teacher.classes.some((assignedClass) => assignedClass.id === addingSlot.classId)
          ? teacher.classes
          : [...teacher.classes, scheduleClass],
      };
      setTeacherRecords((current) => current.map((item) =>
        item.id === teacher.id ? locallyAssignedTeacher : item,
      ));

      try {
        const teachersResponse = await fetch(`${apiUrl}/teachers`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!teachersResponse.ok) {
          setScheduleError(
            "O professor foi vinculado, mas não foi possível atualizar a lista. Feche e reabra o horário.",
          );
        } else {
          const updatedTeachers = await teachersResponse.json() as ClassScheduleTeacher[];
          setTeacherRecords(updatedTeachers);
          if (!updatedTeachers.some((item) =>
            item.id === teacher.id &&
            item.classes.some((assignedClass) => assignedClass.id === addingSlot.classId),
          )) {
            setScheduleError(
              "O professor foi vinculado, mas não apareceu na lista atualizada. Feche e reabra o horário.",
            );
          }
        }
      } catch {
        setScheduleError(
          "O professor foi vinculado, mas não foi possível atualizar a lista. Feche e reabra o horário.",
        );
      }

      if (result.status === "active") {
        setAddTeacherId(teacher.id);
        setAddSubjectId(
          teacher.subjectIds.find((id) => subjects.some((subject) => subject.id === id)) ?? "",
        );
      } else {
        setAddTeacherId("");
        setAddSubjectId("");
      }

      const conflicts = schedules.filter(
        (schedule) =>
          schedule.teacherId === teacher.id &&
          schedule.dayOfWeek === addingSlot.dayOfWeek &&
          scheduleTimesOverlap(
            schedule.startsAt,
            schedule.endsAt,
            addingSlot.startsAt,
            addingSlot.endsAt,
          ),
      );
      setTeacherAssignmentNotice(
        result.status === "pending"
          ? `${teacher.displayName} foi vinculado(a) à turma. O convite ainda está pendente; após a ativação, será possível verificar a disponibilidade e adicioná-lo(a) ao horário.`
          : conflicts.length > 0
          ? `${teacher.displayName} foi adicionado(a) à turma, mas não está disponível neste horário.`
          : result.assigned
            ? `${teacher.displayName} foi adicionado(a) à turma e está disponível neste horário.`
            : `${teacher.displayName} já pertence à turma e está disponível neste horário.`,
      );
    } catch {
      setScheduleError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setAssigningTeacher(false);
      setNewTeacherId("");
    }
  }

  async function addSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addingSlot) {
      return;
    }

    setScheduleError("");
    setAddingSchedule(true);
    try {
      const response = await fetch(`${apiUrl}/schedules`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addingSlot,
          subjectId: addSubjectId,
          teacherId: addTeacherId || null,
        }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setScheduleError("Sua sessão expirou. Entre novamente para continuar.");
        } else if (response.status === 403) {
          setScheduleError("Somente a administração pode adicionar horários.");
        } else if (response.status === 429) {
          setScheduleError("Muitas tentativas. Aguarde um momento e tente novamente.");
        } else {
          const result = await response.json().catch(() => null);
          setScheduleError(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível adicionar a aula.",
          );
        }
        return;
      }

      const saved = (await response.json()) as ClassSchedule;
      setSchedules((current) => [...current, saved]);
      setDeletedSlots((current) =>
        current.filter(
          (slot) =>
            slot.classId !== addingSlot.classId ||
            slot.dayOfWeek !== addingSlot.dayOfWeek ||
            slot.startsAt !== addingSlot.startsAt ||
            slot.endsAt !== addingSlot.endsAt,
        ),
      );
      setAddingSlot(null);
    } catch {
      setScheduleError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setAddingSchedule(false);
    }
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const classBeingEdited = classes.find((item) => item.id === editingClassId);
    let confirmedScheduleChanges: Array<{
      id: string;
      startsAt: string;
      endsAt: string;
      teacherId: string | null;
    }> = [];
    if (classBeingEdited && (classBeingEdited.session ?? "morning") !== session) {
      const classSchedules = schedules.filter((item) => item.classId === classBeingEdited.id);
      if (classSchedules.length > 0) {
        const sourcePeriods = classSessions[classBeingEdited.session ?? "morning"];
        const targetPeriods = classSessions[session];
        const countsByPeriod = new Map<number, number>();
        confirmedScheduleChanges = [];

        for (const schedule of classSchedules) {
          const sourceIndex = sourcePeriods.findIndex(
            (period) =>
              period.startsAt === normalizeScheduleTime(schedule.startsAt) &&
              period.endsAt === normalizeScheduleTime(schedule.endsAt),
          );
          const targetPeriod = sourceIndex >= 0 ? targetPeriods[sourceIndex] : undefined;
          if (!targetPeriod) {
            setError(
              "Não é possível trocar a sessão: configure turnos correspondentes para todas as aulas desta turma.",
            );
            return;
          }
          countsByPeriod.set(sourceIndex, (countsByPeriod.get(sourceIndex) ?? 0) + 1);
          confirmedScheduleChanges.push({
            id: schedule.id,
            startsAt: targetPeriod.startsAt,
            endsAt: targetPeriod.endsAt,
            teacherId: schedule.teacherId,
          });
        }

        const sessionNames = { morning: "Manhã", afternoon: "Tarde" };
        const movementSummary = [...countsByPeriod.entries()]
          .sort(([left], [right]) => left - right)
          .map(([index, count]) => {
            const source = sourcePeriods[index];
            const target = targetPeriods[index];
            return `${count} aula(s): ${source.startsAt}–${source.endsAt} → ${target.startsAt}–${target.endsAt}`;
          })
          .join("\n");
        const confirmed = window.confirm(
          `A turma mudará de ${sessionNames[classBeingEdited.session ?? "morning"]} para ${sessionNames[session]}.\n\n` +
          `${classSchedules.length} aula(s) serão movidas, mantendo matéria e professor:\n${movementSummary}\n\n` +
          "Deseja continuar?",
        );
        if (!confirmed) {
          return;
        }
      }
    }

    setSubmitting(true);

    try {
      const requestUrl = `${apiUrl}/school-structure/classes${editingClassId ? `/${editingClassId}` : ""}`;
      const requestBody = {
        year: Number(year),
        grade,
        name,
        session,
      };
      let response = await fetch(requestUrl, {
        method: editingClassId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null) as {
          code?: unknown;
          message?: unknown;
          conflicts?: unknown;
        } | null;
        if (
          response.status === 409 &&
          result?.code === "SESSION_TEACHER_CONFLICT" &&
          Array.isArray(result.conflicts)
        ) {
          const conflicts = result.conflicts as SessionTeacherConflict[];
          const conflictDetails = conflicts.map((conflict) =>
            `${weekdays[conflict.dayOfWeek - 1] ?? `Dia ${conflict.dayOfWeek}`} ` +
            `${conflict.startsAt}–${conflict.endsAt}: ${conflict.subject} ` +
            `(${conflict.teacherName}) conflita com ${conflict.conflictingSubject} ` +
            `em ${conflict.conflictingClass}`,
          ).join("\n");
          const confirmed = window.confirm(
            `Há ${conflicts.length} conflito(s) de horário com professores:\n\n${conflictDetails}\n\n` +
            "Deseja continuar deixando sem professor somente as aulas afetadas?",
          );
          if (!confirmed) {
            setError("Alteração cancelada. A sessão e as aulas não foram modificadas.");
            return;
          }
          response = await fetch(requestUrl, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...requestBody,
              allowTeacherConflictsWithoutTeacher: true,
              confirmedTeacherConflictScheduleIds: [
                ...new Set(conflicts.map((conflict) => conflict.scheduleId)),
              ],
            }),
          });
        } else {
          if (response.status === 401) {
            setError("Sua sessão expirou. Entre novamente para continuar.");
          } else if (response.status === 403) {
            setError("Somente a administração pode alterar turmas.");
          } else if (response.status === 429) {
            setError("Muitas tentativas. Aguarde um momento e tente novamente.");
          } else {
            setError(
              typeof result?.message === "string"
                ? result.message
                : "Não foi possível salvar a turma.",
            );
          }
          return;
        }
      }

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

      const responseData = (await response.json()) as SchoolClass & {
        rescheduledSchedules?: Array<{
          id: string;
          startsAt: string;
          endsAt: string;
          teacherId: string | null;
        }>;
      };
      const { rescheduledSchedules = [], ...savedClass } = responseData;
      const existingClass = classes.find((item) => item.id === savedClass.id);
      const updatedClass = {
        ...savedClass,
        students: savedClass.students ?? existingClass?.students ?? [],
      };
      setClasses((current) => [
        updatedClass,
        ...current.filter((item) => item.id !== updatedClass.id),
      ].sort((a, b) => b.year - a.year || a.grade.localeCompare(b.grade) || a.name.localeCompare(b.name)));
      const scheduleChanges = new Map(
        (rescheduledSchedules.length > 0
          ? rescheduledSchedules
          : confirmedScheduleChanges)
          .map((change) => [change.id, change]),
      );
      if (scheduleChanges.size > 0) {
        setSchedules((current) =>
          current.map((item) => {
            const change = scheduleChanges.get(item.id);
            return change
              ? {
                ...item,
                startsAt: change.startsAt,
                endsAt: change.endsAt,
                teacherId: change.teacherId,
                teacherName: change.teacherId ? item.teacherName : null,
              }
              : item;
          }),
        );
      }
      const wasEditing = Boolean(editingClassId);
      resetForm();
      const unassignedSchedules = [...scheduleChanges.values()].filter(
        (change) => change.teacherId === null &&
          schedules.find((item) => item.id === change.id)?.teacherId,
      ).length;
      setSuccess(
        unassignedSchedules > 0
          ? `Turma atualizada. ${scheduleChanges.size} aula(s) movida(s) e ${unassignedSchedules} deixada(s) sem professor.`
          : scheduleChanges.size > 0
            ? `Turma atualizada e ${scheduleChanges.size} aula(s) movida(s) para a nova sessão.`
          : wasEditing ? "Turma atualizada com sucesso." : "Turma cadastrada com sucesso.",
      );
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
            <label>
              Sessão
              <select
                onChange={(event) => setSession(event.target.value as "morning" | "afternoon")}
                value={session}
              >
                <option value="morning">Manhã</option>
                <option value="afternoon">Tarde</option>
              </select>
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
          description={`Ano letivo ${selectedClass.year} · Sessão ${selectedClass.session === "afternoon" ? "Tarde" : "Manhã"}`}
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

      {scheduleClass && !addingSlot && (
        <EntryFormDialog
          description={`Distribuição semanal de ${scheduleClass.grade} · Turma ${scheduleClass.name} · ${scheduleClass.year}.`}
          eyebrow="SEMANA ESCOLAR"
          icon="◷"
          isBusy={Boolean(deletingScheduleId)}
          onClose={() => {
            setScheduleError("");
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
            {scheduleError && <p className="form-message form-error" role="alert">{scheduleError}</p>}
            {scheduleRows.length === 0 &&
            sessionPeriods.length === 0 &&
            !classRecess.startsAt &&
            !deletedSlots.some((slot) => slot.classId === scheduleClass.id) ? (
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
                                Number(item.dayOfWeek) === index + 1 &&
                                normalizeScheduleTime(item.startsAt) === startsAt &&
                                normalizeScheduleTime(item.endsAt) === endsAt,
                            );
                            const isRecess = classRecess.startsAt === startsAt &&
                              classRecess.endsAt === endsAt;
                            const isSessionPeriod = sessionPeriods.some(
                              (period) => period.startsAt === startsAt && period.endsAt === endsAt,
                            );

                            if (isRecess) {
                              return (
                                <td className="weekly-schedule-recess" key={weekday}>
                                  <strong>Recreio escolar</strong>
                                  <span>Intervalo de descanso</span>
                                </td>
                              );
                            }
                            return schedule ? (
                              <td className="weekly-schedule-lesson" key={weekday}>
                                <button
                                  aria-label={`Remover aula de ${schedule.subject}, ${weekday} às ${schedule.startsAt}`}
                                  className="weekly-schedule-remove"
                                  disabled={Boolean(deletingScheduleId)}
                                  onClick={() => void removeSchedule(schedule)}
                                  title="Remover aula"
                                  type="button"
                                >
                                  {deletingScheduleId === schedule.id ? "…" : "×"}
                                </button>
                                <strong>{schedule.subject}</strong>
                                <span>{schedule.teacherName ?? "Professor não definido"}</span>
                              </td>
                            ) : (
                              <td
                                className="weekly-schedule-empty"
                                key={weekday}
                                aria-label={`${weekday}: sem aula`}
                              >
                                {isSessionPeriod && (
                                  <button
                                    aria-label={`Adicionar aula, ${weekday} às ${startsAt}`}
                                    className="weekly-schedule-add"
                                    disabled={Boolean(deletingScheduleId)}
                                    onClick={() => void openAddSchedule(index + 1, startsAt, endsAt)}
                                    title="Adicionar aula a este turno"
                                    type="button"
                                  >
                                    +
                                  </button>
                                )}
                              </td>
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
              {scheduleFrequencySummary.length > 0 ? (
                <ul className="weekly-schedule-frequency" aria-label="Matérias a ajustar" aria-live="polite">
                  {scheduleFrequencySummary.map((subject) => (
                    <li key={subject.id}>
                      {subject.name} ({subject.difference > 0 ? "+" : ""}{subject.difference})
                    </li>
                  ))}
                </ul>
              ) : scheduleMatchesAllFrequencies ? (
                <p className="weekly-schedule-frequency-status" aria-live="polite">
                  O horário corresponde às frequências semanais de todas as matérias.
                </p>
              ) : null}
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

      {scheduleClass && addingSlot && (
        <EntryFormDialog
          description={`${weekdays[addingSlot.dayOfWeek - 1]} · ${addingSlot.startsAt}–${addingSlot.endsAt} · ${scheduleClass.grade}, Turma ${scheduleClass.name}.`}
          eyebrow="SEMANA ESCOLAR"
          icon="◷"
          isBusy={addingSchedule}
          onClose={() => {
            setAddingSlot(null);
            setScheduleError("");
          }}
          title="Adicionar aula"
          titleId="add-schedule-title"
        >
          {scheduleError && <p className="form-message form-error" role="alert">{scheduleError}</p>}
          {subjects.length === 0 ? (
            <>
              <p className="class-details-empty">Cadastre uma matéria antes de adicionar aulas ao horário.</p>
              <div className="dialog-form-actions">
                <button
                  className="class-cancel-edit"
                  onClick={() => {
                    setAddingSlot(null);
                    setScheduleError("");
                  }}
                  type="button"
                >
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <form className="schedule-form" onSubmit={addSchedule}>
              <section className="schedule-available-teachers" aria-label="Professores disponíveis">
                <h3>Professores da turma disponíveis neste horário</h3>
                <p>Escolha a matéria já atribuída ao professor para adicioná-lo à aula.</p>
                {loadingTeachers ? (
                  <p className="class-details-empty" role="status">Atualizando professores e matérias...</p>
                ) : availableTeachers.length > 0 ? (
                  <ul>
                    {availableTeachers.map((teacher) => (
                      <li key={teacher.id}>
                        <strong>{teacher.displayName}</strong>
                        <div className="schedule-subject-options">
                          {teacher.subjectIds.map((subjectId) => {
                            const subject = subjects.find((item) => item.id === subjectId);
                            if (!subject) {
                              return null;
                            }
                            const isSelected =
                              addTeacherId === teacher.id && addSubjectId === subject.id;
                            return (
                              <button
                                aria-pressed={isSelected}
                                className={isSelected ? "schedule-subject-option selected" : "schedule-subject-option"}
                                disabled={addingSchedule}
                                key={subject.id}
                                onClick={() => {
                                  setAddTeacherId(teacher.id);
                                  setAddSubjectId(subject.id);
                                }}
                                type="button"
                              >
                                {subject.name}
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="class-details-empty">Nenhum professor da turma está disponível neste horário.</p>
                )}
              </section>
              <label className="schedule-add-teacher">
                Adicionar professor à turma
                <select
                  disabled={loadingTeachers || assigningTeacher || addingSchedule || teachersOutsideClass.length === 0}
                  onChange={(event) => {
                    setNewTeacherId(event.target.value);
                    void assignTeacherToClass(event.target.value);
                  }}
                  value={newTeacherId}
                >
                  <option value="">
                    {teachersOutsideClass.length > 0
                        ? "Selecione um professor ou convite que ainda não pertence à turma"
                        : "Todos os professores e convites já pertencem à turma"}
                  </option>
                  {teachersOutsideClass.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.displayName}{teacher.status === "pending" ? " · Convite pendente" : ""}
                      </option>
                    ))}
                </select>
              </label>
              {assigningTeacher && (
                <p className="schedule-teacher-notice" role="status">
                  Adicionando professor à turma e verificando disponibilidade...
                </p>
              )}
              {teacherAssignmentNotice && (
                <p
                  className={selectedTeacherConflicts.length > 0
                    ? "schedule-teacher-conflict"
                    : "schedule-teacher-assigned"}
                  role={selectedTeacherConflicts.length > 0 ? "alert" : "status"}
                >
                  {teacherAssignmentNotice}
                </p>
              )}
              {selectedTeacherConflicts.length > 0 && (
                <div className="schedule-teacher-conflict" role="alert">
                  <span>Esta pessoa já tem aula:</span>
                  <ul>
                    {selectedTeacherConflicts.map((schedule) => (
                      <li key={schedule.id}>
                        {weekdays[schedule.dayOfWeek - 1]} · {schedule.startsAt}–{schedule.endsAt}
                        {schedule.classLabel ? ` · ${schedule.classLabel}` : ""} · {schedule.subject}
                      </li>
                    ))}
                  </ul>
                  <span>O professor foi vinculado à turma, mas não pode assumir esta aula neste horário.</span>
                </div>
              )}
              {selectedSubjectForNewLesson && (
                projectedLessonDifference !== null &&
                projectedLessonDifference !== 0 && (
                  <p className="weekly-schedule-frequency-preview" aria-live="polite">
                    {selectedSubjectForNewLesson.name} ({projectedLessonDifference > 0 ? "+" : ""}{projectedLessonDifference})
                  </p>
                )
              )}
              <div className="schedule-form-actions">
                <button
                  className="class-cancel-edit"
                  disabled={addingSchedule}
                  onClick={() => {
                    setAddingSlot(null);
                    setScheduleError("");
                  }}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="class-submit schedule-submit"
                  disabled={addingSchedule || !addSubjectId || !addTeacherId || selectedTeacherConflicts.length > 0}
                  type="submit"
                >
                  {addingSchedule ? "Salvando..." : "Adicionar aula"}
                </button>
              </div>
            </form>
          )}
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
            <label>
              Sessão
              <select
                disabled={submitting}
                onChange={(event) => setSession(event.target.value as "morning" | "afternoon")}
                value={session}
              >
                <option value="morning">Manhã</option>
                <option value="afternoon">Tarde</option>
              </select>
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
                      aria-label={`Ver detalhes da turma ${schoolClass.name}, ${schoolClass.grade}, ${schoolClass.year}, sessão ${schoolClass.session === "afternoon" ? "Tarde" : "Manhã"}`}
                      className="class-card-button"
                      onClick={() => openClassDetails(schoolClass)}
                      type="button"
                    >
                      <span
                        className={`class-session-indicator ${schoolClass.session === "afternoon" ? "class-session-indicator-afternoon" : ""}`}
                        aria-hidden="true"
                      >
                        {schoolClass.session === "afternoon" ? (
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="4" />
                            <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                          </svg>
                        )}
                      </span>
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
                        <small>
                          {schoolClass.grade} · Ano letivo {schoolClass.year} · Sessão{" "}
                          {schoolClass.session === "afternoon" ? "Tarde" : "Manhã"}
                        </small>
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
