"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("Email ou senha inválidos.");
        } else if (response.status === 429) {
          setError("Muitas tentativas. Aguarde um minuto e tente novamente.");
        } else {
          setError("Não foi possível entrar. Tente novamente em instantes.");
        }
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível conectar à KlassApp. Verifique se a API está iniciada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <Link className="brand login-brand" href="/" aria-label="KlassApp">
          <span className="brand-mark" aria-hidden="true">k</span>
          <span>Klass<span className="brand-highlight">App</span></span>
        </Link>
        <p className="eyebrow login-eyebrow">BEM-VINDA DE VOLTA <span aria-hidden="true">✦</span></p>
        <h1 id="login-title">Que bom ter você por aqui!</h1>
        <p className="login-copy">Entre para cuidar da rotina da sua escola.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            autoComplete="username"
            autoFocus
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />

          <label htmlFor="password">Senha</label>
          <input
            autoComplete="current-password"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />

          {error && <p className="login-error" role="alert">{error}</p>}

          <button className="login-submit" disabled={submitting} type="submit">
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="login-help">Acesso criado pela administração da escola.</p>
        <div className="login-decoration" aria-hidden="true">✿</div>
      </section>
    </main>
  );
}
