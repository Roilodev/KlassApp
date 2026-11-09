import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogoutButton } from "../logout-button";
import type { SchoolRecess } from "../school-recess";
import { ClassSessionSettings } from "./class-session-settings";
import type { SchoolClassSessions } from "./class-session-settings";
import { RecessSettings } from "./recess-settings";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

export default function ConfigurationPage() {
  return (
    <Suspense fallback={<main className="loading-screen">Carregando as configurações...</main>}>
      <ConfigurationDashboard />
    </Suspense>
  );
}

async function ConfigurationDashboard() {
  const cookieStore = await cookies();
  if (!cookieStore.has("klassapp_session")) {
    redirect("/login");
  }
  const headers = { cookie: cookieStore.toString() };
  const sessionResponse = await fetch(`${apiUrl}/auth/me`, { headers, cache: "no-store" });
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

  const [recessResponse, sessionsResponse] = await Promise.all([
    fetch(`${apiUrl}/settings/school-recess`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/settings/class-sessions`, { headers, cache: "no-store" }),
  ]);
  if (
    recessResponse.status === 401 ||
    recessResponse.status === 403 ||
    sessionsResponse.status === 401 ||
    sessionsResponse.status === 403
  ) {
    redirect("/login");
  }
  if (!recessResponse.ok || !sessionsResponse.ok) {
    throw new Error("Não foi possível carregar as configurações da rotina escolar.");
  }
  const [recess, sessions] = await Promise.all([
    recessResponse.json() as Promise<SchoolRecess>,
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
          <Link className="nav-item" href="/"><span className="nav-icon" aria-hidden="true">⌂</span><span>Início</span></Link>
          <Link className="nav-item" href="/turmas"><span className="nav-icon" aria-hidden="true">▦</span><span>Turmas</span></Link>
          <Link className="nav-item" href="/professores"><span className="nav-icon" aria-hidden="true">♙</span><span>Professores</span></Link>
          <Link className="nav-item" href="/alunos"><span className="nav-icon" aria-hidden="true">♧</span><span>Alunos</span></Link>
          <Link className="nav-item" href="/materias"><span className="nav-icon" aria-hidden="true">▤</span><span>Matérias</span></Link>
          <Link className="nav-item" href="/eventos"><span className="nav-icon" aria-hidden="true">▣</span><span>Eventos</span></Link>
          <Link className="nav-item" href="/avaliacoes"><span className="nav-icon" aria-hidden="true">✎</span><span>Avaliações</span></Link>
          <Link className="nav-item" href="/comportamento"><span className="nav-icon" aria-hidden="true">♡</span><span>Comportamento</span></Link>
          <Link className="nav-item active" href="/configuracao"><span className="nav-icon" aria-hidden="true">⚙</span><span>Configuração</span></Link>
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><Link href="/">{session.school.name}</Link> <span>/</span> <strong>Configuração</strong></div>
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
            <p className="eyebrow">AJUSTES DA ESCOLA <span aria-hidden="true">✦</span></p>
            <h1>Configuração escolar <span aria-hidden="true">⚙</span></h1>
            <p className="welcome-copy">Defina os horários que fazem parte da rotina semanal da escola.</p>
          </div>
        </section>

        <ClassSessionSettings initialSessions={sessions} />
        <RecessSettings initialRecess={recess} />
        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
