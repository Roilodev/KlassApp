"use client";

import { useRouter } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    const response = await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Não foi possível encerrar a sessão.");
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="logout-button" onClick={logout} type="button">
      Sair
    </button>
  );
}
