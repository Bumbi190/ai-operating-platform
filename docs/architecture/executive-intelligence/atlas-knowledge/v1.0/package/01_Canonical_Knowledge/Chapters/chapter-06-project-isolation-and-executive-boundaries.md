# Chapter 6 — Project Isolation & Executive Boundaries

## Metadata

- chapter_number: 6
- canonical_title: Chapter 6 — Project Isolation & Executive Boundaries
- canonical_status: Approved and locked — Canonical v1.0
- canonical_source_file: Chapter 06 — Project Isolation & Executive Boundaries — Canonical v1.0.docx
- canonical_source_file_sha256: 5715189cca5d15b2927eed9d8d48924bfdac511a0947cd2b325b67810fc4cb79
- canonical_book_sha256: ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8
- professional_edition_page_range: p.152–206
- navigational_part (NON-CANONICAL RETRIEVAL AID): Part II — PORTFOLIO, PROJECTS & ISOLATION
- section_count: 118
- section_id_range: 6.1–6.118 (118 sections)
- section_ids: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.14, 6.15, 6.16, 6.17, 6.18, 6.19, 6.20, 6.21, 6.22, 6.23, 6.24, 6.25, 6.26, 6.27, 6.28, 6.29, 6.30, 6.31, 6.32, 6.33, 6.34, 6.35, 6.36, 6.37, 6.38, 6.39, 6.40, 6.41, 6.42, 6.43, 6.44, 6.45, 6.46, 6.47, 6.48, 6.49, 6.50, 6.51, 6.52, 6.53, 6.54, 6.55, 6.56, 6.57, 6.58, 6.59, 6.60, 6.61, 6.62, 6.63, 6.64, 6.65, 6.66, 6.67, 6.68, 6.69, 6.70, 6.71, 6.72, 6.73, 6.74, 6.75, 6.76, 6.77, 6.78, 6.79, 6.80, 6.81, 6.82, 6.83, 6.84, 6.85, 6.86, 6.87, 6.88, 6.89, 6.90, 6.91, 6.92, 6.93, 6.94, 6.95, 6.96, 6.97, 6.98, 6.99, 6.100, 6.101, 6.102, 6.103, 6.104, 6.105, 6.106, 6.107, 6.108, 6.109, 6.110, 6.111, 6.112, 6.113, 6.114, 6.115, 6.116, 6.117, 6.118
- implementation_status: unknown_not_verified_in_this_package

Hash schema: `canonical_book_sha256` = the compiled canonical book; `canonical_source_file_sha256` = this chapter's separate canonical source file. Metadata is descriptive provenance; the text below the separator is exact canonical text (whitespace normalized only; no rewriting, no summaries).

---

## Canonical Text

### 6.1 Purpose of This Chapter

Executive Intelligence cannot safely lead multiple projects unless project isolation is guaranteed by architecture.
Project isolation must not depend on convention.
It must not depend on agents remembering which project they are working for.
It must not depend on developers manually adding filters to every query.
It must not depend on naming conventions, UI routes, prompts, or good intentions.
Project isolation must be explicit, persistent, verifiable, and enforced across every intelligence and execution layer of Omnira.
This chapter defines the isolation and boundary architecture required for:
Portfolio Executive.
Project Executives.
Memory.
Knowledge.
AI Intelligence.
Performance Intelligence.
Manager.
Workforce.
Agents.
Workflows.
Approvals.
Autonomy licenses.
Tools and MCP connections.
Costs and revenue.
Customer data.
Future customer projects.
The purpose is not only to prevent data leakage.
The purpose is to ensure that every decision, mission, action, permission, cost, memory, metric, and outcome remains attributable to the correct project.
Project isolation is both a security requirement and an executive leadership requirement.

### 6.2 The Core Thesis

Every project in Omnira must be treated as a bounded organizational environment.
Each project must have its own:
Identity.
Authority.
Data.
Memory.
Knowledge.
Workforce.
Workflows.
Tools.
Policies.
Approvals.
Autonomy.
Costs.
Performance.
Decision history.
Customer context.
Atlas may understand the portfolio.
The Portfolio Executive may compare governed project summaries.
Project Executives may lead their own projects.
But no project should accidentally inherit the data, permissions, memory, strategy, or authority of another project.
The foundational rule is:
Global visibility must never become global leakage.
Project intelligence must never become cross-project authority.

### 6.3 Isolation Is an Architectural Property

Isolation must be a property of the system.
It cannot be a behavioral suggestion.
A weak model says:
“Remember to filter by project.”
A strong model says:
“An operation cannot proceed unless project scope is explicit and authorized.”
A weak model says:
“Agents should avoid unrelated data.”
A strong model says:
“Agents cannot retrieve unrelated data because access is technically and organizationally scoped.”
A weak model says:
“Portfolio Executive should be careful.”
A strong model says:
“Portfolio Executive receives governed summaries and may request deeper access only through an auditable authorization path.”
Isolation should remain intact even when a model reasons incorrectly.
Safety cannot depend on perfect reasoning.

### 6.4 The Project Boundary Model

Every project should have a formal boundary.
That boundary should separate the project from:
Other internal projects.
Shared Omnira infrastructure.
Portfolio-level intelligence.
Founder-private context.
External customer projects.
Third-party tools.
Public channels.
Production systems.
The project boundary should govern both inbound and outbound flow.
Inbound flow includes:
Data retrieval.
Memory retrieval.
Knowledge retrieval.
Portfolio directives.
Customer messages.
Performance signals.
Tool responses.
Founder instructions.
Outbound flow includes:
Published content.
Customer replies.
Workforce missions.
Tool calls.
Approval requests.
Cost events.
Performance reports.
Portfolio summaries.
Decision Ledger entries.
The Project Executive must understand both sides of the boundary.

### 6.5 The Project Scope Envelope

Every meaningful executive or operational object should carry a project scope envelope.
Conceptually, the envelope should identify:
Project identifier.
Project ownership.
Project type.
Authority scope.
Data classification.
Execution environment.
Policy profile.
Autonomy profile.
Requested action.
Originating layer.
Trace identifier.
The project scope envelope should accompany:
Executive recommendations.
Missions.
Tasks.
Workflow runs.
Memory writes.
Memory retrievals.
Knowledge retrievals.
Tool calls.
Approvals.
Performance events.
Cost events.
Decision Ledger entries.
Published outputs.
Project identity must travel with the work.
It must not be inferred late in the process.

### 6.6 Explicit Scope Before Action

No executive action should proceed without explicit scope.
Before acting, Omnira should be able to answer:
Which project does this belong to?
Who owns that project?
Which authority applies?
Which policies apply?
Which data may be accessed?
Which tools may be used?
Which external actions are allowed?
Which approval gates apply?
Where should the result be recorded?
If scope is unclear, the system should stop and escalate.
Ambiguous project scope is not a minor metadata issue.
It is a governance failure.

### 6.7 Default-Deny Project Isolation

