import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogoutButton } from "../logout-button";
import type { SchoolClass, SchoolClassSessions } from "../turmas/class-form";
import { ScheduleManagement } from "./schedule-management";
import type { ScheduleRecord, ScheduleTeacher, SchoolSubject } from "./schedule-management";
import { SectionIllustration } from "../section-illustration";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export default function SchedulesPage() {
  return (
    <Suspense fallback={<main className="loading-screen">Carregando os horários...</main>}>
      <SchedulesDashboard />
    </Suspense>
  );
}

async function SchedulesDashboard() {
  const cookieStore = await cookies();
  if (!cookieStore.has("klassapp_session")) {
    redirect("/login");
  }
  const headers = { cookie: cookieStore.toString() };
  const sessionResponse = await fetch(`${apiUrl}/auth/me`, {
    headers,
    cache: "no-store",
  });
  if (sessionResponse.status === 401 || sessionResponse.status === 403) {
    redirect("/login");
  }
  if (!sessionResponse.ok) {
    throw new Error("Não foi possível validar sua sessão.");
  }
  const session = await sessionResponse.json();
  if (session.school.role !== "admin") {
    redirect("/");
  }

  const [classResponse, teacherResponse, scheduleResponse, subjectResponse, sessionsResponse] = await Promise.all([
    fetch(`${apiUrl}/school-structure/classes`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/teachers`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/schedules`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/subjects`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/settings/class-sessions`, { headers, cache: "no-store" }),
  ]);
  if (
    classResponse.status === 401 || classResponse.status === 403 ||
    teacherResponse.status === 401 || teacherResponse.status === 403 ||
    scheduleResponse.status === 401 || scheduleResponse.status === 403 ||
    subjectResponse.status === 401 || subjectResponse.status === 403 ||
    sessionsResponse.status === 401 || sessionsResponse.status === 403
  ) {
    redirect("/login");
  }
  if (!classResponse.ok || !teacherResponse.ok || !scheduleResponse.ok || !subjectResponse.ok || !sessionsResponse.ok) {
    throw new Error("Não foi possível carregar as turmas, professores, matérias e horários.");
  }
  const [classes, teachers, schedules, subjects, classSessions] = await Promise.all([
    classResponse.json() as Promise<SchoolClass[]>,
    teacherResponse.json() as Promise<ScheduleTeacher[]>,
    scheduleResponse.json() as Promise<ScheduleRecord[]>,
    subjectResponse.json() as Promise<SchoolSubject[]>,
    sessionsResponse.json() as Promise<SchoolClassSessions>,
  ]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="KlassApp, página inicial">
          <span className="brand-mark" aria-hidden="true">k</span>
          <span>Klass<span className="brand-highlight">App</span></span>
        </Link>
        <nav className="main-nav" aria-label="Navegação principal">
          <p className="nav-heading">MENU</p>
          <Link className="nav-item" href="/">
            <span className="nav-icon" aria-hidden="true">⌂</span>
            <span>Início</span>
          </Link>
          <Link className="nav-item" href="/turmas">
            <span className="nav-icon" aria-hidden="true">▦</span>
            <span>Turmas</span>
          </Link>
          <Link className="nav-item" href="/professores">
            <span className="nav-icon" aria-hidden="true">♙</span>
            <span>Professores</span>
          </Link>
          <Link className="nav-item" href="/alunos">
            <span className="nav-icon" aria-hidden="true">♧</span>
            <span>Alunos</span>
          </Link>
          <Link className="nav-item active" href="/horarios">
            <span className="nav-icon" aria-hidden="true">◷</span>
            <span>Horários</span>
          </Link>
          <Link className="nav-item" href="/materias">
            <span className="nav-icon" aria-hidden="true">▤</span>
            <span>Matérias</span>
          </Link>
          <Link className="nav-item" href="/eventos">
            <span className="nav-icon" aria-hidden="true">▣</span>
            <span>Eventos</span>
          </Link>
          <Link className="nav-item" href="/avaliacoes">
            <span className="nav-icon" aria-hidden="true">✎</span>
            <span>Avaliações</span>
          </Link>
          <Link className="nav-item" href="/comportamento">
            <span className="nav-icon" aria-hidden="true">♡</span>
            <span>Comportamento</span>
          </Link>
          <Link className="nav-item" href="/configuracao">
            <span className="nav-icon" aria-hidden="true">⚙</span>
            <span>Configuração</span>
          </Link>
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/">{session.school.name}</Link> <span>/</span> <strong>Horários</strong>
          </div>
          <div className="topbar-user">
            <span className="profile-avatar" aria-hidden="true">{session.user.displayName.slice(0, 1).toUpperCase()}</span>
            <span className="topbar-user-copy">
              <strong>{session.user.displayName}</strong>
              <small>{session.school.role === "admin" ? "Administração" : "Professor(a)"}</small>
            </span>
            <LogoutButton />
          </div>
        </header>

        <ScheduleManagement
          initialSchedules={schedules}
          classes={classes}
          teachers={teachers}
          subjects={subjects}
          classSessions={classSessions}
        />

        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
