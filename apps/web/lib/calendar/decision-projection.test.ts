import {it,expect} from 'vitest';
import type {DerivedDecisionState} from '../atlas/decision-ledger/types';
import {projectDecisionSummaries} from './decision-projection';
const range={fromDate:'2026-10-19',toDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'} as const;
const example={decisionId:'decision-1',version:2,projectId:'project-a',title:'Lansering',status:'approved',lastRecordAt:'2026-10-20T09:00:00.000Z',decidedAt:'2026-10-20T09:00:00.000Z',review:null,outcome:null} as DerivedDecisionState;
it('only projects authorized decisions in the selected Stockholm week',()=>{
 const values=projectDecisionSummaries([example,{...example,decisionId:'foreign',projectId:'project-b'},{...example,decisionId:'late',lastRecordAt:'2026-10-27T12:00:00.000Z'}],range,['project-a']);
 expect(values).toHaveLength(1);
 expect(values[0]).toMatchObject({id:'atlas-decision:decision-1:2',title:'Lansering',status:'approved',hasOutcome:false,sourceSystem:'atlas_decision_ledger'});
});
it('does not represent an unapproved proposal as an approved decision',()=>{
 expect(projectDecisionSummaries([{...example,status:'proposed',decidedAt:null}],range,['project-a'])[0].status).toBe('proposed');
});
