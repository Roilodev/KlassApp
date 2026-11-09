"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { SchoolClass } from "../turmas/class-form";
import type { SchoolSubject } from "../horarios/schedule-management";
import { PersonProfile } from "../person-profile";
import { PersonPhotoAvatar } from "../person-photo";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

interface Teacher {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  homeAddress: string;
  status: "active" | "inactive" | "pending";
  leaveDate: string | null;
  leaveReason: string | null;
  hasPhoto: boolean;
  classes: SchoolClass[];
  subjectIds: string[];
  invitationExpiresAt: string | null;
}

interface TeacherManagementProps {
  initialTeachers: Teacher[];
  classes: SchoolClass[];
  subjects: SchoolSubject[];
}

export function TeacherManagement({
  initialTeachers,
  classes,
  subjects,
}: TeacherManagementProps) {
  const [teachers, setTeachers] = useState(initialTeachers);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [search, setSearch] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activationTeacher, setActivationTeacher] = useState<Teacher | null>(null);
  const [activationPassword, setActivationPassword] = useState("");
  const [activationError, setActivationError] = useState("");
  const [activating, setActivating] = useState(false);
  const [profileTeacher, setProfileTeacher] = useState<{
    id: string;
    displayName: string;
    status: Teacher["status"];
    subjectIds: string[];
  } | null>(null);

  const searchTerm = normalizeSearch(search.trim());
  const phoneSearch = search.replace(/\D/g, "");
  const filteredTeachers = teachers.filter((teacher) => {
    const text = normalizeSearch([
      teacher.displayName,
      teacher.email,
      teacher.phone ?? "",
      teacher.homeAddress,
      ...teacher.classes.map((schoolClass) =>
        `${schoolClass.grade} ${schoolClass.name} ${schoolClass.year}`,
      ),
      ...teacher.subjectIds.map((id) =>
        subjects.find((subject) => subject.id === id)?.name ?? "",
      ),
      teacher.status,
    ].join(" "));
    const phoneDigits = teacher.phone?.replace(/\D/g, "") ?? "";
    return text.includes(searchTerm) ||
      (phoneSearch.length > 0 && phoneDigits.includes(phoneSearch));
  });

  function toggleClass(classId: string) {
    setSelectedClasses((current) =>
      current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId],
    );
  }

  function toggleSubject(
    subjectId: string,
    selected: string[],
    update: (ids: string[]) => void,
  ) {
    update(selected.includes(subjectId)
      ? selected.filter((id) => id !== subjectId)
      : [...selected, subjectId]);
  }

  async function inviteTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setInvitationUrl("");
    setSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/teachers/invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          phone,
          homeAddress,
          classIds: selectedClasses,
          subjectIds: selectedSubjectIds,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("Sua sessão expirou. Entre novamente para continuar.");
        } else if (response.status === 403) {
          setError("Somente a administração pode cadastrar professores.");
        } else if (response.status === 429) {
          setError("Muitas tentativas. Aguarde um momento e tente novamente.");
        } else {
          const result = await response.json().catch(() => null);
          setError(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível cadastrar o professor.",
          );
        }
        return;
      }

      const result = await response.json();
      const existingTeacher = teachers.find(
        (teacher) => teacher.email.toLowerCase() === String(result.email).toLowerCase(),
      );
      const newTeacher: Teacher = {
        id: result.teacherId ?? result.invitationId,
        email: result.email,
        displayName: result.displayName,
        phone: result.phone,
        homeAddress: result.homeAddress ?? homeAddress,
        status: result.status === "active" ? "active" : "pending",
        leaveDate: null,
        leaveReason: null,
        hasPhoto: existingTeacher?.hasPhoto ?? false,
        classes: classes.filter((schoolClass) => selectedClasses.includes(schoolClass.id)),
        subjectIds: selectedSubjectIds,
        invitationExpiresAt: result.expiresAt ?? null,
      };
      setTeachers((current) => [
        newTeacher,
        ...current.filter(
          (teacher) => teacher.email.toLowerCase() !== newTeacher.email.toLowerCase(),
        ),
      ]);
      setEmail("");
      setDisplayName("");
      setPhone("");
      setHomeAddress("");
      setSelectedClasses([]);
      setSelectedSubjectIds([]);
      setInvitationUrl(result.invitationUrl ?? "");
      setMessage(
        result.status === "active"
          ? "Professor vinculado à escola e às turmas selecionadas."
          : "Convite criado. Copie e compartilhe o link com o professor.",
      );
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setMessage("Link copiado. Compartilhe-o diretamente com o professor.");
    } catch {
      setError("Não foi possível copiar. Selecione e copie o link manualmente.");
    }
  }

  async function activatePendingTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activationTeacher) return;
    setActivationError("");
    setActivating(true);
    try {
      const response = await fetch(
        `${apiUrl}/teachers/invitations/${activationTeacher.id}/activate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: activationPassword }),
        },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : "Não foi possível ativar o professor.",
        );
      }
      const result = await response.json() as {
        teacherId: string;
        email: string;
        displayName: string;
      };
      setTeachers((current) => current.map((teacher) =>
        teacher.id === activationTeacher.id
          ? {
              ...teacher,
              id: result.teacherId,
              email: result.email,
              displayName: result.displayName,
              status: "active" as const,
              invitationExpiresAt: null,
            }
          : teacher,
      ).sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setMessage("Professor ativado. Compartilhe a senha com ele por um canal seguro.");
      setActivationPassword("");
      setActivationTeacher(null);
    } catch (requestError) {
      setActivationError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível ativar o professor.",
      );
    } finally {
      setActivating(false);
    }
  }

  return (
    <>
      {isFormOpen && (
        <div
          className="profile-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setIsFormOpen(false);
          }}
        >
          <section
            aria-labelledby="create-teacher-title"
            aria-modal="true"
            className="entry-form-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !submitting) setIsFormOpen(false);
            }}
            role="dialog"
            tabIndex={-1}
          >
            <div className="class-panel-heading">
              <div className="setup-icon" aria-hidden="true">♙</div>
              <div>
                <p className="card-kicker">EQUIPE ESCOLAR</p>
                <h2 id="create-teacher-title">Cadastre um professor</h2>
                <p>Informe os contatos e escolha as turmas que poderá acessar.</p>
              </div>
            </div>

            <form className="teacher-form" onSubmit={inviteTeacher}>
            <div className="teacher-fields">
              <label>
                Nome completo
                <input
                  autoComplete="name"
                  maxLength={160}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  value={displayName}
                />
              </label>
              <label>
                Email de acesso
                <input
                  autoComplete="email"
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label>
                Telefone com DDD
                <input
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={20}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(11) 99999-9999"
                  required
                  type="tel"
                  value={phone}
                />
              </label>
              <label>
                Endereço residencial
                <input
                  autoComplete="street-address"
                  maxLength={300}
                  onChange={(event) => setHomeAddress(event.target.value)}
                  placeholder="Rua, número, bairro, cidade"
                  value={homeAddress}
                />
              </label>
            </div>

            <fieldset className="class-picker">
              <legend>Turmas atribuídas</legend>
              <div className="class-picker-options">
                {classes.map((schoolClass) => (
                  <label className="class-option" key={schoolClass.id}>
                    <input
                      checked={selectedClasses.includes(schoolClass.id)}
                      onChange={() => toggleClass(schoolClass.id)}
                      type="checkbox"
                    />
                    <span>{schoolClass.grade} · Turma {schoolClass.name}</span>
                    <small>{schoolClass.year}</small>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="class-picker">
              <legend>Matérias que leciona</legend>
              <div className="class-picker-options">
                {subjects.map((subject) => (
                  <label className="class-option" key={subject.id}>
                    <input
                      checked={selectedSubjectIds.includes(subject.id)}
                      onChange={() =>
                        toggleSubject(subject.id, selectedSubjectIds, setSelectedSubjectIds)
                      }
                      type="checkbox"
                    />
                    <span>{subject.name}</span>
                  </label>
                ))}
                {subjects.length === 0 && <small>Cadastre matérias antes de associá-las.</small>}
              </div>
            </fieldset>

            <div className="dialog-form-actions teacher-submit">
              <button
                className="class-submit"
                disabled={submitting || selectedClasses.length === 0}
                type="submit"
              >
                {submitting ? "Preparando convite..." : "Cadastrar professor"}
              </button>
            </div>
            </form>
            {error && <p className="form-message form-error" role="alert">{error}</p>}
            {message && <p className="form-message form-success" role="status">{message}</p>}
            {invitationUrl && (
              <div className="invitation-share">
                <label htmlFor="invitation-link">Link de ativação · válido por 7 dias</label>
                <div>
                  <input
                    id="invitation-link"
                    onFocus={(event) => event.currentTarget.select()}
                    readOnly
                    value={invitationUrl}
                  />
                  <button onClick={copyInvitation} type="button">Copiar link</button>
                </div>
                <small>Compartilhe diretamente com o professor. O link só pode ser usado uma vez.</small>
              </div>
            )}
            <div className="dialog-form-actions">
              <button className="class-cancel-edit" disabled={submitting} onClick={() => setIsFormOpen(false)} type="button">
                Fechar
              </button>
            </div>
          </section>
        </div>
      )}
      {activationTeacher && (
        <div
          className="profile-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !activating) {
              setActivationTeacher(null);
              setActivationPassword("");
              setActivationError("");
            }
          }}
        >
          <section
            aria-labelledby="activate-teacher-title"
            aria-modal="true"
            className="entry-form-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !activating) setActivationTeacher(null);
            }}
            role="dialog"
            tabIndex={-1}
          >
            <div className="class-panel-heading">
              <div className="setup-icon" aria-hidden="true">♙</div>
              <div>
                <p className="card-kicker">ATIVAÇÃO ADMINISTRATIVA</p>
                <h2 id="activate-teacher-title">Ativar {activationTeacher.displayName}</h2>
                <p>Defina a senha inicial para liberar o acesso à conta.</p>
              </div>
            </div>
            <form className="teacher-form" onSubmit={activatePendingTeacher}>
              <label className="teacher-activation-password">
                Senha inicial (mínimo de 12 caracteres)
                <input
                  autoComplete="new-password"
                  maxLength={128}
                  minLength={12}
                  onChange={(event) => setActivationPassword(event.target.value)}
                  required
                  type="password"
                  value={activationPassword}
                />
              </label>
              <p className="profile-edit-note">
                A senha não será exibida novamente. Compartilhe-a com o professor por um canal seguro.
              </p>
              {activationError && (
                <p className="form-message form-error" role="alert">{activationError}</p>
              )}
              <div className="dialog-form-actions teacher-submit">
                <button className="class-cancel-edit" disabled={activating} onClick={() => {
                  setActivationTeacher(null);
                  setActivationPassword("");
                  setActivationError("");
                }} type="button">
                  Cancelar
                </button>
                <button className="class-submit" disabled={activating} type="submit">
                  {activating ? "Ativando..." : "Ativar professor"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="class-list-panel" aria-labelledby="teachers-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">EQUIPE DA ESCOLA</p>
            <h2 id="teachers-title">Professores cadastrados</h2>
          </div>
          <div className="class-list-actions">
            <button
              className="class-submit"
              disabled={classes.length === 0}
              onClick={() => {
                setError("");
                setMessage("");
                setInvitationUrl("");
                setSelectedClasses([]);
                setSelectedSubjectIds([]);
                setIsFormOpen(true);
              }}
              type="button"
            >
              Novo professor
            </button>
            <span className="class-count" aria-label={`${teachers.length} professores`}>
              {teachers.length}
            </span>
          </div>
        </div>
        {classes.length === 0 && (
          <p className="student-create-hint">
            Cadastre uma turma antes de convidar professores. <Link className="setup-link" href="/turmas">Ir para Turmas</Link>
          </p>
        )}
        <label className="people-search">
          <span>Buscar professor</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome, email, endereço, telefone ou turma"
            type="search"
            value={search}
          />
        </label>

        {teachers.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">✿</span>
            <strong>Os professores aparecerão aqui</strong>
            <p>Cadastre o primeiro professor e atribua as turmas correspondentes.</p>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="empty-classes">
            <strong>Nenhum professor encontrado</strong>
            <p>Tente buscar por outro nome, email, telefone ou turma.</p>
          </div>
        ) : (
          <ul className="class-list people-card-grid">
            {filteredTeachers.map((teacher) => (
              <li className="teacher-list-item" key={teacher.id}>
                <button
                  className="person-list-button person-card-button"
                  disabled={teacher.status === "pending"}
                  onClick={() => setProfileTeacher({
                    id: teacher.id,
                    displayName: teacher.displayName,
                    status: teacher.status,
                    subjectIds: teacher.subjectIds,
                  })}
                  type="button"
                >
                  {teacher.status !== "pending" ? (
                    <PersonPhotoAvatar
                      hasPhoto={teacher.hasPhoto}
                      kind="teachers"
                      personId={teacher.id}
                      personName={teacher.displayName}
                    />
                  ) : (
                    <span className="teacher-avatar" aria-hidden="true">
                      {teacher.displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="class-list-copy teacher-list-copy">
                    <strong>{teacher.displayName}</strong>
                    <span className="teacher-contact-info">
                      <span className="teacher-contact-line">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m4 7 8 6 8-6" />
                        </svg>
                        <small>{teacher.email}</small>
                      </span>
                      <span className="teacher-contact-line">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                          <path d="M7 3h3l2 5-2 2a15 15 0 0 0 4 4l2-2 5 2v3c0 1.1-.9 2-2 2A16 16 0 0 1 5 5c0-1.1.9-2 2-2Z" />
                        </svg>
                        <small>{teacher.phone ?? "Telefone não informado"}</small>
                      </span>
                    </span>
                  </span>
                  <span className="teacher-card-details">
                    <span className="teacher-class-tags">
                      {teacher.classes.map((schoolClass) => (
                        <span key={schoolClass.id}>
                          {schoolClass.grade} · {schoolClass.name}
                        </span>
                      ))}
                    </span>
                    <span className="teacher-class-tags">
                      {teacher.subjectIds.map((id) => {
                        const subject = subjects.find((item) => item.id === id);
                        return subject ? <span key={id}>{subject.name}</span> : null;
                      })}
                    </span>
                    <span className={`teacher-status ${teacher.status}`}>
                      {teacher.status === "active"
                        ? "ATIVO"
                        : teacher.status === "inactive"
                          ? "INATIVO"
                          : "CONVITE PENDENTE"}
                    </span>
                  </span>
                </button>
                {teacher.status === "pending" && (
                  <button
                    className="teacher-activate-button"
                    onClick={() => {
                      setActivationError("");
                      setActivationPassword("");
                      setActivationTeacher(teacher);
                    }}
                    type="button"
                  >
                    Ativar e definir senha
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {profileTeacher && (
        <PersonProfile
          canEditPhoto={profileTeacher.status === "active"}
          canEditProfile
          classes={classes}
          kind="teachers"
          subjects={subjects}
          teacherSubjects={profileTeacher.subjectIds
            .map((subjectId) => subjects.find((subject) => subject.id === subjectId)?.name)
            .filter((name): name is string => name !== undefined)}
          onProfileUpdated={(updated) => {
            const displayName = updated.displayName;
            const email = updated.email;
            const updatedClasses = updated.classes;
            const updatedSubjectIds = updated.subjectIds;
            if (updatedSubjectIds) {
              setTeachers((current) => current.map((teacher) =>
                teacher.id === updated.id
                  ? { ...teacher, subjectIds: updatedSubjectIds }
                  : teacher,
              ));
              setProfileTeacher((current) => current
                ? { ...current, subjectIds: updatedSubjectIds }
                : current);
            }
            if (updated.isActive !== undefined) {
              setTeachers((current) => current.map((teacher) =>
                teacher.id === updated.id
                  ? {
                      ...teacher,
                      status: updated.isActive ? "active" : "inactive",
                      leaveDate: updated.leaveDate ?? null,
                      leaveReason: updated.leaveReason ?? null,
                    }
                  : teacher,
              ));
            }
            if (displayName && email && updatedClasses) {
              setTeachers((current) => current.map((teacher) =>
                teacher.id === updated.id
                  ? {
                      ...teacher,
                      displayName,
                      email,
                      phone: updated.phone ?? teacher.phone,
                      homeAddress: updated.homeAddress ?? teacher.homeAddress,
                      classes: updatedClasses,
                      subjectIds: updatedSubjectIds ?? teacher.subjectIds,
                    }
                  : teacher,
              ).sort((a, b) => a.displayName.localeCompare(b.displayName)));
              setProfileTeacher((current) => current
                ? { ...current, displayName }
                : current);
            }
          }}
          onClose={() => setProfileTeacher(null)}
          personId={profileTeacher.id}
          personName={profileTeacher.displayName}
        />
      )}
    </>
  );
}
