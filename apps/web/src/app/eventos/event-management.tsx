"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { EntryFormDialog } from "../entry-form-dialog";
import type { SchoolClass } from "../turmas/class-form";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type AudienceType = "school" | "grade" | "class";

interface GradeAudience {
  grade: string;
  year: number;
}

export interface SchoolEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  audienceType: AudienceType;
  audienceLabel: string;
  timeZone: string;
  status: "published" | "cancelled";
  createdAt: string;
}

interface EventManagementProps {
  initialEvents: SchoolEvent[];
  classes: SchoolClass[];
  schoolName: string;
}

function getGradeAudiences(classes: SchoolClass[]): GradeAudience[] {
  const audiences = new Map<string, GradeAudience>();
  for (const schoolClass of classes) {
    const key = JSON.stringify([schoolClass.year, schoolClass.grade]);
    audiences.set(key, { grade: schoolClass.grade, year: schoolClass.year });
  }
  return [...audiences.values()].sort(
    (left, right) => right.year - left.year || left.grade.localeCompare(right.grade),
  );
}

function formatEventDate(value: string, timeZone: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  });
}

function eventDateParts(value: string, timeZone: string) {
  const date = new Date(value);
  const dateParts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone,
  }).formatToParts(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
  return {
    day: dateParts.find((part) => part.type === "day")?.value ?? "",
    month: dateParts.find((part) => part.type === "month")?.value.replace(".", "").toUpperCase() ?? "",
    weekday: new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      timeZone,
    }).format(date),
    time,
  };
}

