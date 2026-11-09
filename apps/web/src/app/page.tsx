import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogoutButton } from "./logout-button";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const navigation = [
  { label: "Início", icon: "⌂", active: true },
  { label: "Turmas", icon: "▦", href: "/turmas" },
  { label: "Professores", icon: "♙", href: "/professores" },
  { label: "Alunos", icon: "♧", href: "/alunos" },
  { label: "Matérias", icon: "▤", href: "/materias" },
  { label: "Eventos", icon: "▣", href: "/eventos" },
  { label: "Avaliações", icon: "✎", href: "/avaliacoes" },
  { label: "Comportamento", icon: "♡", href: "/comportamento" },
  { label: "Configuração", icon: "⚙", href: "/configuracao" },
  { label: "Notificações", icon: "♧", soon: true },
];

interface Session {
  user: {
    email: string;
    displayName: string;
  };
  school: {
    name: string;
    role: "admin" | "teacher";
  };
}

interface DashboardSummary {
  students: number;
  classes: number;
  subjects: number;
  teachers: number | null;
  activeTeachers: number | null;
  requiredTeachers: number | null;
  configuredSubjectFrequencies: number | null;
  schedules: number;
  classesWithIncompleteSchedules: number | null;
  events: number | null;
  assessments: number;
  behaviorRecords: number;
  studentsMissingResponsible: number | null;
  activeAssignedTeachers: number | null;
  configuredEvents: number | null;
  morningSessionPeriods: number | null;
  afternoonSessionPeriods: number | null;
  configuredStudents: number | null;
}

interface NextEvent {
  title: string;
  startsAt: string;
  location: string;
  audienceLabel: string;
  timeZone: string;
}

interface SetupProgressItem {
  label: string;
  icon: string;
  ready: boolean;
}

interface DashboardObservation {
  type: string;
  title: string;
  href: string;
  items: string[];
}

async function getDashboardSummary(headers: { cookie: string }): Promise<DashboardSummary> {
  const response = await fetch(`${apiUrl}/dashboard/summary`, {
    headers,
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    redirect("/login");
  }
  if (!response.ok) {
    throw new Error("Não foi possível carregar as quantidades dos registros.");
  }
  return response.json() as Promise<DashboardSummary>;
}

async function getNextEvent(headers: { cookie: string }): Promise<NextEvent | null> {
  const response = await fetch(`${apiUrl}/events/next`, {
    headers,
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    redirect("/login");
  }
  if (!response.ok) {
    throw new Error("Não foi possível carregar o próximo evento.");
  }
  return response.json() as Promise<NextEvent | null>;
}

async function getDashboardObservations(
  headers: { cookie: string },
): Promise<DashboardObservation[]> {
  const response = await fetch(`${apiUrl}/dashboard/observations`, {
    headers,
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    redirect("/login");
  }
  if (!response.ok) {
    throw new Error("Não foi possível carregar as observações da escola.");
  }
  return response.json() as Promise<DashboardObservation[]>;
}

function formatNextEventDate(event: NextEvent): string {
  return new Date(event.startsAt).toLocaleString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: event.timeZone,
  });
}

function getSetupProgress(summary: DashboardSummary): SetupProgressItem[] {
  return [
    {
      label: "Sessões e turnos",
      icon: "◷",
      ready: (summary.morningSessionPeriods ?? 0) > 0 &&
        (summary.afternoonSessionPeriods ?? 0) > 0,
    },
    {
      label: summary.requiredTeachers === null
        ? "Professores"
        : `Professores (${summary.activeTeachers ?? 0} de ${summary.requiredTeachers})`,
      icon: "♙",
      ready: (summary.activeTeachers ?? 0) > 0 &&
        summary.requiredTeachers !== null &&
        (summary.activeTeachers ?? 0) >= summary.requiredTeachers,
    },
    {
      label: "Alunos",
      icon: "♧",
      ready: (summary.configuredStudents ?? 0) > 0,
    },
    {
      label: "Disciplinas",
      icon: "▤",
      ready: summary.subjects > 0 &&
        summary.configuredSubjectFrequencies === summary.subjects,
    },
    {
      label: "Horários",
      icon: "◷",
      ready: summary.schedules > 0 && summary.classesWithIncompleteSchedules === 0,
    },
    { label: "Eventos", icon: "▣", ready: (summary.configuredEvents ?? 0) > 0 },
  ];
}

async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  if (!cookieStore.has("klassapp_session")) {
    redirect("/login");
  }

  const response = await fetch(
    `${process.env.API_INTERNAL_URL ?? "http://localhost:4000"}/auth/me`,
    {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store",
    },
  );
  if (response.status === 401 || response.status === 403) {
    redirect("/login");
  }
  if (!response.ok) {
    throw new Error("Não foi possível validar sua sessão.");
  }
  return response.json() as Promise<Session>;
}

