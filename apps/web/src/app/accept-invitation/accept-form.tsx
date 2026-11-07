"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface AcceptFormProps {
  token: string;
  email: string;
  displayName: string;
  schoolName: string;
}

export function AcceptInvitationForm({
  token,
  email,
  displayName,
  schoolName,
}: AcceptFormProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 12) {
      setError("A senha deve ter pelo menos 12 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/teacher-invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
          setError("Este convite é inválido ou expirou. Peça à escola para enviar um novo.");
        } else if (response.status === 429) {
          setError("Muitas tentativas. Aguarde um minuto e tente novamente.");
        } else {
          const result = await response.json().catch(() => null);
          setError(
            typeof result?.message === "string"
              ? result.message
              : "Não foi possível ativar o acesso.",
          );
        }
        return;
      }
      setDone(true);
    } catch {
      setError("Não foi possível conectar à KlassApp. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section className="login-card" aria-labelledby="login-title">
        <Link className="brand login-brand" href="/" aria-label="KlassApp">
          <span className="brand-mark" aria-hidden="true">k</span>
          <span>Klass<span className="brand-highlight">App</span></span>
        </Link>
        <p className="eyebrow login-eyebrow">TUDO PRONTO <span aria-hidden="true">✦</span></p>
        <h1 id="login-title">Acesso ativado!</h1>
        <p className="login-copy">
          {displayName}, sua conta de professora em {schoolName} está pronta.
          Entre com <strong>{email}</strong> e a senha que você acabou de criar.
        </p>
        <Link className="login-submit login-submit-link" href="/login">Ir para entrar</Link>
      </section>
    );
  }

  return (
    <section className="login-card" aria-labelledby="login-title">
      <Link className="brand login-brand" href="/" aria-label="KlassApp">
        <span className="brand-mark" aria-hidden="true">k</span>
        <span>Klass<span className="brand-highlight">App</span></span>
      </Link>
      <p className="eyebrow login-eyebrow">CONVITE DA ESCOLA <span aria-hidden="true">✦</span></p>
      <h1 id="login-title">Olá, {displayName}!</h1>
      <p className="login-copy">
        Você foi convidada por <strong>{schoolName}</strong> para acessar a KlassApp.
        Crie sua senha para ativar o acesso.
      </p>
      <p className="invitation-email">{email}</p>

      <form className="login-form" onSubmit={accept}>
        <label htmlFor="new-password">Crie uma senha</label>
        <input
          autoComplete="new-password"
          id="new-password"
          maxLength={128}
          minLength={12}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <small className="password-hint">Use pelo menos 12 caracteres.</small>

        <label htmlFor="confirm-password">Confirme a senha</label>
        <input
          autoComplete="new-password"
          id="confirm-password"
          maxLength={128}
          minLength={12}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type="password"
          value={confirmation}
        />

        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" disabled={submitting} type="submit">
          {submitting ? "Ativando acesso..." : "Criar senha e ativar"}
        </button>
      </form>
      <div className="login-decoration" aria-hidden="true">✿</div>
    </section>
  );
}
