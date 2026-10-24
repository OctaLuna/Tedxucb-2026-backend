export const SUPPORTED_EVENT_SLUGS = ['tedxucb', 'innovation-week'] as const;
export type SupportedEventSlug = (typeof SUPPORTED_EVENT_SLUGS)[number];
