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
      <body>{children}</body>
    </html>
  );
}
