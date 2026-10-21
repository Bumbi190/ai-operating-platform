import type {ProjectLifecycleState} from './types'
export type ProjectLifecycleRelation={project_lifecycle?:unknown}
export function projectLifecycleState(row:ProjectLifecycleRelation):ProjectLifecycleState{
 let relation=row.project_lifecycle
 if(Array.isArray(relation)){if(relation.length>1)throw Error('Invalid project lifecycle');relation=relation[0]}
 if(relation==null)return 'active'
 if(typeof relation!=='object'||!('state' in relation)||!['active','archived','trashed'].includes(String(relation.state)))throw Error('Invalid project lifecycle')
 return relation.state as ProjectLifecycleState
}
