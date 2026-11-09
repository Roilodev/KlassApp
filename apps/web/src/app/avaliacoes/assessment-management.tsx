"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { EntryFormDialog } from "../entry-form-dialog";
import type { SchoolSubject } from "../horarios/schedule-management";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface AssessmentClass {
  id: string;
  year: number;
  grade: string;
  name: string;
}

export interface AssessmentRecord {
  id: string;
  classId: string;
  classLabel: string;
  year: number;
  title: string;
  subjectId: string;
  subject: string;
  scheduledOn: string;
  maxPoints: number;
}

interface StudentResult {
  studentId: string;
  fullName: string;
  score: number | null;
  updatedAt: string | null;
}

interface AssessmentManagementProps {
  initialAssessments: AssessmentRecord[];
  classes: AssessmentClass[];
  subjects: SchoolSubject[];
}

function sortAssessments(assessments: AssessmentRecord[]) {
  return [...assessments].sort(
    (left, right) =>
      right.scheduledOn.localeCompare(left.scheduledOn) ||
      left.classLabel.localeCompare(right.classLabel),
  );
}

function formatAssessmentDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("pt-BR", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

export function AssessmentManagement({
  initialAssessments,
  classes,
  subjects,
}: AssessmentManagementProps) {
  const [assessments, setAssessments] = useState(() => sortAssessments(initialAssessments));
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [scheduledOn, setScheduledOn] = useState("");
  const [maxPoints, setMaxPoints] = useState("10");
  const [students, setStudents] = useState<StudentResult[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentRecord | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);

  function editAssessment(assessment: AssessmentRecord) {
    setEditingAssessmentId(assessment.id);
    setClassId(assessment.classId);
    setTitle(assessment.title);
    setSubjectId(assessment.subjectId);
    setScheduledOn(assessment.scheduledOn.slice(0, 10));
    setMaxPoints(String(assessment.maxPoints));
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  function startNewAssessment() {
    setEditingAssessmentId(null);
    setClassId(classes[0]?.id ?? "");
    setTitle("");
    setSubjectId(subjects[0]?.id ?? "");
    setScheduledOn("");
    setMaxPoints("10");
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  async function saveAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch(
        `${apiUrl}/assessments${editingAssessmentId ? `/${editingAssessmentId}` : ""}`,
        {
        method: editingAssessmentId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          title,
          subjectId,
          scheduledOn,
          maxPoints: Number(maxPoints),
        }),
        },
      );
      if (!response.ok) {
        await showRequestError(
          response,
          setError,
          editingAssessmentId
            ? "Não foi possível atualizar a avaliação."
            : "Não foi possível cadastrar a avaliação.",
        );
        return;
      }
      const saved = (await response.json()) as AssessmentRecord;
      const wasEditing = Boolean(editingAssessmentId);
      setAssessments((current) =>
        sortAssessments([...current.filter((item) => item.id !== saved.id), saved]),
      );
      if (selectedAssessment?.id === saved.id) {
        setSelectedAssessment(saved);
      }
      setIsFormOpen(false);
      setEditingAssessmentId(null);
      if (wasEditing) {
        setMessage("Avaliação atualizada.");
      } else {
        setTitle("");
        setSubjectId(subjects[0]?.id ?? "");
        setScheduledOn("");
        setClassId(classes[0]?.id ?? "");
        setMaxPoints("10");
        setMessage("Avaliação cadastrada. Agora você pode lançar os resultados.");
        await openResults(saved);
      }
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openResults(assessment: AssessmentRecord) {
    setError("");
    setMessage("");
    setSelectedAssessment(assessment);
    setStudents([]);
    setScores({});
    setLoadingResults(true);
    try {
      const response = await fetch(`${apiUrl}/assessments/${assessment.id}/students`, {
        credentials: "include",
      });
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível carregar a lista de alunos.");
        return;
      }
      const result = (await response.json()) as StudentResult[];
      setStudents(result);
      setScores(Object.fromEntries(
        result
          .filter((student) => student.score !== null)
          .map((student) => [student.studentId, String(student.score)]),
      ));
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setLoadingResults(false);
    }
  }

  async function saveScore(student: StudentResult) {
    const rawScore = scores[student.studentId] ?? "";
    if (rawScore.trim() === "") {
      setError("Informe a pontuação do aluno antes de salvar.");
      return;
    }
    setError("");
    setMessage("");
    setSavingStudentId(student.studentId);
    try {
      const response = await fetch(
        `${apiUrl}/assessments/${selectedAssessment?.id}/results`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: student.studentId, score: Number(rawScore) }),
        },
      );
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível salvar o resultado.");
        return;
      }
      const saved = (await response.json()) as StudentResult;
      setStudents((current) =>
        current.map((item) => item.studentId === saved.studentId ? saved : item),
      );
      setMessage(`Resultado de ${saved.fullName} salvo.`);
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSavingStudentId("");
    }
  }

  return (
    <>
      {isFormOpen && (
        <EntryFormDialog
          description={editingAssessmentId
            ? "Edite os dados da avaliação. A turma e os resultados registrados são preservados."
            : "Defina a turma, a matéria e a pontuação máxima. Você escolhe a escala de pontos."}
          eyebrow="ROTINA DE APRENDIZAGEM"
          icon="✎"
          isBusy={submitting}
          onClose={() => setIsFormOpen(false)}
          title={editingAssessmentId ? "Edite a avaliação" : "Cadastre uma avaliação"}
          titleId="create-assessment-title"
        >
          {subjects.length === 0 ? (
            <p className="subject-required-notice">
              Nenhuma matéria cadastrada. Peça à administração que cadastre as matérias da escola.
            </p>
          ) : <form className="assessment-form" onSubmit={saveAssessment}>
            <label>
              Turma
              <select
                disabled={Boolean(editingAssessmentId)}
                onChange={(event) => setClassId(event.target.value)}
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
              Avaliação
              <input
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Atividade do capítulo 3"
                required
                value={title}
              />
            </label>
            <label>
              Matéria
              <select
                onChange={(event) => setSubjectId(event.target.value)}
                required
                value={subjectId}
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input
                onChange={(event) => setScheduledOn(event.target.value)}
                required
                type="date"
                value={scheduledOn}
              />
            </label>
            <label>
              Pontuação máxima
              <input
                max="10000"
                min="0.01"
                onChange={(event) => setMaxPoints(event.target.value)}
                required
                step="0.01"
                type="number"
                value={maxPoints}
              />
            </label>
            <div className="dialog-form-actions">
              <button className="class-submit assessment-submit" disabled={submitting} type="submit">
                {submitting
                  ? "Salvando..."
                  : editingAssessmentId ? "Salvar alterações" : "Cadastrar avaliação"}
              </button>
              <button className="class-cancel-edit" disabled={submitting} onClick={() => setIsFormOpen(false)} type="button">
                Fechar
              </button>
            </div>
          </form>}
          {error && <p className="form-message form-error" role="alert">{error}</p>}
        </EntryFormDialog>
      )}

      <section className="class-list-panel" aria-labelledby="assessments-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">ACOMPANHAMENTO ESCOLAR</p>
            <h2 id="assessments-title">Avaliações cadastradas</h2>
          </div>
          <div className="class-list-actions">
            <button
              className="class-submit"
              disabled={classes.length === 0 || subjects.length === 0}
              onClick={startNewAssessment}
              type="button"
            >
              Nova avaliação
            </button>
            <span className="class-count">{assessments.length}</span>
          </div>
        </div>
        {classes.length === 0 && (
          <p className="student-create-hint">Nenhuma turma disponível para criar avaliações.</p>
        )}
        {subjects.length === 0 && (
          <p className="student-create-hint">Cadastre matérias antes de criar avaliações.</p>
        )}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
        {assessments.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">✿</span>
            <strong>As avaliações aparecerão aqui</strong>
            <p>Cadastre a primeira para começar a acompanhar os resultados da turma.</p>
          </div>
        ) : (
          <ul className="assessment-list">
            {assessments.map((assessment) => (
              <li className="assessment-list-item" key={assessment.id}>
                <span className="assessment-icon" aria-hidden="true">✎</span>
                <span className="assessment-list-copy">
                  <strong>{assessment.title}</strong>
                  <small>{assessment.subject} · {assessment.classLabel} · {assessment.year}</small>
                  <small>{formatAssessmentDate(assessment.scheduledOn)} · Máximo: {assessment.maxPoints} pontos</small>
                </span>
                <div className="assessment-list-actions">
                  <button
                    className="assessment-open-button"
                    onClick={() => openResults(assessment)}
                    type="button"
                  >
                    Lançar resultados
                  </button>
                  <button
                    className="assessment-edit-button dialog-edit-button"
                    onClick={() => editAssessment(assessment)}
                    type="button"
                  >
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedAssessment && (
        <section className="class-list-panel" aria-labelledby="assessment-results-title">
          <div className="section-heading class-list-heading">
            <div>
              <p className="card-kicker">RESULTADOS DA TURMA</p>
              <h2 id="assessment-results-title">{selectedAssessment.title}</h2>
              <p className="assessment-results-subtitle">
                {selectedAssessment.subject} · {selectedAssessment.classLabel} ·
                {" "}pontuação máxima: {selectedAssessment.maxPoints}
              </p>
            </div>
          </div>
          {loadingResults ? (
            <p className="assessment-loading">Carregando os alunos...</p>
          ) : students.length === 0 ? (
            <div className="empty-classes">
              <span aria-hidden="true">♧</span>
              <strong>Não há alunos com matrícula ativa nesta turma</strong>
            </div>
          ) : (
            <ul className="assessment-student-list">
              {students.map((student) => (
                <li className="assessment-student-item" key={student.studentId}>
                  <span className="student-avatar" aria-hidden="true">
                    {student.fullName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="assessment-student-name">{student.fullName}</span>
                  <label>
                    Pontos
                    <input
                      aria-label={`Pontos de ${student.fullName}`}
                      max={selectedAssessment.maxPoints}
                      min="0"
                      onChange={(event) =>
                        setScores((current) => ({
                          ...current,
                          [student.studentId]: event.target.value,
                        }))
                      }
                      step="0.01"
                      type="number"
                      value={scores[student.studentId] ?? ""}
                    />
                    <span className="assessment-score-max">de {selectedAssessment.maxPoints}</span>
                  </label>
                  <button
                    className="assessment-save-button"
                    disabled={Boolean(savingStudentId)}
                    onClick={() => saveScore(student)}
                    type="button"
                  >
                    {savingStudentId === student.studentId ? "Salvando..." : "Salvar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="class-details-actions">
            <button
              className="assessment-close-button"
              onClick={() => {
                setSelectedAssessment(null);
                setStudents([]);
              }}
              type="button"
            >
              Fechar
            </button>
          </div>
        </section>
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
