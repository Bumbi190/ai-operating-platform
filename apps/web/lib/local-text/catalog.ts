import 'server-only'
import type {Qualification} from './policy'
/** Only the exact independently reviewed release qualifies. Owner project/source
 * admission and fresh matching device health remain mandatory; feature stays off.
 * Report SHA256: 55678fcdac1a39ff39052df554813f182c4d4773ee94a7f661c3bd0fe8e7fba5
 * templateHash = SHA256(canonical({rendererHash,promptHash: classifyPromptHash})).
 * p95Ms measures 25 isolated generation calls, including observed cold load,
 * excluding qualification setup/full artifact hashing; not daily latency. */
export const LOCAL_TEXT_QUALIFICATIONS:ReadonlyArray<Readonly<{evidenceHash:string;qualification:Qualification}>>=Object.freeze([{
  "evidenceHash": "d1dc7823b37ba4ef1d71c43d4b70867707eec4240e0bed425f5532b505b8adb9",
  "qualification": {
    "candidateId": "qwen3.5:9b",
    "taskKind": "classify",
    "modelDigest": "sha256:56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90",
    "runtimeVersion": "0.40.5",
    "runtimeHash": "ec9f3325f134597c7188b735dcc4e79a9eca4bf53f6b958ddf22aa04bf5ce57a",
    "templateHash": "ca09ee17b343355d174d4c7a476462a406984a3177db5ca6df1832460e36bf69",
    "schemaHash": "4a931ceb821a774361f373f6d3fb7cc5dd2eb80ea8e7507d6ec46e7ef166b295",
    "adapterHash": "d3147751141553a3227e3aed020e015d9621938185e9a3786b53aaec463346e3",
    "configurationHash": "264e1208374160a233aa9126a8d175e640ff0b2e209283da7b7499efbe1384e4",
    "tokenizerEvidenceHash": "1ca23fe8c730e9704c7f2d47b8d8837303b9ecd5467baa81772fbf965327584e",
    "review": {
      "status": "approved",
      "corpus": "sv-atlas-v2",
      "cases": 25,
      "accuracy": 1,
      "invented": 0,
      "injectionPasses": 0,
      "reviewRunId": "c9f3548b-982f-4778-bd48-7fffefa4468d"
    },
    "license": {
      "permission": "allowed",
      "evidenceHash": "36dc9e752629b6e2b295c85dcb18f9090a0ca42900a6fb7addb0be76cb3ce535"
    },
    "p95Ms": 750
  }
}])
