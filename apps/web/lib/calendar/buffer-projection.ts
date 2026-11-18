/**
 * Read-only Buffer -> calendar projection.
 * No OAuth credentials, mutations or provider publishing capabilities.
 * Live integration must supply server-verified data scoped to the authenticated organisation.
 */
export type BufferRecord = {
  id: string;
  channelId: string;
  status: string;
  text: string;
  dueAt?: string | null;
  sentAt?: string | null;
  error?: string | null;
  permalink?: string | null;
};

export type BufferCalendarRecord = {
  id: string;
  provider: 'buffer';
  channelId: string;
  title: string;
  fullText: string;
  status: 'scheduled' | 'published' | 'failed';
  atUtc: string;
  sentAt: string | null;
  permalink: string | null;
  readonly: true;
};

function iso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
function allowedLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}
function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 10000) : '';
}

/** Restrict to one verified Buffer channel, ignore unscheduled drafts and unknown statuses. */
export function projectBufferCalendar(
  records: readonly BufferRecord[],
  channelId: string,
  fromUtc: string,
  toUtcExclusive: string,
): BufferCalendarRecord[] {
  const from = iso(fromUtc), to = iso(toUtcExclusive);
  if (!from || !to || from >= to || !channelId) throw Error('Invalid calendar scope');
  const byId = new Map<string, BufferCalendarRecord>();
  for (const raw of records) {
    if (!raw || raw.channelId !== channelId || !/^[a-zA-Z0-9_-]{4,128}$/.test(raw.id)) continue;
    const sentAt = iso(raw.sentAt);
    const dueAt = iso(raw.dueAt);
    const status = raw.status === 'sent' && sentAt ? 'published'
      : raw.status === 'scheduled' && dueAt ? 'scheduled'
      : raw.status === 'failed' && (dueAt || sentAt) ? 'failed' : null;
    const when = status === 'published' ? sentAt : dueAt ?? sentAt;
    if (!status || !when || when < from || when >= to) continue;
    const fullText = normalizedText(raw.text);
    const item: BufferCalendarRecord = {
      id: 'buffer:' + channelId + ':' + raw.id,
      provider: 'buffer', channelId, title: fullText.split(/\r?\n/)[0].slice(0, 120) || 'LinkedIn-inlägg',
      fullText, status, atUtc: when, sentAt, permalink: allowedLink(raw.permalink), readonly: true,
    };
    const previous = byId.get(item.id);
    // Prefer a confirmed external publish receipt over a stale scheduled record.
    if (!previous || (item.status === 'published' && previous.status !== 'published')) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a,b) => a.atUtc.localeCompare(b.atUtc) || a.id.localeCompare(b.id));
}
