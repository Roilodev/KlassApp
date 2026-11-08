"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { SchoolClass } from "../turmas/class-form";
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
  status: "active" | "inactive" | "pending";
  hasPhoto: boolean;
  classes: SchoolClass[];
  invitationExpiresAt: string | null;
}

interface TeacherManagementProps {
  initialTeachers: Teacher[];
  classes: SchoolClass[];
}

export function TeacherManagement({
  initialTeachers,
  classes,
}: TeacherManagementProps) {
  const [teachers, setTeachers] = useState(initialTeachers);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [profileTeacher, setProfileTeacher] = useState<{
    id: string;
    displayName: string;
    status: Teacher["status"];
  } | null>(null);

  const searchTerm = normalizeSearch(search.trim());
  const phoneSearch = search.replace(/\D/g, "");
  const filteredTeachers = teachers.filter((teacher) => {
    const text = normalizeSearch([
      teacher.displayName,
      teacher.email,
      teacher.phone ?? "",
      ...teacher.classes.map((schoolClass) =>
        `${schoolClass.grade} ${schoolClass.name} ${schoolClass.year}`,
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
        body: JSON.stringify({ email, displayName, phone, classIds: selectedClasses }),
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
        status: result.status === "active" ? "active" : "pending",
        hasPhoto: existingTeacher?.hasPhoto ?? false,
        classes: classes.filter((schoolClass) => selectedClasses.includes(schoolClass.id)),
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
      setSelectedClasses([]);
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
            placeholder="Nome, email, telefone ou turma"
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
                    <small>{teacher.email}</small>
                    <small>{teacher.phone ?? "Telefone não informado"}</small>
                    <span className="teacher-class-tags">
                      {teacher.classes.map((schoolClass) => (
                        <span key={schoolClass.id}>
                          {schoolClass.grade} · {schoolClass.name}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className={`teacher-status ${teacher.status}`}>
                    {teacher.status === "active"
                      ? "ATIVO"
                      : teacher.status === "inactive"
                        ? "INATIVO"
                        : "CONVITE PENDENTE"}
                  </span>
                </button>
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
          onProfileUpdated={(updated) => {
            const displayName = updated.displayName;
            const email = updated.email;
            const updatedClasses = updated.classes;
            if (displayName && email && updatedClasses) {
              setTeachers((current) => current.map((teacher) =>
                teacher.id === updated.id
                  ? {
                      ...teacher,
                      displayName,
                      email,
                      phone: updated.phone ?? teacher.phone,
                      classes: updatedClasses,
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
