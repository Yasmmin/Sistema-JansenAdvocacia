import { useLocation } from "react-router-dom";
import HearingsPage from "@/pages/AudienciasPage";
import CalendarPage from "@/pages/CalendarioPage";
import ClientsPage from "@/pages/ClientesPage";
import IntimationsPage from "@/pages/IntimacoesPage";
import PainelPage from "@/pages/PainelPage";

export default function SajulbraPage() {
  const { pathname } = useLocation();
  const section = pathname.split("/").filter(Boolean)[1];
  if (section === "intimacoes") return <IntimationsPage source="SAJULBRA" />;
  if (section === "assistidos") return <ClientsPage source="SAJULBRA" />;
  if (section === "calendario") return <CalendarPage source="SAJULBRA" />;
  if (section === "audiencias") return <HearingsPage source="SAJULBRA" />;
  return <PainelPage source="SAJULBRA" />;
}
