import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { resolveEventBySlug } from '../../common/events/resolve-event';
import type { CreateEventProgramItemDto } from './dto/create-event-program-item.dto';
import type { UpdateEventProgramItemDto } from './dto/update-event-program-item.dto';

const publicSpeakerSelect = { id: true, fullName: true, headline: true, photoUrl: true, photoAltText: true } as const;

@Injectable()
export class EventProgramService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug, true);
    const items = await this.prisma.eventProgramItem.findMany({
      where: { eventId: event.id, status: 'PUBLISHED' },
      orderBy: [{ displayOrder: 'asc' }, { startsAt: 'asc' }],
      select: {
        id: true, eventId: true, title: true, description: true, type: true,
        startsAt: true, endsAt: true, displayOrder: true, status: true,
        speaker: { select: { ...publicSpeakerSelect, status: true } },
      },
    });
    const data = items.map(({ speaker, ...item }) => ({
      ...item,
      speaker: speaker?.status === 'PUBLISHED' ? {
        id: speaker.id,
        fullName: speaker.fullName,
        headline: speaker.headline,
        photoUrl: speaker.photoUrl,
        photoAltText: speaker.photoAltText,
      } : null,
    }));
    return { data };
  }

  async listAdmin(eventSlug = 'tedxucb', status?: string) {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const data = await this.prisma.eventProgramItem.findMany({
      where: { eventId: event.id, ...(status ? { status } : {}) },
      orderBy: [{ displayOrder: 'asc' }, { startsAt: 'asc' }],
      include: { speaker: { select: publicSpeakerSelect } },
    });
    return { data };
  }

  async create(dto: CreateEventProgramItemDto, actorId: string, eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    this.assertTimeRange(dto.startsAt, dto.endsAt);
    this.assertTitle(dto.title);
    await this.assertSpeaker(dto.speakerId, event.id, dto.status === 'PUBLISHED');

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.eventProgramItem.create({
        data: {
          eventId: event.id,
          createdById: actorId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          type: dto.type,
          speakerId: dto.speakerId,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
          displayOrder: dto.displayOrder ?? 0,
          status: dto.status ?? 'DRAFT',
        },
        include: { speaker: { select: publicSpeakerSelect } },
      });
      await tx.auditLog.create({
        data: { actorId, action: 'EVENT_PROGRAM_ITEM_CREATED', entityType: 'event_program_item', entityId: item.id, detail: { eventId: event.id, type: item.type } },
      });
      return item;
    });
  }

  async update(id: string, dto: UpdateEventProgramItemDto, actorId: string, eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const current = await this.prisma.eventProgramItem.findFirst({ where: { id, eventId: event.id } });
    if (!current) throw new AppException(404, 'NOT_FOUND', 'Elemento de programa no encontrado.');

    const startsAt = dto.startsAt ?? current.startsAt.toISOString();
    const endsAt = dto.endsAt ?? current.endsAt.toISOString();
    this.assertTimeRange(startsAt, endsAt);
    if (dto.title !== undefined) this.assertTitle(dto.title);
    const speakerId = dto.speakerId === undefined ? current.speakerId ?? undefined : dto.speakerId;
    const targetStatus = dto.status ?? current.status;
    await this.assertSpeaker(speakerId, event.id, targetStatus === 'PUBLISHED');

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.eventProgramItem.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          type: dto.type,
          speakerId: dto.speakerId,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          displayOrder: dto.displayOrder,
          status: dto.status,
        },
        include: { speaker: { select: publicSpeakerSelect } },
      });
      await tx.auditLog.create({
        data: { actorId, action: 'EVENT_PROGRAM_ITEM_UPDATED', entityType: 'event_program_item', entityId: item.id, detail: { eventId: event.id, ...dto } },
      });
      return item;
    });
  }

  private async assertSpeaker(speakerId: string | undefined, eventId: string, requirePublished = false) {
    if (!speakerId) return;
    const speaker = await this.prisma.speaker.findFirst({ where: { id: speakerId, eventId }, select: { id: true, status: true } });
    if (!speaker) throw new AppException(422, 'INVALID_SPEAKER', 'El speaker no pertenece a este evento.');
    if (requirePublished && speaker.status !== 'PUBLISHED') {
      throw new AppException(422, 'SPEAKER_NOT_PUBLISHED', 'Publica el speaker antes de publicarlo en el programa.');
    }
  }

  private assertTitle(title: string) {
    if (!title.trim()) throw new AppException(422, 'INVALID_TITLE', 'El título no puede estar vacío.');
  }

  private assertTimeRange(startsAt: string, endsAt: string) {
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new AppException(422, 'INVALID_TIME_RANGE', 'La hora de finalización debe ser posterior al inicio.');
    }
  }
}
