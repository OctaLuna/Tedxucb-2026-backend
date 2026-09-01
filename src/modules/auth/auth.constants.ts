export const UserStatus = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  REJECTED: 'REJECTED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const Role = {
  ADMIN: 'ADMIN',
  STAFF: 'STAFF',
  ALUMNO: 'ALUMNO',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const AuthTokenType = {
  INVITATION: 'INVITATION',
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;
export type AuthTokenType = (typeof AuthTokenType)[keyof typeof AuthTokenType];

/** RF-109 / plan.md: access token corto, deliberadamente no configurable. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** RF-108: 7 días para invitación/verificación/recuperación, fijado en la spec. */
export const ONE_TIME_TOKEN_TTL_DAYS = 7;