Project isolation should follow a default-deny model.
The default assumption should be:
No project may access another project’s data, memory, tools, customers, permissions, or workflows.
Access should be granted only when:
The purpose is explicit.
The authority is valid.
The scope is limited.
The access is necessary.
The action is logged.
The permission can expire.
The result remains governed.
Default-deny architecture is safer than trying to enumerate every possible forbidden path.

### 6.8 Least Privilege

Every executive layer, agent, workflow, role, and tool should receive the minimum access required.
Least privilege applies to:
Data.
Memory.
Knowledge.
Customer records.
Financial information.
Tool permissions.
Publishing channels.
Infrastructure access.
Approval capability.
Autonomy scope.
A research agent may need access to sources.
It does not need refund authority.
A content agent may need article context.
It does not need customer data.
A support agent may need a customer case.
It does not need global portfolio strategy.
A Project Executive may need financial summaries.
It may not need unrestricted banking access.
Capability should remain narrow enough to audit.

### 6.9 Separation of Data and Authority

Access to data does not imply authority to act on that data.
A Project Executive may see that churn is increasing.
That does not automatically authorize discounts.
A support workflow may see that a customer is unhappy.
That does not authorize a refund.
A Performance system may identify low-performing content.
That does not authorize permanent deletion.
A Portfolio Executive may see revenue across projects.
That does not authorize fund transfers.
Omnira must distinguish:
Read authority.
Interpretation authority.
Recommendation authority.
Execution authority.
External action authority.
Financial authority.
These permissions must not collapse into one access flag.

### 6.10 Project Data Isolation

Each project should own its project-scoped operational data.
Examples include:
Customers.
Users.
Subscriptions.
Content.
Articles.
News items.
Support cases.
Products.
Campaigns.
Workflows.
Agent runs.
Approvals.
Revenue events.
Costs.
Performance measurements.
Project settings.
A project-specific operation should retrieve only data belonging to the active project.
Project identity should be enforced at every relevant boundary:
Storage.
Retrieval.
Mutation.
Workflow execution.
Tool usage.
Reporting.
Export.
Deletion.
Archival.
Data should never become globally visible merely because it exists inside the same technical platform.

### 6.11 Customer Data Isolation

Customer data requires especially strong isolation.
Customer data may include:
Names.
Email addresses.
Subscription state.
Payment history.
Support history.
Product usage.
Feedback.
Complaints.
Refund requests.
Child-related information.
Training information.
Private messages.
A Project Executive should receive only the customer context required for leadership.
Workforce should receive only the data required for the specific task.
Portfolio Executive should usually receive aggregated signals rather than raw records.
Examples:
Allowed portfolio signal:
Familje-Stunden support volume increased by 40%.
Not automatically allowed:
Full access to every customer conversation.
Data minimization protects both users and the organization.

### 6.12 Sensitive Data Classification

Projects should classify data by sensitivity.
A conceptual model may include:
Public.
Internal.
Confidential.
Sensitive Customer Data.
Restricted.
Founder Private.
Public
Information already intended for public distribution.
Internal
Project operating information with limited risk.
Confidential
Strategy, financial data, unpublished content, or internal decisions.
Sensitive Customer Data
Personal, behavioral, subscription, support, health-adjacent, child-related, or payment-related information.
Restricted
Security credentials, high-impact system access, or legally sensitive information.
Founder Private
Personal calendar details, private obligations, personal communications, and non-project personal context.
Access should become more restrictive as sensitivity increases.

### 6.13 Project Memory Isolation

Memory must be project-scoped by default.
Project Memory may include:
Past decisions.
Strategy history.
Customer patterns.
Workflow lessons.
Approval history.
Autonomy history.
Risk incidents.
Performance interpretations.
Project preferences.
Rejected recommendations.
A Project Executive should retrieve its own project Memory.
A project Workforce agent should retrieve only the subset required for its task.
The Portfolio Executive may receive governed summaries or explicitly authorized cross-project memories.
A project should not gain access to another project’s full Memory merely because the knowledge appears useful.
Memory leakage can create strategic leakage even when no customer data is exposed.

### 6.14 Global Memory vs Project Memory

Omnira should distinguish between global and project-scoped Memory.
Global Memory
May contain:
Founder-wide preferences.
Omnira-wide policies.
Portfolio decisions.
Shared architectural principles.
Global governance rules.
Cross-project lessons approved for reuse.
Project Memory
May contain:
Local strategy.
Local decisions.
Project-specific risks.
Customer patterns.
Workflow history.
Local autonomy history.
Local performance interpretation.
A project may use global Memory only when that global Memory is authorized for project use.
Project Memory should not automatically become global.
Promotion from project Memory to global Memory should be deliberate.

### 6.15 Memory Promotion

Some project lessons may be useful across Omnira.
For example:
Approval edits improve future content quality.
Permanent deletion creates unnecessary risk.
Newsletter sending requires stricter approval than draft preparation.
Certain provider failures require fallback.
A Project Executive may recommend promoting a lesson to global Memory.
Promotion should evaluate:
Is the lesson generalizable?
Does it expose project-sensitive information?
Does it contain customer data?
Does it conflict with another project’s policy?
Who may use the promoted memory?
Should the lesson be abstracted first?
The promoted memory should contain the principle, not unnecessary underlying details.

### 6.16 Project Knowledge Isolation

Knowledge systems must distinguish between:
Shared domain knowledge.
Project-specific knowledge.
Sensitive project knowledge.
Customer-specific knowledge.
Shared knowledge may include:
General SEO principles.
General publishing knowledge.
General subscription metrics.
General workflow design.
General AI model capability.
Project-specific knowledge may include:
The Prompt editorial strategy.
Familje-Stunden brand tone.
GainPilot progression logic.
Omnira internal architecture.
Knowledge retrieval should respect project scope.
Shared domain knowledge may be reusable.
Project strategy is not automatically reusable.

### 6.17 Knowledge Promotion and Reuse

Project-derived knowledge may be reused when it has been:
Abstracted.
De-identified.
Authorized.
Reviewed for conflicts.
Separated from project-sensitive context.
For example:
Reusable:
A general framework for newsletter approval gates.
Not automatically reusable:
The Prompt’s exact editorial categories and performance thresholds.
Knowledge reuse should create leverage without erasing project identity.

### 6.18 Workforce Isolation

Workforce must remain project-scoped during execution.
Every Workforce assignment should identify:
Project.
Mission.
Role.
Task.
Allowed data.
Allowed tools.
Forbidden actions.
Approval gates.
Output destination.
Reporting path.
A Workforce role may be reusable across projects.
Its context, permissions, tools, and outputs must still be isolated per mission.
A content writer role may serve multiple projects.
The active instance must know which project it serves now.
Reusable capability must not become reusable access.

### 6.19 Agent Identity vs Project Identity

An agent may have a reusable capability identity.
Examples:
Content Writer.
Research Analyst.
QA Reviewer.
Support Drafting Agent.
Performance Analyst.
But every active assignment must also have a project identity.
The agent should not act only as:
“I am a Content Writer.”
It should act as:
“I am the assigned Content Writer for this specific The Prompt mission under this specific scope.”
Project assignment should determine:
Context.
Memory access.
Knowledge access.
Tools.
Policies.
Approval gates.
Output location.
The role is reusable.
The authority is not.

