import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogoutButton } from "../logout-button";
import { StudentManagement } from "./student-management";
import type { SchoolClass } from "../turmas/class-form";
import { SectionIllustration } from "../section-illustration";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

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

export default function StudentsPage() {
  return (
    <Suspense fallback={<main className="loading-screen">Carregando os alunos...</main>}>
      <StudentsDashboard />
    </Suspense>
  );
}

async function StudentsDashboard() {
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

  const [studentsResponse, classesResponse] = await Promise.all([
    fetch(`${apiUrl}/students`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/school-structure/classes`, { headers, cache: "no-store" }),
  ]);
  if (
    studentsResponse.status === 401 ||
    studentsResponse.status === 403 ||
    classesResponse.status === 401 ||
    classesResponse.status === 403
  ) {
    redirect("/login");
  }
  if (!studentsResponse.ok || !classesResponse.ok) {
    throw new Error("Não foi possível carregar os alunos e as turmas.");
  }

  const students = await studentsResponse.json() as Student[];
  const classes = await classesResponse.json() as SchoolClass[];

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
          <Link className="nav-item" href="/turmas">
            <span className="nav-icon" aria-hidden="true">▦</span>
            <span>Turmas</span>
          </Link>
          <Link className="nav-item" href="/professores">
            <span className="nav-icon" aria-hidden="true">♙</span>
            <span>Professores</span>
          </Link>
          <Link className="nav-item active" href="/alunos">
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
          <Link className="nav-item" href="/avaliacoes">
            <span className="nav-icon" aria-hidden="true">✎</span>
            <span>Avaliações</span>
          </Link>
          <Link className="nav-item" href="/comportamento">
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
          <span className="profile-avatar" aria-hidden="true">A</span>
          <span className="profile-copy">
            <strong>{session.user.displayName}</strong>
            <small>Administração</small>
          </span>
          <LogoutButton />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/">Escola</Link> <span>/</span> <strong>Alunos</strong>
          </div>
          <span className="today-label">ESCOLA PILOTO</span>
        </header>

        <section className="welcome-section classes-welcome">
          <div>
            <p className="eyebrow">CADA HISTÓRIA COMEÇA AQUI <span aria-hidden="true">✦</span></p>
            <h1>Alunos e famílias <span aria-hidden="true">🌼</span></h1>
            <p className="welcome-copy">
              Cadastre o aluno, organize sua matrícula e mantenha os contatos
              autorizados da família.
            </p>
          </div>
          <SectionIllustration kind="students" />
        </section>

        <StudentManagement initialStudents={students} classes={classes} />

        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