export default function Home() {
  return (
    <Suspense fallback={<main className="loading-screen">Preparando sua escola...</main>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const session = await getSession();
  const cookieStore = await cookies();
  const headers = { cookie: cookieStore.toString() };
  const [summary, nextEvent, observations] = await Promise.all([
    getDashboardSummary(headers),
    getNextEvent(headers),
    session.school.role === "admin"
      ? getDashboardObservations(headers)
      : Promise.resolve([]),
  ]);
  const setupItems = session.school.role === "admin"
    ? getSetupProgress(summary)
    : [];
  const configuredCount = setupItems.filter((item) => item.ready).length;
  const setupPercent = setupItems.length
    ? Math.round((configuredCount / setupItems.length) * 100)
    : 0;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="KlassApp, página inicial">
          <span className="brand-mark" aria-hidden="true">k</span>
          <span>Klass<span className="brand-highlight">App</span></span>
        </Link>

        <nav className="main-nav" aria-label="Navegação principal">
          <p className="nav-heading">MENU</p>
          {navigation
            .filter((item) =>
              session.school.role === "admin" ||
              item.href === "/avaliacoes" ||
              item.href === "/comportamento" ||
              !item.href
            )
            .map((item) => (
            item.href ? (
              <Link className="nav-item" href={item.href} key={item.label}>
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ) : (
              <button
                className={`nav-item${item.active ? " active" : ""}`}
                disabled={item.soon}
                key={item.label}
                title={item.soon ? "Disponível em breve" : undefined}
                type="button"
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
                {item.soon && <span className="soon-label">em breve</span>}
              </button>
            )
            ))}
        </nav>

      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">{session.school.name} <span>/</span> <strong>Início</strong></div>
          <div className="topbar-actions">
            <div className="topbar-user">
              <span className="profile-avatar" aria-hidden="true">{session.user.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="topbar-user-copy">
                <strong>{session.user.displayName}</strong>
                <small>{session.school.role === "admin" ? "Administração" : "Professor(a)"}</small>
              </span>
              <LogoutButton />
            </div>
          </div>
        </header>

        {session.school.role === "admin" && setupItems.some((item) => !item.ready) && (
          <section className="setup-flow" aria-labelledby="setup-title">
            <div className="setup-flow-heading">
              <span className="dashboard-live-dot" aria-hidden="true" />
              <div>
                <h2 id="setup-title">Configuração inicial</h2>
              </div>
              <strong className="setup-flow-progress">{setupPercent}%</strong>
            </div>
            <ol className="setup-flow-list">
              {setupItems.map((item, index) => (
                <li key={item.label}>
                  <div className={`setup-flow-item ${item.ready ? "ready" : "pending"}`}>
                    <span className="setup-flow-icon" aria-hidden="true">{item.icon}</span>
                    <span className="setup-flow-copy">
                      <small>ETAPA {index + 1}</small>
                      <strong>{item.label}</strong>
                    </span>
                    <span className={item.ready ? "setup-step-status ready" : "setup-step-status"}>
                      {item.ready ? "Concluído" : "Pendente"}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {nextEvent && (
          <section className="welcome-section dashboard-hero">
            <div>
              <p className="eyebrow">PRÓXIMO EVENTO <span aria-hidden="true">✦</span></p>
              <h1>{nextEvent.title}</h1>
              <p className="welcome-copy">
                {formatNextEventDate(nextEvent)}
                {nextEvent.location ? ` · ${nextEvent.location}` : ""}
              </p>
              <div className="dashboard-hero-actions">
                {session.school.role === "admin" && (
                  <Link className="dashboard-hero-primary" href="/eventos">
                    Ver eventos <span aria-hidden="true">↗</span>
                  </Link>
                )}
                <span className="dashboard-hero-school">
                  <span aria-hidden="true">✿</span> {nextEvent.audienceLabel}
                </span>
              </div>
            </div>
            <svg
              aria-hidden="true"
              className="dashboard-hero-illustration"
              fill="none"
              viewBox="0 0 360 245"
            >
              <circle cx="276" cy="68" r="38" fill="#FFC85B" />
              <path d="M37 200c40-35 77-41 111-17 37-45 89-43 139 1 19-16 35-20 54-12v58H37v-30Z" fill="#B7DDBE" />
              <path d="M91 109 180 49l91 60v108H91V109Z" fill="#FFF9ED" stroke="#324539" strokeWidth="5" strokeLinejoin="round" />
              <path d="M77 112 180 42l104 70" stroke="#324539" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M151 217v-58a29 29 0 0 1 58 0v58" fill="#F2A477" stroke="#324539" strokeWidth="4" />
              <path d="M111 126h34v34h-34zM216 126h34v34h-34z" fill="#A9D8E6" stroke="#324539" strokeWidth="4" />
              <path d="M128 126v34m-17-17h34m88-17v34m-17-17h34" stroke="#324539" strokeWidth="3" />
              <path d="M180 42V23h28v38" stroke="#324539" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M48 211c7-23 23-30 37-17-7 22-21 29-37 17Zm4 5c-1-18 7-30 24-34" stroke="#4F9B6B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M294 204c6-18 19-24 31-14-6 18-17 24-31 14Zm4 4c-1-14 6-24 19-27" stroke="#4F9B6B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m60 70 4 9 10 1-8 7 2 10-8-5-9 5 2-10-7-7 10-1 4-9Zm241 70 3 6 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1 3-6Z" fill="#E97855" />
              <path d="M18 184c9-13 18-13 27 0m260-112c10-11 20-10 28 2" stroke="#6D63AE" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </section>
        )}

        <section className="dashboard-metrics" aria-label="Resumo da escola">
          <div className="dashboard-metrics-heading">
            <span className="dashboard-live-dot" aria-hidden="true" />
            <span>UM OLHAR DE PERTO</span>
            <strong>O que faz a escola acontecer</strong>
          </div>
          <div className="dashboard-metrics-list">
            <div className="dashboard-metric metric-students">
              <span className="dashboard-metric-icon" aria-hidden="true">♧</span>
              <span><strong>{summary.students}</strong><small>alunos</small></span>
            </div>
            <div className="dashboard-metric metric-subjects">
              <span className="dashboard-metric-icon" aria-hidden="true">▤</span>
              <span><strong>{summary.subjects}</strong><small>matérias</small></span>
            </div>
            {session.school.role === "admin" ? (
              <>
                <div className="dashboard-metric metric-teachers">
                  <span className="dashboard-metric-icon" aria-hidden="true">♙</span>
                  <span><strong>{summary.teachers ?? 0}</strong><small>professores e convites</small></span>
                </div>
                <div className="dashboard-metric metric-events">
                  <span className="dashboard-metric-icon" aria-hidden="true">▣</span>
                  <span><strong>{summary.events ?? 0}</strong><small>eventos</small></span>
                </div>
              </>
            ) : (
              <>
                <div className="dashboard-metric metric-assessments">
                  <span className="dashboard-metric-icon" aria-hidden="true">✎</span>
                  <span><strong>{summary.assessments}</strong><small>avaliações</small></span>
                </div>
                <div className="dashboard-metric metric-behavior">
                  <span className="dashboard-metric-icon" aria-hidden="true">♡</span>
                  <span><strong>{summary.behaviorRecords}</strong><small>observações</small></span>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="section-heading dashboard-section-heading">
          <div>
            <p className="card-kicker">ESPAÇOS PARA CUIDAR</p>
            <h2>Encontre seu próximo passo</h2>
          </div>
          <span className="dashboard-section-note">Tudo em seu lugar, com carinho <span aria-hidden="true">✿</span></span>
        </div>

        <section className="feature-grid" aria-label="Áreas da escola">                   
          {session.school.role === "admin" && (
            <Link className="feature-card teachers-card feature-link" href="/professores">
              <span className="feature-icon" aria-hidden="true">♙</span>
              <div>
                <h3>Professores</h3>
                <p>Consulte a equipe escolar e os convites enviados.</p>
                <span className="feature-count">{summary.teachers ?? 0} professores e convites</span>
              </div>
              <span className="feature-status">CONSULTAR →</span>
            </Link>
          )}
          <Link className="feature-card students-card feature-link" href="/alunos">
            <span className="feature-icon" aria-hidden="true">♧</span>
            <div>
              <h3>Alunos</h3>
              <p>Conheça cada estudante e mantenha os contatos da família por perto.</p>
              <span className="feature-count">{summary.students} alunos</span>
            </div>
            <span className="feature-status">COMEÇAR →</span>
          </Link>
          <Link className="feature-card subjects-card feature-link" href="/materias">
            <span className="feature-icon" aria-hidden="true">▤</span>
            <div>
              <h3>Matérias</h3>
              <p>Consulte as matérias usadas nos horários e nas avaliações.</p>
              <span className="feature-count">{summary.subjects} matérias</span>
            </div>
            <span className="feature-status">CONSULTAR →</span>
          </Link> 
          <Link className="feature-card assessments-card feature-link" href="/avaliacoes">
            <span className="feature-icon" aria-hidden="true">✎</span>
            <div>
              <h3>Avaliações</h3>
              <p>Cadastre atividades e acompanhe os resultados da turma.</p>
              <span className="feature-count">{summary.assessments} avaliações</span>
            </div>
            <span className="feature-status">COMEÇAR →</span>
          </Link>
          <Link className="feature-card behavior-card feature-link" href="/comportamento">
            <span className="feature-icon" aria-hidden="true">♡</span>
            <div>
              <h3>Comportamento</h3>
              <p>Registre observações respeitosas sobre o dia a dia de cada estudante.</p>
              <span className="feature-count">{summary.behaviorRecords} observações</span>
            </div>
            <span className="feature-status">ACOMPANHAR →</span>
          </Link>
          {session.school.role === "admin" && (
            <Link className="feature-card events-card feature-link" href="/eventos">
              <span className="feature-icon" aria-hidden="true">▣</span>
              <div>
                <h3>Eventos</h3>
                <p>Organize atividades e defina para quais turmas são destinadas.</p>
                <span className="feature-count">{summary.events} eventos</span>
              </div>
              <span className="feature-status">COMEÇAR →</span>
            </Link>
          )}
        </section>        

        {session.school.role === "admin" && (
          <section className="dashboard-observations" aria-labelledby="dashboard-observations-title">
            <div className="dashboard-observations-heading">
              <span className="dashboard-observations-icon" aria-hidden="true">!</span>
              <div>
                <h2 id="dashboard-observations-title">Observações</h2>
              </div>
              <span className="dashboard-observations-count">
                {observations.reduce((count, observation) => count + observation.items.length, 0)}
              </span>
            </div>
            {observations.length === 0 ? (
              <p className="dashboard-observations-empty">
                Tudo em ordem. Não há itens que precisem de atenção agora.
              </p>
            ) : (
              <div className="dashboard-observation-grid">
                {observations.map((observation) => (
                  <article className="dashboard-observation" key={observation.type}>
                    <div className="dashboard-observation-title">
                      <h3>{observation.title}</h3>
                      <span>{observation.items.length}</span>
                    </div>
                    <ul>
                      {observation.items.slice(0, 5).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    {observation.items.length > 5 && (
                      <p className="dashboard-observation-more">
                        E mais {observation.items.length - 5} itens.
                      </p>
                    )}
                    <Link href={observation.href}>
                      Ver registros <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