### 6.20 Manager Isolation

Manager must coordinate inside the project scope of the mission.
Manager should not:
Route tasks across projects without authorization.
Reuse an approval from another project.
Assign an agent with incompatible permissions.
Merge project queues.
Apply the wrong policy profile.
Send outputs to the wrong destination.
Retry work under a different project scope.
Manager should verify project scope at every handoff.
Operational coordination must preserve executive boundaries.

### 6.21 Workflow Isolation

Every workflow should be associated with:
Project scope.
Workflow owner.
Autonomy level.
Risk class.
Allowed tools.
Allowed data.
External channels.
Approval requirements.
Cost attribution.
Performance attribution.
Rollback path.
A workflow must not become globally reusable by copying only its logic.
When reused, it must receive a new project-specific configuration and authority profile.
The workflow pattern may be shared.
The workflow permission must be local.

### 6.22 Workflow Templates vs Workflow Instances

Omnira should distinguish between:
Workflow template.
Workflow instance.
A workflow template defines reusable structure.
For example:
Research → Draft → Edit → Approve → Publish.
A workflow instance defines project-specific execution:
Project: The Prompt.
Sources: Approved AI news sources.
Publishing channel: theprompt.nu.
Approval rule: Human approval required.
Autonomy level: Prepare only.
Brand voice: The Prompt editorial tone.
Templates may be shared.
Instances must be scoped.

### 6.23 Tool and MCP Isolation

External tools and MCP connections must be scoped.
Each connection should define:
Project ownership.
Credentials.
Allowed actions.
Allowed data.
Read or write capability.
External side effects.
Cost impact.
Approval requirements.
Logging requirements.
Revocation path.
A tool connection for The Prompt social publishing should not automatically authorize publishing for Familje-Stunden.
A Stripe connection should not expose all projects if project-specific access is possible.
A calendar connection should not expose private calendar details to Workforce.
Tool availability must not imply unrestricted tool authority.

### 6.24 Shared Tooling

Some tools may be shared at infrastructure level.
Examples:
AI model providers.
Image generation systems.
Email infrastructure.
Storage.
Analytics infrastructure.
Workflow engines.
Observability.
Shared infrastructure must still preserve project-level:
Credentials or credential scopes.
Data separation.
Cost attribution.
Logs.
Rate limits.
Policies.
Output destinations.
Shared infrastructure should increase efficiency without blending project operations.

### 6.25 Credential Isolation

Credentials should be scoped as narrowly as possible.
Preferred order:
Project-specific credentials.
Project-specific subaccounts.
Scoped tokens.
Role-limited credentials.
Shared credentials only when unavoidable.
Shared credentials create systemic risk.
When shared credentials are required, Omnira should compensate through:
Strict project context validation.
Action allowlists.
Audit logs.
Rate limits.
Approval gates.
Anomaly detection.
Rapid revocation.
Credentials are authority.
They must be governed accordingly.

### 6.26 Publishing Channel Isolation

Publishing channels must belong to specific projects.
Examples:
The Prompt website.
The Prompt Instagram.
The Prompt Facebook.
The Prompt YouTube.
Familje-Stunden newsletter.
Familje-Stunden social accounts.
GainPilot app communication.
Every publishing action should verify:
Project identity.
Channel ownership.
Content category.
Publishing authority.
Approval state.
Autonomy license.
Brand policy.
Risk class.
A correct article published to the wrong project is still a serious failure.

### 6.27 Communication Isolation

Customer communication must remain project-specific.
The system must preserve:
Brand voice.
Support policy.
Response templates.
Refund authority.
Escalation rules.
Sensitive topic rules.
Service promises.
Response timing.
A response style approved for The Prompt should not automatically be used for Familje-Stunden.
Project communication is part of project identity.
It must remain bounded.

### 6.28 Brand Isolation

Each project has its own brand.
Brand scope may include:
Name.
Tone.
Visual identity.
Audience.
Values.
Claims.
Editorial position.
Customer promise.
Language style.
Project Executives and Workforce must not blend brands.
Brand leakage can damage trust even when no data leakage occurs.
Examples include:
Displaying The Prompt branding inside Familje-Stunden.
Using GainPilot terminology in Omnira.
Applying The Prompt editorial voice to family support.
Using Familje-Stunden customer promises in another project.
Brand isolation is an executive boundary.

### 6.29 Financial Isolation

Each project should have project-scoped financial context.
This may include:
Revenue.
Recurring revenue.
Costs.
Marketing spend.
Infrastructure cost.
Model usage.
Refunds.
Subscription metrics.
Cost per result.
Budget authority.
Financial events should be attributed to the correct project.
Shared costs should be explicitly allocated or classified as shared portfolio costs.
Unattributed cost weakens executive judgment.

### 6.30 Cost Attribution

Every meaningful cost should be classified as:
Project-specific.
Shared infrastructure.
Portfolio-level.
Experimental.
Unallocated exception.
Project-specific AI usage should be attributed to the project.
A shared Executive Intelligence service may be a portfolio cost.
A project-specific campaign should not be hidden inside shared infrastructure spend.
The Portfolio Executive needs accurate attribution to evaluate opportunity cost and return.

### 6.31 Budget Isolation

Budget authority must remain project-scoped.
A budget mandate for The Prompt should not authorize Familje-Stunden spending.
Each mandate should define:
Project.
Maximum amount.
Purpose.
Allowed vendors.
Time period.
Risk class.
Reporting requirement.
Stopping condition.
Review date.
Unused budget in one project does not become available to another without an explicit decision.

### 6.32 Revenue Isolation

Revenue should be attributed to the project that generated it.
The Portfolio Executive may view aggregates.
Project Executives should view their own revenue context.
Cross-project revenue comparison may be allowed at portfolio level.
Raw payment data should remain restricted.
Revenue visibility should support leadership without broadening payment-system access unnecessarily.

### 6.33 Performance Isolation

Performance Intelligence must remain project-scoped by default.
Project performance includes:
Traffic.
Leads.
Subscribers.
Revenue.
Retention.
Engagement.
Workflow reliability.
Agent quality.
Model cost.
Approval rate.
Correction rate.
Policy violations.
Autonomy readiness.
The Portfolio Executive may consume normalized summaries.
The Project Executive should receive deeper local detail.
A project should not optimize based on another project’s metric without explicit interpretation.

### 6.34 Metric Definition Isolation

The same metric name may mean different things across projects.
For example:
Engagement in The Prompt:
Views, clicks, reading time, shares.
Engagement in Familje-Stunden:
Product usage, activity completion, email interaction.
Engagement in GainPilot:
Workout adherence, logging, progression interaction.
Metrics must retain project-specific definitions.
Portfolio comparison should use normalized concepts carefully.
The system must not pretend unlike metrics are directly equivalent.

