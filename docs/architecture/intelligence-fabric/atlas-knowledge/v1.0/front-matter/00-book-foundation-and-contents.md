---
title: Book Foundation and Contents
book: Omnira Intelligence Fabric
version: v1.0
status: canonical_verified
source_docx: ../../../canonical/v1.0/front-matter/00-book-foundation-and-contents.docx
source_sha256: b5975e7de481e6722d871098525fafbaae931c5563f335fa5621994401d40308
runtime_ingested: false
---

OMNIRA INTELLIGENCE FABRIC

Agent, Model, Provider & Multimodal Orchestration Architecture

Canonical Working Manuscript

Book Foundation, Authority, Scope and Contents

Document Status

Authority Statement

This book defines the intended canonical architecture of the Omnira Intelligence Fabric.

It establishes the principles, contracts, boundaries, responsibilities and governance rules through which Omnira accesses, selects, coordinates and evaluates artificial intelligence resources.

The book does not, by itself:

activate a provider,

authorize an external service,

grant an agent execution authority,

approve expenditure,

create credentials,

publish content,

change runtime permissions,

or prove that a described capability has been implemented.

Architecture, runtime state and operational authority are separate forms of truth.

A capability described in this book must not be represented as operational until the corresponding implementation, tests, security controls, policies and deployment state have been verified.

No model, provider, agent, tool or workflow receives authority merely because it is named or described in this book.

Foreword

Artificial intelligence is rapidly reducing the amount of capital, infrastructure and specialist labour required to transform an idea into a real product, service, organisation or company.

A person can now access capabilities that previously required separate teams for research, software development, writing, design, illustration, animation, voice production, video editing, analytics, marketing and operational planning.

However, access to many individual AI services does not automatically create an intelligent operating system.

Without a governed architecture, the result becomes a fragmented collection of subscriptions, prompts, credentials, agents and generated files. Costs become difficult to understand. Data moves without sufficient control. Agents become coupled to individual model providers. Knowledge is lost between tools. Quality varies unpredictably. Commercial rights become unclear. Failures become difficult to investigate.

Omnira must solve this problem at the platform level.

The purpose of the Omnira Intelligence Fabric is not merely to connect Omnira to more AI models. Its purpose is to create a governed intelligence execution layer through which the entire platform can access the right capability under the right conditions.

Atlas, Managers, specialist agents and workflows should be able to express what must be achieved without being permanently tied to one provider, model, protocol or technical implementation.

The Intelligence Fabric must determine how an approved objective can be fulfilled while respecting:

capability requirements,

quality expectations,

data classification,

commercial rights,

project boundaries,

user authority,

provider availability,

execution latency,

cost limits,

reliability requirements,

provenance requirements,

and approved autonomy.

This architecture supports a central Omnira ambition:

People should be able to pursue and operationalise meaningful ideas without first requiring the capital normally needed to hire an entire specialist organisation.

This does not mean that intelligence, computation or creative work must always be free.

It means that Omnira should reduce unnecessary cost, duplicated effort, technical lock-in and inaccessible complexity. The system should use local, user-owned, included, free-tier or lower-cost resources when they satisfy the required standard, while reserving premium resources for tasks where their additional value is justified.

The objective is not minimum cost at any price.

The objective is the most appropriate intelligence for the approved purpose.

The Intelligence Fabric Promise

The Omnira Intelligence Fabric shall provide a governed and provider-independent path from intent to intelligence execution.

It shall allow Omnira to:

request capabilities without hard-coding providers,

select resources according to explicit policies,

combine multiple models and tools within one governed execution,

use local and external resources together,

estimate and record cost,

enforce project and tenant isolation,

protect classified information,

preserve commercial rights and provenance,

evaluate the quality of results,

recover from provider and model failures,

collect evidence and learning,

and maintain human authority over consequential actions.

The Intelligence Fabric shall make intelligence resources replaceable without making Omnira’s agents, projects or knowledge dependent on one provider.

The system shall optimise for the user’s approved objective, not for the commercial interests of any individual AI vendor.

Canonical Foundational Principle

