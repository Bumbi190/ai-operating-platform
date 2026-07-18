# Chapter 10 — Decision Intelligence

## Metadata

- chapter_number: 10
- canonical_title: Chapter 10 — Decision Intelligence
- canonical_status: Approved and locked — Canonical v1.0
- canonical_source_file: Chapter 10 — Decision Intelligence — Canonical v1.0.docx
- canonical_source_file_sha256: 445ea74f01243e1e6f7342bacaf55fdb75cebe478e3b98eba274664e07230471
- canonical_book_sha256: ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8
- professional_edition_page_range: p.348–394
- navigational_part (NON-CANONICAL RETRIEVAL AID): Part IV — DECISIONS, PLANNING & PRIORITIZATION
- section_count: 133
- section_id_range: 10.1–10.133 (133 sections)
- section_ids: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.16, 10.17, 10.18, 10.19, 10.20, 10.21, 10.22, 10.23, 10.24, 10.25, 10.26, 10.27, 10.28, 10.29, 10.30, 10.31, 10.32, 10.33, 10.34, 10.35, 10.36, 10.37, 10.38, 10.39, 10.40, 10.41, 10.42, 10.43, 10.44, 10.45, 10.46, 10.47, 10.48, 10.49, 10.50, 10.51, 10.52, 10.53, 10.54, 10.55, 10.56, 10.57, 10.58, 10.59, 10.60, 10.61, 10.62, 10.63, 10.64, 10.65, 10.66, 10.67, 10.68, 10.69, 10.70, 10.71, 10.72, 10.73, 10.74, 10.75, 10.76, 10.77, 10.78, 10.79, 10.80, 10.81, 10.82, 10.83, 10.84, 10.85, 10.86, 10.87, 10.88, 10.89, 10.90, 10.91, 10.92, 10.93, 10.94, 10.95, 10.96, 10.97, 10.98, 10.99, 10.100, 10.101, 10.102, 10.103, 10.104, 10.105, 10.106, 10.107, 10.108, 10.109, 10.110, 10.111, 10.112, 10.113, 10.114, 10.115, 10.116, 10.117, 10.118, 10.119, 10.120, 10.121, 10.122, 10.123, 10.124, 10.125, 10.126, 10.127, 10.128, 10.129, 10.130, 10.131, 10.132, 10.133
- implementation_status: unknown_not_verified_in_this_package

Hash schema: `canonical_book_sha256` = the compiled canonical book; `canonical_source_file_sha256` = this chapter's separate canonical source file. Metadata is descriptive provenance; the text below the separator is exact canonical text (whitespace normalized only; no rewriting, no summaries).

---

## Canonical Text

### 10.1 Purpose of This Chapter

Executive Intelligence exists to turn organizational context into direction.
That requires a disciplined decision system.
Omnira must be able to move from:
Signal
→ Interpretation
→ Recommendation
→ Decision
→ Delegation
→ Outcome
→ Learning
without collapsing uncertainty, evidence, policy, authority, and execution into one opaque answer.
This chapter defines Decision Intelligence: the architecture through which Executive Intelligence evaluates options, forms recommendations, determines whether action is permitted, escalates uncertainty, records material decisions, and learns from outcomes.
Decision Intelligence must help Omnira answer:
What decision is actually being made?
Why does it matter now?
What evidence supports the recommendation?
Which assumptions are being made?
How confident is the system?
What risks exist?
What alternatives were considered?
What is the opportunity cost?
Who has authority to decide?
What would change the recommendation?
When should the decision be reviewed?
The goal is not to make every decision automatically.
The goal is to make every important decision clearer, more accountable, and easier to improve.

### 10.2 The Core Thesis

Decision Intelligence is not the ability to produce confident answers.
It is the ability to produce governed judgment.
A strong decision contains:
A clearly defined question.
Relevant evidence.
Explicit assumptions.
Alternative options.
Risk analysis.
Opportunity cost.
Confidence.
Authority.
Decision conditions.
Review conditions.
The foundational principle is:
Executive Intelligence must never confuse confidence of expression with confidence of evidence.
A recommendation may be clear while uncertainty remains high.
A decision may be urgent while evidence remains incomplete.
A powerful Executive system must be able to distinguish both.

### 10.3 Recommendation vs Decision

A recommendation and a decision are not the same thing.
Recommendation
A proposed course of action supported by reasoning.
Decision
An authorized commitment to a course of action.
Executive Intelligence may recommend more broadly than it may decide.
Example:
Recommendation:
Move The Prompt short-news workflow from L2 to L4 autonomy.
Decision:
Autonomy remains L2 until 30 successful runs are completed.
The recommendation belongs to reasoning.
The decision belongs to authority.
The architecture must preserve this distinction.

### 10.4 Decision Authority

Every decision must identify who or what has authority.
Possible authorities include:
Founder.
Portfolio Executive under mandate.
Project Executive under mandate.
Governance policy.
Autonomy license.
Budget mandate.
Crisis authority.
Delegated human approver.
A correct recommendation made by an unauthorized actor is not an authorized decision.
Technical capability must never be mistaken for authority.

### 10.5 Decision Classes

Decisions should be classified by scope.
Portfolio Decisions
Affect several projects or organizational direction.
Project Decisions
Affect one project.
Mission Decisions
Affect an Executive Mission.
Workflow Decisions
Affect one workflow or automation.
Operational Decisions
Affect task coordination or execution detail.
Policy Decisions
Affect governance, authority, or allowed behavior.
Crisis Decisions
Affect containment, safety, or recovery.
The classification determines authority, depth, review, and recording requirements.

### 10.6 Decision Impact

