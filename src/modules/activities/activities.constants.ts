export const ACTIVITY_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;

export type ActivityStatus = (typeof ACTIVITY_STATUS)[keyof typeof ACTIVITY_STATUS];

/**
 * Ninguna transición sale de CANCELLED (terminal). No existe CLOSED→PUBLISHED
 * (reabrir) ni PUBLISHED→DRAFT (despublicar): ningún RF los pide (Artículo
 * VII, no construir lo no pedido).
 */
export const VALID_ACTIVITY_TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['CLOSED', 'CANCELLED'],
  CLOSED: ['CANCELLED'],
  CANCELLED: [],
};

export const ATTENDANCE_METHOD = {
  STAFF_SCAN: 'STAFF_SCAN',
  MANUAL: 'MANUAL',
} as const;
