import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogoutButton } from "../logout-button";
import { BehaviorManagement } from "./behavior-management";
import type { BehaviorClass } from "./behavior-management";
import { SectionIllustration } from "../section-illustration";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export default function BehaviorPage() {
  return (
    <Suspense fallback={<main className="loading-screen">Carregando os registros...</main>}>
      <BehaviorDashboard />
    </Suspense>
  );
}

async function BehaviorDashboard() {
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
  const classesResponse = await fetch(`${apiUrl}/behavior/classes`, {
    headers,
    cache: "no-store",
  });
  if (classesResponse.status === 401 || classesResponse.status === 403) {
    redirect("/login");
  }
  if (!classesResponse.ok) {
    throw new Error("Não foi possível carregar as turmas.");
  }
  const classes = await classesResponse.json() as BehaviorClass[];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="KlassApp, página inicial">
          <span className="brand-mark" aria-hidden="true">k</span>
          <span>Klass<span className="brand-highlight">App</span></span>
        </Link>
        <div className="school-switcher">
          <span className="school-avatar" aria-hidden="true">✿</span>
          <span className="school-copy">
            <strong>{session.school.name}</strong>
            <small>Escola piloto</small>
          </span>
        </div>
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
              <Link className="nav-item" href="/eventos">
                <span className="nav-icon" aria-hidden="true">▣</span>
                <span>Eventos</span>
              </Link>
            </>
          )}
          <Link className="nav-item" href="/avaliacoes">
            <span className="nav-icon" aria-hidden="true">✎</span>
            <span>Avaliações</span>
          </Link>
          <Link className="nav-item active" href="/comportamento">
            <span className="nav-icon" aria-hidden="true">♡</span>
            <span>Comportamento</span>
          </Link>
        </nav>
        <div className="sidebar-note">
          <span className="note-sparkle" aria-hidden="true">✦</span>
          <strong>Um bom dia começa junto</strong>
          <p>Organize a rotina da escola com mais leveza.</p>
        </div>
        <div className="profile">
          <span className="profile-avatar" aria-hidden="true">
            {session.user.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="profile-copy">
            <strong>{session.user.displayName}</strong>
            <small>{session.school.role === "admin" ? "Administração" : "Professor(a)"}</small>
          </span>
          <LogoutButton />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/">Escola</Link> <span>/</span> <strong>Comportamento</strong>
          </div>
          <span className="today-label">ESCOLA PILOTO</span>
        </header>

        <section className="welcome-section classes-welcome">
          <div>
            <p className="eyebrow">CADA CRIANÇA TEM SUA HISTÓRIA <span aria-hidden="true">✦</span></p>
            <h1>Registros de acompanhamento <span aria-hidden="true">🌱</span></h1>
            <p className="welcome-copy">
              Registre fatos concretos do dia a dia para acompanhar o desenvolvimento de cada estudante.
            </p>
          </div>
          <SectionIllustration kind="behavior" />
        </section>

        <BehaviorManagement
          classes={classes}
          canEditPhoto={session.school.role === "admin"}
        />

        <p className="privacy-note behavior-notice">
          Registros internos para acompanhamento escolar. Apenas a administração e os professores atribuídos à turma podem consultá-los. Ainda não são compartilhados com responsáveis nem com um agente.
        </p>

        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
