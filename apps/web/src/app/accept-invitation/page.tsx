import Link from "next/link";
import { Suspense } from "react";
import { AcceptInvitationForm } from "./accept-form";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

interface InvitationPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default function AcceptInvitationPage(props: InvitationPageProps) {
  return (
    <main className="login-page">
      <Suspense fallback={<section className="login-card">Verificando convite...</section>}>
        <InvitationDetails {...props} />
      </Suspense>
    </main>
  );
}

async function InvitationDetails({ searchParams }: InvitationPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return <InvalidInvitation />;
  }

  let response: Response;
  try {
    response = await fetch(
      `${apiUrl}/teacher-invitations/preview?${new URLSearchParams({ token })}`,
      { cache: "no-store" },
    );
  } catch {
    throw new Error("Não foi possível conectar à KlassApp.");
  }

  if (response.status === 404 || response.status === 401) {
    return <InvalidInvitation />;
  }
  if (!response.ok) {
    throw new Error("Não foi possível verificar o convite.");
  }
  const invitation = await response.json();

  return (
    <AcceptInvitationForm
      displayName={invitation.displayName}
      email={invitation.email}
      schoolName={invitation.schoolName}
      token={token}
    />
  );
}

function InvalidInvitation() {
  return (
    <section className="login-card" aria-labelledby="invalid-invitation-title">
      <Link className="brand login-brand" href="/" aria-label="KlassApp">
        <span className="brand-mark" aria-hidden="true">k</span>
        <span>Klass<span className="brand-highlight">App</span></span>
      </Link>
      <p className="eyebrow login-eyebrow">CONVITE INDISPONÍVEL</p>
      <h1 id="invalid-invitation-title">Este link não está mais ativo.</h1>
      <p className="login-copy">
        Peça à administração da escola para enviar um novo convite.
      </p>
    </section>
  );
}
