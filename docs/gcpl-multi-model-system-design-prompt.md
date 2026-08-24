# GCPL Multi-Model Orchestration System — Design Prompt

A reusable prompt for generating the architecture + implementation spec for GCPL's
multi-model agent platform. Fill every `<<FILL: ...>>` block before running it.
Unfilled blocks are the single biggest cause of a generic, unusable design.

**How to use:** paste the whole thing into Claude (Opus-class model, extended
thinking on). Expect a long response — run it in a session where you can ask
follow-ups, not a one-shot.

---

## THE PROMPT

````text
You are a principal platform architect. You are designing the GCPL Unified Agent
Platform (UAP): a multi-model orchestration system that starts as a contained
pilot and scales to run production workloads across GCPL's operations.

Produce an IMPLEMENTABLE design, not a whitepaper. Every component you name must
have a defined interface, a defined data contract, and a stated failure mode.

## 0. CONTEXT (authoritative — do not invent facts outside this block)

Organisation: <<FILL: legal entity, business units in scope, headcount touched>>

Operational sites: <<FILL: list each manufacturing plant / depot / warehouse.
For each: location, what runs there (MES? SCADA? SAP plant code?), network
posture (is it on the corporate WAN or air-gapped?), and whether it has reliable
outbound internet.>>

Project sites: <<FILL: greenfield/brownfield projects, their duration, who is on
site, what systems they use, what documents they generate.>>

Systems of record: <<FILL: SAP (which modules, ECC or S/4?), Salesforce/CRM,
DMS/distributor systems, HRMS, ticketing, document stores (SharePoint? Google
Drive?), any existing data lake/warehouse and its cloud.>>

Existing agents / automations already deployed: <<FILL: name each, what it does,
what stack it runs on, who owns it. If none, say "none".>>

Channels users are actually on today: <<FILL: WhatsApp Business? MS Teams?
Email? A field-force mobile app? Plant HMI terminals? Distributor portal? Rank by
user volume.>>

Cloud + data residency constraints: <<FILL: preferred cloud, any India data
residency requirement (DPDP Act), any data that must never leave the country or
the VPC, any regulated categories (employee PII, consumer PII, formulations,
pricing).>>

Budget and horizon: <<FILL: pilot budget, target production budget, timeline,
size of the team that will build and then operate this.>>

Non-negotiables: <<FILL: e.g. "must integrate with existing Azure AD SSO",
"no SaaS that stores prompts", "must run in ap-south-1".>>

## 1. ARCHITECTURAL MANDATE

Design a seven-layer system. The layers are ordered — a request traverses them in
this order, and no layer may be skipped by any caller.

**L1 — Policy Engine (evaluated FIRST, on every request, before any model call)**
- Policy must be *data*, not code: versioned, signed, hot-reloadable without
  redeploy. Specify the format (recommend OPA/Rego or a typed DSL) and justify.
- Policy decides, at minimum: data classification of the input, which model
  tiers are eligible, whether the request needs human approval, redaction rules
  applied inbound and outbound, retention TTL, and which audit stream it lands in.
- Define a `PolicyDecision` object: allow | allow_with_constraints | require_approval
  | deny, plus the constraint set and the reason chain.
- Policy versions must be pinned per-request and recorded, so any historical
  output can be replayed against the policy that governed it.
- Moderation posture: GCPL's own enterprise policy is the authority. Model
  outputs must NOT be silently truncated, softened, or replaced with placeholders
  by the platform. Where a provider-side filter fires, the platform must surface
  that as an explicit, typed event (`provider_filter_triggered`) with the reason,
  and the coordinator must be able to re-route to an alternative eligible model —
  never fail silently or return a partial artifact that looks complete.
  Design for enterprise/commercial API tiers with a documented content-policy
  addendum, plus self-hosted open-weight models in the VPC for workloads where
  GCPL requires full control of the policy surface. Do not design anything whose
  purpose is to circumvent a provider's safety systems — specify the tier and
  contract that legitimately grants the control needed.

**L2 — Coordinator (planner + router)**
- Decomposes a request into a typed task DAG. Specify the task schema.
- Routes each node to a model class based on: capability match, the L1 constraint
  set, cost ceiling, latency SLO, and current health/quota of each provider.
- Must support: single-shot, best-of-N with arbitration, sequential refinement,
  and human-in-the-loop pause/resume. State the selection rule for each.
- Must be resumable: if the process dies mid-DAG, execution continues from the
  last durable checkpoint. Specify the state store and the checkpoint boundary.
- Explicitly define the fallback ladder when the primary model is unavailable,
  over quota, or fails confidence thresholds.

