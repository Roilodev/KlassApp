"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { PersonPhoto } from "./person-photo";
import type { SchoolClass } from "./turmas/class-form";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface StudentProfileData {
  student: {
    id: string;
    fullName: string;
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

function behaviorCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    participation: "Participação",
    collaboration: "Colaboração e convivência",
    responsibility: "Responsabilidade",
    learning: "Envolvimento na aprendizagem",
    positive: "Destaque positivo",
    other: "Outro fato observado",
  };
  return labels[value] ?? value;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="profile-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
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
  const [studentName, setStudentName] = useState("");
  const [responsibles, setResponsibles] = useState<ResponsibleDraft[]>([]);
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPhone, setTeacherPhone] = useState("");
  const [teacherClassIds, setTeacherClassIds] = useState<string[]>([]);

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
    setResponsibles((current) => current.map((responsible, currentIndex) =>
      currentIndex === index ? { ...responsible, ...patch } : responsible,
    ));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    setSaveSuccess("");
    setSaving(true);
    try {
      const response = await fetch(`${apiUrl}/${kind}/${personId}/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isStudent
          ? { fullName: studentName, responsibles }
          : {
              displayName: teacherName,
              email: teacherEmail,
              phone: teacherPhone,
              classIds: teacherClassIds,
            }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setSaveError(
          typeof result?.message === "string"
            ? result.message
            : "Não foi possível salvar as alterações do perfil.",
        );
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
      onProfileUpdated?.(updated);
      setIsEditing(false);
      setSaveSuccess("Perfil atualizado com sucesso.");
    } catch {
      setSaveError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section
        aria-labelledby="person-profile-title"
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
        <div className="person-profile-heading">
          <PersonPhoto
            editable={canEditPhoto}
            kind={kind}
            personId={personId}
            personName={profileName}
          />
          <div className="person-profile-copy">
            <p className="card-kicker">{isStudent ? "PERFIL DO ALUNO" : "PERFIL DO PROFESSOR"}</p>
            <h2 id="person-profile-title">{profileName}</h2>
            {teacherProfile && <p>{teacherProfile.teacher.email}</p>}
            {teacherProfile && <p>{teacherProfile.teacher.phone ?? "Telefone não informado"}</p>}
            {teacherProfile && (
              <p className={teacherProfile.teacher.isActive ? "profile-active-status" : "profile-inactive-status"}>
                {teacherProfile.teacher.isActive ? "Perfil ativo" : "Perfil inativo"}
              </p>
            )}
          </div>
          {canEditProfile && !loading && !error && !isEditing && (
            <div className="profile-heading-actions">
              <button className="profile-edit-button" onClick={beginEditing} type="button">
                Editar perfil
              </button>
            </div>
          )}
        </div>

        {saveSuccess && <p className="form-message form-success" role="status">{saveSuccess}</p>}
        {loading ? (
          <p className="profile-loading">Carregando os dados...</p>
        ) : error ? (
          <p className="form-message form-error" role="alert">{error}</p>
        ) : isEditing ? (
          <form className="profile-edit-form" onSubmit={saveProfile}>
            {saveError && <p className="form-message form-error" role="alert">{saveError}</p>}
            {isStudent ? (
              <>
                <label>
                  Nome completo do aluno
                  <input
                    autoComplete="off"
                    maxLength={160}
                    onChange={(event) => setStudentName(event.target.value)}
                    required
                    value={studentName}
                  />
                </label>
                <fieldset className="profile-responsible-editor">
                  <legend>Responsáveis</legend>
                  {responsibles.map((responsible, index) => (
                    <fieldset className="profile-responsible-fields" key={responsible.id ?? `new-${index}`}>
                      <legend>Responsável {index + 1}</legend>
                      <label>
                        Nome completo
                        <input
                          autoComplete="off"
                          maxLength={160}
                          onChange={(event) => updateResponsible(index, { fullName: event.target.value })}
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
                      {responsibles.length > 1 && (
                        <button
                          className="profile-remove-responsible"
                          onClick={() => setResponsibles((current) =>
                            current.filter((_item, currentIndex) => currentIndex !== index),
                          )}
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
                      onClick={() => setResponsibles((current) => [
                        ...current,
                        { fullName: "", phone: "", relationship: "", notificationAuthorized: false },
                      ])}
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
        ) : studentProfile ? (
          <div className="profile-sections">
            <Section title="Dados do cadastro">
              <p>Registrado em {formatDateTime(studentProfile.student.createdAt)}</p>
              {studentProfile.student.photoAuthorizationDate && (
                <p>
                  Autorização da foto confirmada em {formatDateTime(studentProfile.student.photoAuthorizationDate)}
                  {studentProfile.student.photoAuthorizedBy ? ` por ${studentProfile.student.photoAuthorizedBy}` : ""}
                </p>
              )}
            </Section>
            <Section title="Matrículas e turmas">
              {studentProfile.enrollments.length === 0 ? <p>Nenhuma matrícula encontrada.</p> : (
                <ul className="profile-list">
                  {studentProfile.enrollments.map((enrollment, index) => (
                    <li key={`${enrollment.year}-${enrollment.className}-${index}`}>
                      <strong>{enrollment.grade} · Turma {enrollment.className} · {enrollment.year}</strong>
                      <span>{enrollment.status === "active" ? "Ativa" : enrollment.status === "completed" ? "Concluída" : "Transferida"} · {formatDate(enrollment.startedAt)}{enrollment.endedAt ? ` até ${formatDate(enrollment.endedAt)}` : ""}</span>
                      {enrollment.teachers.length > 0 && <span>Professores: {enrollment.teachers.join(", ")}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Responsáveis">
              {studentProfile.responsiblesRestricted ? (
                <p>Os contatos dos responsáveis são restritos à administração.</p>
              ) : studentProfile.responsibles.length === 0 ? <p>Nenhum responsável cadastrado.</p> : (
                <ul className="profile-list">
                  {studentProfile.responsibles.map((responsible) => (
                    <li key={responsible.id}>
                      <strong>{responsible.fullName} · {responsible.relationship}</strong>
                      <span>{responsible.phone} · {responsible.notificationAuthorized ? "Autorizado para notificações" : "Sem autorização de notificações"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Avaliações e resultados">
              {studentProfile.assessments.length === 0 ? <p>Nenhuma avaliação cadastrada.</p> : (
                <ul className="profile-list">
                  {studentProfile.assessments.map((assessment) => (
                    <li key={`${assessment.id}-${assessment.year}`}>
                      <strong>{assessment.title} · {assessment.subject}</strong>
                      <span>{assessment.classLabel} · {assessment.year} · {formatDate(assessment.scheduledOn)}</span>
                      <span>Resultado: {assessment.score === null ? "Ainda não registrado" : `${assessment.score} / ${assessment.maxPoints}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Histórico de comportamento">
              {studentProfile.behavior.length === 0 ? <p>Nenhuma observação registrada.</p> : (
                <ul className="profile-list">
                  {studentProfile.behavior.map((record) => (
                    <li key={record.id}>
                      <strong>{behaviorCategoryLabel(record.category)} · {formatDate(record.occurredOn)} · {record.classLabel}</strong>
                      <span>{record.description}</span>
                      <small>Registrado por {record.recordedBy}</small>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Horários">
              {studentProfile.schedules.length === 0 ? <p>Nenhum horário cadastrado.</p> : (
                <ul className="profile-list">
                  {studentProfile.schedules.map((schedule, index) => (
                    <li key={`${schedule.year}-${schedule.dayOfWeek}-${schedule.startsAt}-${index}`}>
                      <strong>{schedule.grade} · Turma {schedule.className} · {schedule.year}</strong>
                      <span>{weekdays[schedule.dayOfWeek]} · {schedule.startsAt.slice(0, 5)}–{schedule.endsAt.slice(0, 5)} · {schedule.subject}{schedule.teacher ? ` · ${schedule.teacher}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Eventos da turma">
              {studentProfile.events.length === 0 ? <p>Nenhum evento relacionado.</p> : (
                <ul className="profile-list">
                  {studentProfile.events.map((schoolEvent) => (
                    <li key={schoolEvent.id}>
                      <strong>{schoolEvent.title} · {schoolEvent.status === "published" ? "Publicado" : "Cancelado"}</strong>
                      <span>{formatDateTime(schoolEvent.startsAt)}{schoolEvent.location ? ` · ${schoolEvent.location}` : ""}</span>
                      {schoolEvent.description && <span>{schoolEvent.description}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        ) : teacherProfile ? (
          <div className="profile-sections">
            <Section title="Dados da conta">
              <p>Email: {teacherProfile.teacher.email}</p>
              <p>Telefone de contato da escola: {teacherProfile.teacher.phone ?? "Não informado"}</p>
              <p>Conta criada em {formatDateTime(teacherProfile.teacher.createdAt)}</p>
            </Section>
            <Section title="Turmas atribuídas">
              {teacherProfile.classes.length === 0 ? <p>Nenhuma turma atribuída.</p> : (
                <ul className="profile-list">
                  {teacherProfile.classes.map((schoolClass, index) => (
                    <li key={`${schoolClass.year}-${schoolClass.name}-${index}`}>
                      <strong>{schoolClass.grade} · Turma {schoolClass.name} · {schoolClass.year}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Horários de aula">
              {teacherProfile.schedules.length === 0 ? <p>Nenhum horário associado.</p> : (
                <ul className="profile-list">
                  {teacherProfile.schedules.map((schedule, index) => (
                    <li key={`${schedule.year}-${schedule.dayOfWeek}-${schedule.startsAt}-${index}`}>
                      <strong>{schedule.grade} · Turma {schedule.className} · {schedule.year}</strong>
                      <span>{weekdays[schedule.dayOfWeek]} · {schedule.startsAt.slice(0, 5)}–{schedule.endsAt.slice(0, 5)} · {schedule.subject}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title={`Avaliações criadas · ${teacherProfile.assessments.length}`}>
              {teacherProfile.assessments.length === 0 ? <p>Nenhuma avaliação criada.</p> : (
                <ul className="profile-list">
                  {teacherProfile.assessments.map((assessment) => (
                    <li key={assessment.id}>
                      <strong>{assessment.title} · {assessment.subject}</strong>
                      <span>{assessment.classLabel} · {assessment.year} · {formatDate(assessment.scheduledOn)}</span>
                      <span>Máximo: {assessment.maxPoints} pontos · {assessment.resultsRecorded} resultados lançados</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Alunos sob responsabilidade">
              <p>
                {teacherProfile.studentsCount} {teacherProfile.studentsCount === 1 ? "aluno" : "alunos"}
              </p>
            </Section>
            <Section title={`Eventos criados · ${teacherProfile.events.length}`}>
              {teacherProfile.events.length === 0 ? <p>Nenhum evento criado.</p> : (
                <ul className="profile-list">
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
            </Section>
          </div>
        ) : null}
        {!isEditing && (
          <div className="profile-dialog-actions">
            <button className="profile-cancel-button" disabled={saving} onClick={onClose} type="button">
              Fechar
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
