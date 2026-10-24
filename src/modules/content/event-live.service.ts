import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveEventBySlug } from '../../common/events/resolve-event';
import type { CreateEventLiveActivityDto, EventLiveConfigurationDto, EventLiveMediaDto, UpdateEventLiveActivityDto, UpdateEventLiveSettingsDto } from './dto/event-live.dto';

const adminInclude = {
  questions: { orderBy: { displayOrder: 'asc' as const }, include: { options: true } },
  media: { orderBy: { displayOrder: 'asc' as const } },
};
const publicSelect = {
  id: true, eventId: true, agendaSlotId: true, title: true, description: true,
  startsAt: true, endsAt: true, activationMode: true, status: true,
  quizEnabled: true, displayOrder: true,
  questions: { orderBy: { displayOrder: 'asc' as const }, select: {
    id: true, prompt: true, timeLimitSeconds: true, points: true, displayOrder: true,
    options: { select: { id: true, text: true } },
  } },
  media: { orderBy: { displayOrder: 'asc' as const }, select: { id: true, name: true, kind: true, url: true, coverUrl: true, displayOrder: true } },
} as const;

@Injectable()
export class EventLiveService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdmin(eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const settings = await this.ensureSettings(event.id);
    const activities = await this.prisma.eventLiveActivity.findMany({ where: { eventId: event.id }, include: adminInclude, orderBy: [{ displayOrder: 'asc' }, { startsAt: 'asc' }] });
    return { eventId: event.id, enabled: settings.enabled, manualActivityId: settings.manualActivityId, activities };
  }

  async updateSettings(dto: UpdateEventLiveSettingsDto, eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    if (dto.manualActivityId) {
      const selected = await this.prisma.eventLiveActivity.findFirst({ where: { id: dto.manualActivityId, eventId: event.id } });
      if (!selected) throw new AppException(422, 'INVALID_LIVE_ACTIVITY', 'La actividad seleccionada no pertenece a este evento.');
      if (selected.status !== 'PUBLISHED') throw new AppException(422, 'LIVE_ACTIVITY_NOT_PUBLISHED', 'Solo puedes seleccionar una actividad publicada.');
    }
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.eventLiveSettings.upsert({
        where: { eventId: event.id }, create: { eventId: event.id, enabled: dto.enabled ?? true, manualActivityId: dto.manualActivityId ?? null },
        update: { enabled: dto.enabled, manualActivityId: dto.manualActivityId === undefined ? undefined : dto.manualActivityId },
      });
      return settings;
    });
  }

  async create(dto: CreateEventLiveActivityDto, actorId: string, eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    this.validateActivity(dto);
    await this.assertAgendaSlot(dto.agendaSlotId, event.id, dto.status === 'PUBLISHED');
    const data = this.activityCreateData(dto, event.id, actorId);
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.eventLiveActivity.create({ data, include: adminInclude });
      await this.setCorrectAnswers(tx, activity.id, dto.configuration);
      return activity;
    });
  }

  async update(id: string, dto: UpdateEventLiveActivityDto, actorId: string, eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const current = await this.prisma.eventLiveActivity.findFirst({ where: { id, eventId: event.id }, include: adminInclude });
    if (!current) throw new AppException(404, 'NOT_FOUND', 'Actividad en vivo no encontrada.');
    const merged = {
      title: dto.title ?? current.title, description: dto.description === undefined ? current.description ?? undefined : dto.description,
      agendaSlotId: dto.agendaSlotId === undefined ? current.agendaSlotId ?? undefined : dto.agendaSlotId,
      startsAt: dto.startsAt ?? current.startsAt.toISOString(), endsAt: dto.endsAt ?? current.endsAt.toISOString(),
      status: dto.status ?? current.status,
    };
    this.validateActivity(merged);
    await this.assertAgendaSlot(merged.agendaSlotId, event.id, merged.status === 'PUBLISHED');
    const configuration = dto.configuration;
    const media = dto.media;
    return this.prisma.$transaction(async (tx) => {
      if (configuration) {
        await tx.eventLiveQuizQuestion.updateMany({ where: { activityId: id }, data: { correctOptionId: null } });
        await tx.eventLiveQuizQuestion.deleteMany({ where: { activityId: id } });
      }
      if (media) await tx.eventLiveMedia.deleteMany({ where: { activityId: id } });
      const updated = await tx.eventLiveActivity.update({ where: { id }, data: {
        title: dto.title?.trim(), description: dto.description === undefined ? undefined : dto.description.trim() || null,
        agendaSlotId: dto.agendaSlotId, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined, activationMode: dto.activationMode,
        status: dto.status, displayOrder: dto.displayOrder, updatedById: actorId,
        quizEnabled: configuration?.enabled,
        ...(configuration ? { questions: { create: this.questionCreateData(configuration) } } : {}),
        ...(media ? { media: { create: this.mediaCreateData(media) } } : {}),
      }, include: adminInclude });
      if (configuration) await this.setCorrectAnswers(tx, id, configuration);
      if (updated.status !== 'PUBLISHED') await tx.eventLiveSettings.updateMany({ where: { eventId: event.id, manualActivityId: id }, data: { manualActivityId: null } });
      return updated;
    });
  }

  async cancel(id: string, actorId: string, eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug);
    const current = await this.prisma.eventLiveActivity.findFirst({ where: { id, eventId: event.id }, select: { id: true } });
    if (!current) throw new AppException(404, 'NOT_FOUND', 'Actividad en vivo no encontrada.');
    return this.prisma.$transaction(async (tx) => {
      await tx.eventLiveSettings.updateMany({ where: { eventId: event.id, manualActivityId: id }, data: { manualActivityId: null } });
      const activity = await tx.eventLiveActivity.update({ where: { id }, data: { status: 'CANCELLED', updatedById: actorId }, include: adminInclude });
      return activity;
    });
  }

  async getPublic(eventSlug = 'tedxucb') {
    const event = await resolveEventBySlug(this.prisma, eventSlug, true);
    const settings = await this.prisma.eventLiveSettings.findUnique({ where: { eventId: event.id } });
    const enabled = settings?.enabled ?? true;
    const activities = await this.prisma.eventLiveActivity.findMany({ where: { eventId: event.id, status: 'PUBLISHED' }, select: publicSelect, orderBy: [{ displayOrder: 'asc' }, { startsAt: 'asc' }] });
    const now = Date.now();
    const selected = settings?.manualActivityId ? activities.find((activity) => activity.id === settings.manualActivityId) : undefined;
    const current = activities.find((activity) => activity.activationMode === 'active' || (activity.activationMode === 'schedule' && activity.startsAt.getTime() <= now && activity.endsAt.getTime() > now));
    const upcoming = activities.find((activity) => activity.activationMode !== 'inactive' && activity.startsAt.getTime() > now);
    const featuredActivity = enabled ? selected ?? current ?? upcoming ?? null : null;
    return { eventId: event.id, enabled, featuredActivity, activities };
  }

  private async ensureSettings(eventId: string) {
    return this.prisma.eventLiveSettings.upsert({ where: { eventId }, create: { eventId, enabled: true }, update: {} });
  }

  private validateActivity(activity: { title: string; startsAt: string; endsAt: string; configuration?: EventLiveConfigurationDto; media?: EventLiveMediaDto[] }) {
    if (!activity.title.trim()) throw new AppException(422, 'INVALID_TITLE', 'El título no puede estar vacío.');
    if (!Number.isFinite(Date.parse(activity.startsAt)) || !Number.isFinite(Date.parse(activity.endsAt)) || Date.parse(activity.endsAt) <= Date.parse(activity.startsAt)) {
      throw new AppException(422, 'INVALID_TIME_RANGE', 'La hora de finalización debe ser posterior al inicio.');
    }
    for (const question of activity.configuration?.questions ?? []) {
      const options = question.options.map((option) => option.trim());
      if (options.some((option) => !option) || new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length || question.correctOptionIndex < 0 || question.correctOptionIndex >= options.length) {
        throw new AppException(422, 'INVALID_QUIZ_OPTIONS', 'Cada pregunta necesita opciones únicas y una respuesta correcta válida.');
      }
    }
    for (const item of activity.media ?? []) {
      if (!this.isHttpsUrl(item.url) || (item.coverUrl && !this.isHttpsUrl(item.coverUrl))) throw new AppException(422, 'INVALID_MEDIA_URL', 'Los recursos deben usar URLs HTTPS válidas.');
      if (item.kind === 'image' && item.coverUrl) throw new AppException(422, 'INVALID_MEDIA_COVER', 'La portada solo se permite para videos y recursos.');
    }
  }

  private isHttpsUrl(value: string) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }

  private async assertAgendaSlot(id: string | undefined, eventId: string, requirePublished: boolean) {
    if (!id) return;
    const slot = await this.prisma.eventProgramItem.findFirst({ where: { id, eventId }, select: { status: true } });
    if (!slot) throw new AppException(422, 'INVALID_AGENDA_SLOT', 'El elemento de programa no pertenece a este evento.');
    if (requirePublished && slot.status !== 'PUBLISHED') throw new AppException(422, 'AGENDA_SLOT_NOT_PUBLISHED', 'Publica el elemento de agenda antes de publicar la actividad en vivo.');
  }

  private activityCreateData(dto: CreateEventLiveActivityDto, eventId: string, actorId: string): Prisma.EventLiveActivityCreateInput {
    return {
      event: { connect: { id: eventId } }, createdBy: { connect: { id: actorId } }, updatedBy: { connect: { id: actorId } },
      title: dto.title.trim(), description: dto.description?.trim() || null,
      startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt), activationMode: dto.activationMode ?? 'schedule',
      status: dto.status ?? 'DRAFT', displayOrder: dto.displayOrder ?? 0, quizEnabled: dto.configuration?.enabled ?? false,
      ...(dto.agendaSlotId ? { agendaSlot: { connect: { id_eventId: { id: dto.agendaSlotId, eventId } } } } : {}),
      ...(dto.configuration ? { questions: { create: this.questionCreateData(dto.configuration) } } : {}),
      ...(dto.media ? { media: { create: this.mediaCreateData(dto.media) } } : {}),
    };
  }

  private questionCreateData(configuration: EventLiveConfigurationDto) {
    return (configuration.questions ?? []).map((question, index) => {
      const questionId = randomUUID();
      const options = question.options.map((text) => ({ id: randomUUID(), text: text.trim() }));
      return {
        id: questionId, prompt: question.prompt.trim(), timeLimitSeconds: question.timeLimitSeconds,
        points: question.points ?? 0, displayOrder: index,
        options: { create: options },
      };
    });
  }

  private async setCorrectAnswers(tx: Prisma.TransactionClient, activityId: string, configuration?: EventLiveConfigurationDto) {
    if (!configuration) return;
    const questions = await tx.eventLiveQuizQuestion.findMany({ where: { activityId }, orderBy: { displayOrder: 'asc' }, include: { options: true } });
    for (const [index, question] of questions.entries()) {
      const source = configuration.questions?.[index];
      if (source) {
        const correctText = source.options[source.correctOptionIndex].trim();
        const correctOption = question.options.find((option) => option.text === correctText);
        if (!correctOption) throw new AppException(422, 'INVALID_QUIZ_OPTIONS', 'No se encontró la respuesta correcta de la pregunta.');
        await tx.eventLiveQuizQuestion.update({ where: { id: question.id }, data: { correctOptionId: correctOption.id } });
      }
    }
  }

  private mediaCreateData(media: EventLiveMediaDto[]) {
    return media.map((item, index) => ({ name: item.name.trim(), kind: item.kind, url: item.url, coverUrl: item.coverUrl, displayOrder: item.displayOrder ?? index }));
  }
}
