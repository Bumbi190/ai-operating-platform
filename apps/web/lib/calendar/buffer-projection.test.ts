import {describe, expect, it} from 'vitest';
import {projectBufferCalendar, type BufferRecord} from './buffer-projection';

const channel = 'linkedin-company-123';
const range = ['2026-11-18T00:00:00.000Z', '2026-11-21T00:00:00.000Z'] as const;
const record = (values: Partial<BufferRecord> = {}): BufferRecord => ({
  id: 'post_1234', channelId: channel, status: 'scheduled',
  text: 'Handlarbörsen\nLäs mer på hemsidan',
  dueAt: '2026-11-18T13:30:00.000Z', sentAt: null, error: null, permalink: null, ...values,
});
const project = (records: BufferRecord[]) => projectBufferCalendar(records, channel, ...range);

describe('read-only Buffer calendar projection', () => {
  it('maps scheduled post and preserves Swedish text and UTC', () => {
    expect(project([record()])).toEqual([{
      id: 'buffer:linkedin-company-123:post_1234', provider: 'buffer',
      channelId: channel, title: 'Handlarbörsen',
      fullText: 'Handlarbörsen\nLäs mer på hemsidan',
      status: 'scheduled', atUtc: '2026-11-18T13:30:00.000Z',
      sentAt: null, permalink: null, readonly: true,
    }]);
  });
  it('shows confirmed sentAt instead of planned dueAt for sent posts', () => {
    const result = project([record({status:'sent',sentAt:'2026-11-18T13:32:00Z',permalink:'https://www.linkedin.com/feed/update/123'})]);
    expect(result[0]).toMatchObject({status:'published',atUtc:'2026-11-18T13:32:00.000Z',readonly:true});
    expect(result[0].permalink).toBe('https://www.linkedin.com/feed/update/123');
  });
  it('ignores other channels, drafts, missing receipts and out-of-range records', () => {
    expect(project([
      record({channelId:'different'}),
      record({status:'draft'}),
      record({status:'sent',sentAt:null}),
      record({dueAt:'2026-11-21T00:00:00Z'}),
      record({id:'bad/id'}),
    ])).toEqual([]);
  });
  it('deduplicates provider IDs and prefers a sent receipt over scheduled state', () => {
    const items=project([
      record(),
      record({status:'sent',sentAt:'2026-11-18T13:31:00Z'}),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('published');
  });
  it('rejects javascript URLs and invalid scope', () => {
    expect(project([record({permalink:'javascript:alert(1)'})])[0].permalink).toBeNull();
    expect(() => projectBufferCalendar([], channel, range[1], range[0])).toThrow('Invalid calendar scope');
  });
  it('does not mutate original provider data', () => {
    const input = Object.freeze(record());
    project([input]);
    expect(input.status).toBe('scheduled');
  });
});