Decisions should also be classified by impact.
Low Impact
Reversible, internal, limited consequence.
Moderate Impact
Meaningful operational or project effect.
High Impact
Material financial, strategic, customer, brand, or autonomy effect.
Critical Impact
Potential security, safety, legal, customer, or systemic damage.
Higher impact requires deeper reasoning and stronger governance.

### 10.7 Decision Reversibility

Reversibility should influence decision depth.
Easily Reversible
Can be undone quickly with little cost.
Partially Reversible
Can be changed, but with delay, cost, or side effects.
Difficult to Reverse
Creates significant lock-in, external commitments, or strategic cost.
Irreversible
Cannot meaningfully be undone.
Low-risk reversible decisions may tolerate lower confidence.
High-impact irreversible decisions require greater evidence, review, and approval.

### 10.8 Decision Urgency

Urgency should be classified separately from impact.
A decision may be:
Critical now.
Required today.
Required this week.
Required this month.
Condition-based.
Not time-sensitive.
Urgency should be justified.
The system must not use urgency language merely to force attention.

### 10.9 The Decision Object

A material decision should eventually exist as a structured object.
Conceptually, it may contain:
Decision identifier.
Title.
Question.
Scope.
Project.
Decision class.
Impact level.
Urgency.
Authority.
Recommendation.
Alternatives.
Evidence.
Assumptions.
Confidence.
Risks.
Opportunity cost.
Expected impact.
Approval status.
Final decision.
Decision rationale.
Review date.
Reversal conditions.
Outcome references.
Version.
The exact implementation may evolve.
The decision contract should remain stable.

### 10.10 The Decision Question

Every decision should begin with a clearly framed question.
Weak:
What should we do with The Prompt?
Strong:
Should The Prompt short-news workflow receive L4 autonomy for approved low-risk categories during a 14-day trial?
A good decision question defines:
Scope.
Action.
Time horizon.
Affected system.
Authority requirement.
Decision boundary.
Poorly framed questions produce vague answers.

### 10.11 Decision Framing

Executive Intelligence should frame the decision before analyzing it.
Decision framing should identify:
Current state.
Desired outcome.
Problem or opportunity.
Constraints.
Deadline.
Stakeholders.
Authority.
Relevant prior decisions.
Framing prevents the system from solving the wrong problem.

### 10.12 Decision Context

Decision context should include only information relevant to the decision.
More context is not always better.
Relevant context may include:
Project mode.
Portfolio priority.
Founder capacity.
Performance data.
Risk profile.
Current policy.
Active autonomy license.
Previous decision.
Open dependencies.
Available resources.
Unrelated context should be excluded.

### 10.13 Evidence

Evidence is verified information used to support reasoning.
Evidence may include:
Performance measurements.
Revenue data.
Cost data.
Workflow results.
Approval history.
Customer feedback.
Manager reports.
Project Executive reports.
Decision Ledger entries.
Memory records.
Market information.
Policy state.
Capacity information.
Evidence should be attributable.

### 10.14 Evidence Quality

Evidence quality should be evaluated through:
Source reliability.
Freshness.
Completeness.
Consistency.
Sample size.
Measurement quality.
Relevance.
Independence.
A large amount of weak evidence does not automatically become strong evidence.

### 10.15 Evidence Freshness

Evidence should be classified as:
Current.
Recent.
Historical.
Delayed.
Incomplete.
Estimated.
Unverified.
Stale.
Evidence freshness should influence confidence.
A daily operational decision may require current data.
A long-term strategic decision may rely on broader historical patterns.

### 10.16 Evidence Hierarchy

A conceptual evidence hierarchy may be:
Verified current system data.
Verified human-approved records.
Repeated measured outcomes.
Direct customer evidence.
Reliable external primary evidence.
Historical organizational Memory.
Manager and Workforce reports.
Forecasts.
Hypotheses.
Unverified assumptions.
The hierarchy may vary by decision type.
Policy and authority may override performance evidence.

### 10.17 Evidence Conflict

When evidence conflicts, Executive Intelligence should show:
Which sources disagree.
Why they may disagree.
Which source is more reliable.
What remains uncertain.
Whether the decision should wait.
What verification is needed.
Conflicting evidence should reduce confidence.
It should not be hidden to preserve a clean recommendation.

### 10.18 Missing Evidence

Executive Intelligence should identify missing evidence.
Example:
Missing:
Reliable conversion data from The Prompt website.
Impact:
A Growth operating mode recommendation remains premature.
Recommended action:
Continue measurement before changing strategy.
The system should not invent certainty to fill evidence gaps.

### 10.19 Evidence Sufficiency

Evidence is sufficient when it supports the required decision depth.
The standard should depend on:
Impact.
Reversibility.
Urgency.
Risk.
Cost.
Authority.
Trial scope.
A reversible two-week experiment may proceed with limited evidence.
A permanent strategy change requires more.

### 10.20 Assumptions

Assumptions are claims accepted temporarily without complete evidence.
Material assumptions should be explicit.
Example:
Assumption:
Founder capacity will remain limited this week.
Assumption:
The Prompt remains the highest-leverage autonomy proving ground.
Assumption:
Source reliability will remain stable during the trial.
Hidden assumptions create hidden risk.

### 10.21 Assumption Types

Assumptions may include:
Market assumptions.
Customer assumptions.
Performance assumptions.
Capacity assumptions.
Technical assumptions.
Cost assumptions.
Policy assumptions.
Timing assumptions.
Behavior assumptions.
Each type may fail differently.

### 10.22 Assumption Confidence

