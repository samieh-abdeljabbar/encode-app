# How People Genuinely Learn: A Research Foundation for Encode

**Purpose:** This document is the evidence base that drives every feature decision in Encode. Every section includes a "Design Implication" explaining how the research should manifest in the app. When a feature debate arises, start here.

**Last Updated:** March 2026

---

## Table of Contents

1. [How Memory Works — The Fundamentals](#1-how-memory-works)
2. [Working Memory Limits and Cognitive Load](#2-working-memory-limits-and-cognitive-load)
3. [Schema Theory — Knowledge Structure in the Brain](#3-schema-theory)
4. [Dual Coding Theory — Verbal and Visual Together](#4-dual-coding-theory)
5. [Levels of Processing — Depth Determines Retention](#5-levels-of-processing)
6. [The Forgetting Curve and Spaced Repetition](#6-the-forgetting-curve-and-spaced-repetition)
7. [The Testing Effect — Retrieval Practice](#7-the-testing-effect)
8. [Desirable Difficulties — Why Struggle Is the Point](#8-desirable-difficulties)
9. [The Generation Effect — Produce, Don't Consume](#9-the-generation-effect)
10. [Interleaving — Mixing Problems Beats Blocking](#10-interleaving)
11. [Elaborative Interrogation and Self-Explanation](#11-elaborative-interrogation-and-self-explanation)
12. [The Feynman Technique — Teaching as Learning](#12-the-feynman-technique)
13. [Bloom's Taxonomy — A Progression Map for Understanding](#13-blooms-taxonomy)
14. [Metacognition — Knowing What You Don't Know](#14-metacognition)
15. [What Doesn't Work — Anti-Patterns to Avoid](#15-what-doesnt-work)
16. [Emotion, Motivation, and Memory Encoding](#16-emotion-motivation-and-memory-encoding)
17. [FSRS — The Modern Spaced Repetition Algorithm](#17-fsrs)
18. [AI-Assisted Learning — What the Research Says](#18-ai-assisted-learning)
19. [Gamification — When It Helps vs. Hurts](#19-gamification)
20. [Concept Mapping and Knowledge Graphs](#20-concept-mapping-and-knowledge-graphs)
21. [Practical Synthesis — How Encode Should Work](#21-practical-synthesis)

---

## 1. How Memory Works

### Core Model

Memory is not a single thing. It operates across at least three stages:

**Encoding** — Sensory information enters working memory. Encoding quality depends almost entirely on how deeply the information is processed (see Section 5). Shallow processing (noticing the shape or sound of words) produces weak, fragile traces. Deep, semantic processing (connecting meaning to what you already know) produces durable traces.

**Storage (Consolidation)** — Over hours and days, memories are consolidated, primarily during sleep. The hippocampus initially holds new memories and replays them to the cortex for long-term storage. Emotionally significant material gets priority processing through the amygdala (see Section 16). Schema-compatible information consolidates faster because it has existing structure to attach to (see Section 3).

**Retrieval** — The act of retrieving a memory is not passive readout. It is a reconstruction. Each retrieval strengthens the memory trace and modifies it slightly. This is why retrieval practice is so powerful — the act of getting something out is itself the training, not just the check.

**Key insight for app design:** Encode should engineer all three stages deliberately. Importing content primes encoding. Digestion gates force deep processing at the moment of reading. Spaced repetition schedules retrieval at the moment traces are weakest. Together these simulate what the best human learners do naturally.

### Design Implication

Every interaction in Encode should map to one of these three stages. Feature requests that don't improve encoding depth, storage consolidation, or retrieval quality should be deprioritized. The reader is an encoding environment. Digestion gates are encoding intensifiers. Flashcards are retrieval practice. Quizzes test the quality of storage. Nothing should be purely cosmetic.

---

## 2. Working Memory Limits and Cognitive Load

### Miller's Law and Cowan's Update

George Miller's 1956 paper established that humans can hold approximately 7 ± 2 items in working memory. However, this figure assumed people could chunk freely. Nelson Cowan's 2001 research, corroborated by subsequent reviews, showed that the true underlying capacity is closer to **4 chunks** (range: 3–5) when chunking is controlled for — and items can only be held for roughly 20 seconds without active rehearsal.

The practical implication: at any given moment, a learner can juggle very little genuinely new information. When that limit is exceeded, learning stops and frustration or cognitive overload takes its place.

### Cognitive Load Theory (Sweller, 1988 — updated through 2025)

John Sweller built on Miller to propose that working memory has three types of load:

- **Intrinsic load** — Complexity inherent to the material itself (can't be eliminated, but can be sequenced)
- **Extraneous load** — Complexity introduced by poor design, navigation friction, confusing layout (should be minimized to zero)
- **Germane load** — Productive effort that builds schemas (should be maximized)

A 2025 systematic review in PMC confirmed that cognitive load theory remains the strongest theoretical basis for instructional design, and that AI-driven adaptive systems that manage load dynamically produce better outcomes than fixed-sequence instruction.

**What this means practically:** The interface surrounding a learning activity should be invisible. Every click, animation, loading state, and modal that requires cognitive resources is stealing from the 4-chunk budget the learner has for actual content.

### Design Implication

- The reader view in Encode must be distraction-free. Sidebar collapsed by default during reading.
- Introduce one concept at a time. Never surface multiple digestion prompts simultaneously.
- Section breaks are not arbitrary — they are working-memory resets. Each section should be sized so that a motivated reader can hold its key ideas in working memory while writing a digestion response.
- Loading states during AI calls should be calm and non-distracting — a simple spinner, not animated content that demands attention.
- Navigation complexity (breadcrumbs, subject trees, file lists) must not be visible during reading mode. Bring it back only when the user explicitly asks.
- Target section lengths of approximately 500–800 words — enough to develop a complete idea, small enough to remain in working memory.

---

## 3. Schema Theory

### How Knowledge Is Organized

Schemas are long-term memory structures — networks of related concepts built from past experience. First described by Frederic Bartlett in the 1920s and formalized in the 1970s through work by Marvin Minsky and Richard Anderson, schema theory explains why experts learn new information in their domain far faster than novices.

When new information arrives, the brain searches for an existing schema to attach it to. If a matching schema exists, encoding is fast and consolidation is efficient — the new fact rides on existing structure. If no schema exists, the brain must construct one from scratch, which is slower and more fragile.

This has a profound consequence: **what you already know determines how fast you can learn new things**. A gas station manager learning database normalization learns faster when examples use inventory tables, point-of-sale transactions, and fuel pricing — not abstract entities A, B, and C — because those connect to existing schemas.

A 2024 ResearchGate publication confirmed that schema theory has modern implications for learning, memory, and academic achievement, and that schema activation during instruction significantly improves comprehension and long-term retention.

### The Expert-Novice Gap

Experts don't have faster working memories. They have richer schemas that allow them to chunk information more aggressively — a chess grandmaster "sees" board positions, not individual pieces. This is why domain experts can absorb a dense paper in an hour while a novice struggles with the same material over a week.

### Design Implication

- When a user starts a new topic, the AI coach should ask priming questions before presenting content: "What do you already know about normalization? When have you seen data get messy in real life?" This activates prior schemas.
- The FTS5 vault search should surface related notes at gate prompts: "You wrote about foreign keys last week — how does this section on referential integrity connect?" This builds schema links explicitly.
- The system should use context from the user's subject profile to generate analogies. For Samieh: database tables → spreadsheet tabs at the store, primary keys → loyalty card numbers, normalization → eliminating redundant SKU entries across 50 locations.
- Teach-back (Feynman) sessions should be evaluated partly on whether the student makes connections to other topics in their vault — schema integration is the signal of genuine understanding.

---

## 4. Dual Coding Theory

### Verbal + Visual = Stronger Memory

Allan Paivio proposed in the late 1960s that the mind processes information through two distinct but interconnected channels: **verbal** (language, text, speech) and **nonverbal** (images, diagrams, spatial information). These channels have separate working memory buffers and separate long-term storage systems, but they communicate.

When information is encoded through both channels simultaneously, two separate memory traces are formed. Each trace provides an independent retrieval path. If one degrades, the other can still provide access. This roughly doubles retrieval reliability.

The cognitive theory of multimedia learning (Mayer, 2001, updated extensively through 2020s) operationalized this into design principles: text paired with a relevant diagram outperforms text alone, not because pictures are inherently better, but because they engage the separate nonverbal channel without consuming verbal working memory.

**The redundancy principle:** Reading text aloud while displaying the same text on screen is counterproductive — it forces both channels to process the same information, wasting capacity. The image should add meaning the text doesn't carry.

### Design Implication

- Mermaid diagrams in markdown are not decoration. They are dual-coding in practice. The AI coach should suggest when a concept would benefit from a diagram and offer to generate one.
- When a user completes a teach-back, prompt them to also draw a diagram: "Can you represent this as a flow chart or entity-relationship diagram?" This forces the nonverbal channel to encode the concept independently.
- Flashcards should support image attachments. A card with text + a relevant visual on the back encodes stronger than text alone.
- The reader should render mermaid diagrams inline, never behind a click. Separating the visual from the text that references it breaks dual coding by requiring the learner to hold the text in working memory while fetching the image.
- Quiz questions at higher Bloom's levels should sometimes ask learners to interpret a diagram rather than just recall text — this tests the nonverbal encoding directly.

---

## 5. Levels of Processing

### Depth Determines Durability

Craik and Lockhart's 1972 framework proposed that memory strength is not determined by how long you study something, but by how deeply you process it. They identified a continuum from shallow to deep:

1. **Structural/visual** — How does this word look? (shallowest; poor retention)
2. **Phonemic** — What does this word sound like? (shallow; better than structural)
3. **Semantic** — What does this word mean? How does it relate to other things I know? (deepest; strongest retention)

Craik and Tulving's 1975 experiments confirmed that semantically processed words were recalled far better than phonemically or structurally processed ones — even when participants spent the same total time studying. Time is not the variable. Depth is.

**Deep processing means:** connecting new information to existing knowledge, generating examples, explaining why something is true, making judgments about meaning. All of these force semantic engagement.

**Shallow processing means:** re-reading, copying text, reading aloud without reflection, highlighting. All of these can happen with zero semantic engagement.

### Design Implication

- Digestion gates are, at their core, a mechanism to force deep processing at the moment of reading. The gate prompt must require semantic engagement — not "what did this section say?" but "why does this make sense? Where have you seen this before? What would break if this weren't true?"
- Rotating gate prompt types (summarize, connect, predict, apply, contrast) ensures the learner cannot habituate to a single processing strategy.
- The gate should not accept responses that are clearly copied from the text. Surface matching is shallow. Paraphrase detection isn't the goal — but the AI evaluator should reward responses that make connections, generate examples, or express surprise.
- Flashcard questions should be written to demand semantic retrieval, not structural. Bad: "What is the definition of 3NF?" Good: "You have a table where a non-key attribute determines another non-key attribute. What normal form is violated and why does it cause problems?"

---

## 6. The Forgetting Curve and Spaced Repetition

### Ebbinghaus's Discovery

Hermann Ebbinghaus conducted a systematic self-study from 1880–1885, memorizing nonsense syllables and tracking retention over time. He found that forgetting follows an exponential decay curve: roughly 50% of new information is lost within an hour, 70% within 24 hours, and only about 25% is retained after a week without review.

The curve is not fixed. Each successful retrieval "resets" the curve at a higher baseline and slows the decay rate. The more times something has been successfully retrieved, the longer it takes to forget. This is the foundation of spaced repetition.

### The Spacing Effect

A meta-analysis by Cepeda et al. (2006) — the most comprehensive review of distributed practice — confirmed that spacing out learning episodes reliably improves recall across a wide range of materials, time scales, and populations. Spacing produces 10–30% better retention versus equivalent time spent in massed practice.

One study found spaced repetition can improve long-term retention by up to 200% compared to cramming when properly implemented.

**Optimal timing:** The key principle is to review material just before you would forget it — at the moment the trace is weakest but still retrievable. This creates the maximum retrieval effort (a desirable difficulty) and produces the maximum strengthening effect.

A research-supported schedule for a new item: review at 24 hours, then 3 days, then 7 days, then 14 days, then exponentially increasing intervals. Anki (SM-2) and FSRS both implement variations of this.

### Leitner System

The Leitner system is a mechanical implementation of spaced repetition using physical boxes (or their digital equivalent): cards in Box 1 are reviewed daily, Box 2 every few days, Box 3 weekly, and so on. Correctly answered cards move forward; incorrect cards return to Box 1. This approximates optimal spacing without requiring per-card memory modeling.

### Design Implication

- Every flashcard must track: ease factor, current interval, last reviewed date, and next due date. These fields are stored in the markdown file itself (as frontmatter or callout metadata) so they survive database loss.
- The SM-2 algorithm (already in `src/lib/sr.ts`) is the minimum viable implementation. FSRS is the target upgrade (see Section 17).
- The "due today" dashboard feature is not optional. Users must see what needs review without having to remember to check. Remove this friction entirely.
- Review sessions should be time-boxed, not card-count-boxed. "Study for 20 minutes" is cognitively safer than "do 50 cards" — the latter encourages rushing.
- New cards should be limited per session. Introducing too many new items at once creates interference. A cap of 20–30 new cards per session is standard in Anki research.
- The system should never surface a card before its due date just because the user asks. Premature review weakens the spacing effect.

---

## 7. The Testing Effect

### Retrieval Practice is the Most Powerful Study Technique

The testing effect (also called retrieval practice, active recall, or test-enhanced learning) is the most robust finding in applied memory research: **the act of retrieving information from memory strengthens that memory far more than re-studying the same material**.

Roediger and Karpicke's 2006 paper "The Power of Testing Memory" (Washington University) demonstrated that students who studied a passage and then took practice tests retained significantly more after a week than students who studied the passage repeatedly — even though students who restudied felt more confident.

Key findings from the literature:

- Retrieval practice produces >100% better long-term retention than restudying in some studies
- The benefit of testing over restudying is small or even reversed on immediate tests, but becomes large and durable over days and weeks — this is the "testing paradox"
- Repeated retrieval of the same item compounds the benefit: three retrieval attempts are significantly better than one
- The effect generalizes across age groups, subject domains, and question formats (free recall, cued recall, multiple choice, short answer)
- A 2025 ScienceDirect review confirmed that retrieval practice also improves the ability to apply and transfer complex educational concepts — not just recall facts

**The forward effect:** Testing on previously studied material also improves learning of new related material. Retrieval builds the schema framework that new information hooks into.

### Why It Works

Two mechanisms have been proposed:
1. **Elaborative retrieval:** When you reconstruct a memory, you must reactivate its context, connections, and meaning — reinforcing the deep semantic network around the fact.
2. **Error correction:** Failed retrieval attempts followed by feedback produce particularly strong encoding, because the mismatch between expected and actual answer creates a memorable event.

### Design Implication

- Quizzes are not assessments. They are the primary learning mechanism. Reframe all quiz UI language to reflect this.
- After a user completes a reading section and passes the digestion gate, the system should queue a quiz on that material for the following session — the one-day delay is important. Immediate quizzing (same session) produces weak effects.
- Flashcard reviews are retrieval practice. The system should not show the answer before the user has attempted recall. Even if the user says "I don't know," prompt one more attempt: "Take a guess. Wrong answers still help."
- The AI should never just tell the user the answer when they're struggling. It should scaffold: "What do you remember about why rows get duplicated? Start there."
- Multiple-choice questions should be designed carefully: plausible distractors are required. Recognition with no confusion is shallow retrieval. The distractor should represent a common misconception.
- Free-recall questions ("Explain X in your own words") produce stronger effects than multiple choice but are harder to evaluate. Use AI to evaluate free-recall responses and score them against a rubric.

---

## 8. Desirable Difficulties

### The Core Idea (Robert Bjork, UCLA)

Robert Bjork coined the term "desirable difficulties" to describe training conditions that appear to impede performance during learning but yield greater long-term retention and transfer than easier conditions.

The key insight is that **performance during practice is a terrible predictor of long-term learning**. A student who re-reads a chapter can recall it perfectly ten minutes later. A student who struggled through retrieval practice may recall less immediately — but will retain dramatically more a week later.

The four well-established desirable difficulties are:

1. **Spacing** — Distributing practice over time (Section 6)
2. **Interleaving** — Mixing different topics or problem types (Section 10)
3. **Testing/Retrieval** — Forcing recall instead of re-exposure (Section 7)
4. **Generation** — Producing answers before seeing them (Section 9)

These are "desirable" specifically because the difficulty serves the learning goal. Undesirable difficulties — confusing explanations, poor interface design, unclear instructions — impede performance without producing learning benefits.

### The Feeling of Difficulty is a Feature

Students using effective study methods typically feel like they're learning less than students using ineffective methods. Re-reading feels productive. Flashcard review feels hard. This metacognitive illusion (Section 14) means that learner confidence is inversely correlated with actual learning when effective methods are used.

This is a serious UX problem: an app that makes learning feel harder will be rated worse by users even if it produces better outcomes. Encode must communicate the science of difficulty explicitly and consistently.

### Design Implication

- Every digestion gate and quiz session should include a brief message about why the difficulty is the point — not a lengthy lecture, but one sentence: "Struggling to recall this is making it stick."
- The "fluency illusion" trap: if a flashcard is consistently answered correctly, increase difficulty before retiring it. Easy correct answers produce less learning than hard correct answers.
- Do not add a "skip" button to digestion gates. The friction is the product.
- Never show the correct answer immediately after a flashcard. Force the attempt, show the answer, ask for self-rating. The self-rating itself is a processing step.
- Progress indicators should show long-term retention health, not just session completion. A learner who found a session easy should see that their retention estimate is high — but also that the next review is scheduled farther out, reducing review burden over time.

---

## 9. The Generation Effect

### Producing Beats Consuming

The generation effect is the finding that information generated by the learner is remembered substantially better than the same information simply read. A meta-analysis across 86 studies found an effect size of d = 0.40 in favor of generation over reading — almost half a standard deviation improvement in retention.

Practically: retention improves by 30–50% when learners generate content rather than consuming pre-made materials.

**This effect holds even when the generated answer is wrong.** Producing an incorrect answer, then receiving correct feedback, produces stronger encoding than being told the correct answer from the start. The prediction error creates a memorable event.

**Why it works:** Generation requires deep semantic processing (see Section 5). You cannot generate an answer through shallow processing. You must access and manipulate meaning.

**Summarization research (2024):** A study published in Frontiers in Psychology found that students who wrote summaries during pauses in a multimedia lesson significantly outperformed students who passively received the lesson on post-tests. Drawing did not produce the same benefit — the verbal generation was the active ingredient.

### Design Implication

- Digestion gate responses are generation events. The gate must require the user to produce text, not select from options. Even a forced multiple-choice digestion prompt would be inferior to free-text generation.
- The system should prompt generation before revealing information: "Before you read this section on BCNF, predict: what limitation of 3NF do you think it addresses?" This primes encoding and creates a prediction error that strengthens learning when the section confirms or corrects the prediction.
- Teach-back sessions are the highest-intensity generation activity in the app. They should be treated as core, not supplementary.
- "Pre-testing" — testing learners on material they haven't seen yet — is a validated generation technique. Encode could show quiz questions about a topic before presenting the content, then revisit them after. The initial failure primes the subsequent encoding.
- Never auto-fill, autocomplete, or summarize content for the user. Every time the system generates text that the user would have generated, it steals a learning opportunity.

---

## 10. Interleaving

### Mixing Problems Beats Blocking

Blocked practice means studying all examples of Type A, then all of Type B, then all of Type C. Interleaved practice means mixing A, B, and C throughout the session.

Blocked practice feels easier and produces better performance during practice. Interleaved practice feels harder, performs worse during practice, and produces dramatically better performance on delayed tests.

**Effect sizes from research:**
- Mathematics: Interleaved vs. blocked produced test scores of 72% vs. 38% (d = 1.05) in one study
- Meta-analysis across multiple studies: overall pooled effect size g = 0.42 (p = 0.001)
- Physics: median improvement of 50–125% on novel transfer problems after interleaved practice

**Why interleaving works:** Blocked practice lets learners apply the same strategy repeatedly — they don't have to identify which strategy to use. Interleaving forces learners to (a) identify the problem type, (b) select the appropriate approach, and (c) execute it. Steps (a) and (b) are exactly what real-world problem-solving requires, and they're never practiced during blocked study.

**Important caveat:** Interleaving is not additive with spacing. Research suggests that maximally interleaved and maximally spaced practice can interfere with each other. The interaction is complex. In practice: interleave within sessions, space sessions.

### Design Implication

- Flashcard review sessions should interleave across subjects and topics, not review all cards from one topic in sequence. The default sort should be randomized by due date, not grouped by subject.
- Quiz sessions for a subject that has multiple chapters should pull questions from all chapters, not just the most recent one. This is the most important quiz design decision in the app.
- The AI quiz generator should be instructed to mix question types (recall, application, analysis) and vary topics within a session, not cluster similar questions together.
- When the vault has multiple subjects active, the daily review session could optionally interleave across subjects. This should be a configurable preference (some users want subject isolation, especially when cramming for a single exam).
- The SM-2/FSRS scheduler already produces some interleaving naturally because cards from different topics come due at different times. Don't override this by grouping.

---

## 11. Elaborative Interrogation and Self-Explanation

### Asking "Why" Forces Deeper Processing

Elaborative interrogation involves prompting learners to explain why a fact is true: "Why does this make sense?" "Why is this statement correct?" This simple technique forces semantic processing by requiring learners to connect new facts to existing knowledge.

Self-explanation is similar but more open-ended: learners explain their own reasoning or understanding as they work through material. Research suggests self-explanation may be slightly more powerful because it can surface more types of knowledge gaps.

**Key findings from Dunlosky et al.'s 2013 comprehensive review** of 10 study techniques (one of the most cited papers in educational psychology):
- Elaborative interrogation received a "moderate utility" rating — not top tier, but well above low-utility techniques like highlighting
- Self-explanation also received "moderate utility"
- Both techniques are more effective when learners have some prior knowledge — novices with zero background struggle to generate meaningful explanations

**The prior knowledge dependency:** If a learner has no schema to connect to, elaborative interrogation produces shallow responses that don't aid retention. This is why gate prompts should not be triggered immediately on unfamiliar material — some exposure is needed first.

### Design Implication

- Digestion gate prompts should include "why does this make sense?" as one of the rotating prompt types.
- The AI coach's feedback on digestion responses should evaluate whether the learner connected the new content to prior knowledge — not just whether they summarized accurately.
- For topics where the user has related notes in the vault, the gate prompt should surface a relevant connection: "You have a note about Entity-Relationship diagrams. How does what you just read about primary keys relate to that?"
- The system should not trigger a "why" gate prompt on the very first section of a brand-new topic. Allow one section of orientation before demanding elaboration.
- Self-explanation during teach-back (Feynman sessions) should be evaluated by the AI for whether the explanation reveals gaps — not just whether it's fluent.

---

## 12. The Feynman Technique

### How It Works

Richard Feynman, Nobel Prize-winning physicist, developed his learning approach from the belief that if you cannot explain something simply, you do not understand it. The technique has four steps:

1. **Choose a concept** and write its name at the top of a page
2. **Explain it as if teaching a 12-year-old** — avoid jargon, use simple language and concrete examples
3. **Identify the gaps** — wherever your explanation breaks down or becomes vague, you have found a knowledge gap
4. **Return to the source material** to fill the gap, then simplify again

The technique is powerful because it exploits the generation effect (Section 9), forces deep semantic processing (Section 5), and systematically surfaces metacognitive gaps (Section 14) in a way that passive study never does.

**Evidence for effectiveness:** The technique is described as "twice as effective as traditional learning methods" in multiple educational sources due to its active engagement demands. While controlled RCTs specifically on the Feynman technique are limited, it maps directly onto the self-explanation effect and the generation effect, both of which have strong RCT support.

**The simplicity requirement is the mechanism.** Jargon lets learners feel they understand without actually understanding. Forcing plain language bypasses this. You cannot fake a simple explanation of a concept you don't understand.

### Design Implication

- Teach-back sessions in Encode are the digital implementation of the Feynman technique. They are not optional extras — they are the highest-integrity learning mechanism in the app.
- The teach-back prompt should always specify a concrete, simple audience: "Explain this to a new employee at a convenience store who has never heard of databases."
- The AI evaluator should check for: (a) accuracy, (b) simplicity (penalize unexplained jargon), (c) concrete examples, (d) gap identification — places where the explanation becomes vague or contradictory.
- After AI evaluation, the system should highlight exactly where the explanation broke down: "Your explanation of functional dependency was clear, but you described foreign keys as 'linking tables' without explaining what they link or why that matters."
- Teach-back sessions should be saved as teach-back markdown files in the vault, with the AI evaluation appended. Future teach-backs on the same topic can compare to previous attempts — showing growth.
- The system could gamify (appropriately — see Section 19) teach-back quality by showing a "simplicity score" — not points, but a metric showing how jargon-free the explanation was.

---

## 13. Bloom's Taxonomy

### The Six Levels of Cognitive Complexity

Benjamin Bloom's 1956 taxonomy (revised in 2001 by Anderson and Krathwohl) organizes learning objectives into six levels of increasing cognitive complexity:

| Level | Verb Form | Cognitive Operation |
|-------|-----------|---------------------|
| 1. Remember | Recall, List, Define, Identify | Retrieve from long-term memory |
| 2. Understand | Explain, Summarize, Classify, Compare | Construct meaning from information |
| 3. Apply | Use, Solve, Execute, Implement | Use procedures in given situations |
| 4. Analyze | Differentiate, Organize, Attribute, Break down | Break into parts, find relationships |
| 5. Evaluate | Critique, Judge, Assess, Justify | Make judgments based on criteria |
| 6. Create | Design, Construct, Produce, Develop | Put elements together into new whole |

Each level builds on the ones below it. You cannot reliably evaluate without first being able to analyze. You cannot apply without first understanding.

**Revised Taxonomy changes (2001):** The original used nouns (Knowledge, Comprehension, Application, Analysis, Synthesis, Evaluation). The revision uses action verbs and swaps "Synthesis" and "Evaluation" order, placing "Create" at the apex. This matters because the verb form makes it easier to write assessable learning objectives.

### Question Stems by Level

**Level 1 (Remember):** What is...? List the steps of...? When did...? Who was...? Define...

**Level 2 (Understand):** Explain in your own words... How would you describe...? What is the main idea of...? Compare X and Y...

**Level 3 (Apply):** Given this scenario, how would you...? Solve this problem using...? What happens when you apply X to Y?

**Level 4 (Analyze):** What are the components of...? How does X influence Y? What evidence supports...? Break down...

**Level 5 (Evaluate):** Do you agree with...? What is the best...? Justify your choice of...? Critique this approach...

**Level 6 (Create):** Design a system that...? Propose a solution for...? What would you create if...? How would you reorganize...?

### Progression Strategy

Do not jump levels. A learner who cannot recall the definition of referential integrity should not be given an Evaluate-level question about whether a database design violates it. The system should:

1. Track performance at each Bloom level per topic
2. Target quiz generation at one level above the highest level with >70% accuracy
3. Only unlock higher levels after demonstrating consistent competence at the current level

### Criticisms and Limits

Bloom's has critics. The taxonomy implies a strict hierarchy that doesn't always hold — some research suggests that creative tasks can sometimes scaffold recall better than drilling recall directly. The revised taxonomy is not universally adopted. For practical app design, the taxonomy's value is as a **vocabulary and sequencing tool**, not as a rigid psychological law.

### Design Implication

- Every quiz question should have an associated Bloom level (1–6) stored in its metadata.
- The quiz generator prompt to the AI should specify a target Bloom level based on the adaptive difficulty system.
- The adaptive system (in `quiz_history` SQLite table) should track per-subject, per-Bloom-level performance and automatically target questions at the appropriate level.
- Bloom level 1–2 questions are appropriate for immediately after reading (testing basic encoding). Levels 3–4 are appropriate for second and third review sessions. Levels 5–6 are appropriate for mastery assessments.
- Flashcards should have a Bloom level field. Level 1 cards (pure recall) should graduate to higher-level cards as the user masters them.
- Teach-back sessions should be scored partly on Bloom level — an explanation that only recalls facts scores lower than one that applies or analyzes them.
- Digestion gate prompts should cycle through Bloom levels: "Summarize" (Level 2), "Apply this to your work context" (Level 3), "What assumption does this section make?" (Level 4), "Is this approach optimal?" (Level 5).

---

## 14. Metacognition

### Thinking About Your Own Thinking

Metacognition is the ability to monitor and regulate one's own cognitive processes — to know what you know, know what you don't know, and adjust study behavior accordingly. It has two components:

- **Metacognitive knowledge** — Beliefs about how your memory works, which study strategies are effective, your own strengths and weaknesses
- **Metacognitive regulation** — Planning (choosing strategies), monitoring (tracking understanding during study), evaluating (assessing outcomes)

Research consistently shows that learners with strong metacognitive skills significantly outperform those without, even when controlling for prior knowledge.

### The Illusion of Competence

The illusion of competence is the most dangerous failure mode in self-directed learning: feeling like you understand something when you don't.

**How it happens:**
- Re-reading creates familiarity, which the brain misinterprets as understanding
- Highlighting creates the physical sensation of doing something, which feels like learning
- Seeing the correct answer on a flashcard feels like knowing it would have come to you
- Fluent reading (not having to pause and decode) signals comprehension even when none occurred

A 2023 ResearchGate paper found that students' confidence in their knowledge was inversely calibrated with actual test performance when using passive strategies — they felt most confident using the methods that worked least well.

**The calibration problem:** Judments of learning (JOLs) made while studying are systematically biased by cues that have nothing to do with actual memory strength — familiarity, fluency, and physical proximity to the material. A student who can see their notes believes they know what's in them. Remove the notes and performance collapses.

### Fixing Calibration

Research identified two effective interventions:
1. **Mnemonic-based procedures** — forcing learners to use only what's in memory (no notes, closed book) before rating their confidence
2. **Theory-based procedures** — explicitly teaching learners how memory works so they understand why familiarity ≠ knowledge

Both approaches produced "mended metacognitive illusions" — better calibration between confidence and actual performance.

### Design Implication

- Encode's entire architecture is a metacognitive calibration machine. Every gate, every quiz, every flashcard self-rating is a forced calibration event.
- Confidence ratings on flashcards (Again / Hard / Good / Easy) are not preferences — they are calibration practice. The UI should make this explicit.
- After quiz results, show the learner their predicted score vs. actual score. If they expected 90% and got 60%, this is the most important learning event of the session. Do not bury it.
- The system should periodically show learners their calibration trend: "Over the last month, you rated cards 'Easy' but then failed them on next review 40% of the time. Your hardest category to self-assess accurately is SQL joins."
- Never let users "check" an answer before attempting recall. The option to peek destroys the calibration feedback.
- Teaching users explicitly about the forgetting curve and the testing effect (brief tooltips, onboarding) is itself an evidence-based intervention. Users who understand why the app works the way it does cooperate with it more effectively.

---

## 15. What Doesn't Work

### Highlighting and Underlining

Classified as a "low utility" study strategy by Dunlosky et al.'s comprehensive 2013 review. A 2013 Harvard study confirmed that highlighting is essentially re-reading with a colored marker — it adds no semantic processing. The physical act of highlighting creates false mastery — the brain records "I've engaged with this" without any meaningful encoding occurring.

When highlighting does appear in the text, it signals to the brain that the content has already been processed, reducing the probability of a second, deeper engagement.

**Design implication:** Encode's reader should not provide a highlighting feature. This is not an omission — it is a deliberate, evidence-based decision. If users request it, the response is: "Highlighting creates an illusion of learning without the reality. We don't support it by design."

### Re-reading

Re-reading produces fluency — the text becomes easier to process — which the learner misinterprets as understanding. Dunlosky et al. rated re-reading as "low utility." The time cost is high and the learning gain is minimal beyond the first reading.

**Design implication:** The reader should not make it trivially easy to scroll back through completed sections. Returning to a section should require a deliberate navigation action, not accidental scrolling. After a gate is passed, the gate response is appended to the file — this serves as a summary, reducing the temptation to re-read.

### Cramming (Massed Practice)

Cramming works for immediate recall. Information crammed the night before an exam can be retrieved that morning. The same information is largely gone within 48–72 hours. Cramming stores information in working memory, not long-term memory. It produces high confidence and poor long-term retention — the worst possible combination for actual learning.

Research shows students who space their studying score higher on assessments given weeks after the initial learning than students who cram, even when total study time is equal.

**Design implication:** Encode should not support "cram mode" or "review everything tonight." The closest acceptable feature is an emergency review that shortens intervals temporarily — but it should display a warning: "This will work tonight. Plan a full review cycle starting tomorrow or you'll lose this material."

### Passive Video Watching

Watching a lecture video without pausing, rewinding with purpose, or taking active notes produces learning outcomes close to zero for complex material. The learner feels engaged (the video is interesting) while encoding almost nothing. This is passive re-exposure, not retrieval.

**Design implication:** The import feature can accept video transcripts or web articles. When video content is imported, the system should prompt the learner to add their own notes before reading mode begins: "You've imported this video transcript. Before reading, write one sentence about what you expect to learn."

### Multitasking During Study

Multitasking splits attentional resources, reducing working memory capacity available for the study task. Research confirms that focused study is substantially more effective than distracted study. The damage is not just additive — switching between tasks has a residual attention cost that persists for minutes after the switch.

**Design implication:** Encode's reader mode should be full-screen capable, with all notifications suppressed. The app should track and display focused reading time (time without switching away) as a quality metric, not total time spent.

---

## 16. Emotion, Motivation, and Memory Encoding

### The Amygdala Effect

Emotional arousal during or immediately after learning significantly enhances memory consolidation. The mechanism involves the amygdala (the brain's emotional processing center), which modulates memory storage in the hippocampus when activated by emotional significance.

A 2017 Frontiers in Psychology review confirmed: emotional activation before, during, or shortly after learning enhances memory. Arousal promotes encoding strength and accelerates consolidation.

This is why you remember where you were on significant news events but forget what you had for breakfast three Tuesdays ago. Emotion is the brain's salience signal — it flags events as worth remembering.

**Valence matters less than arousal:** Both positive and negative emotional arousal enhance memory. Stress enhances memory of studied material (within limits — extreme stress impairs learning). Mild anxiety about an upcoming quiz is not a bug; it's a feature.

**Motivation and dopamine:** High motivation (intrinsic, goal-directed) triggers dopamine release, which acts as a memory modulator distinct from the amygdala pathway. Both pathways strengthen encoding, but dopamine-mediated enhancement is particularly important for procedural learning and skill acquisition.

### Emotional Salience and Relevance

Information that connects to personal goals, fears, or aspirations is processed as emotionally salient, even if it's abstract. This is why analogies to personally relevant contexts (gas station management, inventory systems, customer loyalty data) improve learning for Samieh — they activate emotional salience networks that pure academic examples do not.

### Design Implication

- The AI coach should consistently use real-world analogies from the user's professional context. For Samieh: every database concept should have a convenience store / fuel management analog.
- The subject profile (`_subject.md`) should store user context (job, background, goals) that the AI uses for analogy generation. This is not personalization for its own sake — it's activating emotional salience networks.
- Mild stakes create appropriate arousal. The teach-back and quiz evaluation should feel like a real assessment, not a casual game. Don't strip all pressure from the experience.
- The "One Thing" daily commitment feature (daily commitment notes) is a motivation anchor. Users who connect their study session to a concrete daily goal study more effectively than those with no declared purpose.
- Avoid designing the system to feel emotionally flat. A well-crafted gate prompt that challenges the learner ("You just read that 3NF eliminates transitive dependencies — can you construct a counterexample where that logic fails?") creates appropriate arousal. Generic prompts ("Summarize what you just read") create none.

---

## 17. FSRS — The Modern Spaced Repetition Algorithm

### Why FSRS Replaces SM-2

SM-2 (the algorithm behind classic Anki and the initial Encode implementation) was designed by Piotr Wozniak in the late 1980s. It uses a simple formula where interval multipliers are determined by a per-card ease factor. SM-2 was a major advance over no scheduling at all, but it has known limitations: the ease factor can spiral downward ("ease hell"), early review sessions produce poor estimates, and the algorithm doesn't model individual learner memory patterns.

**FSRS (Free Spaced Repetition Scheduler)** was developed by Jarrett Ye and is now the default algorithm in Anki. It is based on the **Three Component Model of Memory**:

1. **Retrievability (R)** — The probability of successfully recalling an item right now
2. **Stability (S)** — How long it takes for retrievability to decay from 100% to 90% (a measure of how "set" the memory is)
3. **Difficulty (D)** — A per-card difficulty parameter that modulates how stability grows with each review

FSRS uses machine learning trained on large-scale user review data to optimize parameters. The algorithm learns individual memory patterns and adjusts intervals accordingly.

**Benchmark results (2024 research):**
- FSRS achieves an 89.6% success rate in predicting recall
- SM-2 achieves only a 47.1% success rate
- FSRS users can expect 20–30% fewer reviews to achieve the same retention level

### Practical Difference

SM-2 treats all cards of the same ease factor identically. FSRS tracks the stability of each card's memory trace — a concept that was reviewed at the ideal time has a higher stability than one that was reviewed too early. This means FSRS schedules later reviews more accurately and avoids the "review treadmill" where cards keep coming back without the intervals lengthening appropriately.

### Design Implication

- The `src/lib/sr.ts` SM-2 implementation should be treated as a placeholder. FSRS should be the target algorithm.
- FSRS parameters can be seeded with community defaults and updated through a calibration phase as the user builds review history.
- The FSRS Three Component Model maps directly to the flashcard frontmatter: store `stability`, `difficulty`, and `retrievability` alongside the existing `ease`, `interval`, `next`, and `last` fields.
- Displaying the "predicted retrievability" for a card at the time of review (e.g., "You have a ~75% chance of recalling this") is a metacognitive tool that helps learners calibrate (Section 14).
- Long-term: if the FSRS open-source parameters can be personalized from review history, Encode should do this — it's the closest thing to a scientifically optimal review schedule.

---

## 18. AI-Assisted Learning — What the Research Says

### What Works

A 2025 randomized controlled trial found AI tutoring outperformed in-class active learning with an effect size of 0.73–1.3 standard deviations — a large effect by any standard. Across studies, students in AI-powered environments achieve 30–54% better outcomes on standardized measures.

**Effective AI use cases in learning:**
- **Personalized feedback on open-ended responses** — AI can identify gaps in a learner's explanation that a multiple-choice test cannot surface
- **Adaptive difficulty** — Adjusting question complexity in real-time based on performance
- **Elaborative scaffolding** — Asking follow-up questions rather than simply confirming answers
- **Analogy generation** — Connecting abstract concepts to the learner's existing knowledge and context
- **Error correction with explanation** — Not just "wrong" but "wrong because..."

**What AI should not do:**
- Replace the generative effort of the learner (providing summaries, writing explanations for them)
- Create false confidence through excessive praise
- Answer direct knowledge questions without first prompting a recall attempt

A systematic review (ScienceDirect, 2025) found that AI feedback is most effective when it is: (a) immediate, (b) specific to the learner's actual response rather than generic, (c) explanatory rather than evaluative, and (d) scaffolded — increasing in detail only when simpler hints fail.

### Important Limitations

Traditional discussion-based learning and teacher-student interaction remain superior for developing deep critical thinking and analytical skills. AI should complement structured learning, not replace deliberate practice.

The risk of AI dependency: if the system answers questions before the learner attempts retrieval, it eliminates the most valuable learning event.

### Design Implication

- The AI coach operates under a strict rule: **never answer a knowledge question without first asking the learner to attempt it**. The coach is a Socratic interlocutor, not a search engine.
- AI feedback on digestion gate responses should be structured: (1) What you got right, (2) What was missing, (3) One question to deepen the connection. Not a grade. Not a score.
- The AI should vary its feedback style based on Bloom level of the response: a Level 2 (understand) response should be pushed toward Level 3 (apply): "Good summary — now where would you use this in a real system?"
- When AI is unavailable (Ollama down, no API key), Encode must still function. All gate, flashcard, and quiz mechanisms should work without AI — AI just adds the coaching layer.
- AI evaluation should never be the only feedback. The learner's self-rating (Did I know this? Do I feel confident?) should always be captured alongside AI assessment.

---

## 19. Gamification — When It Helps vs. Hurts

### The Evidence

Gamification in educational contexts has a complex, nuanced research record.

**When it helps:**
- Short-term engagement and motivation — particularly for learners who were disengaged or bored
- When learners have autonomy over participation (opt-in elements)
- When game elements support competence, autonomy, and relatedness (Self-Determination Theory)
- When the game mechanic directly reflects the learning structure (e.g., leveling up in a topic maps to Bloom's level progression)

**When it hurts:**
- Long-term: the novelty effect wears off within weeks; intrinsic motivation may actually decrease
- Leaderboards create embarrassment for lower-performing learners
- Points and badges shift focus from learning to reward-seeking
- Extrinsic rewards can undermine pre-existing intrinsic motivation (the "overjustification effect")

A meta-analysis found gamification enhances perceived autonomy and relatedness but has minimal impact on actual competency. The effects on learning outcomes are weak and inconsistent.

**The critical finding:** Gamification that feels arbitrary (badges for logging in, points for time spent) is actively harmful. Gamification that reflects real progress in the domain (a "3NF mastery" badge unlocked after demonstrating consistent performance at Bloom Level 3 on normalization questions) can reinforce intrinsic motivation.

### Why Encode's CLAUDE.md Says No Gamification

The decision to exclude points, badges, XP, and leaderboards is evidence-based. These elements would shift learner attention from the quality of understanding to the accumulation of external rewards — precisely the opposite of what deep learning requires. The app should make the learner feel competent because they are competent, not because they accumulated points.

### Design Implication

- No points, no badges, no XP, no leaderboards. This is a hard line.
- **Allowed:** Progress indicators that reflect genuine knowledge state — "Your 3NF retention health is 84%", "You've reviewed this topic at Bloom Level 4", "You have 12 cards due for first review"
- Streak tracking (days of continuous review) is borderline. Research suggests streaks can increase engagement but become a source of anxiety when broken. If implemented, streaks should be forgiving (one missed day doesn't break the streak) and framed positively.
- The clearest acceptable "game" element is the Bloom level progression — showing learners concretely that they've moved from recall to application to analysis on a topic. This reflects actual cognitive growth and is intrinsically motivating because it's real.
- Celebrating genuine milestones is appropriate: "You've now seen this concept enough times that your predicted retention in 60 days is above 90%." That's a real achievement worth marking.

---

## 20. Concept Mapping and Knowledge Graphs

### What the Research Shows

Concept mapping — creating visual representations of how concepts relate — has a statistically significant positive effect on learning and retention compared to note-taking or reading alone. Research confirms that students who construct concept maps during or after learning show better mastery and recollection of material.

The mechanism: concept mapping forces learners to explicitly identify relationships between concepts — a demanding semantic processing task (Levels of Processing, Section 5). It also activates the nonverbal channel (Dual Coding, Section 4) and requires the learner to impose structure on loosely connected information (schema building, Section 3).

**Knowledge graphs in education (2024 systematic review, PMC):** Educational knowledge graphs (EKGs) with prerequisite relations significantly improve learning outcomes by giving students structured paths through a knowledge domain and highlighting which concepts must be understood before others. Students who study in prerequisite order (as determined by EKG) have better success rates than those who study in arbitrary order.

**Important limitation:** Students must have relevant prior knowledge for concept mapping to be effective. Complete novices generating concept maps produce low-quality maps that can actually reinforce misconceptions.

### Design Implication

- Mermaid diagrams in vault files serve as concept maps. The reader renders them inline, supporting dual coding.
- The AI coach should suggest concept mapping when a user is struggling to connect multiple ideas: "It sounds like you're trying to hold several related concepts simultaneously. Would you like to sketch a diagram showing how normalization forms relate to each other?"
- The `maps/` directory in the vault structure is designed for Mermaid concept map files. These should be surfaced in the UI as a dedicated view — not buried.
- When a learner completes a chapter, optionally prompt: "Try drawing a concept map of the key ideas in this chapter before your next review session." This is a high-quality generation activity.
- The FTS5 search across the vault functions as a lightweight knowledge graph — surfacing connections across notes that the learner may not have made explicitly. This should be used actively at gate prompts to surface related content.

---

## 21. Practical Synthesis — How Encode Should Work

This section consolidates the research into a concrete design philosophy for Encode.

### The Learning Loop

The evidence points to a single optimal learning loop, repeated at appropriate intervals:

```
ENCOUNTER (deep) → GENERATE → VERIFY → SPACE → RETRIEVE → GENERATE → VERIFY → SPACE → ...
```

In Encode's language:
```
READ SECTION (deep processing) → DIGESTION GATE (generation) → AI FEEDBACK (verification)
→ WAIT (spacing) → QUIZ (retrieval) → TEACH-BACK (generation + analysis)
→ AI EVALUATION (verification) → FLASHCARD REVIEW (spaced retrieval) → ...
```

Every feature should slot into this loop. Features that don't belong in the loop — analytics dashboards, social features, cosmetic customization — are distractions.

### Priority Ranking of Learning Mechanisms (by evidence strength)

| Rank | Mechanism | Effect Size | Encode Feature |
|------|-----------|-------------|----------------|
| 1 | Retrieval Practice | Large (d > 1.0 in some studies) | Flashcards, Quizzes |
| 2 | Spaced Repetition | Large | SR scheduler, due-today queue |
| 3 | Generation Effect | Medium (d = 0.40) | Digestion gates, Teach-back |
| 4 | Interleaving | Medium (g = 0.42) | Mixed-topic quiz sessions |
| 5 | Elaborative Interrogation | Moderate | Gate prompt types |
| 6 | Dual Coding | Moderate | Mermaid diagrams inline |
| 7 | Teach-back / Feynman | Moderate (maps to self-explanation) | Teach-back sessions |
| 8 | Concept Mapping | Moderate | maps/ directory, diagram prompts |

### Gates That Actually Work

Based on the research, a digestion gate is effective when it:

1. **Requires generation** (free text, not selection)
2. **Demands semantic processing** (not "what did you read" but "why does this matter, how does it connect, what would break")
3. **Rotates prompt type** to prevent habituation (summarize → connect → predict → apply → contrast)
4. **Uses context from the vault** to surface relevant prior knowledge
5. **Provides specific, elaborative feedback** (not "good job" but "your connection to foreign keys was correct; you missed that cascade delete is a referential integrity mechanism")
6. **Is timed appropriately** — triggered at natural section boundaries, not arbitrary word counts

### Timing Guidelines

| Event | Optimal Timing |
|-------|----------------|
| First review after reading | 24 hours later |
| Second review | 3 days after first |
| Third review | 7 days after second |
| Subsequent reviews | FSRS-determined (exponentially growing) |
| Quiz after new chapter | Next study session (not same session) |
| Teach-back | After at least 2 review cycles |
| Pre-test before new chapter | Immediately before reading |

### Measuring Real Understanding (Not Just Recognition)

Recognition (can identify the correct answer from options) is the weakest form of knowing. Genuine understanding is measured by:

1. **Transfer** — Can the learner apply the concept in a novel context?
2. **Generation** — Can the learner reconstruct the concept from scratch without cues?
3. **Teach-back quality** — Can the learner explain it simply and accurately to a novice?
4. **Error detection** — Can the learner identify when the concept is being misapplied?
5. **Cross-domain connection** — Can the learner link the concept to related ideas in their vault?

Bloom's Levels 3–6 map to these capabilities. Encode's quiz system should track performance at each level and report which levels the learner genuinely controls.

### The Anti-Pattern Checklist

Before shipping any feature, check against these:

- Does this feature allow passive engagement? (If so, remove the passive path)
- Does this feature create a "feeling of learning" without actual encoding? (highlighting, re-reading, just-in-time answers)
- Does this feature interrupt spacing? (study everything before the due date)
- Does this feature provide the answer before the learner attempts recall?
- Does this feature add cognitive load to the reading environment? (extraneous load)
- Does this feature reward time-on-platform rather than quality of engagement?

Any "yes" is a red flag. The feature either needs redesign or removal.

---

## References and Sources

The following sources were consulted in preparing this document:

- Cepeda, N.J. et al. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin*, 132(3), 354–380.
- Cowan, N. (2001). The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1), 87–114.
- Craik, F.I.M., & Lockhart, R.S. (1972). Levels of processing: A framework for memory research. *Journal of Verbal Learning and Verbal Behavior*, 11(6), 671–684.
- Dunlosky, J., Rawson, K.A., Marsh, E.J., Nathan, M.J., & Willingham, D.T. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest*, 14(1), 4–58.
- Roediger, H.L., & Karpicke, J.D. (2006). The power of testing memory. *Perspectives on Psychological Science*, 1(3), 181–210.
- Roediger, H.L., & Karpicke, J.D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, 17(3), 249–255.
- Bjork, R.A. (ongoing). Research on desirable difficulties, spacing, and interleaving. UCLA Bjork Learning and Forgetting Lab.
- Firth, J. et al. (2021). A systematic review of interleaving as a concept learning strategy. *Review of Education*, 9(3), 643–684.
- Ye, J. (2022–2024). FSRS: Free Spaced Repetition Scheduler. Open-source algorithm; benchmark data from expertium.github.io.
- Paivio, A. (1969–1986). Dual coding theory. University of Western Ontario.
- Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257–285.
- PMC review on AI-assisted feedback in education (2025): ScienceDirect, doi:10.1016/j.caeai.2025
- Rouder, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science*, 35(6), 481–498.
- Bartlett, F.C. (1932). *Remembering: A Study in Experimental and Social Psychology*. Cambridge University Press.
- PMC Frontiers in Psychology (2017): The Influences of Emotion on Learning and Memory. doi:10.3389/fpsyg.2017.01454
- Cohort Study on Anki (2023): Medical Science Educator, doi:10.1007/s40670-023-01826-8
- Generation effect meta-analysis: Slamecka & Graf (1978) + updated meta-analysis d = 0.40 across 86 studies.
- PMC Challenging Cognitive Load Theory (2025): doi:10.3390/educsci11030144

---

*This document is a living reference. Update it as new research emerges and as Encode's features are tested against real learner behavior. The goal is not theoretical completeness — it is building a system that works.*