export function EventManagement({ initialEvents, classes, schoolName }: EventManagementProps) {
  const gradeAudiences = getGradeAudiences(classes);
  const [events, setEvents] = useState(initialEvents);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("class");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [gradeKey, setGradeKey] = useState(
    gradeAudiences[0] ? JSON.stringify([gradeAudiences[0].year, gradeAudiences[0].grade]) : "",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [presentationError, setPresentationError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const presentationRef = useRef<HTMLElement>(null);

  const upcomingEvents = events
    .filter((schoolEvent) =>
      schoolEvent.status === "published" &&
      new Date(schoolEvent.startsAt).getTime() >= currentTime,
    )
    .sort((left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );

  useEffect(() => {
    if (!isPresentationOpen) return;

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        setIsPresentationOpen(false);
      }
    }

    function updateClock() {
      setCurrentTime(Date.now());
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    const timer = window.setInterval(updateClock, 60_000);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.clearInterval(timer);
    };
  }, [isPresentationOpen]);

  async function closePresentation() {
    if (document.fullscreenElement === presentationRef.current) {
      await document.exitFullscreen().catch(() => {
        setPresentationError("Não foi possível sair do modo imersivo pelo navegador.");
      });
    }
    setIsPresentationOpen(false);
  }

  async function openPresentation(element: HTMLElement) {
    try {
      await element.requestFullscreen();
    } catch {
      setPresentationError(
        "Não foi possível ativar a tela cheia. Verifique as permissões do navegador.",
      );
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const selectedGrade = gradeAudiences.find(
        (audience) => JSON.stringify([audience.year, audience.grade]) === gradeKey,
      );
      const response = await fetch(`${apiUrl}/events`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          startsAt,
          location,
          audienceType,
          ...(audienceType === "class"
            ? { classId }
            : audienceType === "grade"
              ? { grade: selectedGrade?.grade, year: selectedGrade?.year }
              : {}),
        }),
      });
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível publicar o evento.");
        return;
      }

      const created = (await response.json()) as SchoolEvent;
      setEvents((current) => [created, ...current]);
      setTitle("");
      setDescription("");
      setStartsAt("");
      setLocation("");
      setIsFormOpen(false);
      setMessage("Evento registrado na agenda da escola.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelEvent(schoolEvent: SchoolEvent) {
    if (!window.confirm(`Cancelar o evento “${schoolEvent.title}”?`)) {
      return;
    }
    setError("");
    setMessage("");
    setCancellingId(schoolEvent.id);
    try {
      const response = await fetch(`${apiUrl}/events/${schoolEvent.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        await showRequestError(response, setError, "Não foi possível cancelar o evento.");
        return;
      }
      setEvents((current) =>
        current.map((item) =>
          item.id === schoolEvent.id ? { ...item, status: "cancelled" } : item,
        ),
      );
      setMessage("Evento cancelado. O registro foi mantido no histórico.");
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setCancellingId("");
    }
  }

  return (
    <>
      <section className="class-panel student-create-panel event-create-panel" aria-labelledby="event-create-heading">
        <div className="student-create-copy">
          <div className="setup-icon" aria-hidden="true">▣</div>
          <div>
            <p className="card-kicker">AGENDA DA COMUNIDADE</p>
            <h2 id="event-create-heading">Eventos escolares</h2>
            <p>Publique eventos para toda a escola, um ano escolar ou uma turma.</p>
          </div>
        </div>
        <button
          className="class-submit student-create-button"
          onClick={() => {
            setError("");
            setMessage("");
            setIsFormOpen(true);
          }}
          type="button"
        >
          + Novo evento
        </button>
        <button
          className="event-display-button"
          onClick={() => {
            flushSync(() => {
              setPresentationError("");
              setCurrentTime(Date.now());
              setIsPresentationOpen(true);
            });
            const presentation = presentationRef.current;
            if (presentation) {
              void openPresentation(presentation);
            }
          }}
          type="button"
        >
          <span aria-hidden="true">▣</span> Exibir no painel
        </button>
        {classes.length === 0 && (
          <p className="student-create-hint">Você pode publicar eventos para toda a escola. Cadastre turmas para direcionar eventos a um grupo. <Link href="/turmas">Ir para Turmas</Link></p>
        )}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
      </section>

      {isFormOpen && (
        <EntryFormDialog
          description="Escolha quem deve participar: toda a escola, uma turma ou todas as turmas de um ano escolar."
          eyebrow="AGENDA DA COMUNIDADE"
          icon="▣"
          isBusy={submitting}
          onClose={() => setIsFormOpen(false)}
          title="Registre um evento"
          titleId="create-event-title"
        >
          <form className="event-form" onSubmit={createEvent}>
            <label>
              Nome do evento
              <input
                autoComplete="off"
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Festa da primavera"
                required
                value={title}
              />
            </label>
            <label>
              Data e hora
              <input
                onChange={(event) => setStartsAt(event.target.value)}
                required
                type="datetime-local"
                value={startsAt}
              />
            </label>
            <label>
              Local (opcional)
              <input
                maxLength={160}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Ex.: Pátio da escola"
                value={location}
              />
            </label>
            <label>
              Público do evento
              <select
                onChange={(event) => setAudienceType(event.target.value as AudienceType)}
                value={audienceType}
              >
                <option value="school">Toda a escola</option>
                <option value="class">Uma turma</option>
                <option value="grade">Todas as turmas de um ano escolar</option>
              </select>
            </label>
            {audienceType === "school" ? null : audienceType === "class" ? (
              <label>
                Turma
                <select
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
            ) : (
              <label>
                Ano escolar e ano letivo
                <select
                  onChange={(event) => setGradeKey(event.target.value)}
                  required
                  value={gradeKey}
                >
                  {gradeAudiences.map((audience) => {
                    const key = JSON.stringify([audience.year, audience.grade]);
                    return (
                      <option key={key} value={key}>
                        {audience.grade} · {audience.year}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
            <label className="event-description-field">
              Detalhes (opcional)
              <textarea
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Conte às famílias e à equipe um pouco mais sobre o evento."
                rows={3}
                value={description}
              />
            </label>
            <p className="privacy-note event-notice">
              O evento ficará visível nesta área da administração. Ainda não há portal dos responsáveis nem envio de mensagens por WhatsApp.
            </p>
            <button className="class-submit event-submit" disabled={submitting} type="submit">
              {submitting ? "Publicando..." : "Publicar evento"}
            </button>
          </form>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
        </EntryFormDialog>
      )}

      <section className="class-list-panel" aria-labelledby="events-title">
        <div className="section-heading class-list-heading">
          <div>
            <p className="card-kicker">AGENDA DA ESCOLA</p>
            <h2 id="events-title">Agenda de eventos</h2>
          </div>
          <span className="class-count">{events.length}</span>
        </div>
        {events.length === 0 ? (
          <div className="empty-classes">
            <span aria-hidden="true">🎈</span>
            <strong>Nenhum evento por aqui ainda</strong>
            <p>Publique o primeiro para começar a montar a agenda da comunidade.</p>
          </div>
        ) : (
          <ul className="event-list">
            {events.map((schoolEvent) => (
              <li className={`event-list-item${schoolEvent.status === "cancelled" ? " event-cancelled" : ""}`} key={schoolEvent.id}>
                <span className="event-date-icon" aria-hidden="true">✿</span>
                <div className="event-list-copy">
                  <div className="event-title-row">
                    <strong>{schoolEvent.title}</strong>
                    <span className={`event-status${schoolEvent.status === "cancelled" ? " cancelled" : ""}`}>
                      {schoolEvent.status === "cancelled" ? "CANCELADO" : "PUBLICADO"}
                    </span>
                  </div>
                  <small>{formatEventDate(schoolEvent.startsAt, schoolEvent.timeZone)} · {schoolEvent.audienceLabel}</small>
                  {schoolEvent.location && <small>Local: {schoolEvent.location}</small>}
                  {schoolEvent.description && <p>{schoolEvent.description}</p>}
                </div>
                {schoolEvent.status === "published" && (
                  <button
                    className="event-cancel-button"
                    disabled={Boolean(cancellingId)}
                    onClick={() => cancelEvent(schoolEvent)}
                    type="button"
                  >
                    {cancellingId === schoolEvent.id ? "Cancelando..." : "Cancelar"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isPresentationOpen && (
        <section
          aria-labelledby="event-presentation-title"
          className="event-presentation"
          ref={presentationRef}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !document.fullscreenElement) {
              setIsPresentationOpen(false);
            }
          }}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div className="event-presentation-topbar">
            <div className="event-presentation-brand">
              <span className="event-presentation-mark" aria-hidden="true">✿</span>
              <span>{schoolName}<small>AGENDA DA ESCOLA</small></span>
            </div>
            <button
              aria-label="Fechar painel de eventos"
              className="event-presentation-close"
              onClick={() => void closePresentation()}
              type="button"
            >
              <span aria-hidden="true">×</span> Sair do painel
            </button>
          </div>
          <header className="event-presentation-heading">
            <p>ENCONTROS QUE NOS APROXIMAM <span aria-hidden="true">✦</span></p>
            <h2 id="event-presentation-title">O que vem por aí</h2>
            <span className="event-presentation-count">
              {upcomingEvents.length} {upcomingEvents.length === 1 ? "próximo evento" : "próximos eventos"}
            </span>
          </header>
          {presentationError && (
            <p className="event-presentation-notice" role="status">{presentationError}</p>
          )}
          {upcomingEvents.length === 0 ? (
            <div className="event-presentation-empty">
              <span aria-hidden="true">🌱</span>
              <h3>Um novo encontro está sendo preparado</h3>
              <p>Quando a escola publicar um evento, ele aparecerá aqui.</p>
            </div>
          ) : (
            <div className="event-presentation-grid">
              {upcomingEvents.map((schoolEvent, index) => {
                const date = eventDateParts(schoolEvent.startsAt, schoolEvent.timeZone);
                return (
                  <article
                    className={`event-presentation-card event-presentation-card-${index % 4}`}
                    key={schoolEvent.id}
                  >
                    <span className="event-presentation-card-spark" aria-hidden="true">
                      {index % 2 === 0 ? "✦" : "✿"}
                    </span>
                    <div className="event-presentation-date">
                      <strong>{date.day}</strong>
                      <span>{date.month}</span>
                    </div>
                    <div className="event-presentation-copy">
                      <span className="event-presentation-weekday">{date.weekday} · {date.time}</span>
                      <h3>{schoolEvent.title}</h3>
                      <span className="event-presentation-audience">{schoolEvent.audienceLabel}</span>
                      {schoolEvent.location && (
                        <span className="event-presentation-location">
                          <span aria-hidden="true">⌖</span> {schoolEvent.location}
                        </span>
                      )}
                      {schoolEvent.description && <p>{schoolEvent.description}</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <footer className="event-presentation-footer">
            <span>Feito com carinho para a comunidade escolar</span>
            <span aria-hidden="true">♥</span>
          </footer>
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
    setError("Somente a administração pode alterar eventos.");
  } else if (response.status === 429) {
    setError("Muitas tentativas. Aguarde um momento e tente novamente.");
  } else {
    const result = await response.json().catch(() => null);
    setError(typeof result?.message === "string" ? result.message : fallback);
  }
}