Assumptions should have confidence when material.
Example:
Assumption:
Approval rate will remain above 90%.
Confidence:
Medium.
Reason:
Current sample size is limited.
Low-confidence assumptions may justify smaller experiments or stronger controls.

### 10.23 Assumption Validation

Important assumptions should have validation paths.
Example:
Assumption:
Short news posts create meaningful website engagement.
Validation:
Compare reading time, return visits, newsletter signup, and search traffic over four weeks.
An assumption without a validation path may remain speculation indefinitely.

### 10.24 Confidence

Confidence expresses how strongly the evidence supports the recommendation.
Suggested levels:
High.
Medium.
Low.
Confidence should consider:
Evidence quality.
Evidence consistency.
Data freshness.
Sample size.
Assumption burden.
Historical accuracy.
Risk.
Reversibility.

### 10.25 Confidence Is Not Probability

A confidence label is not necessarily a precise statistical probability.
It communicates executive certainty.
Example:
High confidence:
Evidence is strong, recent, consistent, and directly relevant.
Medium confidence:
Recommendation is credible but depends on material assumptions.
Low confidence:
Evidence is limited, conflicting, stale, or highly uncertain.
The system should not imply false mathematical precision.

### 10.26 Recommendation Strength

Recommendation strength may differ from confidence.
A low-confidence recommendation may still be strong when the downside of waiting is high.
Example:
Confidence:
Low.
Recommendation:
Pause publication immediately.
Reason:
Potential customer harm is severe.
Risk can justify decisive action despite uncertainty.

### 10.27 Risk

Every material recommendation should consider risk.
Risk analysis should identify:
What can go wrong?
How likely is it?
How serious would the impact be?
How quickly would damage appear?
Can the action be reversed?
What controls exist?
What signals indicate failure?

### 10.28 Risk Categories

Risk categories may include:
Strategic.
Financial.
Customer.
Brand.
Legal.
Security.
Data.
Operational.
Technical.
Autonomy.
Founder capacity.
Reputation.
Trust.
Different projects require different risk weighting.

### 10.29 Risk Severity

Risk severity may be classified as:
Critical.
High.
Moderate.
Low.
Watch.
Severity should reflect potential damage, not emotional intensity.

### 10.30 Likelihood and Impact

Risk should evaluate both:
Likelihood.
Impact.
A low-likelihood catastrophic event may still require strong controls.
A high-likelihood minor inconvenience may require only routine handling.

### 10.31 Risk Velocity

Risk velocity describes how quickly damage may occur.
Examples:
Immediate:
Wrong-project publication.
Fast:
Sensitive customer response.
Gradual:
Declining content quality.
Slow:
Strategic drift.
High-velocity risks require faster detection and response.

### 10.32 Risk Controls

Controls may include:
Approval gate.
Autonomy limit.
Trial period.
Budget cap.
Rollback.
Human review.
Source validation.
Rate limit.
Content category restriction.
Project scope check.
Monitoring threshold.
Kill-switch.
A recommendation should explain how controls reduce risk.

### 10.33 Residual Risk

Residual risk is the risk remaining after controls.
Executive Intelligence should not claim that controls remove all risk.
Example:
Control:
Human approval before newsletter sending.
Residual risk:
A misleading claim may still pass review.
Residual risk should be accepted consciously.

### 10.34 The Damage Boundary

Decision Intelligence must determine whether a proposed action crosses the Damage Boundary.
A decision crosses the boundary when it may create:
Financial damage.
Brand damage.
Customer harm.
Legal exposure.
Trust damage.
Security risk.
Data exposure.
Strategic misdirection.
Crossing the Damage Boundary normally requires human approval unless an explicit governed mandate exists.

### 10.35 Alternatives

Material decisions should include realistic alternatives.
Alternatives may include:
Proceed.
Proceed with narrower scope.
Run a trial.
Prepare only.
Defer.
Gather more evidence.
Choose another approach.
Stop.
Maintain current state.
The system should not create artificial alternatives merely to appear balanced.

### 10.36 Status Quo as an Alternative

Doing nothing is also a decision.
The current state should often be included as an alternative.
Example:
Option A:
Increase autonomy.
Option B:
Maintain current autonomy.
Option C:
Reduce autonomy.
The cost and risk of maintaining the status quo should be explicit.

### 10.37 Recommended Alternative

Executive Intelligence should recommend one option when evidence allows.
A recommendation should not hide behind endless neutrality.
It should state:
Recommended option.
Reason.
Confidence.
Risk.
Conditions.
Review date.

### 10.38 Opportunity Cost

Every significant choice excludes or delays something else.
Opportunity cost may include:
Founder time.
Workforce capacity.
Revenue delay.
Strategic delay.
Learning delay.
Technical debt.
Risk exposure.
Project distraction.
The recommendation should state what will be displaced.

### 10.39 Opportunity Cost Example

Recommendation:
Prioritize project isolation before expanding The Prompt publishing autonomy.
Opportunity cost:
Website automation moves one week later.
Executive judgment:
The delay is acceptable because weak isolation creates systemic risk.
Opportunity cost turns priority into an explicit tradeoff.

### 10.40 Expected Impact

A recommendation should describe the expected impact.
Impact may include:
Revenue.
Cost.
Risk reduction.
Founder burden.
Customer value.
Workflow reliability.
Learning.
Autonomy readiness.
Strategic leverage.
Expected impact should remain distinguishable from guaranteed outcome.

### 10.41 Impact Horizon

Expected impact should identify timing.
Examples:
Immediate.
Within one week.
Within one month.
Within one quarter.
Long-term.
Condition-dependent.
A high-value long-term investment may still be poorly timed.

### 10.42 Decision Conditions

