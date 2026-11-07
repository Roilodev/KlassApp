"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { EntryFormDialog } from "../entry-form-dialog";
import { PersonProfile } from "../person-profile";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const categories = [
  { value: "participation", label: "Participação" },
  { value: "collaboration", label: "Colaboração e convivência" },
  { value: "responsibility", label: "Responsabilidade" },
  { value: "learning", label: "Envolvimento na aprendizagem" },
  { value: "positive", label: "Destaque positivo" },
  { value: "other", label: "Outro fato observado" },
] as const;

type BehaviorCategory = (typeof categories)[number]["value"];

export interface BehaviorClass {
  id: string;
  year: number;
  grade: string;
  name: string;
}

interface BehaviorStudent {
  id: string;
  enrollmentId: string;
  fullName: string;
}

interface BehaviorRecord {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  classId: string;
  classLabel: string;
  category: BehaviorCategory;
  description: string;
  occurredOn: string;
  recordedBy: string;
  createdAt: string;
}

interface BehaviorManagementProps {
  classes: BehaviorClass[];
  canEditPhoto: boolean;
}

function localDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRecordDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("pt-BR", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

function categoryLabel(value: BehaviorCategory) {
  return categories.find((category) => category.value === value)?.label ?? "Outro fato observado";
}

function sortBehaviorRecords(records: BehaviorRecord[]) {
  return [...records].sort(
    (left, right) =>
      right.occurredOn.localeCompare(left.occurredOn) ||
      right.createdAt.localeCompare(left.createdAt),
  );
}

export function BehaviorManagement({ classes, canEditPhoto }: BehaviorManagementProps) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [students, setStudents] = useState<BehaviorStudent[]>([]);
  const [studentId, setStudentId] = useState("");
  const [records, setRecords] = useState<BehaviorRecord[]>([]);
  const [occurredOn, setOccurredOn] = useState(localDateValue);
  const [category, setCategory] = useState<BehaviorCategory>("participation");
  const [description, setDescription] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const selectedStudent = students.find((student) => student.id === studentId);

  useEffect(() => {
    if (!classId) {
      return;
    }

    const controller = new AbortController();
    async function loadStudents() {
      setLoadingStudents(true);
      setError("");
      try {
        const response = await fetch(`${apiUrl}/behavior/classes/${classId}/students`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          await showRequestError(response, setError, "Não foi possível carregar os alunos da turma.");
          return;
        }
        setStudents(await response.json() as BehaviorStudent[]);
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingStudents(false);
        }
      }
    }
    void loadStudents();

    return () => controller.abort();
  }, [classId]);

  useEffect(() => {
    if (!studentId) {
      return;
    }

    const controller = new AbortController();
    async function loadRecords() {
      setLoadingRecords(true);
      setRecordsError("");
      try {
        const response = await fetch(`${apiUrl}/behavior/students/${studentId}/records`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          await showRequestError(response, setRecordsError, "Não foi possível carregar o histórico.");
          return;
        }
        setRecords(sortBehaviorRecords(await response.json() as BehaviorRecord[]));
      } catch (requestError) {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setRecordsError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingRecords(false);
        }
      }
    }
    void loadRecords();

    return () => controller.abort();
  }, [studentId]);

  async function addRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const student = students.find((item) => item.id === studentId);
    if (!student) {
      setError("Selecione um aluno com matrícula ativa.");
      return;
    }
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/behavior/records`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId: student.enrollmentId,
          category,
          description,
          occurredOn,
        }),
      });
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível salvar o registro.");
        return;
      }
      const created = await response.json() as BehaviorRecord;
      setRecords((current) => sortBehaviorRecords([created, ...current]));
      setDescription("");
      setIsFormOpen(false);
      setMessage("Registro adicionado ao histórico do estudante.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="class-panel behavior-entry-panel" aria-labelledby="behavior-create-heading">
        <div className="class-panel-heading">
          <div className="setup-icon" aria-hidden="true">♡</div>
          <div>
            <p className="card-kicker">ACOMPANHAMENTO CUIDADOSO</p>
            <h2 id="behavior-create-heading">Histórico de comportamento</h2>
            <p>Selecione uma turma e um aluno para consultar ou registrar uma observação.</p>
          </div>
        </div>

        {classes.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">▦</span>
            <strong>Nenhuma turma disponível</strong>
            <p>Cadastre uma turma ou solicite à administração que atribua uma turma ao seu acesso.</p>
          </div>
        ) : (
          <>
            <div className="behavior-selection-fields">
            <label>
              Turma
              <select
                onChange={(event) => {
                  setClassId(event.target.value);
                  setStudents([]);
                  setStudentId("");
                  setRecords([]);
                  setRecordsError("");
                  setLoadingStudents(false);
                  setLoadingRecords(false);
                  setError("");
                  setMessage("");
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
              Aluno
              <select
                disabled={loadingStudents || students.length === 0}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setRecords([]);
                  setRecordsError("");
                  setLoadingRecords(false);
                  setError("");
                  setMessage("");
                }}
                required
                value={studentId}
              >
                <option value="">
                  {loadingStudents ? "Carregando alunos..." : "Selecione um aluno"}
                </option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{student.fullName}</option>
                ))}
              </select>
            </label>
            </div>
            <button
              className="class-submit behavior-create-button"
              disabled={!studentId}
              onClick={() => {
                setError("");
                setMessage("");
                setIsFormOpen(true);
              }}
              type="button"
            >
              + Nova observação
            </button>
            {!studentId && (
              <p className="student-create-hint">
                {loadingStudents
                  ? "Carregando alunos da turma..."
                  : students.length === 0
                    ? "Nenhum aluno com matrícula ativa nesta turma."
                    : "Selecione um aluno antes de registrar uma observação."}
              </p>
            )}
          </>
        )}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
      </section>

      {isFormOpen && (
        <EntryFormDialog
          description="Descreva uma situação específica, usando linguagem objetiva e respeitosa."
          eyebrow="ACOMPANHAMENTO CUIDADOSO"
          icon="♡"
          isBusy={submitting}
          onClose={() => setIsFormOpen(false)}
          title="Registre uma observação"
          titleId="create-behavior-title"
        >
          {selectedStudent && (
            <p className="behavior-target-student">
              Aluno: <strong>{selectedStudent.fullName}</strong>
            </p>
          )}
          <form className="behavior-form" onSubmit={addRecord}>
            <label>
              Data do fato
              <input
                max={localDateValue()}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                type="date"
                value={occurredOn}
              />
            </label>
            <label>
              Tipo de observação
              <select
                onChange={(event) => setCategory(event.target.value as BehaviorCategory)}
                value={category}
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="behavior-description-field">
              O que aconteceu?
              <textarea
                maxLength={1200}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Registre fatos observáveis e o contexto, sem rótulos ou diagnósticos."
                required
                rows={4}
                value={description}
              />
            </label>
            <p className="privacy-note behavior-form-notice">
              Este histórico é interno e não é enviado a responsáveis. Evite diagnósticos, rótulos ou informações que não sejam necessárias para o acompanhamento escolar.
            </p>
            <button
              className="class-submit behavior-submit"
              disabled={submitting || !studentId}
              type="submit"
            >
              {submitting ? "Salvando..." : "Adicionar ao histórico"}
            </button>
          </form>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
        </EntryFormDialog>
      )}

      <section className="class-list-panel" aria-labelledby="behavior-history-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">HISTÓRICO INDIVIDUAL</p>
            <h2 id="behavior-history-title">
              {selectedStudent?.fullName ?? "Escolha um aluno"}
            </h2>
          </div>
          {studentId && (
            <div className="profile-history-actions">
              <button
                className="profile-link-button"
                onClick={() => setShowStudentProfile(true)}
                type="button"
              >
                Ver perfil completo
              </button>
              <span className="class-count">{records.length}</span>
            </div>
          )}
        </div>
        {!studentId ? (
          <div className="empty-classes">
            <span aria-hidden="true">✿</span>
            <strong>Selecione um aluno para consultar o histórico</strong>
            <p>O acesso ao histórico é filtrado pelas turmas associadas ao seu perfil.</p>
          </div>
        ) : loadingRecords ? (
          <p className="assessment-loading">Carregando o histórico...</p>
        ) : recordsError ? (
          <p className="form-message form-error" role="alert">{recordsError}</p>
        ) : records.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">🌱</span>
            <strong>Este estudante ainda não tem observações registradas</strong>
            <p>Adicione fatos concretos e importantes para acompanhar seu percurso.</p>
          </div>
        ) : (
          <ol className="behavior-history">
            {records.map((record) => (
              <li className="behavior-record" key={record.id}>
                <span className="behavior-record-marker" aria-hidden="true">✿</span>
                <div className="behavior-record-content">
                  <div className="behavior-record-heading">
                    <strong>{categoryLabel(record.category)}</strong>
                    <time dateTime={record.occurredOn}>{formatRecordDate(record.occurredOn)}</time>
                  </div>
                  <p>{record.description}</p>
                  <small>{record.classLabel} · Registrado por {record.recordedBy}</small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      {showStudentProfile && selectedStudent && (
        <PersonProfile
          canEditPhoto={canEditPhoto}
          canEditProfile={canEditPhoto}
          kind="students"
          onProfileUpdated={(updated) => {
            const fullName = updated.fullName;
            if (fullName) {
              setStudents((current) => current.map((student) =>
                student.id === updated.id ? { ...student, fullName } : student,
              ));
            }
          }}
          onClose={() => setShowStudentProfile(false)}
          personId={selectedStudent.id}
          personName={selectedStudent.fullName}
        />
      )}
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
    setError("Você não tem permissão para acessar esta turma.");
  } else if (response.status === 429) {
    setError("Muitas tentativas. Aguarde um momento e tente novamente.");
  } else {
    const result = await response.json().catch(() => null);
    setError(typeof result?.message === "string" ? result.message : fallback);
  }
}
