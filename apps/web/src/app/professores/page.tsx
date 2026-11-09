import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogoutButton } from "../logout-button";
import type { SchoolClass } from "../turmas/class-form";
import type { SchoolSubject } from "../horarios/schedule-management";
import { TeacherManagement } from "./teacher-management";
import { SectionIllustration } from "../section-illustration";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

interface Teacher {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  homeAddress: string;
  status: "active" | "inactive" | "pending";
  leaveDate: string | null;
  leaveReason: string | null;
  hasPhoto: boolean;
  classes: SchoolClass[];
  subjectIds: string[];
  invitationExpiresAt: string | null;
}

export default function TeachersPage() {
  return (
    <Suspense fallback={<main className="loading-screen">Carregando a equipe...</main>}>
      <TeachersDashboard />
    </Suspense>
  );
}

async function TeachersDashboard() {
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

  const [teacherResponse, classResponse, subjectResponse] = await Promise.all([
    fetch(`${apiUrl}/teachers`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/school-structure/classes`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/subjects`, { headers, cache: "no-store" }),
  ]);
  if (teacherResponse.status === 401 || teacherResponse.status === 403 ||
      classResponse.status === 401 || classResponse.status === 403 ||
      subjectResponse.status === 401 || subjectResponse.status === 403) {
    redirect("/login");
  }
  if (!teacherResponse.ok || !classResponse.ok || !subjectResponse.ok) {
    throw new Error("Não foi possível carregar os professores, turmas e matérias.");
  }
  const teachers = await teacherResponse.json() as Teacher[];
  const classes = await classResponse.json() as SchoolClass[];
  const subjects = await subjectResponse.json() as SchoolSubject[];

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
          <Link className="nav-item active" href="/professores">
            <span className="nav-icon" aria-hidden="true">♙</span>
            <span>Professores</span>
          </Link>
          <Link className="nav-item" href="/alunos">
            <span className="nav-icon" aria-hidden="true">♧</span>
            <span>Alunos</span>
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
            <Link href="/">{session.school.name}</Link> <span>/</span> <strong>Professores</strong>
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

        <TeacherManagement initialTeachers={teachers} classes={classes} subjects={subjects} />

        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