A conditional decision may be appropriate.
Example:
Approve L4 autonomy only if:
30 successful runs are completed.
No P0 or P1 violations occur.
Rollback remains available.
Project isolation health remains strong.
Conditions allow safe progression without repeated full debate.

### 10.43 Trial Decisions

Uncertain but reversible decisions may use a trial.
A trial should define:
Scope.
Duration.
Success criteria.
Failure criteria.
Risk limit.
Budget limit.
Monitoring.
Rollback.
Review date.
A trial is not reduced governance.
It is structured uncertainty reduction.

### 10.44 Decision Timebox

Some decisions should expire if not made.
A timebox should state:
Decision deadline.
Reason.
Consequence of delay.
Fallback.
Whether the opportunity expires.
Artificial deadlines should be avoided.

### 10.45 Review Date

Every material decision should have a review date or review condition.
Examples:
Review in 14 days.
Review after 30 successful runs.
Review when revenue reaches threshold.
Review at month end.
Review after the next customer cohort.
A decision without review may silently become permanent.

### 10.46 Reversal Conditions

Reversal conditions identify when the decision should be changed.
Example:
Reverse autonomy increase if:
A P0 or P1 policy violation occurs.
Correction rate exceeds 15%.
Project boundary compliance fails.
Rollback is unavailable.
Reversal conditions improve response speed.

### 10.47 What Would Change the Recommendation

Material recommendations should state what new evidence would change the recommendation.
Example:
Current recommendation:
Keep GainPilot hibernated.
Would change if:
Meaningful new user traction, revenue, or a major strategic partnership appears.
This prevents recommendations from appearing dogmatic.

### 10.48 Decision Depth Levels

Decision Intelligence should use four depth levels.
Fast Executive Response
For simple, reversible, low-risk questions.
Standard Executive Review
For routine project and daily decisions.
Deep Executive Analysis
For strategy, autonomy, spending, major risk, and roadmap decisions.
Board-Level Review
For portfolio direction, major investment, project activation, or long-term organizational change.
Depth should scale with impact and uncertainty.

### 10.49 Fast Executive Response

A Fast Executive Response may contain:
Recommendation.
Short reason.
Risk note.
Next action.
Example:
Recommendation:
Defer the dashboard redesign.
Reason:
It does not support today’s primary objective.

### 10.50 Standard Executive Review

A Standard Executive Review should include:
Decision question.
Recommendation.
Evidence.
Assumptions.
Confidence.
Risk.
Opportunity cost.
Next action.
Review date.
This is appropriate for most Daily Brief decisions.

### 10.51 Deep Executive Analysis

A Deep Executive Analysis should include:
Full framing.
Decision history.
Evidence review.
Alternative analysis.
Assumption analysis.
Risk analysis.
Pre-mortem.
Opportunity cost.
Capacity assessment.
Governance check.
Recommendation.
Conditions.
Rollback.
Review date.

### 10.52 Board-Level Review

A Board-Level Review should include:
Portfolio implications.
Financial impact.
Strategic alignment.
Project viability.
Founder role impact.
Systemic risk.
Long-term opportunity cost.
Scenario analysis.
Decision alternatives.
Formal recommendation.
Review horizon.

### 10.53 Cognitive Budget

Decision depth consumes AI resources, time, and founder attention.
The cognitive budget should scale with:
Impact.
Risk.
Uncertainty.
Irreversibility.
Cost.
Strategic scope.
Founder capacity.
Routine decisions should not use board-level analysis.
Major decisions should not use shallow summaries.

### 10.54 Founder Capacity and Decision Depth

Decision packages should match founder capacity.
On a low-capacity day:
Prepare the analysis.
Present only urgent decisions.
Defer noncritical review.
Offer a safe fallback.
On a high-capacity day:
Schedule deep strategic decisions.
Present complex alternatives.
Use longer review blocks.
Poor timing can reduce decision quality.

### 10.55 Decision Preparation

Before a decision reaches the founder, Omnira should prepare:
The exact question.
Executive recommendation.
Alternatives.
Evidence.
Risk.
Opportunity cost.
Required authority.
Estimated review effort.
The founder should not spend high-value capacity reconstructing context.

### 10.56 Decision-Ready Standard

A decision is ready when:
The question is clear.
Scope is explicit.
Authority is identified.
Evidence is sufficient.
Assumptions are visible.
Risks are analyzed.
Alternatives are realistic.
Recommendation is provided.
Delay consequences are known.
Incomplete decision requests should not enter the Approval Inbox.

### 10.57 Decision Status

A decision may have status:
Identified.
Under analysis.
Ready for review.
Waiting for approval.
Approved.
Rejected.
Deferred.
Superseded.
Expired.
Reversed.
The status should be visible and auditable.

### 10.58 Deferred Decisions

A deferred decision should include:
Reason for deferral.
Evidence still required.
New review date.
Interim action.
Risk of waiting.
Deferred must not mean forgotten.

### 10.59 Rejected Recommendations

When a recommendation is rejected, Omnira should preserve:
Original recommendation.
Founder decision.
Reason if provided.
Resulting plan change.
Review date if relevant.
The system should not repeatedly re-propose the same rejected option without new evidence.

### 10.60 Founder Override

The founder may override Executive Intelligence.
Executive Intelligence should then:
Acknowledge the decision.
State the expected impact.
Update affected plans.
Adjust missions.
Record the decision when material.
Preserve the original analysis.
Define review conditions where appropriate.
Founder authority remains final.
Executive honesty remains required.

### 10.61 Executive Challenge

