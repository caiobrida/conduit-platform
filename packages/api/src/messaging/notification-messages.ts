import { Category, Status } from '@org/shared-types';

/**
 * E5 — message templates per event type. Free-form Brazilian Portuguese
 * text (Evolution needs no Meta template approval). Built to carry minimal
 * data: protocol + status, never the reporter's name/phone.
 */

const STATUS_LABELS: Record<Status, string> = {
  OPEN: 'Aberto',
  IN_TRIAGE: 'Em triagem',
  TEAM_ASSIGNED: 'Equipe designada',
  IN_FIELD: 'Em atendimento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Encerrado',
  REOPENED: 'Reaberto',
};

const CATEGORY_LABELS: Record<Category, string> = {
  WATER_OUTAGE: 'Falta de água',
  STREET_LEAK: 'Vazamento na via',
  SERVICE_LINE_LEAK: 'Vazamento no ramal',
  SEWAGE: 'Esgoto',
  LOW_PRESSURE: 'Baixa pressão',
  OTHER: 'Outro',
};

export function statusLabel(status: Status): string {
  return STATUS_LABELS[status] ?? status;
}

export function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** Admin alert for a newly opened service request (no citizen PII). */
export function newRequestAdminMessage(input: {
  protocol: string;
  category: Category;
  city: string | null;
}): string {
  const location = input.city ? ` em ${input.city}` : '';
  return (
    `🔔 Novo chamado ${input.protocol}\n` +
    `Categoria: ${categoryLabel(input.category)}${location}.\n` +
    `Acesse o painel para triagem.`
  );
}

/** Citizen update on a status change, with the public tracking link. */
export function statusChangedCitizenMessage(input: {
  protocol: string;
  newStatus: Status;
  trackingUrl: string | null;
}): string {
  const tail = input.trackingUrl
    ? `\nAcompanhe: ${input.trackingUrl}`
    : `\nProtocolo: ${input.protocol}`;
  return (
    `Olá! Seu chamado ${input.protocol} foi atualizado.\n` +
    `Status: ${statusLabel(input.newStatus)}.${tail}`
  );
}
