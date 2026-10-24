import { prismaTestClient } from './prisma-test-client';
import { seedTestEvent } from './seed-events';
export { seedTestEvent } from './seed-events';

export async function seedSpeaker(
  overrides: Partial<{
    fullName: string;
    status: 'DRAFT' | 'PUBLISHED';
    headline: string;
    bio: string;
    talkTitle: string;
    photoUrl: string;
    photoAltText: string;
    displayOrder: number;
    eventSlug: string;
  }> = {},
) {
  const event = await seedTestEvent(overrides.eventSlug);
  const { eventSlug: _eventSlug, ...speakerOverrides } = overrides;
  return prismaTestClient.speaker.create({
    data: { fullName: 'Ana Pérez', status: 'DRAFT', displayOrder: 0, eventId: event.id, ...speakerOverrides },
  });
}

/** Campos que satisfacen published_speaker_is_complete, para pruebas de publicación. */
export function completeSpeakerFields() {
  return {
    headline: 'Directora de Sostenibilidad',
    bio: 'Reseña de prueba con contenido suficiente.',
    talkTitle: 'Lo que el desperdicio nos enseña',
    photoUrl: '/uploads/speakers/prueba.png',
    photoAltText: 'Retrato de Ana Pérez sonriendo',
  };
}

export async function seedApplication(
  overrides: Partial<{
    fullName: string;
    email: string;
    affiliation: string;
    expertiseArea: string;
    ideaTitle: string;
    ideaSummary: string;
    evidenceBasis: string;
    applicability: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'NOT_TED_FORMAT' | 'CONVERTED';
    reviewedById: string;
    reviewedAt: Date;
    convertedSpeakerId: string;
    eventSlug: string;
  }> = {},
) {
  const event = await seedTestEvent(overrides.eventSlug);
  const { eventSlug: _eventSlug, ...applicationOverrides } = overrides;
  return prismaTestClient.speakerApplication.create({
    data: {
      eventId: event.id,
      fullName: 'Carlos Gómez',
      email: 'carlos.gomez@ejemplo.com',
      affiliation: 'Universidad X',
      expertiseArea: 'Educación',
      ideaTitle: 'Repensar el aula',
      ideaSummary: 'Resumen de prueba.',
      evidenceBasis: 'Estudio propio.',
      applicability: 'Aplicable en universidades.',
      status: 'PENDING',
      ...applicationOverrides,
    },
  });
}