Executive Intelligence should challenge the founder when:
The decision conflicts with evidence.
Risk is high.
Opportunity cost is hidden.
Capacity is unrealistic.
A policy boundary is crossed.
A prior decision is contradicted.
The recommendation appears driven by novelty or urgency bias.
Challenge should be respectful and direct.

### 10.62 Disagreement Protocol

When Executive Intelligence disagrees, it should state:
My recommendation.
Why I disagree.
Evidence.
Risk.
What your preferred option changes.
Whether approval is still valid.
It should not obstruct an authorized founder decision unless policy or constitutional rules prohibit the action.

### 10.63 Policy Check

Before a recommendation becomes action, Decision Intelligence should evaluate:
Is the action allowed?
Is approval required?
Does the actor have authority?
Does the action cross the Damage Boundary?
Does the project scope match?
Does an autonomy license apply?
Does Crisis Mode change the rule?
Reasoning does not replace policy.

### 10.64 Authority Check

The system should distinguish:
Can recommend.
Can prepare.
Can decide internally.
Can act externally.
Can spend.
Can publish.
Can change policy.
Can increase autonomy.
These are separate authorities.

### 10.65 Project Scope Check

Every decision should identify:
Portfolio scope.
Project scope.
Workflow scope.
Mission scope.
Affected external systems.
A Project Executive should not make a portfolio decision.
A workflow decision should not silently change project strategy.

### 10.66 Cross-Project Decisions

Cross-project decisions belong to Portfolio Executive or authorized founder governance.
A cross-project decision should identify:
Projects affected.
Shared dependencies.
Data used.
Resource tradeoffs.
Risk distribution.
Authority.
Expected portfolio impact.

### 10.67 Decision and Project Mode

Project mode should influence the recommendation.
Examples:
Build operating mode:
Prioritize capability creation.
Growth operating mode:
Prioritize revenue and distribution.
Stabilize operating mode:
Prioritize reliability and risk reduction.
Learning operating mode:
Prioritize evidence and experiments.
Maintenance operating mode:
Prioritize continuity.
Crisis Mode:
Prioritize containment and recovery.
A decision that ignores mode may be locally attractive but strategically wrong.

### 10.68 Decision and Portfolio Priority

A project-level recommendation should consider portfolio constraints.
Example:
Project recommendation:
Expand Familje-Stunden analytics work.
Portfolio constraint:
The Prompt and Omnira foundation currently consume available capacity.
Final recommendation:
Prepare the analytics plan now, defer implementation to the next review.

### 10.69 Decision and Revenue

Revenue should remain a primary factor.
Decision Intelligence should ask:
Does this create revenue?
Protect revenue?
Improve retention?
Reduce cost?
Shorten time to value?
Unlock future revenue?
Revenue should be interpreted alongside risk and strategic leverage.

### 10.70 Decision and Cost

Cost includes:
Money.
Founder time.
Workforce capacity.
AI usage.
Infrastructure.
Approval burden.
Maintenance.
Complexity.
Context switching.
Total organizational cost matters more than one visible invoice.

### 10.71 Decision and Learning Value

A decision may be valuable because it reduces uncertainty.
The analysis should identify:
What will be learned?
How will it be measured?
Which later decision will use the learning?
How much capacity will it consume?
When does the experiment stop?
Learning without a future decision path is weak justification.

### 10.72 Decision and Strategic Leverage

Strategic leverage exists when one decision benefits several capabilities or projects.
Examples:
Improved project isolation.
Shared approval architecture.
Decision Ledger.
Performance normalization.
Trust Score foundations.
High leverage may justify temporary delay of direct project output.

### 10.73 Decision and Founder Leverage

A decision should consider whether it reduces or increases founder burden.
Questions include:
Will this create repeated approvals?
Can policy replace future decisions?
Can Workforce own more preparation?
Does this remove manual coordination?
Does this create a new founder bottleneck?

### 10.74 Decision and Autonomy

Autonomy decisions require especially strong analysis.
They should include:
Workflow.
Project.
Current autonomy.
Proposed autonomy.
Successful runs.
Approval history.
Correction rate.
Policy violations.
Rollback.
Risk.
Trial scope.
Review date.
Executive Intelligence may recommend autonomy.
It may not grant itself autonomy.

### 10.75 Decision and Trust Score

Trust Score may inform decisions.
It should not make decisions automatically.
A high Trust Score does not override:
Damage Boundary.
Policy.
Project isolation failure.
Unsafe action category.
Missing rollback.
Human authority.
Trust is evidence, not permission.

### 10.76 Decision and Crisis

Crisis decisions prioritize containment.
A crisis decision package should focus on:
Known facts.
Unknowns.
Immediate damage.
Actions already taken.
Smallest required decision.
Recovery path.
Next review time.
Normal strategic analysis may be deferred.

### 10.77 Decision and Recovery

Recovery decisions should identify:
What is safe to restore?
What remains restricted?
Which controls changed?
Which tests remain?
Should autonomy stay reduced?
When may normal operation resume?

### 10.78 Decision and External Actions

External actions require stricter review.
Examples:
Publishing.
Sending messages.
Spending.
Refunding.
Connecting tools.
Changing customer promises.
Exporting data.
Deploying production changes.
The action destination and side effect must be explicit.

### 10.79 Decision and Internal Actions

Internal actions may include:
Preparing drafts.
Running analysis.
Creating missions.
Updating internal plans.
Generating alternatives.
Performing tests.
Producing reports.
Internal actions may have broader autonomy when they remain reversible and within policy.

### 10.80 Decision and Permanent Deletion

Permanent deletion should be treated as high impact.
The analysis should consider:
Correct project.
Correct object.
Retention rules.
Dependencies.
SEO impact.
Audit impact.
Recovery.
Approval.
Alternative reversible actions.
Preferred alternatives include:
Archive.
Unpublish.
Mark stale.
Disable.
Redirect.
Quarantine.

