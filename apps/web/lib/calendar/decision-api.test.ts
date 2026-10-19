import {it,expect,vi,beforeEach} from 'vitest';
import {calendarDecisionApi} from './decision-api';
import {resolveCalendarAccess} from './access';
import {createDecisionLedgerStore} from '../atlas/decision-ledger/store';
vi.mock('./access',()=>({resolveCalendarAccess:vi.fn()}));
vi.mock('../atlas/decision-ledger/store',()=>({createDecisionLedgerStore:vi.fn()}));
vi.mock('./source-decisions',()=>({readCalendarDecisions:vi.fn(async()=>({decisions:[],available:true,truncated:false}))}));
const access=vi.mocked(resolveCalendarAccess),store=vi.mocked(createDecisionLedgerStore);
beforeEach(()=>{vi.resetAllMocks();access.mockResolvedValue({ok:true,actor:{userId:'owner',allowedProjectIds:['project-a'],projectScopeAvailable:true},sessionDb:{} as never});});
it('does not expose unknown or unauthorized decision IDs',async()=>{
 store.mockReturnValue({lineage:async()=>[{projectId:'project-b'}]} as never);
 const res=await calendarDecisionApi(new Request('https://example.test/api/calendar/decisions?decisionId=some-id'));
 expect(res.status).toBe(404);
 expect(await res.json()).toEqual({ok:false,code:'NOT_FOUND'});
 expect(res.headers.get('Cache-Control')).toBe('private, no-store');
});
it('does not query decision records when project scope failed',async()=>{
 access.mockResolvedValue({ok:true,actor:{userId:'owner',allowedProjectIds:['project-a'],projectScopeAvailable:false},sessionDb:{} as never});
 const res=await calendarDecisionApi(new Request('https://example.test/api/calendar/decisions?decisionId=some-id'));
 expect(res.status).toBe(503);expect(store).not.toHaveBeenCalled();
});
it('rejects duplicate query keys and non-GET writes',async()=>{
 expect((await calendarDecisionApi(new Request('https://example.test/api/calendar/decisions?decisionId=a&decisionId=b'))).status).toBe(400);
 expect((await calendarDecisionApi(new Request('https://example.test/api/calendar/decisions',{method:'POST'}))).status).toBe(405);
});
