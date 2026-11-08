"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PersonPhoto } from "./person-photo";
import type { SchoolClass } from "./turmas/class-form";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface StudentProfileData {
  student: {
    id: string;
    fullName: string;
    schoolName: string;
    createdAt: string;
    photoAuthorizationDate: string | null;
    photoAuthorizedBy: string | null;
  };
  enrollments: Array<{
    year: number;
    grade: string;
    className: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    teachers: string[];
  }>;
  responsibles: Array<{
    id: string;
    fullName: string;
    phone: string;
    relationship: string;
    notificationAuthorized: boolean;
  }>;
  responsiblesRestricted: boolean;
  assessments: Array<{
    id: string;
    title: string;
    subject: string;
    scheduledOn: string;
    maxPoints: number;
    score: number | null;
    classLabel: string;
    year: number;
  }>;
  behavior: Array<{
    id: string;
    category: string;
    description: string;
    occurredOn: string;
    recordedBy: string;
    classLabel: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    description: string;
    startsAt: string;
    location: string;
    status: string;
    audienceType: string;
  }>;
  schedules: Array<{
    year: number;
    grade: string;
    className: string;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
    subject: string;
    teacher: string | null;
  }>;
}

interface TeacherProfileData {
  teacher: {
    id: string;
    displayName: string;
    email: string;
    phone: string | null;
    schoolName: string;
    createdAt: string;
    isActive: boolean;
  };
  classes: Array<{ id: string; year: number; grade: string; name: string }>;
  assessments: Array<{
    id: string;
    title: string;
    subject: string;
    scheduledOn: string;
    maxPoints: number;
    classLabel: string;
    year: number;
    resultsRecorded: number;
  }>;
  studentsCount: number;
  events: Array<{
    id: string;
    title: string;
    description: string;
    startsAt: string;
    location: string;
    status: string;
    audienceType: string;
    audience: string;
  }>;
  schedules: Array<{
    year: number;
    grade: string;
    className: string;
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
    subject: string;
  }>;
}

type ProfileData = StudentProfileData | TeacherProfileData;

interface PersonProfileProps {
  kind: "students" | "teachers";
  personId: string;
  personName: string;
  canEditPhoto: boolean;
  canEditProfile: boolean;
  classes?: SchoolClass[];
  onProfileUpdated?: (updated: {
    id: string;
    fullName?: string;
    displayName?: string;
    email?: string;
    phone?: string;
    responsibles?: StudentProfileData["responsibles"];
    classes?: SchoolClass[];
  }) => void;
  onClose: () => void;
}

interface ResponsibleDraft {
  id?: string;
  fullName: string;
  phone: string;
  relationship: string;
  notificationAuthorized: boolean;
}