### 10.81 Pre-Mortem

Before major decisions, Executive Intelligence should ask:
Assume this decision failed.
Why did it fail?
The pre-mortem should identify:
Failure causes.
Early warning signals.
Controls.
Stopping conditions.
Rollback.

### 10.82 Post-Decision Monitoring

A decision should define what must be monitored.
Examples:
Revenue.
Quality.
Customer response.
Correction rate.
Policy violations.
Cost.
Workflow reliability.
Founder burden.
Trust Score.
A decision without monitoring cannot be evaluated.

### 10.83 Decision Outcome

The outcome should be compared against:
Expected impact.
Success criteria.
Risk prediction.
Cost estimate.
Timeline.
Assumptions.
The system should distinguish between a good decision with a bad outcome and a bad decision with a lucky outcome.

### 10.84 Decision Quality vs Outcome Quality

A decision may be high quality even when the outcome is poor.
Decision quality depends on:
Evidence available at the time.
Reasoning quality.
Authority.
Risk control.
Alternative evaluation.
Assumption transparency.
Outcome quality depends on what happened afterward.
The system should learn from both.

### 10.85 Decision Learning

After review, Omnira should extract:
What was predicted correctly?
Which assumptions failed?
Which risks were missed?
Was confidence calibrated?
Was the decision timely?
Did the expected impact occur?
What should change next time?

### 10.86 Confidence Calibration

Executive Intelligence should compare confidence with outcomes.
Examples:
High-confidence recommendation succeeded.
High-confidence recommendation failed.
Low-confidence trial produced strong results.
Medium-confidence assumption remained unresolved.
Repeated overconfidence should reduce future confidence.
Repeated underconfidence should also be corrected.

### 10.87 Recommendation Accuracy

Recommendation performance may be measured through:
Founder acceptance.
Outcome success.
Correction rate.
Reversal rate.
Risk prediction accuracy.
Cost forecast accuracy.
Time forecast accuracy.
Opportunity-cost accuracy.
Metrics should support calibration, not punish uncertainty.

### 10.88 Decision Memory

Durable lessons may enter Memory.
Examples:
The founder prefers reversible trials before major autonomy changes.
Newsletter approvals create high review burden.
Project isolation must be validated before cross-project automation.
Morning strategic reviews produce better completion.
Not every rejected option should become durable Memory.

### 10.89 Decision Ledger Integration

Material decisions should enter the Decision Ledger.
The ledger should preserve:
Decision.
Scope.
Authority.
Evidence.
Assumptions.
Recommendation.
Final decision.
Rationale.
Review date.
Outcome.
Decision Intelligence creates the reasoning package.
Decision Ledger preserves the institutional record.

### 10.90 Decision Graph

The Intelligence Graph should connect:
Decision.
Evidence.
Assumptions.
Alternatives.
Dependencies.
Mission.
Outcome.
Performance.
Review.
Next recommendation.
This allows the founder to understand why current work exists.

### 10.91 Decision Versioning

Decisions may change.
Versioning should preserve:
Original recommendation.
Original decision.
Updated evidence.
Revised decision.
Reason for revision.
Authority.
Affected missions.
Silent mutation destroys accountability.

### 10.92 Superseded Decisions

When a decision is replaced, it should become Superseded.
The system should identify:
Which decision replaced it.
Why.
When.
Who authorized the change.
Which work is affected.
Superseded decisions should remain visible historically.

### 10.93 Decision Expiration

Some decisions should expire automatically.
Examples:
Temporary budget mandate.
Autonomy trial.
Temporary cross-project access.
Crisis exception.
Limited publishing policy.
Expiration should return the system to a safe default.

### 10.94 Decision Renewal

Renewal should require evidence.
A renewal should answer:
Did the decision work?
Did the risk remain acceptable?
Did conditions remain valid?
Should scope change?
What is the new review date?
Renewal should not be automatic for high-impact authority.

### 10.95 Decision Notification

Only decision-relevant events should notify the founder.
Examples:
Decision ready.
Deadline approaching.
Evidence materially changed.
Risk increased.
Condition failed.
Review date reached.
Routine analytical progress should remain quiet.

### 10.96 Decision Queue

The founder’s decision queue should be prioritized by:
Damage potential.
Urgency.
Dependency impact.
Revenue impact.
Customer impact.
Reversibility.
Founder effort.
The newest decision should not automatically be first.

### 10.97 Decision Batching

Similar low-risk decisions may be batched.
A decision batch should share:
Project.
Decision category.
Authority.
Risk class.
Time horizon.
Evidence standard.
High-impact decisions should remain individually reviewable.

### 10.98 Decision Burden

Executive Intelligence should measure decision burden.
Burden may include:
Number of decisions.
Complexity.
Review time.
Evidence volume.
Correction rate.
Deferral rate.
Decision fatigue.
Repeated context reconstruction.
The objective is to improve founder leverage.

### 10.99 Reducing Decision Burden

Decision burden may be reduced through:
Clearer policies.
Better defaults.
Prepared recommendations.
Approval batching.
Delegated authority.
Autonomy licenses.
Budget mandates.
Better Mission Briefs.
Decision reuse where scope is identical.
The system should not reduce burden by hiding risk.

### 10.100 Reusable Decision Policies

Some repeated decisions may become policies.
Example:
Repeated decision:
Approve low-risk The Prompt short-news posts.
Future policy:
Posts in approved categories may publish under L4 autonomy when all source and quality checks pass.
Policy promotion should require evidence and approval.

