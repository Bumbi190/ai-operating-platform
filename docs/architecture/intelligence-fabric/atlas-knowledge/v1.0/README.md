# Omnira Intelligence Fabric — Atlas Knowledge v1.0

Status: **repository knowledge source — NOT runtime-ingested**

This directory is a faithful, chapter-addressable Markdown representation derived from the verified canonical source documents. It supports repository review, linking, search, and future ingestion work without asserting that any runtime has loaded it.

## Runtime boundary

- `runtime_ingested: false` is recorded for every chapter.
- No embeddings or vector index were created.
- No retrieval, loader, prompt injection, or production chat integration was added.
- Repository presence does not prove runtime availability.
- Implementation claims remain unverified unless supported by runtime code and tests.

See [RUNTIME_INGESTION_STATUS.md](RUNTIME_INGESTION_STATUS.md) for the authoritative status statement.

## Indexes

- [Chapter index](index/chapters.json)
- [Part index](index/parts.json)
- [Foundation and contents](front-matter/00-book-foundation-and-contents.md)

## Chapters

| Chapter | Part | Title |
|---:|---|---|
| 1 | PART I | [The Intelligence Fabric Vision](chapters/ch01.md) |
| 2 | PART I | [System Position, Ownership and Boundaries](chapters/ch02.md) |
| 3 | PART I | [Doctrine and Architectural Principles](chapters/ch03.md) |
| 4 | PART I | [Canonical Concepts and Object Model](chapters/ch04.md) |
| 5 | PART II | [Capability Requests and Intent Envelopes](chapters/ch05.md) |
| 6 | PART II | [Capability Registry](chapters/ch06.md) |
| 7 | PART II | [Model Registry](chapters/ch07.md) |
| 8 | PART II | [Provider Registry](chapters/ch08.md) |
| 9 | PART II | [Agent, Tool and Execution Resource Registry](chapters/ch09.md) |
| 10 | PART III | [Intelligence Planning and Execution Graphs](chapters/ch10.md) |
| 11 | PART III | [Routing Profiles and Selection Policy](chapters/ch11.md) |
| 12 | PART III | [Cost, Credits and Economic Governance](chapters/ch12.md) |
| 13 | PART III | [Quality, Evaluation and Benchmarking](chapters/ch13.md) |
| 14 | PART III | [Reliability, Fallback and Recovery](chapters/ch14.md) |
| 15 | PART III | [Latency, Capacity, Scheduling and Quotas](chapters/ch15.md) |
| 16 | PART IV | [Adapter and Connector Architecture](chapters/ch16.md) |
| 17 | PART IV | [APIs, MCP, Webhooks and Asynchronous Jobs](chapters/ch17.md) |
| 18 | PART IV | [Credentials, Identity and Secret Management](chapters/ch18.md) |
| 19 | PART IV | [Local, Private, Edge and Self-Hosted Intelligence](chapters/ch19.md) |
| 20 | PART IV | [Multimodal Production Architecture](chapters/ch20.md) |
| 21 | PART IV | [Assets, Provenance, Rights and Consent](chapters/ch21.md) |
| 22 | PART V | [Execution Evidence, Learning and Governed Memory](chapters/ch22.md) |
| 23 | PART V | [Data Classification, Privacy and Isolation](chapters/ch23.md) |
| 24 | PART V | [Approval, Authority and Bounded Autonomy](chapters/ch24.md) |
| 25 | PART V | [Observability, Audit and Incident Response](chapters/ch25.md) |
| 26 | PART VI | [Developer Experience, Testing and Conformance](chapters/ch26.md) |
| 27 | PART VI | [Stage 1 Implementation Architecture](chapters/ch27.md) |
| 28 | PART VI | [Rollout, Migration, Anti-Patterns and Future Evolution](chapters/ch28.md) |
