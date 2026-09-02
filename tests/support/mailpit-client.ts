const MAILPIT_API = 'http://localhost:8025/api/v1';

interface MailpitMessage {
  ID: string;
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
  Snippet: string;
}

export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
}

/**
 * Confirmado contra la API real de Mailpit (docker compose up mailpit +
 * curl): { messages: [{ To: [{Address}], Subject, Snippet, ... }] }.
 * Polling porque el envío ocurre en un Worker de BullMQ, asíncrono
 * respecto al request HTTP que dispara la postulación.
 */
export async function waitForMailpitMessage(
  predicate: (msg: MailpitMessage) => boolean,
  { timeoutMs = 5000, intervalMs = 200 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT_API}/messages`);
    const body = (await response.json()) as { messages: MailpitMessage[] };
    const found = body.messages?.find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Mailpit no recibió el correo esperado dentro del timeout.');
}