No Intelligence Without Fabric

All governed artificial intelligence execution within Omnira shall pass through the Omnira Intelligence Fabric or through an explicitly declared compatibility boundary governed by equivalent policies.

Atlas must not independently embed provider endpoints, model credentials or provider-specific execution logic into its strategic reasoning.

Managers must not create uncontrolled provider integrations.

Specialist agents must not gain permanent ownership of credentials, provider relationships or model selection.

Workflows must not silently bypass cost, data, authority, provenance or project-isolation controls.

The principle does not prohibit experimentation, development tools or temporary manual pilots. It requires those environments to be honestly classified and prevented from being misrepresented as governed production execution.

A manual Claude-to-OpenArt connection may, for example, be used as a pilot environment. It does not become an Omnira production integration until Omnira itself controls the relevant connection, policy, budget, execution record and approval boundary.

Recovered Architecture Baseline

The Intelligence Fabric book is a recovery-informed first canonical edition.

Previous architecture work established several foundational decisions before the full book was written. These decisions are treated as inherited architecture constraints unless this book explicitly refines them.

Previously established decisions

Shared platform capability

The Intelligence Fabric is an Omnira-wide platform service.

Atlas uses the Fabric but does not own it.

Managers, specialist agents, workflows and approved platform services may also request capabilities through it.

Intent is separate from implementation

Atlas and other authorised callers shall express:

the intended outcome,

capability requirements,

quality requirements,

data restrictions,

budget,

deadline,

and authority envelope.

They shall not need to know the selected provider, endpoint, credential or model implementation.

Provider-independent execution

Providers and models are replaceable resources.

Omnira-owned agent identities, memories, policies and responsibilities must survive changes in the underlying execution model.

Arnold remains Arnold whether a particular task is executed by a local model, NVIDIA-hosted capability, Claude, Gemini or another approved provider.

Capability-first architecture

Requests shall be expressed in terms of required capability rather than preferred vendor.

Examples include:

generate a consistent animated character scene,

summarise verified research,

produce Swedish narration,

write and test application code,

create a project-scoped embedding,

edit an existing image,

generate a short-form marketing video,

or compare alternative business strategies.

Provider selection follows from the request and its policies.

Governed selection

Fabric selection must consider:

authority and permission,

data classification,

security,

commercial and licensing rights,

capability compatibility,

required quality,

reliability,

availability,

latency,

cost,

user preference,

and approved provider constraints.

The cheapest provider must not be selected when it cannot satisfy the actual requirement.

Hybrid access model

The Fabric shall support combinations of:

user-owned accounts and credentials,

Omnira-managed credits or services,

local models,

self-hosted resources,

included provider capacity,

free-tier capacity,

and externally billed provider services.

Estimated and actual cost must remain visible regardless of payment path.

Routing profiles

The architecture shall support at least the following execution profiles:

Economy

Balanced

Premium

Private

Pinned

Profiles influence selection but never override security, authority, data protection or rights requirements.

Bounded production approval

A user may approve an entire production envelope rather than every individual model call.

An approved envelope may define:

maximum cost,

credit limit,

permitted providers,

number of scenes,

number of variations,

retry limits,

quality threshold,

execution deadline,

and publication restrictions.

Fabric may operate within that envelope.

It must stop or request additional approval when the approved boundary would be exceeded.

Governed data classification

Omnira shall classify data and determine where it may be processed.

Expected classifications include:

Public,

Project Internal,

Confidential,

Local Only,

and Prohibited.

The Fabric may enforce a stricter classification than requested when risk is detected.

It must never silently weaken a classification.

Omnira-owned agent identity

An agent is not equivalent to the model currently executing its reasoning.

Agent identity, role, policy, authority, memory, relationships and project scope are Omnira-governed objects.

Models are execution resources.

Unified adapter layer

The Fabric shall support integrations through:

traditional APIs,

MCP,

local model runtimes,

local tools,

webhooks,

asynchronous jobs,

queues,

future agent protocols,

and manually assisted provider workflows.

Manual integrations must be identified honestly. They must not be represented as autonomous or fully governed integrations.

