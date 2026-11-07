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
  { label: "Horários", icon: "◷", href: "/horarios" },
  { label: "Eventos", icon: "▣", href: "/eventos" },
  { label: "Avaliações", icon: "✎", href: "/avaliacoes" },
  { label: "Comportamento", icon: "♡", href: "/comportamento" },
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
  teachers: number | null;
  schedules: number;
  events: number | null;
  assessments: number;
  behaviorRecords: number;
  studentsMissingResponsible: number | null;
  activeAssignedTeachers: number | null;
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
  href: string;
  ready: boolean;
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
    { label: "Turmas cadastradas", href: "/turmas", ready: summary.classes > 0 },
    {
      label: "Professores ativos vinculados às turmas",
      href: "/professores",
      ready: (summary.activeAssignedTeachers ?? 0) > 0,
    },
    {
      label: "Alunos com responsável cadastrado",
      href: "/alunos",
      ready: summary.students > 0 && summary.studentsMissingResponsible === 0,
    },
    { label: "Horários semanais cadastrados", href: "/horarios", ready: summary.schedules > 0 },
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
  const [summary, nextEvent] = await Promise.all([
    getDashboardSummary(headers),
    getNextEvent(headers),
  ]);
  const setupItems = session.school.role === "admin"
    ? getSetupProgress(summary)
    : [];
  const configuredCount = setupItems.filter((item) => item.ready).length;
  const setupPercent = setupItems.length
    ? Math.round((configuredCount / setupItems.length) * 100)
    : 0;
  const nextSetupItem = setupItems.find((item) => !item.ready);
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
          <span className="switcher-chevron" aria-hidden="true">⌄</span>
        </div>

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

        <div className="sidebar-note">
          <span className="note-sparkle" aria-hidden="true">✦</span>
          <strong>Um bom dia começa junto</strong>
          <p>Organize a rotina da escola com mais leveza.</p>
        </div>

        <div className="profile">
          <span className="profile-avatar" aria-hidden="true">A</span>
          <span className="profile-copy">
            <strong>{session.user.displayName}</strong>
            <small>{session.school.role === "admin" ? "Administração" : "Professor(a)"}</small>
          </span>
          <LogoutButton />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Escola <span>/</span> <strong>Início</strong></div>
          <div className="topbar-actions">
            <span className="today-label">ESCOLA PILOTO</span>
            <button className="help-button" type="button" aria-label="Ajuda">?</button>
          </div>
        </header>

        <section className="welcome-section dashboard-hero">
          {nextEvent ? (
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
          ) : (
            <div>
              <p className="eyebrow">UM NOVO DIA, MUITAS POSSIBILIDADES <span aria-hidden="true">✦</span></p>
              <h1>Sua escola floresce<br />em cada detalhe.</h1>
              <p className="welcome-copy">
                Um lugar para acompanhar quem aprende, quem ensina e tudo o que acontece pelo caminho.
              </p>
              <div className="dashboard-hero-actions">
                <Link className="dashboard-hero-primary" href="/alunos">
                  Conhecer os alunos <span aria-hidden="true">↗</span>
                </Link>
                <span className="dashboard-hero-school">
                  <span aria-hidden="true">✿</span> {session.school.name}
                </span>
              </div>
            </div>
          )}
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

        {session.school.role === "admin" && setupPercent < 100 && (
          <section className="setup-card" aria-labelledby="setup-title">
            <div className="setup-icon" aria-hidden="true">✎</div>
            <div className="setup-text">
              <p className="card-kicker">PRIMEIROS PASSOS</p>
              <h2 id="setup-title">Configuração fundamental da escola</h2>
              <ul className="setup-checklist">
                {setupItems.map((item) => (
                  <li key={item.label}>
                    <span className={item.ready ? "setup-check ready" : "setup-check"} aria-hidden="true">
                      {item.ready ? "✓" : "○"}
                    </span>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="setup-progress"
              aria-label={`${setupPercent}% da configuração fundamental concluída`}
            >
              <strong>{setupPercent}%</strong>
              <div
                className="progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={setupPercent}
                aria-label="Configuração fundamental concluída"
              >
                <span style={{ width: `${setupPercent}%` }} />
              </div>
              <small>{configuredCount} de {setupItems.length} itens configurados</small>
              {nextSetupItem && (
                <Link className="setup-link" href={nextSetupItem.href}>
                  Configurar próximo item <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>
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
            <div className="dashboard-metric metric-classes">
              <span className="dashboard-metric-icon" aria-hidden="true">▦</span>
              <span><strong>{summary.classes}</strong><small>turmas</small></span>
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
          <Link className="feature-card students-card feature-link" href="/alunos">
            <span className="feature-icon" aria-hidden="true">♧</span>
            <div>
              <h3>Alunos</h3>
              <p>Conheça cada estudante e mantenha os contatos da família por perto.</p>
              <span className="feature-count">{summary.students} alunos</span>
            </div>
            <span className="feature-status">COMEÇAR →</span>
          </Link>
          <Link className="feature-card classes-card feature-link" href="/turmas">
            <span className="feature-icon" aria-hidden="true">▦</span>
            <div>
              <h3>Turmas e horários</h3>
              <p>Organize as turmas e a rotina de cada dia letivo.</p>
              <span className="feature-count">{summary.classes} turmas · {summary.schedules} horários</span>
            </div>
            <span className="feature-status">COMEÇAR →</span>
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
        </section>

        <footer className="page-footer">
          <span>Feito com carinho para a comunidade escolar</span>
          <span aria-hidden="true">♥</span>
        </footer>
      </main>
    </div>
  );
}