### 6.35 Decision Ledger Isolation

Every Decision Ledger entry should have an explicit scope.
Possible scopes include:
Global.
Portfolio.
Project.
Workflow.
Mission.
Incident.
A project decision should not silently become global policy.
A portfolio decision should not expose unnecessary project-sensitive evidence.
Decision retrieval should respect both scope and authority.
The ledger should preserve:
Who decided.
What scope applied.
Which project was affected.
What evidence was used.
What authority existed.
When review is required.

### 6.36 Approval Isolation

Approvals must be tied to the exact scope of the proposed action.
An approval should identify:
Project.
Workflow.
Action.
Content or object.
External destination.
Permission granted.
Duration.
Conditions.
Approver.
Decision time.
Approval for one article does not authorize every future article.
Approval for one batch does not authorize another batch.
Approval for The Prompt does not authorize Familje-Stunden.
Approval scope must be explicit.

### 6.37 Approval Reuse

Some approvals may be reusable through policy or autonomy licenses.
Reuse should occur only when:
The action category is identical.
The project is identical.
The workflow is identical.
The risk class remains acceptable.
The permission has not expired.
The conditions remain satisfied.
No serious policy violation has occurred.
The system should not generalize approval beyond its original scope without authorization.

### 6.38 Autonomy License Isolation

Every autonomy license must be scoped to:
Project.
Workflow.
Action category.
Risk class.
External channel.
Permission level.
Start date.
Expiration or review date.
Success conditions.
Rollback path.
A successful The Prompt social workflow does not authorize:
The Prompt newsletter sending.
The Prompt website strategy changes.
Familje-Stunden support replies.
GainPilot recommendations.
Omnira production changes.
Autonomy must never spread through analogy alone.

### 6.39 Authority Inheritance

Authority should not be inherited automatically.
A Project Executive should not inherit Portfolio Executive authority.
A Manager should not inherit Project Executive authority.
Workforce should not inherit Manager authority.
An agent should not inherit workflow-level permissions beyond the assigned task.
A child task may inherit narrower scope from a mission.
It should never inherit broader authority than the parent mission.
Authority should narrow as work moves toward execution.

### 6.40 The Authority Narrowing Principle

The flow from leadership to execution should reduce ambiguity and authority.
Conceptually:
Portfolio Executive:
Broad strategic context.
Project Executive:
Project-specific direction.
Manager:
Operational coordination scope.
Workforce:
Mission-specific execution scope.
Agent:
Task-specific authority.
Tool call:
Single-action permission.
Each layer should receive less broad authority than the layer above.
Execution should become more precise as it moves downward.

### 6.41 Portfolio Visibility Contract

The Portfolio Executive needs enough visibility to lead.
It does not need unrestricted access to everything.
The Portfolio visibility contract should prefer:
Project health summaries.
Lifecycle and operating modes.
Revenue and cost aggregates.
Risk indicators.
Dependency summaries.
Autonomy summaries.
Approval summaries.
Performance summaries.
Escalations.
Review dates.
Raw project data should remain local unless deeper access is necessary and authorized.

### 6.42 Governed Project Summaries

Each Project Executive should produce governed summaries for Portfolio Executive.
A summary may include:
Current status.
Top priority.
Mode.
Goal progress.
Performance trend.
Major risk.
Approval need.
Dependency.
Autonomy state.
Requested portfolio decision.
The summary should exclude unnecessary sensitive information.
This creates global visibility through abstraction rather than unrestricted exposure.

### 6.43 Cross-Project Requests

Sometimes one project may require input or capability from another.
Cross-project requests should be explicit.
A request should define:
Requesting project.
Providing project or shared system.
Purpose.
Data or capability requested.
Minimum required scope.
Duration.
Risk.
Approval requirement.
Expected output.
Retention rule.
Cross-project access should be temporary where possible.
Permanent access should require stronger justification.

### 6.44 Cross-Project Collaboration

Projects may collaborate without merging boundaries.
Examples:
The Prompt shares a general publishing lesson.
Familje-Stunden uses shared newsletter infrastructure.
GainPilot uses a shared Performance framework.
Omnira provides shared Workforce roles.
Collaboration should occur through contracts:
Shared service.
Abstracted knowledge.
Governed summary.
Scoped API.
Approved mission.
Temporary access grant.
Direct unrestricted database access should not be the default collaboration model.

### 6.45 Temporary Access Grants

Temporary cross-project access should define:
Subject.
Resource.
Purpose.
Scope.
Start time.
Expiration.
Allowed actions.
Logging.
Revocation.
Approval.
Temporary grants should expire automatically.
Expired access should not remain active because no one remembered to remove it.

### 6.46 Break-Glass Access

Rare emergencies may require broader access.
This is break-glass access.
It should require:
Explicit crisis reason.
Authorized actor.
Limited duration.
Enhanced logging.
Immediate notification.
Post-access review.
Automatic expiration.
Post-mortem if material.
Break-glass access must remain exceptional.
Emergency access must not become a shortcut around normal governance.

### 6.47 Founder Private Boundary

Founder-private context requires its own boundary.
Private context may include:
Personal calendar details.
Family events.
Health-related obligations.
Education schedule.
Private communications.
Personal finances.
Non-project preferences.
Atlas may use authorized private context to support planning.
Portfolio Executive may receive capacity signals.
Project Executives may receive only relevant operational summaries.
Workforce and agents should not receive private details unless explicitly necessary and authorized.
Example:
Allowed:
Founder approval availability is low today.
Not normally allowed:
The detailed private reason.

### 6.48 Calendar Privacy

Calendar integration should follow a tiered model.
Atlas-Level Access
May understand event details when authorized.
Executive Capacity Access
Receives derived signals such as:
Available.
Unavailable.
Deep work capacity.
Approval delay.
High-load day.
Low-load day.
Project Access
Receives only the capacity information relevant to planning.
Workforce Access
Receives scheduling constraints only when necessary.
Private calendar text should not flow downward by default.

### 6.49 Shared Intelligence Isolation

Shared intelligence systems may serve multiple projects.
Examples:
Memory infrastructure.
Knowledge infrastructure.
AI Intelligence.
Performance Intelligence.
Executive Intelligence.
Workforce Intelligence.
Shared infrastructure must not create shared context by default.
Each request should carry:
Project scope.
Authority.
Retrieval constraints.
Output scope.
Logging context.
The system may be shared.
The context must remain isolated.

### 6.50 AI Intelligence Boundaries

AI Intelligence may choose models, providers, and tools.
It should not broaden project authority.
If a Project Executive requests:
“Prepare a newsletter draft.”
AI Intelligence may select a model.
It may not reinterpret that as:
“Send the newsletter.”
Resource selection must remain subordinate to mission scope.
Model capability must not expand business authority.

### 6.51 Performance Intelligence Boundaries

Performance Intelligence may aggregate and compare measurements.
It should not expose raw project-sensitive data unnecessarily.
Portfolio comparisons should prefer normalized summaries.
Project Executives should receive local detail.
Performance Intelligence should not directly change project strategy or autonomy.
It produces evidence.
Executive Intelligence interprets the evidence.

