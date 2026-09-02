/**
 * En su propio archivo, no en mail.module.ts: mail.service.ts y
 * mail.processor.ts necesitan importarlo, y module.ts importa a esos dos --
 * juntarlo en module.ts crea un import circular que deja MAIL_QUEUE en
 * `undefined` al momento de evaluar los decoradores @InjectQueue()/
 * @Processor(), que caen en silencio a la cola "default" (bug real
 * encontrado al levantar la app: "BullQueue_default" en vez de
 * "BullQueue_mail").
 */
export const MAIL_QUEUE = 'mail';
