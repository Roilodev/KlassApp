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
            <Link href="/">{session.school.name}</Link> <span>/</span> <strong>Alunos</strong>
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

        <StudentManagement initialStudents={students} classes={classes} />

        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