### 10.101 Decision Reuse

A prior decision may guide a new case only when:
Project is the same.
Action category is the same.
Risk profile is the same.
Policy remains valid.
Conditions remain satisfied.
No material context changed.
Analogy alone is insufficient.

### 10.102 Decision Templates

Decision templates may exist for:
Autonomy increase.
Project mode change.
Budget request.
Tool connection.
Publishing policy.
Crisis activation.
Project reactivation.
Strategy change.
Templates improve consistency.
They must not force unlike decisions into identical reasoning.

### 10.103 Decision Explanation

Atlas should explain recommendations in clear language.
A useful explanation should include:
What I recommend.
Why.
What evidence matters.
What risk exists.
What is uncertain.
What happens next.
The explanation should not expose unnecessary internal chain-of-thought.
It should expose the decision rationale.

### 10.104 Conversational Decision Mode

The founder should be able to ask:
Why?
What are the alternatives?
What happens if we wait?
What is the risk?
What would change your mind?
What did we decide last time?
Atlas should answer from the structured decision record.

### 10.105 Formal Decision Mode

Formal records should remain concise and serious.
A formal decision may look like:
Decision:
Keep The Prompt newsletter sending approval-gated.
Scope:
The Prompt newsletter workflow.
Evidence:
18 successful drafts, limited sending history.
Confidence:
High.
Risk:
Brand and subscriber trust.
Review:
After 30 successful drafts.
Authority:
Founder.

### 10.106 Decision Transparency

The founder should be able to inspect:
Evidence.
Sources.
Assumptions.
Confidence.
Alternatives.
Risk.
Authority.
Decision history.
Outcome.
Transparency supports trust and review.

### 10.107 Decision Privacy

Decision transparency must respect privacy and project isolation.
Portfolio-level decisions may use governed summaries.
Project decisions should not expose unrelated project data.
Founder-private context should appear only as derived capacity signals unless explicit detail is necessary.

### 10.108 Multi-User Decision Rights

Future organizations may have several decision roles.
Examples:
Owner.
Portfolio Executive.
Project Owner.
Approver.
Financial Approver.
Security Approver.
Editorial Approver.
Customer Representative.
Decision authority should be scoped by project and action category.

### 10.109 Delegated Decision Authority

Delegation should define:
Decision category.
Project.
Impact limit.
Financial limit.
Duration.
Escalation rule.
Review date.
Delegated authority should not become general authority.

### 10.110 Decision Escalation

A decision should escalate when:
Authority is insufficient.
Confidence is too low.
Risk crosses the Damage Boundary.
Projects conflict.
Spend is material.
Customer harm is possible.
Policy is unclear.
Constitutional rules may be affected.
Escalation is a safety mechanism, not a failure.

### 10.111 Decision Fallbacks

When a decision cannot be made, safe fallbacks may include:
Prepare only.
Pause.
Maintain current state.
Use approved template.
Defer external action.
Escalate.
Run a smaller trial.
No decision should not automatically mean uncontrolled continuation.

### 10.112 No-Response Decisions

When founder approval is absent, the workflow should follow its defined no-response policy.
Possible outcomes:
Wait.
Expire.
Pause.
Defer.
Use safe fallback.
Escalate.
Cancel.
No response must never mean approval by default.

### 10.113 Decision Latency

Decision latency measures how long decisions remain unresolved.
High latency may indicate:
Insufficient preparation.
Founder overload.
Unclear authority.
Weak evidence.
Poor prioritization.
Too many approvals.
Latency should be interpreted, not merely minimized.

### 10.114 Fast Decisions vs Rushed Decisions

A fast decision may still be high quality when:
Scope is clear.
Evidence is strong.
Risk is low.
The decision is reversible.
Authority is explicit.
A rushed decision is made without adequate framing or evidence.
Speed is not the same as carelessness.

### 10.115 Decision Consistency

Similar cases should produce reasonably consistent recommendations.
When recommendations differ, the system should explain why:
Different project.
Different risk.
Different evidence.
Different policy.
Different capacity.
Different authority.
Consistency should not eliminate context.

### 10.116 Bias Control

Decision Intelligence should defend against predictable biases.
Recency Bias
Overweighting the newest event.
Activity Bias
Assuming more activity means more value.
Novelty Bias
Preferring new ideas.
Sunk Cost Bias
Continuing because much has already been invested.
Confirmation Bias
Selecting evidence that supports the preferred answer.
Automation Bias
Trusting automated output too readily.
Revenue Myopia
Ignoring strategic foundations.
Platform Bias
Overvaluing architecture work.
Urgency Bias
Treating loud problems as important problems.

### 10.117 Bias Check

Major decisions should ask:
Are we reacting to one recent event?
Are we protecting sunk cost?
Are we attracted to novelty?
Are we ignoring contradictory evidence?
Are we confusing activity with progress?
Are we overvaluing platform work?
Are we understating founder capacity limits?

### 10.118 Scenario Analysis

Major decisions may compare scenarios.
Example:
Scenario A:
Increase autonomy now.
Scenario B:
Wait for more evidence.
Scenario C:
Run a limited trial.
Each scenario should assess:
Expected impact.
Risk.
Cost.
Capacity.
Reversibility.
Opportunity cost.

### 10.119 Sensitivity Analysis

Decision Intelligence should identify which assumptions matter most.
Example:
If approval rate remains above 95%, L4 autonomy is attractive.
If approval rate falls below 85%, the recommendation changes.
Sensitivity analysis shows where uncertainty matters.

### 10.120 The Decision Question Test

Before analysis, Executive Intelligence should ask:
Is the decision question specific?
Is the scope explicit?
Is the time horizon clear?
Is the authority known?
Is this one decision or several hidden decisions?

