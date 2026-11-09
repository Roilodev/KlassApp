"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { SchoolClass } from "../turmas/class-form";
import { PersonProfile } from "../person-profile";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const studentsPerPage = 25;
const studentCollator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatRegistrationDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
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
  createdAt: string;
  homeAddress: string;
  hasPhoto: boolean;
  isActive: boolean;
  leaveDate: string | null;
  leaveReason: string | null;
  academicYear: number | null;
  grade: string | null;
  className: string | null;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [fullName, setFullName] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [responsibles, setResponsibles] = useState([emptyResponsible()]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [profileStudent, setProfileStudent] = useState<{ id: string; fullName: string } | null>(null);
  const activeStudentsCount = students.filter((student) => student.isActive).length;
  const inactiveStudentsCount = students.length - activeStudentsCount;

  useEffect(() => {
    function onPhotoUpdated(event: Event) {
      const { kind, personId, hasPhoto } = (
        event as CustomEvent<{ kind: string; personId: string; hasPhoto: boolean }>
      ).detail;
      if (kind !== "students") return;
      setStudents((current) =>
        current.map((student) =>
          student.id === personId ? { ...student, hasPhoto } : student,
        ),
      );
    }

    window.addEventListener("klassapp:person-photo-updated", onPhotoUpdated);
    return () => window.removeEventListener("klassapp:person-photo-updated", onPhotoUpdated);
  }, []);

  const searchTerm = normalizeSearch(search.trim());
  const phoneSearch = search.replace(/\D/g, "");
  const filteredStudents = students.filter((student) => {
    const text = normalizeSearch([
      student.fullName,
      student.homeAddress,
      student.grade ?? "",
      student.className ?? "",
      String(student.academicYear ?? ""),
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
  const sortedStudents = [...filteredStudents].sort((left, right) =>
    studentCollator.compare(left.grade ?? "", right.grade ?? "") ||
    studentCollator.compare(left.className ?? "", right.className ?? "") ||
    (right.academicYear ?? 0) - (left.academicYear ?? 0) ||
    studentCollator.compare(left.fullName, right.fullName),
  );
  const totalPages = Math.ceil(sortedStudents.length / studentsPerPage);
  const pageStart = (currentPage - 1) * studentsPerPage;
  const pageStudents = sortedStudents.slice(pageStart, pageStart + studentsPerPage);
  const studentNumbers = new Map<string, number>();
  const groupNumbers = new Map<string, number>();
  for (const student of sortedStudents) {
    const key = `${student.grade ?? ""}\u0000${student.className ?? ""}\u0000${student.academicYear ?? ""}`;
    const number = (groupNumbers.get(key) ?? 0) + 1;
    groupNumbers.set(key, number);
    studentNumbers.set(student.id, number);
  }
  const studentGroups = pageStudents.reduce<Array<{
    key: string;
    label: string;
    students: Student[];
  }>>((groups, student) => {
    const key = `${student.grade ?? ""}\u0000${student.className ?? ""}\u0000${student.academicYear ?? ""}`;
    const currentGroup = groups[groups.length - 1];
    if (currentGroup?.key === key) {
      currentGroup.students.push(student);
    } else {
      groups.push({
        key,
        label: student.grade && student.className && student.academicYear
          ? `${student.grade} · Turma ${student.className} · ${student.academicYear}`
          : "Sem matrícula",
        students: [student],
      });
    }
    return groups;
  }, []);
  const visiblePages: Array<number | "ellipsis-start" | "ellipsis-end"> =
    totalPages <= 7
      ? Array.from({ length: totalPages }, (_, index) => index + 1)
      : currentPage <= 4
        ? [1, 2, 3, 4, 5, "ellipsis-end", totalPages]
        : currentPage >= totalPages - 3
          ? [1, "ellipsis-start", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
          : [1, "ellipsis-start", currentPage - 1, currentPage, currentPage + 1, "ellipsis-end", totalPages];

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
          homeAddress,
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
      setHomeAddress("");
      setSelectedClassId("");
      setResponsibles([emptyResponsible()]);
      setCurrentPage(1);
      setSuccess("Aluno cadastrado e matriculado com sucesso.");
      setIsFormOpen(false);
      setProfileStudent({ id: createdStudent.id, fullName: createdStudent.fullName });
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  function openStudentProfile(student: Student) {
    setProfileStudent({ id: student.id, fullName: student.fullName });
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
          <div className="class-list-actions">
            <button
              className="class-submit"
              disabled={classes.length === 0}
              onClick={() => {
                setError("");
                setSuccess("");
                setIsFormOpen(true);
              }}
              type="button"
            >
              Novo aluno
            </button>
            <div className="student-status-counts" aria-label="Resumo de alunos">
              <span className="student-status-count is-active">{activeStudentsCount} ativos</span>
              <span className="student-status-count is-inactive">{inactiveStudentsCount} de baixa</span>
            </div>
          </div>
        </div>
        {classes.length === 0 && (
          <p className="student-create-hint">
            Cadastre uma turma antes de registrar alunos. <Link href="/turmas">Ir para Turmas</Link>
          </p>
        )}
        {success && <p className="form-message form-success" role="status">{success}</p>}
        <div className="student-table-tools">
          <label className="people-search">
            <span>Buscar aluno</span>
            <input
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Nome, endereço, turma, responsável ou telefone"
              type="search"
              value={search}
            />
          </label>
          {students.length > 0 && (
            <p className="student-results-count" aria-live="polite">
              {filteredStudents.length === 0
                ? "Nenhum aluno encontrado"
                : `Mostrando ${pageStart + 1}–${Math.min(pageStart + studentsPerPage, filteredStudents.length)} de ${filteredStudents.length} alunos`}
            </p>
          )}
        </div>

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
          <>
            <div className="student-table-scroll" tabIndex={0} aria-label="Lista de alunos; use a rolagem horizontal para ver todas as colunas">
              <table className="student-table">
                <thead>
                  <tr>
                    <th scope="col">N.º</th>
                    <th scope="col">Aluno</th>
                    <th scope="col">Responsável</th>
                    <th scope="col">Endereço</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Ações</th>
                  </tr>
                </thead>
                {studentGroups.map((group) => (
                  <tbody key={group.key}>
                    <tr className="student-table-group">
                      <th colSpan={6} scope="rowgroup">
                        <span>{group.label}</span>
                        <small>{group.students.length} {group.students.length === 1 ? "aluno" : "alunos"}</small>
                      </th>
                    </tr>
                    {group.students.map((student) => (
                      <tr
                        aria-label={`${student.fullName}: abrir ficha`}
                        className="student-table-clickable-row"
                        key={student.id}
                        onClick={() => openStudentProfile(student)}
                        onKeyDown={(event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            openStudentProfile(student);
                          }
                        }}
                        tabIndex={0}
                      >
                        <td>
                          <span className="student-table-number">
                            {studentNumbers.get(student.id)}
                            {student.hasPhoto && (
                              <span
                                aria-label="Tem foto cadastrada"
                                className="student-table-photo-indicator"
                                role="img"
                              />
                            )}
                          </span>
                        </td>
                        <td>
                          <div className="student-table-person">
                            <span className="student-table-person-copy">
                              <strong className="student-table-name">
                                {student.fullName}
                              </strong>
                              <small className="student-table-registration-date">
                                Cadastro em {formatRegistrationDate(student.createdAt)}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td>
                          {student.responsibles[0] ? (
                            <span className="student-table-contact">
                              {student.responsibles.map((responsible) => (
                                <span className="student-table-contact-person" key={responsible.id}>
                                  <span className="student-table-contact-primary">{responsible.fullName}</span>
                                  <span className="student-table-contact-secondary">
                                    {[responsible.relationship, responsible.phone].filter(Boolean).join(" · ") || " "}
                                  </span>
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="student-table-muted">Não informado</span>
                          )}
                        </td>
                        <td>
                          {student.homeAddress ? (
                            <span className="student-table-address">{student.homeAddress}</span>
                          ) : (
                            <span className="student-table-muted">Não informado</span>
                          )}
                        </td>
                        <td>
                          <span className={`student-status-badge ${student.isActive ? "is-active" : "is-inactive"}`}>
                            {student.isActive ? "Ativo" : "Baja"}
                          </span>
                        </td>
                        <td className="student-table-row-actions-cell">
                          <button
                            className="student-table-row-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              openStudentProfile(student);
                            }}
                            type="button"
                          >
                            Ver ficha
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            {totalPages > 1 && (
              <nav className="student-pagination" aria-label="Paginação de alunos">
                <button
                  aria-label="Página anterior"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => page - 1)}
                  type="button"
                >
                  Anterior
                </button>
                <div className="student-pagination-pages" aria-label="Selecionar página">
                  {visiblePages.map((page, index) =>
                    typeof page === "number" ? (
                      <button
                        aria-current={page === currentPage ? "page" : undefined}
                        aria-label={`Página ${page}`}
                        className={page === currentPage ? "active" : ""}
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        type="button"
                      >
                        {page}
                      </button>
                    ) : (
                      <span aria-hidden="true" key={`${page}-${index}`}>…</span>
                    ),
                  )}
                </div>
                <span className="student-pagination-current" aria-live="polite">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  aria-label="Página siguiente"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((page) => page + 1)}
                  type="button"
                >
                  Próxima
                </button>
              </nav>
            )}
          </>
        )}
      </section>
      {profileStudent && (
        <PersonProfile
          canEditPhoto
          canEditProfile
          kind="students"
          onProfileUpdated={(updated) => {
            const fullName = updated.fullName;
            const homeAddress = updated.homeAddress;
            const updatedResponsibles = updated.responsibles;
            setStudents((current) => current.map((student) => {
              if (student.id !== updated.id) return student;
              return {
                ...student,
                ...(fullName ? { fullName } : {}),
                ...(homeAddress !== undefined ? { homeAddress } : {}),
                ...(updatedResponsibles ? { responsibles: updatedResponsibles } : {}),
                ...(updated.isActive !== undefined ? { isActive: updated.isActive } : {}),
                ...(updated.leaveDate !== undefined ? { leaveDate: updated.leaveDate } : {}),
                ...(updated.leaveReason !== undefined ? { leaveReason: updated.leaveReason } : {}),
              };
            }).sort((a, b) => a.fullName.localeCompare(b.fullName)));
            if (fullName) {
              setProfileStudent((current) => current ? { ...current, fullName } : current);
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