### 6.52 Atlas Boundary

Atlas is the user-facing interface across Omnira.
Atlas may communicate across portfolio and project contexts.
However, Atlas should always know:
Which scope the user is discussing.
Which project is active.
Whether a statement is global or local.
Which authority is being requested.
Which data may be surfaced.
Which Executive layer should answer.
Atlas should not blend responses across projects without making the scope explicit.

### 6.53 Scope Switching

When the user switches project context, Atlas should make the transition clear.
Examples:
“Switching to The Prompt.”
“Now viewing Familje-Stunden.”
“This recommendation is portfolio-level.”
“This action affects only GainPilot.”
Scope switching should update:
Data access.
Memory retrieval.
Knowledge retrieval.
Project policies.
Approval context.
Autonomy context.
Tool availability.
Output destination.
UI navigation alone should not be the only source of project scope.

### 6.54 Mixed-Scope Conversations

A conversation may involve several projects.
For example:
“Compare The Prompt and Familje-Stunden.”
In that case, Atlas and Portfolio Executive may use governed summaries.
The system should not silently open unrestricted project contexts.
Mixed-scope reasoning should identify:
Projects included.
Data level used.
Comparison purpose.
Authority.
Sensitive exclusions.
Result scope.
The comparison itself should remain a portfolio operation.

### 6.55 Scope Confirmation for High-Impact Actions

High-impact actions should require explicit project confirmation.
Examples:
Publishing.
Spending.
Customer replies.
Refunds.
Strategy changes.
Lifecycle changes.
Autonomy changes.
Data deletion.
External integration.
The system should confirm:
Project.
Action.
Target.
Authority.
Approval.
Expected effect.
A wrong-scope high-impact action can create serious damage.

### 6.56 Event Isolation

Events should carry project scope.
Examples:
Workflow started.
Content published.
Approval granted.
Payment received.
Customer complaint received.
Autonomy changed.
Policy violation detected.
Mission completed.
Event consumers should process only authorized project events.
A project event should not trigger another project’s workflow unless an explicit cross-project rule exists.

### 6.57 Notification Isolation

Notifications should preserve project context.
A notification should identify:
Project.
Severity.
Required action.
Source.
Deadline.
Approval requirement.
The founder may receive a global notification feed.
Project agents should not receive notifications from unrelated projects.
Notification aggregation must not erase scope.

### 6.58 Logging and Audit

Every cross-boundary action should be auditable.
Audit logs should capture:
Actor.
Project.
Resource.
Action.
Authority.
Purpose.
Timestamp.
Result.
Approval.
Trace identifier.
Policy decision.
External side effect.
Auditability must apply to both successful and denied actions.
Denied cross-project access attempts are important security signals.

### 6.59 Denial Logging

When an action is denied because of project scope, Omnira should record:
Requested action.
Originating project.
Requested resource.
Denial reason.
Policy involved.
Actor.
Severity.
Whether escalation occurred.
Repeated denial patterns may reveal:
Misconfigured workflows.
Prompt ambiguity.
Agent drift.
Malicious behavior.
Incorrect project routing.
Broken authorization.
Denials are not noise.
They are governance evidence.

### 6.60 Observability

Project isolation requires operational visibility.
Observability should answer:
Which project generated this event?
Which project consumed this data?
Which tool was called?
Which authority allowed it?
Which project paid for it?
Which output resulted?
Which approval applied?
Did any boundary check fail?
Without observability, project isolation cannot be trusted.
It can only be assumed.

### 6.61 Isolation Health

Each project should have an isolation health status.
Isolation health may evaluate:
Scoped data access.
Scoped Memory retrieval.
Scoped Knowledge retrieval.
Scoped workflow execution.
Scoped tool use.
Scoped cost attribution.
Scoped approvals.
Scoped autonomy.
Scoped publishing.
Boundary violation history.
Isolation health should be visible to Project Executive and Portfolio Executive.
Poor isolation health should block autonomy expansion.

### 6.62 Boundary Violation Classification

Boundary violations should be classified by severity.
P0 — Critical
Examples:
Customer data exposed across projects.
Unauthorized external action using another project’s credentials.
Cross-tenant data leakage.
Unauthorized financial action.
Restricted credential exposure.
P1 — Serious
Examples:
Wrong project content published.
Wrong project Memory used in a decision.
Wrong project support policy applied.
Incorrect project approval reused.
P2 — Moderate
Examples:
Incorrect project summary shown internally.
Cost attributed to wrong project.
Non-sensitive workflow routed incorrectly before external action.
P3 — Minor
Examples:
Labeling or display issue with no data or authority impact.
Severity should reflect actual potential damage.

### 6.63 Response to Boundary Violations

When a boundary violation occurs, Omnira should:
Contain the action.
Stop external side effects if possible.
Preserve evidence.
Identify affected projects.
Notify the appropriate Executive layer.
Evaluate customer impact.
Reduce or suspend autonomy.
Create an incident record.
Determine whether Crisis Mode is required.
Prepare recovery.
Conduct a post-mortem.
The response should match severity.
A cosmetic label error should not trigger a full portfolio shutdown.
A customer data leak may require immediate portfolio-level Crisis Mode.

### 6.64 Local vs Portfolio Crisis

A project boundary incident may remain local when:
Only one project is affected.
Shared infrastructure remains trustworthy.
No other project data was exposed.
The issue is contained.
The authorization system remains reliable.
A portfolio crisis may be required when:
Shared authorization fails.
Project isolation cannot be trusted.
Several projects are affected.
Cross-tenant leakage occurs.
Shared credentials are compromised.
Audit integrity is uncertain.
The scope of the crisis must match the scope of the failure.

### 6.65 Recovery from Isolation Failure

Recovery should include:
Containment.
Access revocation.
Credential rotation if required.
Data impact assessment.
Correction of misrouted outputs.
Customer communication if required.
Workflow fixes.
Policy updates.
Autonomy reduction.
Isolation tests.
Review of similar workflows.
Decision Ledger update.
Post-mortem.
The system should not return to normal merely because the immediate symptom disappeared.
Isolation trust must be re-established.

### 6.66 Boundary-Aware Rollback

Rollback should preserve project scope.
A rollback should identify:
Project.
Affected action.
Affected data.
Affected external systems.
Previous valid state.
Authority.
Audit trail.
Cross-project impact.
A project rollback should not accidentally reverse valid actions in another project.
Shared infrastructure rollback requires portfolio-level coordination.

### 6.67 Data Deletion Boundaries

Permanent deletion requires strong project validation.
Before deletion, Omnira should verify:
Correct project.
Correct resource.
Authority.
Retention policy.
Customer impact.
Legal requirement.
Dependency impact.
Backup or recovery path.
Approval.
Reversible actions should be preferred:
Archive.
Unpublish.
Disable.
Mark stale.
Revoke access.
Deactivate.
Deletion must not become the default cleanup action.