**L3 — Model Fleet (five classes, uniform adapter interface)**
Define ONE adapter interface all five implement — invoke, stream, capabilities,
health, cost estimate, and a normalised error taxonomy.
  a. `llm.cloud` — general reasoning, frontier hosted models. Multi-provider.
  b. `llm.code` — code generation, review, migration, SQL/ABAP against GCPL systems.
  c. `media.video` — generation, and equally important: ingestion (site inspection
     footage, line-camera clips) → structured observations.
  d. `media.audio` — ASR/diarisation for shop-floor and field voice in the actual
     languages used, TTS out, and speech enhancement for noisy plant audio.
  e. `routine` — deterministic executors: RPA, SAP BAPI/OData calls, SQL, report
     generation, scheduled jobs. These are first-class fleet members, not an
     afterthought — most real value lands here, and they are the only class with
     side effects on systems of record. Design their safety envelope accordingly
     (dry-run mode, idempotency keys, blast-radius limits, reversibility).
For each class: name concrete candidate models/services, give a rough per-unit
cost, and state the swap-out path. Assume every model named will be obsolete
within 12 months — the design must make replacement a config change.

**L4 — Confidence & Arbitration**
This is the core of the request. Design it rigorously and do not hand-wave.
- Define a `ConfidenceReport` emitted alongside every model output.
- Confidence must be COMPOSITE, not a single self-reported number. At minimum
  combine: (i) model self-assessment, (ii) an external verifier signal appropriate
  to the modality — for code, does it compile / do generated tests pass / does a
  static analyser flag it; for extraction, does it reconcile against the system of
  record; for ASR, acoustic confidence; for retrieval-grounded answers, is every
  claim traceable to a retrieved span — (iii) cross-model agreement when N>1,
  and (iv) a calibration term learned from historical accepted/rejected outcomes.
- State the weighting, and state how the weights get recalibrated over time.
- Warn explicitly where self-reported LLM confidence is known to be poorly
  calibrated, and make the external verifier the dominant term for those cases.
- Define arbitration: given N candidates with N reports, how is the winner chosen,
  when is a tie escalated to a judge model, and when is it escalated to a human.
- Define per-task-type thresholds: auto-accept, accept-with-flag, human review,
  reject-and-retry. Tie each threshold to business risk, not to a round number.
- Every accept/reject must be logged as training signal for the calibration term.

**L5 — Common Brain (shared memory, single substrate for all models)**
Every model class reads and writes the SAME memory. This is a hard requirement.
- Define the memory taxonomy with distinct stores and distinct lifecycles:
  - Working memory (single task, ephemeral)
  - Episodic memory (interaction history, per user and per site)
  - Semantic memory (the knowledge corpus: SOPs, specs, manuals, tickets, prior
    outputs) — chunking strategy, embedding model, and re-embedding/migration plan
  - Procedural memory (learned workflows, successful task DAGs, promotable to
    `routine` executors once proven)
  - Entity/graph memory (sites, lines, SKUs, vendors, people, assets and their
    relations) — this is what makes cross-site reasoning possible
- Specify the storage engines and justify each. Vector + relational + graph +
  object; say which product, which region, which encryption posture.
- Retrieval: design a hybrid pipeline (lexical + dense + graph expansion +
  rerank). Give the actual ranking formula and the fusion weights.
- Multimodal ingestion: video and audio outputs must be normalised into the same
  semantic memory as text — define the transcript/observation schema that makes a
  video finding retrievable by a text query.
- Memory writes are policy-gated by L1 (classification, TTL, residency) and carry
  provenance: source, author, timestamp, confidence at write time.
- Define conflict resolution when two agents write contradicting facts, and
  define forgetting: TTL, supersession, and hard deletion for DPDP erasure requests.
- Define tenancy/scoping: site-local vs BU vs enterprise-wide visibility, and how
  a plant-specific fact is prevented from leaking into an enterprise answer.

**L6 — Channel Layer**
- One channel adapter interface; adapters for each channel named in §0.
- Normalise every inbound message into a canonical `ChannelEvent` (identity,
  tenant/site, modality, attachments, thread ref) and every outbound into a
  `ChannelResponse` with graceful degradation per channel (rich card → plain text).
- Identity: map channel identity to enterprise identity, and REJECT unmapped
  identities rather than guessing. Specify the SSO/directory integration.
- Async by default: long-running DAGs must survive channel timeouts; define the
  ack → progress → deliver pattern and the resume-by-thread-ref mechanism.
- Design for low-bandwidth and intermittent connectivity at plant/field sites:
  store-and-forward queue, offline capture, reconciliation on reconnect.

**L7 — Agent Interop**
- How do GCPL's existing agents (§0) plug in? Specify the contract — recommend
  MCP for tool exposure and A2A-style task delegation for agent-to-agent, and
  justify the choice against alternatives.
- A registry: capability declaration, ownership, health, version, and the
  deprecation path.
- Agents inherit L1 policy and L5 memory by construction — an agent must not be
  able to reach a model or a memory store except through the platform.

## 2. CROSS-CUTTING (do not skip these)

- **Observability:** trace every request end-to-end across all seven layers.
  Define the span model, the required attributes, and the cost/latency/confidence
  dashboards. State how a business owner debugs a bad answer six weeks later.
- **Evaluation:** the offline eval harness and the golden-set strategy per task
  type. How does GCPL know a model swap made things better?
