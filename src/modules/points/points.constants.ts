/**
 * En su propio archivo, no en points.module.ts, mismo motivo que
 * mail.constants.ts: reconciliation.processor.ts necesita importarlo, y
 * module.ts lo importa a él -- juntarlo en module.ts crea el import
 * circular que ya causó un bug real en 002-c (MAIL_QUEUE quedaba
 * `undefined` al evaluar @Processor()).
 */
export const POINTS_RECONCILIATION_QUEUE = 'points-reconciliation';

export const DAILY_RECONCILIATION_JOB_ID = 'daily-reconciliation';