### 6.68 Export Boundaries

Data export is a high-risk boundary action.
Exports should define:
Project.
Data categories.
Recipient.
Purpose.
Format.
Retention.
Approval.
Audit.
Security method.
A project export must not include data from another project.
Portfolio reports should use governed aggregation rather than raw combined exports whenever possible.

### 6.69 Search Boundaries

Search systems can create accidental leakage.
Project search should default to project scope.
Global search should require:
Portfolio authority.
Clear user intent.
Data classification awareness.
Result filtering.
Project labels.
Access checks.
Search results should always identify project origin.
A user should not need to guess which project a result belongs to.

### 6.70 Retrieval Boundaries

Retrieval systems should enforce:
Project scope.
Resource type.
Data classification.
Actor authority.
Purpose.
Maximum result scope.
Logging.
A relevant result from the wrong project is still unauthorized.
Semantic similarity must never override access control.

### 6.71 Vector and Embedding Isolation

Semantic retrieval systems may use shared infrastructure.
Project content should remain logically isolated.
Possible approaches may include:
Project namespaces.
Project metadata filters.
Separate indexes.
Tenant-specific partitions.
Authorization-aware retrieval.
The implementation may vary.
The architectural requirement does not:
A retrieval result must be authorized before it is considered relevant.

### 6.72 Cache Isolation

Caches may create hidden leakage.
Cached data should preserve:
Project scope.
User scope.
Authority.
Expiration.
Data classification.
A cached response created for one project should not be returned in another project context.
Performance optimization must not weaken isolation.

### 6.73 Prompt Context Isolation

Prompt construction must remain project-aware.
A prompt should include only the context required for the current operation.
It should not automatically include:
All project Memory.
All portfolio decisions.
All customer data.
All founder preferences.
All past conversations.
All tool results.
Context minimization improves:
Safety.
Accuracy.
Cost.
Auditability.
Project identity.
More context is not always better context.

### 6.74 Model Session Isolation

Model sessions should not silently carry context across projects.
When project scope changes, Omnira should ensure that:
Project-specific context is cleared or replaced.
Tools are re-scoped.
Memory retrieval is re-scoped.
Policies are reloaded.
Autonomy state is updated.
Output destination is updated.
Conversational continuity must not become authorization continuity.

### 6.75 Human User Isolation

Future multi-user and customer environments require user-aware boundaries.
The system should distinguish:
Project owner.
Project member.
Portfolio owner.
Customer user.
External collaborator.
Viewer.
Approver.
Administrator.
User access and project access should be evaluated together.
Being a valid Omnira user does not imply access to every project.

### 6.76 Role-Based Boundaries

Roles should define organizational responsibility.
Examples:
Portfolio Owner.
Project Owner.
Project Executive Viewer.
Approver.
Operator.
Analyst.
Support Role.
External Collaborator.
Role-based access should be combined with project scope.
A support role in Familje-Stunden should not become a support role in every project.

### 6.77 Attribute-Based Boundaries

Some permissions require more than role.
Attributes may include:
Project.
Data sensitivity.
Action risk.
Autonomy level.
Operating mode.
Crisis status.
Approval state.
Time period.
External destination.
For example:
An Editor may publish only:
For The Prompt,
to an approved channel,
within an active autonomy license,
for a low-risk content category,
outside Crisis Mode.
This creates more precise control than role alone.

### 6.78 Policy Evaluation Boundaries

Policy checks should evaluate:
Actor.
Project.
Action.
Resource.
Data sensitivity.
Risk.
Authority.
Approval.
Autonomy license.
Operating mode.
External side effect.
Policy should be evaluated before action.
Policy should not be added only after something goes wrong.

### 6.79 Global Rules and Local Rules

Omnira should support both global and project-specific policy.
Global Rules
Apply across every project.
Examples:
No unauthorized spending.
No cross-project customer data leakage.
No self-granted autonomy.
No silent constitutional change.
No unlogged high-impact external action.
Project Rules
Add local restrictions.
Examples:
Familje-Stunden requires approval for child-related communication.
The Prompt requires source verification before publication.
GainPilot requires safety review for training changes.
Local rules may become stricter.
They may not silently weaken global rules.

### 6.80 Policy Conflict Resolution

When rules conflict, the stricter valid rule should generally apply.
Conflict resolution should consider:
Constitutional authority.
Global governance.
Portfolio policy.
Project policy.
Workflow license.
Human approval.
A lower layer cannot override a higher-level prohibition without explicit authority.
Policy conflicts should be visible and logged.

### 6.81 Shared Service Boundaries

Shared services should expose project-aware contracts.
A shared service should receive:
Project scope.
Requested operation.
Authority.
Data classification.
Return scope.
Cost attribution.
It should return:
Project-scoped result.
Audit metadata.
Cost metadata.
Policy result.
Error or denial reason.
Shared services must not assume the caller already enforced isolation.
Defense in depth is required.

### 6.82 Defense in Depth

Isolation should be enforced at several layers.
Possible enforcement points include:
User authorization.
Project context.
Executive policy.
Manager routing.
Workflow configuration.
Data access.
Memory retrieval.
Tool permissions.
External API scope.
Audit monitoring.
No single check should be trusted as the only defense.
If one layer fails, another should still reduce risk.

### 6.83 Project Context Integrity

Project context should be immutable within a single operation.
A task should not begin under one project and finish under another.
If project context changes, a new operation should be created.
Context mutation during execution creates audit and authorization ambiguity.
The system must be able to trace one operation to one project scope.

### 6.84 Project Context Propagation

Project context should propagate through:
Executive recommendation.
Mission.
Manager work package.
Workflow run.
Task.
Agent call.
Tool call.
Output.
Performance event.
Cost event.
Memory write.
Decision Ledger entry.
Any broken link creates attribution risk.
Scope propagation is as important as initial scope assignment.

### 6.85 Context Validation at Handoffs

Every handoff should validate project context.
Examples:
Executive to Manager.
Manager to Workforce.
Workforce to Agent.
Agent to Tool.
Tool result to Workflow.
Workflow output to Approval.
Approval to Publishing.
Publishing to Performance.
Handoffs are common places for scope loss.
Each handoff should preserve or narrow scope.

### 6.86 Cross-Project Aggregation

Portfolio aggregation should occur only through authorized models.
Aggregation may include:
Revenue totals.
Cost totals.
Risk counts.
Project health.
Autonomy maturity.
Approval burden.
Workforce allocation.
Infrastructure usage.
Aggregation should avoid exposing unnecessary raw data.
A portfolio total should not become a backdoor to project details.

### 6.87 Aggregation Integrity

Portfolio metrics should preserve:
Source project.
Metric definition.
Time period.
Currency or unit.
Confidence.
Data freshness.
Aggregation method.
Misleading aggregation can create bad executive decisions even without security leakage.
Isolation includes semantic integrity.

### 6.88 Future Customer Project Boundaries

