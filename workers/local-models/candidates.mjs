export const JOB_VERSION=1, PROMPT_VERSION=1, FIXTURE_VERSION=1;
export const CANDIDATES=Object.freeze(['qwen3:8b','qwen3.5:4b','qwen3.5:9b']);
export const OPTIONS=Object.freeze({temperature:0,num_ctx:4096,num_predict:384});
export function candidate(id) { if(!CANDIDATES.includes(id)) throw new Error('INVALID_CANDIDATE'); return id; }
