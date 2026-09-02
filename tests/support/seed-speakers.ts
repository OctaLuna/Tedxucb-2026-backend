import { prismaTestClient } from './prisma-test-client';

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
  }> = {},
) {
  return prismaTestClient.speaker.create({
    data: { fullName: 'Ana Pérez', status: 'DRAFT', displayOrder: 0, ...overrides },
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
  }> = {},
) {
  return prismaTestClient.speakerApplication.create({
    data: {
      fullName: 'Carlos Gómez',
      email: 'carlos.gomez@ejemplo.com',
      affiliation: 'Universidad X',
      expertiseArea: 'Educación',
      ideaTitle: 'Repensar el aula',
      ideaSummary: 'Resumen de prueba.',
      evidenceBasis: 'Estudio propio.',
      applicability: 'Aplicable en universidades.',
      status: 'PENDING',
      ...overrides,
    },
  });
}