Future customer projects require tenant-grade isolation.
Customer boundaries may require:
Separate ownership.
Separate users.
Separate Memory.
Separate Knowledge.
Separate Workforce context.
Separate approvals.
Separate credentials.
Separate billing.
Separate autonomy licenses.
Separate audit access.
Separate retention policy.
Internal Portfolio Executive access should not be assumed.
Customer contracts and permissions must define what Omnira may see.

### 6.89 Internal vs External Portfolio Visibility

For internal projects owned by the founder, Portfolio Executive may receive broad governed visibility.
For external customer projects, Portfolio Executive may receive only:
Operational health.
Service usage.
Billing status.
Risk alerts.
Contract-authorized performance summaries.
Escalations.
Customer business strategy, customer data, and detailed Memory may remain private.
Architecture must support both ownership models.

### 6.90 Customer-Controlled Boundaries

Future customers should be able to control:
Who accesses the project.
Which integrations are connected.
Which data enters Memory.
Which actions require approval.
Which workflows are autonomous.
Which portfolio summaries are shared.
How long data is retained.
How exports and deletion work.
Isolation should be visible and understandable.
Customers should not need to trust invisible promises.

### 6.91 Isolation Transparency

The founder or customer should be able to inspect:
Who has access.
Which agents are assigned.
Which tools are connected.
Which data sources are active.
Which autonomy licenses exist.
Which external channels are authorized.
Which cross-project grants are active.
Which boundary violations occurred.
Transparency creates trust and makes governance actionable.

### 6.92 Isolation Testing

Isolation must be tested deliberately.
Tests should verify:
Project A cannot read Project B data.
Project A cannot retrieve Project B Memory.
Project A cannot use Project B credentials.
Project A cannot publish to Project B channels.
Project A cannot reuse Project B approvals.
Project A cannot inherit Project B autonomy.
Project A costs are attributed correctly.
Portfolio summaries exclude restricted data.
Founder-private details do not reach Workforce.
Isolation tests should include both expected and malicious paths.

### 6.93 Negative Testing

Negative tests should attempt:
Missing project scope.
Forged project scope.
Wrong project identifier.
Cross-project retrieval.
Cross-project mutation.
Cross-project tool use.
Expired access grant.
Reused approval.
Escalated authority.
Mixed-project batch operation.
A system is not safely isolated merely because the happy path works.

### 6.94 Adversarial Testing

Omnira should eventually test whether agents or prompts can be manipulated into crossing boundaries.
Examples:
A document instructs the agent to access another project.
A user asks Atlas to ignore project restrictions.
A tool result contains malicious instructions.
An agent claims global authority.
A workflow attempts to reuse broader credentials.
Project scope and policy must remain authoritative.
Untrusted content must not redefine access.

### 6.95 Migration Safety

Schema changes, infrastructure changes, and migrations can weaken isolation.
Before migration, Omnira should evaluate:
Project ownership fields.
Authorization rules.
Data backfill.
Default values.
Existing rows without project scope.
Shared credentials.
Cross-project queries.
Rollback.
Auditability.
A migration that introduces null or ambiguous project ownership can create systemic risk.

### 6.96 Legacy Data

Legacy data without reliable project scope should be treated as untrusted.
It should not be automatically assigned based only on naming or assumptions.
Legacy classification may require:
Deterministic mapping.
Manual review.
Quarantine.
Read-only handling.
Audit record.
Explicit confidence.
Unknown ownership should remain unknown until resolved.

### 6.97 Quarantine

Ambiguous or suspicious data should be quarantined.
Quarantine means:
Not available to normal project workflows.
Not included in Executive reasoning.
Not used for autonomous actions.
Visible for authorized review.
Audited.
Resolved before release.
Quarantine is better than guessing.

### 6.98 Isolation and Backup

Backups should preserve project boundaries.
Recovery processes should be able to restore:
One project.
One tenant.
One project dataset.
One workflow state.
One Memory scope.
A project recovery should not require exposing or restoring unrelated projects unnecessarily.

### 6.99 Isolation and Deletion Requests

Future customer or user deletion requests must respect project and tenant scope.
The system should identify:
Requesting party.
Project.
Data categories.
Legal retention requirements.
Shared records.
Memory references.
Backups.
Audit records.
Deletion authority.
Deletion should not remove shared records incorrectly.
It should not leave unauthorized project copies.

### 6.100 Isolation and Shared Learning

Shared learning should use abstraction rather than raw copying.
A safe shared lesson might be:
“Newsletter workflows benefit from batch approval before autonomous sending.”
An unsafe shared transfer might include:
Customer-specific email content.
Private project strategy.
Unpublished financial details.
Sensitive support history.
Omnira should learn across projects without turning every project into one dataset.

### 6.101 Isolation and Executive Reasoning

Executive reasoning must distinguish between:
Project evidence.
Portfolio evidence.
Shared principle.
Founder preference.
Global policy.
Cross-project inference.
A conclusion drawn from one project should not automatically become a rule for another.
The Project Executive should ask:
Is this evidence local?
Is the pattern generalizable?
Does the other project have the same risk profile?
Does the same policy apply?
What evidence is missing?

### 6.102 Cross-Project Inference Risk

Cross-project comparison can produce misleading conclusions.
Examples:
The Prompt’s successful content cadence may not fit Familje-Stunden.
Familje-Stunden’s support policy may not fit The Prompt.
GainPilot’s retention model may not fit subscription education products.
One project’s Trust Score threshold may not fit another project’s Damage Boundary.
Portfolio learning requires interpretation, not copying.

### 6.103 Project Boundary Changes

Project boundaries may change through:
Project merger.
Project split.
Ownership change.
Customer transfer.
Product spin-off.
Archival.
Shared service extraction.
Boundary changes should be treated as major executive and governance events.
They should require:
Data mapping.
Permission review.
Memory review.
Knowledge review.
Credential review.
Cost attribution review.
Approval.
Audit.
Rollback plan.

### 6.104 Project Merge

Merging projects should not mean blindly combining all data and authority.
A merge should evaluate:
Customer consent.
Data compatibility.
Policy conflicts.
Brand conflicts.
Memory conflicts.
Financial attribution.
Autonomy licenses.
Tool permissions.
Decision histories.
Some boundaries may need to remain even after organizational merger.

### 6.105 Project Split

A project split should define:
Which data belongs where.
Which customers transfer.
Which Memory is copied or abstracted.
Which workflows move.
Which credentials change.
Which approvals remain valid.
Which autonomy licenses expire.
Which costs and revenue move.
Autonomy should generally be re-evaluated after a split.
New boundaries create new risk.

### 6.106 Ownership Change

A change in project ownership should trigger:
Access review.
Role review.
Credential rotation.
Portfolio visibility review.
Memory privacy review.
Approval authority review.
Autonomy review.
Audit handover.
Ownership determines executive authority.
It cannot be treated as a cosmetic field.

### 6.107 Isolation and Crisis Mode

During Crisis Mode, isolation should become stricter, not weaker.
Possible crisis restrictions include:
Suspend cross-project grants.
Require approval for external actions.
Disable shared credentials.
Freeze autonomy escalation.
Increase logging.
Block exports.
Limit Memory promotion.
Restrict tools.
Urgency should not become an excuse to remove boundaries.

