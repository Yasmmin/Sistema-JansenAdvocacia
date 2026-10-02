export const routes = {
  login: "/login",
  inicio: "/",
  dashboard: "/dashboard",
  painel: "/painel",
  intimacoes: "/intimacoes",
  clientes: "/clientes",
  cliente: "/clientes/:id",
  processoDoCliente: "/clientes/:id/processos/:processId",
  processo: "/processos/:processId",
  tarefas: "/tarefas",
  calendario: "/calendario",
  audiencias: "/audiencias",
  sajulbra: "/sajulbra/*",
  sajulbraInicio: "/sajulbra",
  sajulbraIntimacoes: "/sajulbra/intimacoes",
  sajulbraAssistidos: "/sajulbra/assistidos",
  sajulbraCalendario: "/sajulbra/calendario",
  sajulbraAudiencias: "/sajulbra/audiencias",
} as const;

export function clientePath(id: string | number) {
  return `/clientes/${id}`;
}

export function processoPath(processId: string | number, clientId?: string | number) {
  return clientId == null ? `/processos/${processId}` : `/clientes/${clientId}/processos/${processId}`;
}
