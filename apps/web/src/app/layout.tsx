import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KlassApp | Cuidar da comunidade escolar",
  description:
    "Um espaço acolhedor para organizar a rotina e a comunicação da escola.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="app-content">{children}</div>
        <div className="device-unavailable" role="status">
          <span aria-hidden="true">✦</span>
          <h1>Disponível apenas em computadores</h1>
          <p>Acesse a KlassApp em um computador para continuar.</p>
        </div>
      </body>
    </html>
  );
}
