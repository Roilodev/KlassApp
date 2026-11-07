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

interface Responsible {
  id: string;
  fullName: string;
  phone: string;
  relationship: string;
  notificationAuthorized: boolean;
}

interface Student {
  id: string;
  fullName: string;
  hasPhoto: boolean;
  academicYear: number;
  grade: string;
  className: string;
  responsibles: Responsible[];
}

interface StudentManagementProps {
  classes: SchoolClass[];
  initialStudents: Student[];
}

function emptyResponsible(): Omit<Responsible, "id"> {
  return {
    fullName: "",
    phone: "",
    relationship: "",
    notificationAuthorized: false,
  };
}

export function StudentManagement({
  classes,
  initialStudents,
}: StudentManagementProps) {
  const [students, setStudents] = useState(initialStudents);
  const [search, setSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [fullName, setFullName] = useState("");
  const [responsibles, setResponsibles] = useState([emptyResponsible()]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [profileStudent, setProfileStudent] = useState<{ id: string; fullName: string } | null>(null);

  const searchTerm = normalizeSearch(search.trim());
  const phoneSearch = search.replace(/\D/g, "");
  const filteredStudents = students.filter((student) => {
    const text = normalizeSearch([
      student.fullName,
      student.grade,
      student.className,
      String(student.academicYear),
      ...student.responsibles.flatMap((responsible) => [
        responsible.fullName,
        responsible.relationship,
      ]),
    ].join(" "));
    const phoneDigits = student.responsibles
      .map((responsible) => responsible.phone.replace(/\D/g, ""))
      .join(" ");
    return text.includes(searchTerm) ||
      (phoneSearch.length > 0 && phoneDigits.includes(phoneSearch));
  });

  function updateResponsible(
    index: number,
    field: keyof Omit<Responsible, "id">,
    value: string | boolean,
  ) {
    setResponsibles((current) =>
      current.map((responsible, currentIndex) =>
        currentIndex === index
          ? { ...responsible, [field]: value }
          : responsible,
      ),
    );
  }

  function addResponsible() {
    if (responsibles.length < 5) {
      setResponsibles((current) => [...current, emptyResponsible()]);
    }
  }

  function removeResponsible(index: number) {
    if (responsibles.length > 1) {
      setResponsibles((current) =>
        current.filter((_, currentIndex) => currentIndex !== index),
      );
    }
  }

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    const schoolClass = classes.find((item) => item.id === selectedClassId);
    if (!schoolClass) {
      setError("Selecione uma turma válida.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/students`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          academicYear: schoolClass.year,
          classId: schoolClass.id,
          responsibles,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("Sua sessão expirou. Entre novamente para continuar.");
        } else if (response.status === 403) {
          setError("Somente a administração pode cadastrar alunos.");
        } else if (response.status === 429) {
          setError("Muitas tentativas. Aguarde um momento e tente novamente.");
        } else {
          const result = await response.json().catch(() => null);
          setError(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível cadastrar o aluno.",
          );
        }
        return;
      }

      const createdStudent = (await response.json()) as Student;
      setStudents((current) =>
        [...current, createdStudent].sort((a, b) =>
          a.fullName.localeCompare(b.fullName),
        ),
      );
      setFullName("");
      setSelectedClassId("");
      setResponsibles([emptyResponsible()]);
      setSuccess("Aluno cadastrado e matriculado com sucesso.");
      setIsFormOpen(false);
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="class-panel student-create-panel" aria-labelledby="student-create-heading">
        <div className="student-create-copy">
          <div className="setup-icon" aria-hidden="true">♧</div>
          <div>
            <p className="card-kicker">MATRÍCULAS ATIVAS</p>
            <h2 id="student-create-heading">Novo aluno</h2>
            <p>Cadastre um aluno e adicione seus contatos responsáveis.</p>
          </div>
        </div>
        <button
          className="class-submit student-create-button"
          disabled={classes.length === 0}
          onClick={() => {
            setError("");
            setSuccess("");
            setIsFormOpen(true);
          }}
          type="button"
        >
          + Novo aluno
        </button>
        {classes.length === 0 && (
          <p className="student-create-hint">
            Cadastre uma turma antes de registrar alunos. <Link href="/turmas">Ir para Turmas</Link>
          </p>
        )}
        {success && <p className="form-message form-success" role="status">{success}</p>}
      </section>

      {isFormOpen && (
        <div
          className="profile-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setIsFormOpen(false);
          }}
        >
          <section
            aria-labelledby="create-student-title"
            aria-modal="true"
            className="entry-form-dialog student-entry-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !submitting) setIsFormOpen(false);
            }}
            role="dialog"
            tabIndex={-1}
          >
            <div className="class-panel-heading">
              <div className="setup-icon" aria-hidden="true">♧</div>
              <div>
                <p className="card-kicker">NOVO ALUNO</p>
                <h2 id="create-student-title">Vamos fazer o cadastro?</h2>
                <p>Preencha as informações escolares e os contatos necessários.</p>
              </div>
            </div>

            <form className="student-form" onSubmit={createStudent}>
            <div className="student-primary-fields">
              <label>
                Nome completo do aluno
                <input
                  autoComplete="off"
                  maxLength={160}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  value={fullName}
                />
              </label>
              <label>
                Turma e ano letivo
                <select
                  onChange={(event) => setSelectedClassId(event.target.value)}
                  required
                  value={selectedClassId}
                >
                  <option value="">Selecione uma turma</option>
                  {classes.map((schoolClass) => (
                    <option key={schoolClass.id} value={schoolClass.id}>
                      {schoolClass.grade} · Turma {schoolClass.name} ({schoolClass.year})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="responsibles-heading">
              <div>
                <p className="card-kicker">CONTATOS DA FAMÍLIA</p>
                <h3>Responsáveis pelo aluno</h3>
              </div>
              {responsibles.length < 5 && (
                <button className="add-responsible" onClick={addResponsible} type="button">
                  + Adicionar responsável
                </button>
              )}
            </div>

            <div className="responsibles-list">
              {responsibles.map((responsible, index) => (
                <fieldset className="responsible-form-card" key={index}>
                  <legend>
                    <span>Responsável {index + 1}</span>
                    {responsibles.length > 1 && (
                      <button
                        className="remove-responsible"
                        onClick={() => removeResponsible(index)}
                        type="button"
                      >
                        Remover
                      </button>
                    )}
                  </legend>
                  <div className="responsible-fields">
                    <label>
                      Nome completo
                      <input
                        autoComplete="off"
                        maxLength={160}
                        onChange={(event) =>
                          updateResponsible(index, "fullName", event.target.value)
                        }
                        required
                        value={responsible.fullName}
                      />
                    </label>
                    <label>
                      Telefone com DDD
                      <input
                        autoComplete="off"
                        inputMode="tel"
                        maxLength={20}
                        onChange={(event) =>
                          updateResponsible(index, "phone", event.target.value)
                        }
                        placeholder="(11) 99999-9999"
                        required
                        type="tel"
                        value={responsible.phone}
                      />
                    </label>
                    <label>
                      Parentesco ou vínculo
                      <input
                        maxLength={80}
                        onChange={(event) =>
                          updateResponsible(index, "relationship", event.target.value)
                        }
                        placeholder="Ex.: mãe, pai, avó"
                        required
                        value={responsible.relationship}
                      />
                    </label>
                  </div>
                  <label className="authorization-option">
                    <input
                      checked={responsible.notificationAuthorized}
                      onChange={(event) =>
                        updateResponsible(
                          index,
                          "notificationAuthorized",
                          event.target.checked,
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      A escola registrou autorização deste responsável para receber
                      notificações.
                    </span>
                  </label>
                </fieldset>
              ))}
            </div>

            <p className="privacy-note">
              Os contatos ficam separados por escola. Não associamos responsáveis
              automaticamente entre alunos ou escolas pelo número de telefone.
            </p>
            <div className="dialog-form-actions student-submit">
              <button className="class-submit" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : "Cadastrar aluno"}
              </button>
              <button className="class-cancel-edit" disabled={submitting} onClick={() => setIsFormOpen(false)} type="button">
                Fechar
              </button>
            </div>
            </form>
            {error && <p className="form-message form-error" role="alert">{error}</p>}
          </section>
        </div>
      )}

      <section className="class-list-panel" aria-labelledby="students-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">MATRÍCULAS ATIVAS</p>
            <h2 id="students-title">Alunos da escola</h2>
          </div>
          <span className="class-count">{students.length}</span>
        </div>
        <label className="people-search">
          <span>Buscar aluno</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome, turma, responsável ou telefone"
            type="search"
            value={search}
          />
        </label>

        {students.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">✿</span>
            <strong>Os alunos aparecerão aqui</strong>
            <p>Depois de cadastrar um aluno, a matrícula será exibida nesta lista.</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="empty-classes">
            <strong>Nenhum aluno encontrado</strong>
            <p>Tente buscar por outro nome, turma, responsável ou telefone.</p>
          </div>
        ) : (
          <ul className="class-list people-card-grid">
            {filteredStudents.map((student) => (
              <li className="student-list-item" key={student.id}>
                <button
                  className="person-list-button person-card-button"
                  onClick={() => setProfileStudent({ id: student.id, fullName: student.fullName })}
                  type="button"
                >
                  <PersonPhotoAvatar
                    hasPhoto={student.hasPhoto}
                    kind="students"
                    personId={student.id}
                    personName={student.fullName}
                  />
                  <span className="class-list-copy student-list-copy">
                    <strong>{student.fullName}</strong>
                    <small>
                      {student.grade} · Turma {student.className} · {student.academicYear}
                    </small>
                    <span className="student-responsible-list">
                      {student.responsibles[0] && (
                        <span>
                          {student.responsibles[0].fullName} · {student.responsibles[0].phone}
                        </span>
                      )}
                      {student.responsibles.length > 1 && (
                        <span>+ {student.responsibles.length - 1} responsáveis</span>
                      )}
                    </span>
                  </span>
                  <span className="teacher-status">MATRÍCULA ATIVA</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {profileStudent && (
        <PersonProfile
          canEditPhoto
          canEditProfile
          kind="students"
          onProfileUpdated={(updated) => {
            const fullName = updated.fullName;
            const updatedResponsibles = updated.responsibles;
            if (fullName && updatedResponsibles) {
              setStudents((current) => current.map((student) =>
                student.id === updated.id
                  ? { ...student, fullName, responsibles: updatedResponsibles }
                  : student,
              ).sort((a, b) => a.fullName.localeCompare(b.fullName)));
              setProfileStudent((current) => current
                ? { ...current, fullName }
                : current);
            }
          }}
          onClose={() => setProfileStudent(null)}
          personId={profileStudent.id}
          personName={profileStudent.fullName}
        />
      )}
    </>
  );
}