### 6.108 Isolation and Full Autonomy

Full autonomy does not remove project boundaries.
A fully autonomous project must still operate inside:
Project identity.
Project policy.
Autonomy licenses.
Budget mandates.
Customer rules.
Tool permissions.
Data boundaries.
Audit requirements.
Human override.
Emergency brake.
Autonomy describes how much action may occur without repeated approval.
It does not describe freedom from scope.

### 6.109 Isolation and the Omnira Constitution

The future Omnira Constitution should define non-negotiable boundary principles.
These may include:
Projects do not access one another by default.
Customer data remains tenant-scoped.
Autonomy never grants cross-project authority.
Founder-private data is minimized.
High-impact cross-project access is auditable.
Human authority can revoke access.
Project isolation failures trigger mandatory response.
Executive Intelligence must operate beneath these constitutional rules.

### 6.110 The Boundary Decision Test

Before any cross-boundary action, Omnira should ask:
Why is this access needed?
Is the purpose legitimate?
Is the requested scope minimal?
Can a summary replace raw access?
Can the task be completed through a shared service?
Is human approval required?
How long should access last?
What will be logged?
How will access be revoked?
What is the Damage Boundary?
If these questions cannot be answered, access should not be granted.

### 6.111 The Project Scope Test

Before every project action, Omnira should ask:
Is the project explicit?
Is the actor authorized?
Is the data project-scoped?
Is the workflow project-scoped?
Are the tools project-scoped?
Is the approval valid for this project?
Is the autonomy license valid for this action?
Will cost and performance be attributed correctly?
Is the output going to the correct destination?
This test should become a repeated implementation principle.

### 6.112 The Summary Sufficiency Test

Before Portfolio Executive receives raw project data, Omnira should ask:
Can an aggregated signal answer the question?
Can a governed summary answer the question?
Can the Project Executive provide a recommendation?
Is raw access actually required?
Would raw access expose customers or strategy unnecessarily?
The preferred answer is the least invasive form that still supports leadership.

### 6.113 The Authority Test

Before action, Omnira should distinguish:
Can the system see this?
Can the system understand this?
Can the system recommend something?
Can the system prepare something?
Can the system execute internally?
Can the system act externally?
Can the system spend?
Can the system change policy?
These are different authorities.
They must not be treated as one permission.

### 6.114 Failure Modes

The project isolation architecture must prevent several failure modes.
Failure Mode 1 — Convention-Based Isolation
The system relies on developers or agents remembering to filter by project.
Failure Mode 2 — UI-Only Isolation
Pages appear project-scoped while backend data access remains global.
Failure Mode 3 — Shared Memory Leakage
Project agents retrieve unrelated project memories.
Failure Mode 4 — Shared Credential Leakage
One project uses another project’s external credentials.
Failure Mode 5 — Approval Leakage
An approval from one project is reused elsewhere.
Failure Mode 6 — Autonomy Leakage
A successful workflow grants implied authority to another workflow or project.
Failure Mode 7 — Brand Leakage
The wrong project identity, tone, or promise appears in another project.
Failure Mode 8 — Cost Leakage
Costs are attributed to the wrong project or hidden as shared cost.
Failure Mode 9 — Metric Leakage
A metric is interpreted using another project’s definition.
Failure Mode 10 — Founder Privacy Leakage
Private calendar or personal details flow into Workforce or project agents.
Failure Mode 11 — Portfolio Overreach
Portfolio Executive accesses unnecessary raw project data.
Failure Mode 12 — Cross-Tenant Leakage
Future customer projects expose data to internal or other customer projects.
Failure Mode 13 — Context Drift
A long-running operation silently changes project scope.
Failure Mode 14 — Cache Leakage
Cached project data is served in another project context.
Failure Mode 15 — Search Leakage
Global search exposes unauthorized project information.
Failure Mode 16 — Emergency Overreach
Crisis handling bypasses boundaries without logging or expiration.
These failure modes must be treated as architectural threats.

### 6.115 Design Requirements

Any implementation of Executive Intelligence must preserve these requirements:
Every project must have a stable identifier.
Every executive object must have explicit scope.
Every mission must identify its project.
Every workflow instance must be project-scoped.
Every agent assignment must be project-scoped.
Every tool call must carry project authority.
Every external action must verify project destination.
Every Memory write and retrieval must be scoped.
Every Knowledge retrieval must be authorized.
Every cost must be attributed.
Every performance event must identify project origin.
Every approval must identify exact scope.
Every autonomy license must remain project- and workflow-specific.
Every cross-project access must be explicit.
Every temporary grant must expire.
Every boundary violation must be logged.
Every high-impact violation must escalate.
Every future customer project must support tenant-grade isolation.
Every Portfolio summary must minimize sensitive data.
Every Founder-private detail must remain restricted.
Every project boundary must survive UI, workflow, model, and infrastructure changes.
These requirements are not optional implementation details.
They define whether Executive Intelligence can safely exist.

### 6.116 Implementation Neutrality

This chapter defines architecture, not a specific technical stack.
Project isolation may later be implemented through:
Project contexts.
Tenant identifiers.
Authorization policies.
Row-level security.
Scoped service interfaces.
Project namespaces.
Separate indexes.
Credential vaults.
Policy engines.
Audit logs.
Approval objects.
Autonomy license objects.
Event envelopes.
Project-specific queues.
Access grants.
Data classification.
Observability systems.
The technical mechanisms may evolve.
The isolation contract must not.

### 6.117 The Project Isolation Contract

Omnira must guarantee:
A project knows what it owns.
A project knows what it may access.
A project knows what it may do.
A project cannot silently inherit another project’s authority.
A project cannot accidentally publish through another project.
A project cannot reuse another project’s approval.
A project cannot inherit another project’s autonomy.
A project cannot retrieve unrelated Memory.
A project cannot expose customer data across boundaries.
A project cannot hide its costs inside another project.
Portfolio leadership can see enough to lead without seeing everything.
Shared infrastructure can serve many projects without blending them.
Atlas can communicate across scopes without confusing them.
Founder-private context can support planning without spreading downward.
Future customer projects can remain truly isolated.
If these guarantees are not true, Omnira is not ready for broad autonomy.

### 6.118 Closing Principle

Project isolation is not a database filter.
It is not a route.
It is not a naming convention.
It is not a prompt instruction.
It is not an optional security enhancement.
Project isolation is the organizational boundary that allows Omnira to lead several intelligent businesses without blending their customers, strategies, memories, permissions, costs, risks, or identities.
The Portfolio Executive may see the organization.
The Project Executive may lead the project.
Manager may coordinate the mission.
Workforce may perform the task.
But every layer must know where one project ends and another begins.
Without that boundary, autonomy becomes unsafe.
With that boundary, Omnira can scale from internal projects to a governed portfolio of future customer organizations.
Atlas may see the whole.
Every project must remain its own.