Full provenance and governed learning

Meaningful executions and assets shall produce evidence that can support:

auditing,

quality evaluation,

future routing,

cost optimisation,

rights verification,

operational memory,

and future decisions.

Raw execution logs must not automatically become permanent Atlas memory.

Learning must be derived, scoped, evaluated and governed.

Stage-based implementation

The complete target architecture shall be defined before implementation.

Implementation shall then proceed through bounded stages.

Stage 1 shall establish the core infrastructure and a representative set of providers. It shall not attempt to integrate every provider or activate unrestricted autonomy.

Purpose of This Book

This book defines how Omnira shall transform a governed capability request into one or more controlled intelligence executions.

It covers the complete path from intent to result:

Intent

↓

Capability Request

↓

Policy and Authority Evaluation

↓

Planning

↓

Provider and Model Selection

↓

Execution

↓

Validation

↓

Approval

↓

Asset or Decision Evidence

↓

Memory and Learning

The book defines both:

the long-term canonical target architecture,

and the bounded Stage 1 architecture that shall be implemented first.

These two states must never be confused.

Scope

The Intelligence Fabric architecture includes support for:

Intelligence capabilities

language and reasoning,

software development and code execution,

research and retrieval,

search and source verification,

embeddings and reranking,

image generation and editing,

design and visual production,

video generation and animation,

avatars and character-consistent production,

speech synthesis,

speech recognition,

speech-to-speech transformation,

dubbing,

sound effects,

music,

document understanding,

multimodal analysis,

tool execution,

agent execution,

workflow execution,

and future intelligence modalities.

Resource types

commercial cloud providers,

user-owned subscriptions,

provider APIs,

MCP servers,

self-hosted services,

local models,

local tools,

edge devices,

private compute nodes,

Omnira-managed services,

and manually assisted services.

Governance domains

identity,

credentials,

secrets,

permissions,

budgets,

approvals,

data classification,

privacy,

tenant isolation,

project isolation,

provenance,

commercial rights,

consent,

quality,

observability,

reliability,

recovery,

retention,

and memory.

Non-Scope

This book does not define the complete internal architecture of every external provider.

It does not attempt to permanently rank every available model.

It does not guarantee that a currently available free tier, price, model or provider will remain available.

It does not make one named provider a permanent architectural dependency.

It does not define the full business model through which Omnira may later resell or package intelligence capacity.

It does not replace:

Executive Intelligence governance,

Atlas Memory architecture,

Intelligence Graph architecture,

Workforce and agent architecture,

project governance,

platform security architecture,

or application-specific product architecture.

It defines how these systems obtain governed access to intelligence execution.

Relationship to Other Omnira Systems

Atlas

Atlas interprets user intent, project context, strategy and priorities.

Atlas requests capabilities from the Intelligence Fabric.

Atlas does not directly own provider selection or provider credentials.

Executive Intelligence

Executive Intelligence determines strategic relevance, decision quality, priorities and business direction.

The Fabric provides execution capacity and evidence.

The Fabric does not independently determine business strategy.

Managers

Managers plan and coordinate bounded work.

They may request capabilities within their delegated authority.

Specialist agents

Specialist agents perform defined roles.

Their underlying models may change without changing their Omnira identity.

Atlas Memory

Memory stores governed information, decisions, preferences, evidence and learning.

The Fabric supplies execution records and learning candidates.

It must not directly promote all logs into permanent memory.

Intelligence Graph

The Intelligence Graph may represent relationships between:

capability requests,

agents,

models,

providers,

executions,

outputs,

approvals,

evidence,

assets,

decisions,

and derived learning.

Graph representation does not itself create authority.

Project and tenant boundaries

Every execution must belong to an explicit user, tenant, project or approved platform scope.

A provider integration must never become an excuse to mix data between Familje-Stunden, The Prompt, GainPilot, Omnira or future customer projects.

Intended Readers and Consumers

This book is written for both human and machine consumers.

Human readers

Omnira’s founder and owner,

future architects,

developers,

security reviewers,

product leads,