const weekdays = ["", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PersonProfile({
  kind,
  personId,
  personName,
  canEditPhoto,
  canEditProfile,
  classes = [],
  onProfileUpdated,
  onClose,
}: PersonProfileProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [responsibleSaveError, setResponsibleSaveError] = useState<{ index: number; message: string } | null>(null);
  const [responsibleSavingIndex, setResponsibleSavingIndex] = useState<number | null>(null);
  const [studentName, setStudentName] = useState("");
  const [responsibles, setResponsibles] = useState<ResponsibleDraft[]>([]);
  const [collapsedResponsibleIds, setCollapsedResponsibleIds] = useState<string[]>([]);
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPhone, setTeacherPhone] = useState("");
  const [teacherClassIds, setTeacherClassIds] = useState<string[]>([]);
  const newResponsibleNameRef = useRef<HTMLInputElement>(null);
  const [photoActionsTarget, setPhotoActionsTarget] = useState<HTMLDivElement | null>(null);
  const setPhotoActionsContainer = useCallback((element: HTMLDivElement | null) => {
    setPhotoActionsTarget(element);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${apiUrl}/${kind}/${personId}/profile`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível carregar o perfil.",
          );
        }
        setProfile(await response.json() as ProfileData);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o perfil.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProfile();
    return () => controller.abort();
  }, [kind, personId]);

  const isStudent = kind === "students";
  const studentProfile = isStudent ? profile as StudentProfileData | null : null;
  const teacherProfile = isStudent ? null : profile as TeacherProfileData | null;
  const profileName = studentProfile?.student.fullName ?? teacherProfile?.teacher.displayName ?? personName;

  function beginEditing() {
    if (studentProfile) {
      setStudentName(studentProfile.student.fullName);
      setResponsibles(studentProfile.responsibles.map((responsible) => ({ ...responsible })));
      setCollapsedResponsibleIds([]);
    } else if (teacherProfile) {
      setTeacherName(teacherProfile.teacher.displayName);
      setTeacherEmail(teacherProfile.teacher.email);
      setTeacherPhone(teacherProfile.teacher.phone ?? "");
      setTeacherClassIds(teacherProfile.classes.map((schoolClass) => schoolClass.id));
    }
    setSaveError("");
    setSaveSuccess("");
    setIsEditing(true);
  }

  function updateResponsible(index: number, patch: Partial<ResponsibleDraft>) {
    setSaveError("");
    setResponsibleSaveError((current) => current?.index === index ? null : current);
    setResponsibles((current) => current.map((responsible, currentIndex) =>
      currentIndex === index ? { ...responsible, ...patch } : responsible,
    ));
  }

  function addResponsible() {
    if (responsibles.length >= 5) return;
    setSaveError("");
    setResponsibles((current) => [
      ...current,
      { fullName: "", phone: "", relationship: "", notificationAuthorized: false },
    ]);
    requestAnimationFrame(() => {
      newResponsibleNameRef.current?.focus();
      newResponsibleNameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  async function saveProfile(keepEditing = false, responsibleIndex?: number) {
    const responsiblesToSave = responsibleIndex === undefined
      ? responsibles
      : responsibles.filter((responsible, index) => responsible.id || index === responsibleIndex);
    const unsavedResponsibles = responsibleIndex === undefined
      ? []
      : responsibles.filter((responsible, index) => !responsible.id && index !== responsibleIndex);
    setSaveError("");
    setSaveSuccess("");
    setResponsibleSaveError(null);
    setResponsibleSavingIndex(keepEditing ? responsibleIndex ?? null : null);
    setSaving(true);
    try {
      const response = await fetch(`${apiUrl}/${kind}/${personId}/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isStudent
          ? { fullName: studentName, responsibles: responsiblesToSave }
          : {
              displayName: teacherName,
              email: teacherEmail,
              phone: teacherPhone,
              classIds: teacherClassIds,
            }),
      });
      if (!response.ok) {
        const responseBody = await response.text();
        let serverMessage: string | null = null;
        try {
          const result: { message?: unknown } = JSON.parse(responseBody);
          if (typeof result.message === "string") {
            serverMessage = result.message;
          } else if (Array.isArray(result.message)) {
            serverMessage = result.message.filter(
              (message): message is string => typeof message === "string",
            ).join(" ");
          }
        } catch {
          serverMessage = null;
        }
        const message = serverMessage ||
          `Não foi possível salvar as alterações (HTTP ${response.status}).`;
        setSaveError(message);
        if (responsibleIndex !== undefined) {
          setResponsibleSaveError({ index: responsibleIndex, message });
        }
        return;
      }

      const updated = await response.json() as {
        id: string;
        fullName?: string;
        displayName?: string;
        email?: string;
        phone?: string;
        responsibles?: StudentProfileData["responsibles"];
        classes?: SchoolClass[];
      };
      if (isStudent && !updated.responsibles) {
        const message = "A API não retornou os responsáveis salvos. Atualize o perfil antes de continuar.";
        setSaveError(message);
        if (responsibleIndex !== undefined) {
          setResponsibleSaveError({ index: responsibleIndex, message });
        }
        return;
      }
      setProfile((current) => {
        if (isStudent && current && "student" in current && updated.fullName && updated.responsibles) {
          return {
            ...current,
            student: { ...current.student, fullName: updated.fullName },
            responsibles: updated.responsibles,
          };
        }
        if (!isStudent && current && "teacher" in current &&
            updated.displayName && updated.email && updated.phone && updated.classes) {
          return {
            ...current,
            teacher: {
              ...current.teacher,
              displayName: updated.displayName,
              email: updated.email,
              phone: updated.phone,
            },
            classes: updated.classes,
          };
        }
        return current;
      });
      if (isStudent && updated.responsibles) {
        setResponsibleSaveError(null);
        const newlySavedIds = updated.responsibles.flatMap((responsible, index) =>
          responsiblesToSave[index]?.id ? [] : [responsible.id],
        );
        setResponsibles([
          ...updated.responsibles.map((responsible) => ({ ...responsible })),
          ...unsavedResponsibles,
        ]);
        if (keepEditing) {
          setCollapsedResponsibleIds((current) => [...new Set([...current, ...newlySavedIds])]);
        }
      }
      onProfileUpdated?.(updated);
      if (!keepEditing) setIsEditing(false);
      setSaveSuccess(keepEditing
        ? "Responsável salvo com sucesso."
        : "Perfil atualizado com sucesso.");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? `Falha ao salvar: ${requestError.message}`
          : "Falha inesperada ao salvar. Tente novamente.";
      setSaveError(message);
      if (responsibleIndex !== undefined) {
        setResponsibleSaveError({ index: responsibleIndex, message });
      }
    } finally {
      setSaving(false);
      setResponsibleSavingIndex(null);
    }
  }

  return (
    <div className="profile-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section
        aria-labelledby={(studentProfile || teacherProfile) && !isEditing ? "person-ficha-title" : "person-profile-title"}
        aria-modal="true"
        className="person-profile-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) {
            if (isEditing) setIsEditing(false);
            else onClose();
          }
        }}
        role="dialog"
        tabIndex={-1}
      >
        {studentProfile && !isEditing && (
          <section className="student-ficha-sheet" aria-labelledby="person-ficha-title">
            <header className="student-ficha-header">
              <span className="student-ficha-mark" aria-hidden="true">✿</span>
              <div className="student-ficha-heading-copy">
                <p>{studentProfile.student.schoolName}</p>
                <h1 id="person-ficha-title">Ficha do estudante</h1>
                <span>Dados escolares e contatos da família</span>
              </div>
            </header>
            <div className="student-ficha-content">
              <div className="student-ficha-identity">
                <div className="student-ficha-photo">
                  <PersonPhoto
                    actionsTarget={photoActionsTarget}
                    editable={canEditPhoto}
                    kind="students"
                    personId={personId}
                    personName={studentProfile.student.fullName}
                  />
                </div>
                <div className="student-ficha-name">
                  <p className="card-kicker">ESTUDANTE</p>
                  <h2>{studentProfile.student.fullName}</h2>
                  <p>Cadastro em {formatDateTime(studentProfile.student.createdAt)}</p>
                </div>
              </div>

              <section className="student-ficha-section">
                <h2><span aria-hidden="true">▦</span> Dados escolares</h2>
                {studentProfile.enrollments.filter((enrollment) => enrollment.status === "active").length > 0 ? (
                  <ul>
                    {studentProfile.enrollments
                      .filter((enrollment) => enrollment.status === "active")
                      .map((enrollment, index) => (
                        <li key={`${enrollment.year}-${enrollment.className}-${index}`}>
                          <strong>{enrollment.grade} · Turma {enrollment.className}</strong>
                          <span>Ano letivo {enrollment.year}</span>
                          {enrollment.teachers.length > 0 && (
                            <span>Professor(a): {enrollment.teachers.join(", ")}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p>Não há matrícula ativa no momento.</p>
                )}
              </section>

              <section className="student-ficha-section student-ficha-family">
                <h2><span aria-hidden="true">♡</span> Dados familiares</h2>
                {studentProfile.responsiblesRestricted ? (
                  <p>Os contatos dos responsáveis estão disponíveis para a administração.</p>
                ) : studentProfile.responsibles.length > 0 ? (
                  <ul>
                    {studentProfile.responsibles.map((responsible) => (
                      <li key={responsible.id}>
                        <strong>{responsible.fullName}</strong>
                        <span>{responsible.relationship}</span>
                        <span>{responsible.phone}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhum responsável cadastrado.</p>
                )}
              </section>
            </div>
            <footer className="student-ficha-footer">
              <span>Uma comunidade que aprende e cresce junta</span>
              <span aria-hidden="true">✦</span>
            </footer>
          </section>
        )}
        {teacherProfile && !isEditing && (
          <section className="student-ficha-sheet teacher-ficha-sheet" aria-labelledby="person-ficha-title">
            <header className="student-ficha-header">
              <span className="student-ficha-mark" aria-hidden="true">✦</span>
              <div className="student-ficha-heading-copy">
                <p>{teacherProfile.teacher.schoolName}</p>
                <h1 id="person-ficha-title">Ficha do professor</h1>
                <span>Dados profissionais e atuação escolar</span>
              </div>
            </header>
            <div className="student-ficha-content">
              <div className="student-ficha-identity">
                <div className="student-ficha-photo">
                  <PersonPhoto
                    actionsTarget={photoActionsTarget}
                    editable={canEditPhoto}
                    kind="teachers"
                    personId={personId}
                    personName={teacherProfile.teacher.displayName}
                  />
                </div>
                <div className="student-ficha-name">
                  <p className="card-kicker">PROFESSOR(A)</p>
                  <h2>{teacherProfile.teacher.displayName}</h2>
                  <p className={teacherProfile.teacher.isActive ? "profile-active-status" : "profile-inactive-status"}>
                    {teacherProfile.teacher.isActive ? "Perfil ativo" : "Perfil inativo"}
                  </p>
                </div>
              </div>

              <section className="student-ficha-section">
                <h2><span aria-hidden="true">@</span> Dados profissionais</h2>
                <ul>
                  <li>
                    <strong>Email</strong>
                    <span>{teacherProfile.teacher.email}</span>
                  </li>
                  <li>
                    <strong>Telefone de contato</strong>
                    <span>{teacherProfile.teacher.phone ?? "Não informado"}</span>
                  </li>
                  <li>
                    <strong>Cadastro</strong>
                    <span>{formatDateTime(teacherProfile.teacher.createdAt)}</span>
                  </li>
                </ul>
              </section>

              <section className="student-ficha-section">
                <h2><span aria-hidden="true">▦</span> Turmas atribuídas</h2>
                {teacherProfile.classes.length === 0 ? <p>Nenhuma turma atribuída.</p> : (
                  <ul>
                    {teacherProfile.classes.map((schoolClass, index) => (
                      <li key={`${schoolClass.year}-${schoolClass.name}-${index}`}>
                        <strong>{schoolClass.grade} · Turma {schoolClass.name}</strong>
                        <span>Ano letivo {schoolClass.year}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="student-ficha-section">
                <h2><span aria-hidden="true">◷</span> Horários de aula</h2>
                {teacherProfile.schedules.length === 0 ? <p>Nenhum horário associado.</p> : (
                  <ul>
                    {teacherProfile.schedules.map((schedule, index) => (
                      <li key={`${schedule.year}-${schedule.dayOfWeek}-${schedule.startsAt}-${index}`}>
                        <strong>{schedule.grade} · Turma {schedule.className} · {schedule.year}</strong>
                        <span>
                          {weekdays[schedule.dayOfWeek]} · {schedule.startsAt.slice(0, 5)}–
                          {schedule.endsAt.slice(0, 5)} · {schedule.subject}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="student-ficha-section">
                <h2><span aria-hidden="true">✎</span> Avaliações e alunos</h2>
                <p>
                  {teacherProfile.studentsCount} {teacherProfile.studentsCount === 1 ? "aluno sob responsabilidade" : "alunos sob responsabilidade"}
                </p>
                {teacherProfile.assessments.length === 0 ? <p>Nenhuma avaliação criada.</p> : (
                  <ul>
                    {teacherProfile.assessments.map((assessment) => (
                      <li key={assessment.id}>
                        <strong>{assessment.title} · {assessment.subject}</strong>
                        <span>{assessment.classLabel} · {assessment.year} · {formatDate(assessment.scheduledOn)}</span>
                        <span>Máximo: {assessment.maxPoints} pontos · {assessment.resultsRecorded} resultados lançados</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="student-ficha-section">
                <h2><span aria-hidden="true">◇</span> Eventos escolares</h2>
                {teacherProfile.events.length === 0 ? <p>Nenhum evento criado.</p> : (
                  <ul>
                    {teacherProfile.events.map((schoolEvent) => (
                      <li key={schoolEvent.id}>
                        <strong>{schoolEvent.title} · {schoolEvent.status === "published" ? "Publicado" : "Cancelado"}</strong>
                        <span>{schoolEvent.audience} · {formatDateTime(schoolEvent.startsAt)}</span>
                        {schoolEvent.location && <span>{schoolEvent.location}</span>}
                        {schoolEvent.description && <span>{schoolEvent.description}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <footer className="student-ficha-footer">
              <span>Uma comunidade que aprende e cresce junta</span>
              <span aria-hidden="true">✦</span>
            </footer>
          </section>
        )}
        {(!(studentProfile || teacherProfile) || isEditing) && (
          <div className="person-profile-heading">
            <PersonPhoto
              editable={canEditPhoto}
              kind={kind}
              personId={personId}
              personName={profileName}
            />
            <div className="person-profile-copy">
              <div className="profile-title-row">
                <p className="card-kicker">{isStudent ? "PERFIL DO ALUNO" : "PERFIL DO PROFESSOR"}</p>
                {canEditProfile && !loading && !error && !isEditing && (
                  <button
                    aria-label={`Editar perfil de ${profileName}`}
                    className="profile-edit-icon"
                    onClick={beginEditing}
                    title="Editar perfil"
                    type="button"
                  >
                    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                      <path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" />
                    </svg>
                  </button>
                )}
              </div>
              <h2 id="person-profile-title">{profileName}</h2>
              {studentProfile && (
                <div className="profile-header-responsibles" aria-label="Responsáveis">
                  <p className="profile-header-label">RESPONSÁVEIS</p>
                  {studentProfile.responsiblesRestricted ? (
                    <p className="profile-header-note">Os contatos dos responsáveis são restritos à administração.</p>
                  ) : studentProfile.responsibles.length === 0 ? (
                    <p className="profile-header-note">Nenhum responsável cadastrado.</p>
                  ) : (
                    <ul>
                      {studentProfile.responsibles.map((responsible) => (
                        <li key={responsible.id}>
                          <strong>{responsible.fullName}</strong>
                          <span>{responsible.relationship} · {responsible.phone}</span>
                          <small>
                            {responsible.notificationAuthorized
                              ? "Autorizado para notificações"
                              : "Sem autorização de notificações"}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {teacherProfile && <p>{teacherProfile.teacher.email}</p>}
              {teacherProfile && <p>{teacherProfile.teacher.phone ?? "Telefone não informado"}</p>}
              {teacherProfile && (
                <p className={teacherProfile.teacher.isActive ? "profile-active-status" : "profile-inactive-status"}>
                  {teacherProfile.teacher.isActive ? "Perfil ativo" : "Perfil inativo"}
                </p>
              )}
            </div>
          </div>
        )}

        {saveSuccess && <p className="form-message form-success" role="status">{saveSuccess}</p>}
        {loading ? (
          <p className="profile-loading">Carregando os dados...</p>
        ) : error ? (
          <p className="form-message form-error" role="alert">{error}</p>
        ) : isEditing ? (
          <form
            className="profile-edit-form"
            onInvalid={() => {
              if (isStudent) {
                setSaveError("Preencha todos os campos obrigatórios do aluno e dos responsáveis.");
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            {saveError && <p className="form-message form-error" role="alert">{saveError}</p>}
            {isStudent ? (
              <>
                <label>
                  Nome completo do aluno
                  <input
                    autoComplete="off"
                    maxLength={160}
                    onChange={(event) => {
                      setStudentName(event.target.value);
                      setSaveError("");
                    }}
                    required
                    value={studentName}
                  />
                </label>
                <fieldset className="profile-responsible-editor">
                  <legend>Responsáveis</legend>
                  {responsibles.map((responsible, index) => (
                    <fieldset className="profile-responsible-fields" key={responsible.id ?? `new-${index}`}>
                      <legend>Responsável {index + 1}</legend>
                      {responsible.id && collapsedResponsibleIds.includes(responsible.id) ? (
                        <div className="profile-responsible-summary">
                          <div>
                            <strong>{responsible.fullName}</strong>
                            <span>{responsible.relationship} · {responsible.phone}</span>
                          </div>
                          <button
                            className="profile-responsible-edit"
                            onClick={() => setCollapsedResponsibleIds((current) =>
                              current.filter((id) => id !== responsible.id),
                            )}
                            type="button"
                          >
                            Editar responsável
                          </button>
                        </div>
                      ) : (
                        <>
                          <label>
                            Nome completo
                            <input
                              autoComplete="off"
                              maxLength={160}
                              onChange={(event) => updateResponsible(index, { fullName: event.target.value })}
                              ref={
                                !responsible.id && index === responsibles.length - 1
                                  ? newResponsibleNameRef
                                  : undefined
                              }
                              required
                              value={responsible.fullName}
                            />
                          </label>
                          <label>
                            Telefone com DDD
                            <input
                              autoComplete="tel"
                              onChange={(event) => updateResponsible(index, {
                                phone: event.target.value,
                                notificationAuthorized: event.target.value === responsible.phone
                                  ? responsible.notificationAuthorized
                                  : false,
                              })}
                              required
                              type="tel"
                              value={responsible.phone}
                            />
                          </label>
                          <label>
                            Parentesco ou vínculo
                            <input
                              autoComplete="off"
                              maxLength={80}
                              onChange={(event) => updateResponsible(index, { relationship: event.target.value })}
                              required
                              value={responsible.relationship}
                            />
                          </label>
                          <label className="profile-authorization-option">
                            <input
                              checked={responsible.notificationAuthorized}
                              onChange={(event) => updateResponsible(index, {
                                notificationAuthorized: event.target.checked,
                              })}
                              type="checkbox"
                            />
                            Autorização documentada para notificações neste telefone
                          </label>
                          {!responsible.id && (
                            <button
                              className="class-submit profile-responsible-save"
                              disabled={saving}
                              onClick={() => void saveProfile(true, index)}
                              type="button"
                            >
                              {responsibleSavingIndex === index ? "Salvando..." : "Salvar responsável"}
                            </button>
                          )}
                          {responsibleSaveError?.index === index && (
                            <p className="form-message form-error" role="alert">
                              {responsibleSaveError.message}
                            </p>
                          )}
                        </>
                      )}
                      {responsibles.length > 1 && (
                        <button
                          className="profile-remove-responsible"
                          onClick={() => {
                            if (responsible.id) {
                              setCollapsedResponsibleIds((current) =>
                                current.filter((id) => id !== responsible.id),
                              );
                            }
                            setResponsibles((current) =>
                              current.filter((_item, currentIndex) => currentIndex !== index),
                            );
                          }}
                          type="button"
                        >
                          Remover responsável
                        </button>
                      )}
                    </fieldset>
                  ))}
                  {responsibles.length < 5 && (
                    <button
                      className="profile-add-responsible"
                      onClick={addResponsible}
                      type="button"
                    >
                      + Adicionar responsável
                    </button>
                  )}
                  <p className="profile-edit-note">
                    Se alterar o telefone, será necessário confirmar novamente a autorização para notificações.
                  </p>
                </fieldset>
              </>
            ) : (
              <>
                <label>
                  Nome completo
                  <input
                    autoComplete="name"
                    maxLength={160}
                    onChange={(event) => setTeacherName(event.target.value)}
                    required
                    value={teacherName}
                  />
                </label>
                <label>
                  Email de acesso da conta
                  <input
                    autoComplete="email"
                    maxLength={254}
                    onChange={(event) => setTeacherEmail(event.target.value)}
                    required
                    type="email"
                    value={teacherEmail}
                  />
                </label>
                <label>
                  Telefone para contato da escola
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={20}
                    onChange={(event) => setTeacherPhone(event.target.value)}
                    placeholder="(11) 99999-9999"
                    required
                    type="tel"
                    value={teacherPhone}
                  />
                </label>
                <p className="profile-edit-note">
                  Nome e email pertencem à conta global do professor e podem refletir-se em outras escolas. O telefone fica associado somente a esta escola para possíveis notificações futuras.
                </p>
                <fieldset className="profile-teacher-classes">
                  <legend>Turmas atribuídas</legend>
                  {classes.length === 0 ? (
                    <p>Não há turmas cadastradas nesta escola.</p>
                  ) : classes.map((schoolClass) => (
                    <label className="class-option" key={schoolClass.id}>
                      <input
                        checked={teacherClassIds.includes(schoolClass.id)}
                        onChange={() => setTeacherClassIds((current) =>
                          current.includes(schoolClass.id)
                            ? current.filter((id) => id !== schoolClass.id)
                            : [...current, schoolClass.id],
                        )}
                        type="checkbox"
                      />
                      <span>
                        {schoolClass.grade} · Turma {schoolClass.name} ({schoolClass.year})
                      </span>
                    </label>
                  ))}
                  <p className="profile-edit-note">
                    Para retirar uma turma que ainda tenha horários vinculados ao professor, atualize esses horários primeiro.
                  </p>
                </fieldset>
              </>
            )}
            <div className="profile-edit-actions">
              <button
                className="profile-cancel-button"
                disabled={saving}
                onClick={() => setIsEditing(false)}
                type="button"
              >
                Cancelar
              </button>
              <button className="class-submit" disabled={saving} type="submit">
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
              <button className="profile-cancel-button" disabled={saving} onClick={onClose} type="button">
                Fechar
              </button>
            </div>
          </form>
        ) : null}
        {!isEditing && (
          <div className="profile-dialog-actions">
            {(studentProfile || teacherProfile) && !loading && !error && (
              <>
                <button className="profile-print-button" onClick={() => window.print()} type="button">
                  Imprimir ficha
                </button>
                {canEditProfile && (
                  <button className="profile-cancel-button" onClick={beginEditing} type="button">
                    Editar dados
                  </button>
                )}
                {canEditPhoto && (
                  <div className="profile-photo-action-target" ref={setPhotoActionsContainer} />
                )}
              </>
            )}
            <button className="profile-cancel-button" disabled={saving} onClick={onClose} type="button">
              Fechar
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