### 10.121 The Evidence Test

Before recommending, Executive Intelligence should ask:
What evidence supports this?
How current is it?
How reliable is it?
What evidence contradicts it?
What important evidence is missing?

### 10.122 The Assumption Test

Executive Intelligence should ask:
Which claims are assumed?
Which assumptions are fragile?
How can they be tested?
What happens if they are wrong?

### 10.123 The Risk Test

Executive Intelligence should ask:
What can go wrong?
How serious would it be?
How quickly could it happen?
What controls exist?
What residual risk remains?
Does it cross the Damage Boundary?

### 10.124 The Alternative Test

Executive Intelligence should ask:
What realistic alternatives exist?
What happens if we maintain the status quo?
Is a smaller trial possible?
Can preparation occur without execution?

### 10.125 The Opportunity Cost Test

Executive Intelligence should ask:
What will this delay?
Which project loses capacity?
What founder attention is consumed?
What existing commitment is displaced?

### 10.126 The Authority Test

Executive Intelligence should ask:
Who may recommend?
Who may decide?
Who may approve?
Who may execute?
Does the authority expire?
Does the decision affect another project?

### 10.127 The Capacity Test

Executive Intelligence should ask:
Does the founder have capacity to review this well?
Can the decision wait for a better window?
Can preparation reduce review effort?
Is a fallback available?

### 10.128 The Review Test

Before finalizing a decision, Executive Intelligence should ask:
When should this be reviewed?
What outcome is expected?
What would reverse the decision?
What evidence should be monitored?

### 10.129 Failure Modes

Decision Intelligence must prevent several failure modes.
Failure Mode 1 — Confident Guessing
The system presents weak assumptions as facts.
Failure Mode 2 — Recommendation Without Authority
The system acts because it recommended an action.
Failure Mode 3 — Hidden Assumptions
Material assumptions are not disclosed.
Failure Mode 4 — No Alternatives
The system presents one option as inevitable.
Failure Mode 5 — No Opportunity Cost
The recommendation ignores what will be delayed.
Failure Mode 6 — Evidence Dump
The system provides large amounts of data without interpretation.
Failure Mode 7 — False Precision
Confidence and forecasts appear more exact than the evidence allows.
Failure Mode 8 — Stale Evidence
Old data is used as if current.
Failure Mode 9 — Decision Drift
A narrow decision silently expands in scope.
Failure Mode 10 — Authority Drift
Recommendation authority becomes execution authority.
Failure Mode 11 — Unreviewed Decisions
Temporary decisions become permanent.
Failure Mode 12 — Outcome Bias
A lucky result is treated as proof of good reasoning.
Failure Mode 13 — Analysis Paralysis
The system requests endless evidence for reversible decisions.
Failure Mode 14 — Rushed Irreversible Decision
High-impact action occurs without sufficient review.
Failure Mode 15 — Founder Overload
Too many decisions reach the founder.
Failure Mode 16 — Decision Amnesia
The system forgets why earlier decisions were made.
These failure modes should be treated as architectural constraints.

### 10.130 Design Requirements

Any implementation of Decision Intelligence should preserve these requirements:
Every material decision must have a clearly defined question.
Every decision must identify scope.
Every decision must identify authority.
Every recommendation must distinguish evidence from assumptions.
Every material recommendation must include confidence when relevant.
Every high-impact decision must include risk analysis.
Every significant choice must expose opportunity cost.
Every major decision should include realistic alternatives.
Every autonomy decision must remain project- and workflow-scoped.
Every decision crossing the Damage Boundary must require applicable approval.
Every temporary authority decision must have expiration or review.
Every material decision must have review conditions.
Every decision should identify what would change the recommendation.
Every founder decision should be decision-ready before review.
Every decision must respect founder capacity and project isolation.
Every material decision should be traceable to outcome and learning.

### 10.131 Implementation Neutrality

This chapter defines the reasoning and governance contract.
It does not require a specific model, database, scoring system, or interface.
Decision Intelligence may later be implemented through:
Decision objects.
Decision Ledger entries.
Evidence references.
Assumption records.
Confidence models.
Risk registers.
Approval workflows.
Policy checks.
Decision queues.
Scenario analysis.
Review schedules.
Outcome tracking.
Atlas explanations.
Intelligence Graphs.
The technical implementation may evolve.
The decision contract must remain stable.

### 10.132 The Decision Intelligence Contract

Executive Intelligence must:
Frame the correct question.
Use current and relevant evidence.
Expose assumptions.
Communicate confidence honestly.
Analyze risk.
Make alternatives visible.
Make opportunity cost explicit.
Respect authority.
Respect project boundaries.
Respect founder capacity.
Recommend clearly.
Escalate uncertainty appropriately.
Use trials when uncertainty is reversible.
Define review and reversal conditions.
Record material decisions.
Learn from outcomes.
Improve calibration over time.
A feature that does not support this contract should not control executive decisions.

### 10.133 Closing Principle

Decision Intelligence is not about making Omnira sound certain.
It is about making Omnira worthy of trust.
A trusted Executive system must be able to say:
This is what I recommend.
This is the evidence.
These are my assumptions.
This is how confident I am.
These are the risks.
These are the alternatives.
This is what we give up.
This is who has authority.
This is when we should review the decision.
This is what would change my mind.
That is executive judgment.
Not automatic certainty.
Not endless analysis.
Not blind action.
A strong decision does not eliminate uncertainty.
It makes uncertainty visible, governed, and actionable.
Decision Intelligence is the mechanism through which Omnira turns information into accountable direction.