operators,

auditors,

and future partners.

Machine consumers

Atlas,

Claude,

Codex,

Gemini,

implementation agents,

review agents,

migration agents,

testing agents,

documentation agents,

and future Omnira-governed systems.

Machine consumption does not grant execution authority.

AI systems shall treat this book as architecture evidence and normative design context, subject to the declared version and implementation state.

Language Policy

The canonical technical manuscript is primarily written in English.

Swedish may be used for:

planning discussions,

operator-facing explanations,

project-specific terminology,

and future translated editions.

Technical contracts, schemas, identifiers and implementation terms should remain in English where this improves precision and interoperability.

Future editions may include:

Atlas Knowledge Edition,

Developer Edition,

Professional Edition,

public English edition,

and public Swedish edition.

All editions must preserve traceable provenance to the approved canonical source.

Canonical Book Structure

Part I — Foundations

Chapter 1 — The Intelligence Fabric Vision

Defines why the Intelligence Fabric exists, what problem it solves and how it supports Omnira’s mission of reducing the capital and expertise required to realise meaningful ideas.

Chapter 2 — System Position, Ownership and Boundaries

Defines Fabric as a shared platform capability, its relationship to Atlas and other Omnira systems, and what responsibilities remain outside its authority.

Chapter 3 — Doctrine and Architectural Principles

Defines No Intelligence Without Fabric, capability-first execution, provider independence, truthful system behaviour, human authority and other governing principles.

Chapter 4 — Canonical Concepts and Object Model

Defines the canonical vocabulary and core objects used throughout the architecture.

Part II — Requests, Capabilities and Resources

Chapter 5 — Capability Requests and Intent Envelopes

Defines how callers express outcomes, constraints, quality, budget, privacy, timing and authority without selecting technical implementation.

Chapter 6 — Capability Registry

Defines how Omnira represents available intelligence capabilities, supported modalities, limitations and compatibility.

Chapter 7 — Model Registry

Defines model identity, versions, capabilities, context limits, performance evidence, deprecation and lifecycle.

Chapter 8 — Provider Registry

Defines providers, accounts, regions, terms, availability, billing, privacy properties and operational state.

Chapter 9 — Agent, Tool and Execution Resource Registry

Defines the distinction and relationships between agents, models, tools, runtimes, workflows and external provider agents.

Part III — Planning, Routing and Economics

Chapter 10 — Intelligence Planning and Execution Graphs

Defines how complex requests are decomposed into governed execution steps and dependencies.

Chapter 11 — Routing Profiles and Selection Policy

Defines Economy, Balanced, Premium, Private and Pinned routing, together with mandatory policy precedence.

Chapter 12 — Cost, Credits and Economic Governance

Defines estimates, actual cost, budgets, reservations, provider billing, user-owned capacity and cost receipts.

Chapter 13 — Quality, Evaluation and Benchmarking

Defines task-specific quality requirements, automated evaluations, human review, benchmarks and confidence.

Chapter 14 — Reliability, Fallback and Recovery

Defines retries, provider failure, fallback, idempotency, uncertain outcomes, partial completion and recovery.

Chapter 15 — Latency, Capacity, Scheduling and Quotas

Defines execution timing, queues, rate limits, concurrency, deadlines, provider capacity and workload prioritisation.

Part IV — Integration and Multimodal Production

Chapter 16 — Adapter and Connector Architecture

Defines the provider-independent adapter contract and how new resources are integrated without modifying core callers.

Chapter 17 — APIs, MCP, Webhooks and Asynchronous Jobs

Defines protocol-specific integration patterns and honest representation of integration maturity.

Chapter 18 — Credentials, Identity and Secret Management

Defines OAuth, API keys, tokens, vaults, credential isolation, rotation, revocation and least privilege.

Chapter 19 — Local, Private, Edge and Self-Hosted Intelligence

Defines local models, NVIDIA-based execution, user-owned hardware, private nodes, offline operation and workload placement.

Chapter 20 — Multimodal Production Architecture

Defines coordinated production across text, code, image, design, voice, sound, music, video and animation.

