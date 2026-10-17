import 'server-only'
import type {Qualification} from './policy'
/** Deliberately empty until sv-atlas-v2 source/result evidence is independently
 * reviewed for the exact bounded adapter, runtime, configuration and artifact.
 * Installed models and the old pilot report do not create admission authority. */
export const LOCAL_TEXT_QUALIFICATIONS:ReadonlyArray<Readonly<{evidenceHash:string;qualification:Qualification}>>=Object.freeze([])