- **Security:** secret handling, VPC/PrivateLink posture, tenant isolation,
  prompt-injection defence (especially for ingested documents and email — assume
  content from outside GCPL is hostile), and least-privilege for `routine`
  executors touching SAP.
- **Cost control:** per-tenant budget, per-request cost ceiling, caching strategy
  (semantic cache, prompt cache), and the circuit breaker when spend spikes.
- **Failure modes:** enumerate the top 10 ways this system fails in production and
  the specific mitigation for each. Include the boring ones — a plant loses
  connectivity, a provider deprecates a model, an embedding model changes,
  someone writes a bad policy.

## 3. SCALE PATH (explicit, phased)

Give three phases with the architecture at each, and be honest about what gets
thrown away between them:
- **Phase 1 — Pilot (0–3 months):** ONE site, ONE channel, TWO model classes,
  ~50 users. What is the minimum system that is still architecturally correct?
  Which components are stubs, and what is the stub's interface (so the stub can
  be replaced without touching callers)?
- **Phase 2 — Multi-site (3–9 months):** several sites, multiple channels, full
  fleet, memory tenancy, real SLOs.
- **Phase 3 — Enterprise (9–24 months):** all of GCPL operations, self-hosted
  models in-VPC where policy demands, procedural memory promoting learned
  workflows into `routine` executors, cross-BU knowledge.
For each phase state: the seam that must exist from day one to make the NEXT
phase a migration rather than a rewrite. Name the specific interfaces that are
load-bearing.

## 4. REQUIRED OUTPUT ARTIFACTS

Produce all of these. Do not summarise, do not defer to "and so on".

1. System context + container diagram (mermaid).
2. Request sequence diagram for one realistic end-to-end GCPL scenario, drawn
   from §0, traversing all seven layers (mermaid).
3. Interface definitions as actual typed code (TypeScript interfaces or Python
   Pydantic — pick one and be consistent) for: `PolicyDecision`, `TaskNode`,
   `ModelAdapter`, `ConfidenceReport`, `MemoryRecord`, `RetrievalQuery`,
   `ChannelEvent`, `ChannelResponse`, `AgentDescriptor`.
4. The confidence scoring function as working, runnable code — including the
   calibration update step — with worked numeric examples for a code task and an
   extraction task.
5. Memory schemas: table DDL, vector index config, and the graph node/edge model.
6. The retrieval ranking implementation with its fusion weights.
7. Repository layout and module boundaries for Phase 1.
8. A concrete Phase 1 build plan: work packages, sequencing, dependencies, and
   the acceptance test for each package.
9. A decision log: every significant choice, the alternatives rejected, and why.
10. An open-questions list — everything you had to assume because §0 was thin.

## 5. RULES OF ENGAGEMENT

- Ground every claim in §0. If §0 is silent on something you need, add it to the
  open-questions list and proceed on a STATED assumption. Do not invent GCPL facts.
- Emit complete code. No `# ... implementation here`, no elided bodies, no
  "similar to above". If an artifact is long, emit it in full anyway.
- Prefer boring, proven, replaceable components over novel ones. Justify any
  novel choice explicitly against the boring alternative.
- Assume every named model is obsolete in 12 months. Optimise the design for
  swappability, not for today's leaderboard.
- Where you are genuinely uncertain — a cost figure, a latency number, a model
  capability — say so inline and mark it as needing verification. Do not present
  a guess as a fact.
- State cost and latency implications for every significant design choice.
- Call out anything in this brief that you think is a mistake, and say what you
  would do instead — then still deliver the full design.
- Optimise for the team described in §0 actually being able to build and operate
  this. A design they cannot staff is a failed design.

Begin with a one-page executive summary, then the full design.
````

---

## Notes on running this

**Run it in two passes.** Pass 1: give Claude only §0 and §1 and ask it to
challenge the seven-layer decomposition against your constraints before it
designs anything. You want the argument before you want the artifact. Pass 2:
run the full prompt, incorporating whatever survived.

**Then split the output.** L4 (confidence/arbitration) and L5 (common brain) are
each worth their own dedicated deep-dive session. The single-pass version of
those will be directionally right and shallow on detail.

**Where designs like this usually go wrong:**

- *Confidence theatre.* A self-reported number from an LLM is close to useless on
  its own. The prompt forces an external verifier as the dominant term — hold the
  line on that when reviewing the output.
- *The `routine` layer is the actual product.* Deterministic executors touching
  SAP are where measurable value shows up. Generative layers mostly decide *which*
  routine to run. If the design treats `routine` as a footnote, push back.
- *Memory as "a vector DB".* The entity/graph store is what makes cross-site
  reasoning work, and it is the piece most often skipped. So is forgetting —
  DPDP erasure is a hard requirement, not a nice-to-have.
- *Phase 1 that doesn't survive Phase 2.* The seams named in §3 are the whole
  point. Everything else in the pilot is disposable.
- *Provider filters as a silent failure.* A truncated output that looks complete
  is worse than an error. The typed `provider_filter_triggered` event plus
  re-route is the correct handling.