Chapter 21 — Assets, Provenance, Rights and Consent

Defines Asset Records, prompts, references, model provenance, commercial rights, voice consent, likeness consent, versions and publication history.

Part V — Governance, Memory and Authority

Chapter 22 — Execution Evidence, Learning and Governed Memory

Defines the separation between raw execution records, evaluation evidence, derived learning and approved memory.

Chapter 23 — Data Classification, Privacy and Isolation

Defines public, internal, confidential, local-only and prohibited data together with tenant and project isolation.

Chapter 24 — Approval, Authority and Bounded Autonomy

Defines production envelopes, approval boundaries, earned autonomy, escalation and prohibited self-expansion of authority.

Chapter 25 — Observability, Audit and Incident Response

Defines execution receipts, logs, metrics, tracing, investigation, policy violations, provider incidents and operational truth.

Part VI — Delivery and Evolution

Chapter 26 — Developer Experience, Testing and Conformance

Defines SDKs, schemas, contract tests, simulation, provider certification, testing environments and architecture conformance.

Chapter 27 — Stage 1 Implementation Architecture

Defines the minimum usable implementation, representative providers, migration boundaries and acceptance criteria.

Chapter 28 — Rollout, Migration, Anti-Patterns and Future Evolution

Defines controlled adoption, legacy integration, prohibited shortcuts, future capabilities and long-term architectural evolution.

Planned Stage 1 Capability Set

The final Stage 1 scope shall be established normatively in Chapter 27.

The current working baseline includes:

Capability Registry,

Model Registry,

Provider Registry,

credential and connection management,

capability request envelope,

policy evaluation,

data classification,

cost estimation,

budget enforcement,

routing,

fallback,

approval gates,

execution receipts,

provenance,

evaluation records,

project isolation,

local execution support,

and manual final review before publication.

Representative initial integrations may include:

one or more local or NVIDIA-compatible intelligence resources,

at least two external text or reasoning providers,

ElevenLabs or an equivalent governed voice provider,

OpenArt or an equivalent multimodal production provider,

Ideogram or an equivalent image provider,

and provider-independent test adapters.

Named providers are implementation candidates, not permanent architectural dependencies.

Book Production Rules

Each chapter shall:

be complete enough to stand as an independent architectural reference;

remain consistent with all previously approved chapters;

distinguish normative requirements from examples;

distinguish target architecture from implemented reality;

define clear boundaries and failure behaviour;

preserve user, tenant and project isolation;

prevent providers from acquiring hidden authority;

identify relationships with other Omnira books;

avoid vendor lock-in;

include implementation implications where necessary;

avoid prematurely activating future-stage capabilities;

and remain suitable for transformation into Atlas-readable knowledge records.

No meaningful source material shall be deleted during production.

Drafts, reviews, canonical sources, generated editions and archives shall remain separately identifiable.

Approval and Canonicalisation Process

The book shall progress through the following states:

Working Manuscript

↓

Chapter Review

↓

Complete Review Candidate

↓

Architecture Validation

↓

Canonical Review Candidate

↓

Owner Approval

↓

Canonical Edition v1.0

↓

Atlas Knowledge Edition

↓

Repository Integration

A formatted PDF is not canonical merely because it looks complete.

Canonical status requires:

complete approved content,

stable chapter ordering,

resolved contradictions,

declared version,

owner approval,

manifest,

checksums,

source preservation,

and verified final exports.

Repository integration shall occur through a controlled documentation branch and pull request after the canonical package has been verified.

Closing Foundation Statement

The Omnira Intelligence Fabric shall make advanced artificial intelligence available as a governed, replaceable and economically controlled platform capability.

It shall allow Omnira to combine local intelligence, user-owned services, managed providers and future technologies without surrendering ownership of agent identity, project context, memory, authority or strategic direction.

Atlas shall express intent.

The Fabric shall determine compliant execution.

Policies shall define what is permitted.

Evidence shall show what occurred.

Humans shall retain authority over consequential decisions.

Providers shall remain replaceable.

The user’s vision shall remain the purpose of the system.
