import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogoutButton } from "../logout-button";
import { AssessmentManagement } from "./assessment-management";
import type { AssessmentClass, AssessmentRecord } from "./assessment-management";
import type { SchoolSubject } from "../horarios/schedule-management";
import { SectionIllustration } from "../section-illustration";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export default function AssessmentsPage() {
  return (
    <Suspense fallback={<main className="loading-screen">Carregando as avaliações...</main>}>
      <AssessmentsDashboard />
    </Suspense>
  );
}

async function AssessmentsDashboard() {
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

  const [classResponse, assessmentResponse, subjectResponse] = await Promise.all([
    fetch(`${apiUrl}/assessments/classes`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/assessments`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/subjects`, { headers, cache: "no-store" }),
  ]);
  if (
    classResponse.status === 401 || classResponse.status === 403 ||
    assessmentResponse.status === 401 || assessmentResponse.status === 403 ||
    subjectResponse.status === 401 || subjectResponse.status === 403
  ) {
    redirect("/login");
  }
  if (!classResponse.ok || !assessmentResponse.ok || !subjectResponse.ok) {
    throw new Error("Não foi possível carregar as turmas, matérias e avaliações.");
  }
  const [classes, assessments, subjects] = await Promise.all([
    classResponse.json() as Promise<AssessmentClass[]>,
    assessmentResponse.json() as Promise<AssessmentRecord[]>,
    subjectResponse.json() as Promise<SchoolSubject[]>,
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
          {session.school.role === "admin" && (
            <>
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
              <Link className="nav-item" href="/horarios">
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
            </>
          )}
          <Link className="nav-item active" href="/avaliacoes">
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
            <Link href="/">{session.school.name}</Link> <span>/</span> <strong>Avaliações</strong>
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

        <section className="welcome-section classes-welcome">
          <div>
            <p className="eyebrow">CADA APRENDIZADO CONTA <span aria-hidden="true">✦</span></p>
            <h1>Avaliações e resultados <span aria-hidden="true">✏️</span></h1>
            <p className="welcome-copy">
              Organize as avaliações e acompanhe os pontos conquistados por cada estudante.
            </p>
          </div>
          <SectionIllustration kind="assessments" />
        </section>

        <AssessmentManagement
          initialAssessments={assessments}
          classes={classes}
          subjects={subjects}
        />

        <p className="privacy-note assessment-notice">
          Resultados visíveis apenas para a administração e professores atribuídos à turma. Ainda não são compartilhados com responsáveis.
        </p>

        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
