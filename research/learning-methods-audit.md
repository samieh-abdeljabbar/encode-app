# Learning Methods Audit: What Encode Has, What Science Says, What's Missing

*Generated 2026-03-23 from codebase analysis + web research across 100+ scientific sources*

---

## Part 1: Rating Every Learning Method Currently in Encode

Each method rated 1-10 based on: scientific evidence strength, effect size, implementation quality in the app, and how well it serves the core study loop.

### Tier S: The Foundation (9-10/10)

#### 1. Spaced Repetition via FSRS — 10/10
- **Science:** Dunlosky et al. (2013) rates distributed practice "High Utility." Meta-analysis of 242 studies (169,179 participants): d = 0.56. Bjork meta-analysis of 254 studies: 10-30% better retention. FSRS specifically achieves 89.6% recall prediction accuracy vs SM-2's 47.1%, with 30% less review time for the same retention.
- **Implementation:** Full FSRS-5 algorithm in `src/lib/sr.ts`. Three Component Model (Retrievability, Stability, Difficulty). SM-2 migration path. Four rating buttons (Again/Hard/Good/Easy). Both DB and markdown updated on review.
- **Why 10/10:** This is the single most evidence-backed learning technique in cognitive science, and Encode uses the current state-of-the-art algorithm. The combination of retrieval practice + optimal spacing ("successive relearning") produces 75% retention at 1 year and 60% at 5 years in controlled studies.
- **Sources:** Dunlosky et al. 2013; Cepeda et al. 2006; Karpicke & Roediger 2008; FSRS benchmark (open-spaced-repetition/srs-benchmark)

#### 2. Retrieval Practice via Flashcards — 9/10
- **Science:** Meta-analysis (Adesope et al. 2017): g = 0.61. Rowland (2014): g = 0.50. Students using active recall remember 57% vs 29% for passive reading. 272 independent effect sizes found mean effect of 0.74.
- **Implementation:** Full flashcard system in `src/pages/Flashcards.tsx` and `src/stores/flashcard.ts`. Dashboard/Review/Browse tabs. Manual creation + AI suggestion after gates. Bloom level tagging. FSRS scheduling.
- **Why 9/10 (not 10):** Excellent implementation. Loses one point because cards are currently Q&A pairs only — no cloze deletions, no image occlusion, and no context-sentence cards (sentence mining). Adding cloze deletion and context-rich cards would push this to 10.
- **Sources:** Roediger & Karpicke 2006; Adesope et al. 2017; Rowland 2014

#### 3. Digestion Gates (Forced Generation) — 9/10
- **Science:** Generation effect meta-analysis across 86 studies: d = 0.40 (20-40% retention improvement). Slamecka & Graf 1978. Levels of Processing (Craik & Lockhart 1972). Elaborative interrogation rated "Moderate Utility" by Dunlosky.
- **Implementation:** Full gate system in `src/components/reader/DigestionGate.tsx` and `src/lib/gates.ts`. Four rotating prompt types: Summarize (Bloom L2), Connect (elaboration), Predict (prediction error), Apply (transfer). AI evaluates responses. Gates block progression. Responses + feedback saved to markdown.
- **Why 9/10:** Brilliant design that combines generation effect, elaborative interrogation, levels of processing, and AI feedback in one mechanism. Loses one point because gates don't currently surface related prior notes from the vault (cross-topic connections) and there's no explicit "Why?" prompt type for elaborative interrogation.
- **Sources:** Slamecka & Graf 1978; Craik & Lockhart 1972; Dunlosky et al. 2013; Chi et al. 1994

#### 4. Teach-Back / Feynman Technique — 9/10
- **Science:** Fiorella & Mayer 2013: teaching others produces deeper understanding. Nestojko et al. 2014: even *expecting* to teach improves learning. Self-explanation meta-analysis (Bisra et al. 2018): g = 0.55 across 64 studies and 6,000 participants.
- **Implementation:** Full implementation in `src/pages/TeachBack.tsx` and `src/stores/teachback.ts`. User explains topic in simple terms. AI evaluates: accuracy, missing pieces, jargon detection, deeper follow-up question. Graceful no-AI fallback. Results saved as markdown.
- **Why 9/10:** Combines generation effect, self-explanation, metacognition, and elaboration in one feature. The jargon detection is particularly clever — it catches the illusion of competence. Loses one point because there's no numerical simplicity score tracking over time and no follow-up loop (AI asks a deeper question but there's no mechanism to answer it).
- **Sources:** Fiorella & Mayer 2013; Nestojko et al. 2014; Chi et al. 1994; Bisra et al. 2018

### Tier A: Strong Implementation (7-8/10)

#### 5. Quiz System with Bloom's Taxonomy — 8/10
- **Science:** Testing effect (Roediger & Karpicke 2006): quizzes produce >100% better long-term retention than restudying. Bloom's revised taxonomy (Anderson & Krathwohl 2001) provides progressive difficulty framework. Zone of Proximal Development (Vygotsky) — targeting one level above mastery.
- **Implementation:** Full system in `src/pages/Quiz.tsx` and `src/stores/quiz.ts`. Multiple question types (free-recall, MCQ, fill-blank, true/false). AI generation at target Bloom levels. AI evaluation with feedback. Multi-chapter quizzes. History tab with score tracking.
- **Why 8/10:** Solid implementation with good variety. Loses points because: (1) Bloom level tracking exists but isn't used for adaptive difficulty yet — the system doesn't auto-target one level above demonstrated mastery, (2) no interleaved quiz mode that mixes across subjects, (3) no pre-testing (quiz before reading).
- **Sources:** Roediger & Karpicke 2006; Anderson & Krathwohl 2001; Vygotsky 1978

#### 6. Section-by-Section Reading (Cognitive Load Management) — 8/10
- **Science:** Cognitive Load Theory (Sweller 1988): working memory holds ~4 items. Presenting entire chapters at once overwhelms working memory. Miller 1956, Cowan 2001 on working memory limits.
- **Implementation:** Full section splitting in `src/lib/markdown.ts`. Sections split by headings. Gate-protected advancement. Keyboard navigation. Progress bar showing consumed vs digested sections.
- **Why 8/10:** Excellent cognitive load management. Loses points because: (1) section length isn't adaptive — a 2000-word section under one heading gets shown all at once, which can still overwhelm, (2) no "pre-knowledge activation" prompt before starting a chapter ("What do you already know about this topic?").
- **Sources:** Sweller 1988; Miller 1956; Cowan 2001

#### 7. AI Coaching (Multi-Provider Router) — 8/10
- **Science:** 2025 RCT on AI tutoring: 0.73-1.3 SD improvement over passive learning. AI provides immediate, personalized feedback — a key factor in learning effectiveness.
- **Implementation:** Full router in `src-tauri/src/ai.rs`. Supports Ollama (local/free), Claude API (best quality), Gemini API (fast/free tier), and None mode. Single `aiRequest()` endpoint. Graceful degradation.
- **Why 8/10:** The architecture is excellent — privacy-first with local AI default, best-in-class as an option, graceful no-AI mode. Loses points because: (1) AI prompts could be more pedagogically optimized (e.g., Socratic questioning rather than direct evaluation), (2) no conversation history — each AI call is stateless, losing context from earlier in the study session.
- **Sources:** 2025 AI tutoring RCT; Bloom 1984 (2-sigma problem — 1-on-1 tutoring produces 2 SD improvement)

#### 8. One Thing Daily Commitment — 7/10
- **Science:** Implementation Intentions (Gollwitzer 1999): "if-then" planning increases follow-through by 2-3x. Habit formation research (Lally et al. 2010): mean 66 days to automaticity.
- **Implementation:** Full UI in `src/pages/Home.tsx`. Cue ("When will you do it?"), Action (specific task), optional Reflection. Streak tracking. Completion timestamp.
- **Why 7/10:** Good implementation of implementation intentions. Loses points because: (1) streak is brittle — one missed day breaks it (research suggests forgiving streaks are more motivating), (2) no connection between the commitment and actual study activity — the system doesn't check if you actually did the thing you committed to, (3) no "minimum viable action" suggestion for low-motivation days.
- **Sources:** Gollwitzer 1999; Lally et al. 2010; Wood & Neal 2007

### Tier B: Solid but Incomplete (5-6/10)

#### 9. Mermaid Diagram Support (Dual Coding) — 6/10
- **Science:** Dual Coding Theory (Paivio 1986): information encoded through both visual and verbal channels produces ~2x retrieval reliability. Creating visual explanations improved understanding for both high and low spatial ability learners.
- **Implementation:** Mermaid diagrams render inline via `src/components/shared/MarkdownRenderer.tsx`. Slash command `/mermaid` inserts template. Maps directory in vault structure.
- **Why 6/10:** The infrastructure exists but it's passive — users CAN create diagrams but aren't prompted or guided to do so. No "draw a concept map" prompt after completing a chapter. No concept map builder UI. No AI-suggested diagram generation. The power of dual coding is in the *creation* of visuals, not just viewing them.
- **Sources:** Paivio 1986; Clark & Paivio 1991; Mayer multimedia principles

#### 10. Dashboard Metrics (Metacognition) — 6/10
- **Science:** EEF meta-analysis: metacognition produces +7 to +8 months additional academic progress. Self-monitoring of learning state is a core metacognitive skill.
- **Implementation:** Home page shows Cards Due, Subject Count, Day Streak, Quiz grades by subject.
- **Why 6/10:** Shows useful at-a-glance metrics. Loses points because: (1) no calibration tracking (how accurate are the learner's self-assessments?), (2) no predicted vs actual performance comparison, (3) no learning strategy recommendations based on patterns, (4) no forgetting curve visualization, (5) no "you've been doing X well, try more Y" coaching.
- **Sources:** EEF meta-analysis; Dunning-Kruger research; Bjork metacognitive illusions

#### 11. Interleaving — 5/10
- **Science:** Meta-analysis (Brunmair & Richter 2019): g = 0.42. Interleaving group scored 61% vs 38% on delayed math tests. One of Bjork's four core desirable difficulties.
- **Implementation:** Happens *implicitly* through FSRS scheduling — cards from different topics come due on different days. No explicit interleaving features.
- **Why 5/10:** The natural interleaving from FSRS is real but accidental. No deliberate interleaving in quizzes (quizzes are single-topic). No option to shuffle flashcard review across subjects. No interleaved practice sessions. Research shows explicit interleaving (especially for similar/confusable topics) is far more effective than incidental mixing.
- **Sources:** Brunmair & Richter 2019; Rohrer & Taylor 2007; Bjork & Bjork desirable difficulties

#### 12. Elaborative Interrogation — 5/10
- **Science:** Rated "Moderate Utility" by Dunlosky et al. 2013. Most effective when learners have background knowledge and elaborations are precise and self-generated.
- **Implementation:** Partially present in the "Connect" gate prompt type. No explicit "Why does this make sense?" prompts.
- **Why 5/10:** The Connect gate prompt touches on elaboration but doesn't specifically ask "Why?" — the most effective form of elaborative interrogation. No vault-wide search to surface related prior notes at gate prompts. AI feedback doesn't evaluate whether the elaboration connects to prior knowledge.
- **Sources:** Dunlosky et al. 2013; Pressley et al. 1987

---

## Part 2: Comprehensive Learning Technique Research

### What the Science Says Works Best (Ranked by Evidence)

#### S-Tier: Overwhelming Evidence (Effect sizes > 0.50, replicated across hundreds of studies)

| Technique | Effect Size | Key Finding | In Encode? |
|-----------|-------------|-------------|------------|
| Practice Testing / Retrieval Practice | g = 0.50-0.74 | 57% retention vs 29% for passive reading | YES (flashcards, quizzes, gates) |
| Spaced Repetition | d = 0.54-0.56 | 10-30% better retention; 75% recall at 1 year with successive relearning | YES (FSRS) |
| Successive Relearning (Testing + Spacing combined) | 10% exam boost, 75% at 1yr | The combination is more powerful than either alone | YES (FSRS flashcards) |
| Sleep Optimization | Foundational | Memory consolidation occurs during slow-wave and REM sleep; deprivation impairs both declarative and procedural memory | NO |

#### A-Tier: Strong Evidence (Effect sizes 0.40-0.55, well-replicated)

| Technique | Effect Size | Key Finding | In Encode? |
|-----------|-------------|-------------|------------|
| Generation Effect | d = 0.40 | 20-40% retention boost from producing vs reading | YES (gates, teach-back) |
| Self-Explanation | g = 0.55-0.61 | 64 studies, 6,000 participants confirm deep processing benefit | YES (teach-back) |
| Interleaving | g = 0.42 | 61% vs 38% on delayed tests when mixing topic types | PARTIAL |
| Metacognition / Self-Regulated Learning | +7-8 months | EEF meta-analysis; largest effects for disadvantaged students | PARTIAL |
| Feynman Technique / Teach-Back | Strong indirect | Combines generation + elaboration + metacognition | YES |
| Worked Examples (for novices) | Large effect | Lower mental effort + better performance for beginners | NO |
| Exercise Before Study | Moderate | BDNF increase enhances synaptic plasticity; effects persist 30+ min | NO |

#### B-Tier: Moderate Evidence (Effect sizes 0.30-0.45, some caveats)

| Technique | Effect Size | Key Finding | In Encode? |
|-----------|-------------|-------------|------------|
| Elaborative Interrogation | Moderate | "Why does this make sense?" — best with prior knowledge | PARTIAL |
| Dual Coding (Visual + Verbal) | d = 0.48 | Text + relevant diagrams; 89% better transfer than text-only | PARTIAL |
| Concrete Examples / Analogies | Consistent | Grounding abstract concepts in familiar contexts doubles retention | PARTIAL (via AI) |
| Concept Mapping | Small-Large | Construction > studying pre-made maps; best for relationships | PARTIAL (Mermaid exists) |
| Problem-Based Learning | ES = 0.87-1.28 | With scaffolding; large effects in STEM | NO |
| Cornell Note-Taking | Moderate | Built-in self-testing via cue column | NO |
| Context-Based Learning | 2x retention | Learning words/concepts in context vs isolation | PARTIAL |
| Memory Palace / Method of Loci | g = 0.65; d = 0.88 | Doubles recall capacity in 40 days of training (Dresler 2017) | NO |
| Chunking | Foundational | Reduces cognitive load by grouping related elements | IMPLICIT |

#### C-Tier: Useful Supporting Techniques

| Technique | Evidence | In Encode? |
|-----------|----------|------------|
| Implementation Intentions | 2-3x follow-through | YES (One Thing) |
| Pomodoro / Timed Sessions | Low-moderate for learning; good for effort regulation | NO |
| Zettelkasten / Wiki-linking | Strong for long-term knowledge networks | PARTIAL (wiki-links exist) |
| Shadowing | Strong for pronunciation/fluency; limited general applicability | NO (language-specific) |
| Sentence Mining | Strong for vocabulary in context | NO |
| PAO / Major System | Competition-specific; low general applicability | NO |
| Keyword Method | Short-lived benefits, narrow applicability | NO |

#### F-Tier: What Doesn't Work (Correctly Excluded from Encode)

| Technique | Evidence | Status in Encode |
|-----------|----------|-----------------|
| Highlighting / Underlining | Low Utility (Dunlosky); illusion of competence | EXCLUDED |
| Re-reading | Fluency illusion; minimal retention gains | PREVENTED by gates |
| Cramming / Massed Practice | Works for 24hrs, terrible for long-term | PREVENTED by FSRS |
| Passive Video Watching | Near-zero learning for complex material | EXCLUDED |
| Gamification (Points, Badges, XP) | Shifts focus from competence to reward-seeking; overjustification effect | EXCLUDED |

---

## Part 3: What's Missing and How to Add It

### Priority 1: High-Impact, Feasible Additions

#### 1. Pre-Testing (Quiz Before Reading) — Evidence: Strong
- **What:** Show 3-5 questions on material BEFORE the learner reads the chapter. They'll get most wrong. Then they read. Then they quiz again.
- **Why:** Prediction error primes encoding. The initial failure creates a "knowledge gap" that the brain actively tries to fill during reading. Research shows pre-tested material is remembered significantly better than material that was only post-tested.
- **How to implement:** Before entering Reader mode for a new chapter, generate 3-5 questions from the content. Record answers (most will be wrong). After completing the chapter + gates, re-quiz with the same questions. Show improvement. Save both attempts.
- **Estimated impact:** High. The "hypercorrection effect" shows that high-confidence errors (things you were sure about but got wrong) are corrected at very high rates.

#### 2. Interleaved Quiz Mode — Evidence: Strong (g = 0.42)
- **What:** A quiz mode that pulls questions from multiple subjects/chapters in mixed order.
- **Why:** Interleaving forces discrimination between problem types, which is the skill most needed on real exams. Single-topic quizzes let learners use "this is the normalization chapter, so the answer is about normalization" reasoning.
- **How to implement:** Add "Mixed Review" quiz type that draws from all subjects with studied chapters. Weight toward topics with lower quiz scores. Ensure at least 3 different topics per quiz session.
- **Estimated impact:** High. The 61% vs 38% finding from Rohrer et al. is one of the most dramatic effects in the learning literature.

#### 3. Calibration Tracking (Metacognitive Monitoring) — Evidence: Strong (+7-8 months)
- **What:** Track how accurate the learner's self-assessments are. When they rate a flashcard "Easy," do they actually get it right next time? Show a calibration curve.
- **Why:** The Dunning-Kruger effect is real — learners systematically overestimate their knowledge. Making this visible ("You rate cards 'Easy' but fail them 35% of the time") is one of the most powerful metacognitive interventions.
- **How to implement:** Log each rating and the subsequent review outcome. Compute calibration: for cards rated Easy, what % passed next review? For cards rated Hard? Display as a simple accuracy chart on the dashboard. FSRS already has the data — this is mostly a UI feature.
- **Estimated impact:** High. Metacognitive interventions show +7-8 months of additional progress in the EEF meta-analysis.

#### 4. Explicit "Why?" Gate Prompt — Evidence: Moderate
- **What:** Add a fifth gate prompt type: "Why does this make sense? Explain WHY this is true, not just WHAT it says."
- **Why:** Elaborative interrogation is specifically about "why" questions. The current gate prompts (Summarize, Connect, Predict, Apply) don't include an explicit "why" type. Research shows precise "why" elaborations are the most effective form.
- **How to implement:** Add to the gate prompt rotation in `src/lib/gates.ts`. Generate "Why..." questions from section content. AI evaluates whether the explanation connects to prior knowledge or just restates the text.
- **Estimated impact:** Moderate. Fills the one gap in the gate system's coverage of evidence-based techniques.

#### 5. Retrievability Display on Cards — Evidence: Moderate
- **What:** Show the predicted recall probability (e.g., "72% chance you'll remember this") on each flashcard before review.
- **Why:** Makes the spacing algorithm transparent. Learners understand WHY they're seeing a card now. Also serves as a metacognitive tool — "the algorithm thinks I'm at 72%, do I agree?"
- **How to implement:** The `retrievability()` function already exists in `src/lib/sr.ts`. Just call it with current elapsed days and display the result as a percentage on the card UI.
- **Estimated impact:** Low-moderate for learning directly, but high for user trust and metacognitive awareness.

### Priority 2: Moderate-Impact, Moderate Effort

#### 6. Worked Examples with Fading — Evidence: Strong for Novices
- **What:** For procedural STEM content (SQL queries, math proofs, programming), show fully worked examples first. Then show partial examples where the learner fills in steps. Then full problems.
- **Why:** Cognitive Load Theory's worked example effect is one of the most replicated findings. Novices learn more from studying solutions than from problem-solving. But the expertise reversal effect means this must fade as learners improve.
- **How to implement:** New content type: `type: worked-example` in frontmatter. Steps shown one at a time. As quiz scores improve for a topic, transition from full examples to completion problems (some steps blanked) to full problems. Track mastery level per topic.
- **Estimated impact:** High for STEM subjects. Less relevant for purely conceptual material.

#### 7. Cross-Topic Connection Surfacing — Evidence: Moderate
- **What:** At digestion gates, search the vault for related prior notes, flashcards, and teach-backs. Show 1-2 related items to help the learner make connections.
- **Why:** Schema theory (Bartlett, Minsky) — learning is building connections between concepts. Isolated facts are forgotten; connected facts form durable schemas. The vault already has FTS5 search capability.
- **How to implement:** When a gate activates, run a FTS5 query with key terms from the current section. Surface 1-2 most relevant prior items below the gate prompt. Include in the AI context for richer feedback.
- **Estimated impact:** Moderate. Helps build the knowledge network that distinguishes experts from novices.

#### 8. AI-Suggested Mnemonic Images — Evidence: Moderate (g = 0.65 for method of loci)
- **What:** For dry, hard-to-remember facts, AI generates vivid mnemonic image descriptions. "To remember that 1NF requires atomic values, imagine a normal-sized door (1NF = 1 Normal Form) that only allows single atoms to pass through — if you try to push a molecule (non-atomic value), it gets stuck."
- **Why:** Memory competition research shows vivid, bizarre imagery dramatically improves retention. The method of loci meta-analysis shows g = 0.65. While full memory palaces are hard to digitize, mnemonic image suggestions are easy.
- **How to implement:** After flashcard creation, offer "Generate mnemonic" button. AI creates a vivid image description connecting the question to the answer through visual association. Save as a field on the card. Show during review.
- **Estimated impact:** Moderate. Most helpful for rote facts (terminology, dates, formulas) that resist meaningful encoding.

#### 9. Guided Concept Map Creation — Evidence: Moderate
- **What:** After completing a chapter, prompt the learner to create a concept map showing relationships between key ideas. Provide a Mermaid template with blank nodes.
- **Why:** Nesbit & Adesope meta-analysis of 55 studies: concept maps improve retention over traditional materials. But construction is more effective than studying pre-made maps.
- **How to implement:** "Map This Chapter" button on Reader completion. AI extracts 8-12 key concepts. Presents a Mermaid template with concepts as nodes but no connections. Learner fills in the relationship labels. AI evaluates completeness and accuracy. Saved to `maps/` directory.
- **Estimated impact:** Moderate. Particularly valuable for understanding relationships in complex topics like database design.

#### 10. Cloze Deletion Flashcards — Evidence: Strong
- **What:** Cards where a key word/phrase is blanked out from a sentence: "In ______ Normal Form, every non-key attribute must depend on the entire primary key." Answer: "Second."
- **Why:** Cloze deletions combine the generation effect with context-based learning. The surrounding sentence provides retrieval cues and ensures the fact is learned in context, not isolation. Sentence mining research from language learning confirms 2x retention rates for contextual learning.
- **How to implement:** New card type in the flashcard system. When creating cards from a section, offer "Create cloze" option that blanks out a key term. Render with `[...]` placeholder. Multiple clozes per card supported. Store in the existing callout format with a `type: cloze` field.
- **Estimated impact:** High. This is how Anki power users (medical students, law students) create cards — and it's the most efficient format for factual retention.

### Priority 3: Lower-Impact or Higher Effort

#### 11. Pre-Knowledge Activation Prompt
- **What:** Before starting a chapter, ask "What do you already know about [topic]?" Free-text response.
- **Why:** Activating prior knowledge creates "hooks" for new information. Schema theory shows new information is encoded relative to existing knowledge structures.
- **How to implement:** Prompt before Reader mode for new chapters. Save response. After chapter, show pre-knowledge response alongside what was learned — metacognitive comparison.

#### 12. Study Session Timer with Break Reminders
- **What:** Optional Pomodoro-style timer. Suggest breaks. Track session length.
- **Why:** Pomodoro evidence is weak for learning quality but strong for effort regulation and sustained attention. Prevents marathon unfocused sessions.
- **How to implement:** Non-intrusive timer in the status bar. Configurable work/break intervals. Break reminder that suggests physical movement.

#### 13. Forgetting Curve Visualization
- **What:** Show a visual forgetting curve for each topic/card, with review points marked.
- **Why:** Makes the science behind spacing visible and tangible. Motivates timely reviews.
- **How to implement:** Plot retrievability over time using FSRS's `retrievability()` function. Show past reviews as points on the curve. Predict future decay.

#### 14. Exercise and Sleep Nudges
- **What:** Gentle reminders about exercise before study and sleep after study.
- **Why:** Exercise increases BDNF (critical for learning); sleep is when memory consolidation occurs. A single bout of aerobic exercise facilitates learning for 30+ minutes afterward.
- **How to implement:** Optional pre-study check-in: "Did you move today?" Late-night study warning: "It's 11pm — sleep may be more valuable than another hour of study." Non-preachy, dismissible.

#### 15. Adaptive Difficulty with Bloom Level Progression
- **What:** Track quiz performance by Bloom level per topic. Auto-generate next quiz one level above demonstrated mastery.
- **Why:** Zone of Proximal Development — learning happens at the boundary of current ability. Too easy = no growth. Too hard = cognitive overload.
- **How to implement:** Aggregate quiz scores by Bloom level per subject/topic. If learner consistently scores >80% at Level 2, target Level 3. Display mastery level per topic.

#### 16. Forward Testing Effect Prompts
- **What:** After quizzing on Topic A, prompt: "Now let's learn Topic B" — research shows retrieval practice on A enhances subsequent learning of B.
- **Why:** The forward testing effect is robust — testing releases proactive interference and prepares the brain for new encoding.
- **How to implement:** After completing a quiz or flashcard review session, immediately suggest reading a new chapter. Frame it: "Your brain is primed for learning right now."

---

## Part 4: Technique Deep Dives by Domain

### Memory Competition Techniques

**Method of Loci / Memory Palace:**
- Meta-analysis: g = 0.65 (Twomey & Kroneisen 2021); d = 0.88 for immediate serial recall (Ondrej et al. 2025)
- Dresler et al. 2017 (published in Neuron): 40 days of training doubled recall capacity (26 to 62 words out of 72). Brain connectivity patterns shifted to resemble world memory champions. Effects persisted 4 months later without continued training.
- **Relevance to Encode:** High for specific fact memorization (terminology, formulas, dates). Could be implemented as guided "place this fact in your mental space" prompts attached to flashcards. The main barrier is that effective palaces are deeply personal — the app can guide but not fully automate the spatial association.
- **World champion insight (Alex Mullen, 3x World Memory Champion):** Memory techniques should supplement, not replace, deep learning. Palaces pair best with retrieval practice, spacing, interleaving, and elaboration.

**PAO System (Person-Action-Object):**
- Used by virtually every competitive memory athlete for number memorization
- Every 2-digit number (00-99) maps to a Person, Action, and Object. 34-13-79 = "Frank Sinatra kicking a cape"
- **Relevance to Encode:** Low for general studying. Only relevant if the app needs to help memorize specific numbers (dates, constants, formulas). The setup cost (weeks of practice) makes it impractical for a general study tool.

**Chunking:**
- Miller 1956: working memory holds 5-9 items, but each item can be a rich "chunk"
- Competitors chunk everything — numbers in 2-3 digit groups, cards in pairs/triplets
- **Relevance to Encode:** Already implicit in section-by-section reading and flashcard design. Could be made explicit by auto-grouping related concepts and suggesting meaningful clusters during import.

**Elaborative Encoding (Bizarre Imagery):**
- Memory athletes create absurd, emotionally charged images. 20-30% improvement over rote memorization.
- **Relevance to Encode:** AI could generate bizarre mnemonic images for dry facts. "To remember that a foreign key references another table's primary key, imagine a key-shaped alien (foreign) reaching across a bridge to hold hands with a king (primary) sitting at another table."

### Language Learning Techniques

**Comprehensible Input (Krashen's i+1):**
- Material should be 95-98% comprehensible with a small stretch (Hu & Nation 2000)
- **Relevance to Encode:** The digestion gate system already implements this — section-by-section presentation with comprehension checks ensures material is processed at an appropriate level. Could be enhanced by adaptive section length based on gate performance.

**Sentence Mining:**
- Learning vocabulary/concepts in authentic context sentences, then creating SRS cards with the full sentence
- Context can double retention rates vs isolated definitions (multiple studies)
- **Relevance to Encode:** HIGH. Flashcards should include the surrounding paragraph context, not just stripped Q&A. Cloze deletion cards from chapter sentences would implement this directly.

**Shadowing:**
- Simultaneously echoing audio to build phonological loop engagement
- **Relevance to Encode:** LOW for general studying. Language-specific technique.

**Immersion Staging (Refold Method):**
- Stage 1: Build base vocabulary + grammar. Stage 2: Active immersion with sentence mining + SRS. Stage 3: Output after high comprehension.
- **Relevance to Encode:** The staging concept generalizes — don't ask learners to produce until they have sufficient comprehension. Encode already does this: Read (input) -> Gate (check comprehension) -> Quiz/Teach-back (output).

**Output Hypothesis (Swain):**
- Production forces deeper processing than comprehension alone. Three functions: noticing gaps, testing hypotheses, metalinguistic reflection.
- **Relevance to Encode:** Already implemented via teach-back and gates. This is the theoretical justification for forcing written responses rather than multiple-choice recognition.

### STEM-Specific Techniques

**Worked Examples with Fading:**
- Novices learn better from studying solutions than solving problems (Sweller, Cognitive Load Theory)
- The expertise reversal effect: fully guided instruction becomes counterproductive for advanced learners
- Adaptive fading: gradually remove steps as mastery increases
- **Relevance to Encode:** HIGH for D426 (SQL queries, normalization steps). Not yet implemented. Would require a new content type for step-by-step procedural walkthroughs with progressive blanking.

**Problem-Based Learning (PBL):**
- Meta-analysis: ES = 0.87-1.28 (large effect) for STEM
- Must be scaffolded for novices; pure discovery learning overwhelms working memory
- **Relevance to Encode:** The "Apply" gate prompt is a lightweight PBL implementation. Could be expanded: after completing a chapter, present a realistic scenario problem (e.g., "Design a normalized schema for a gas station inventory system") with graduated hints.

**Concrete Examples from Learner's Domain:**
- Abstract concepts grounded in familiar contexts are remembered better
- Multiple varied examples promote abstraction of the underlying principle
- **Relevance to Encode:** Already leveraged through AI prompts. The CLAUDE.md already instructs AI to use gas station management analogies for Samieh. Could be systematized: learner profile includes their professional domain, and AI always generates domain-specific examples.

**Cognitive Load Theory Design Principles:**
- Split attention effect: integrate labels into diagrams, don't separate related information
- Redundancy effect: visuals should add information, not duplicate text
- Modality effect: use both visual and auditory channels
- **Relevance to Encode:** Already followed in UI design (clean interface, section-by-section). The split attention principle should guide future diagram features — labels integrated into Mermaid diagrams, not in separate text blocks.

### General Learning Science

**Desirable Difficulties Framework (Bjork & Bjork):**
- The meta-principle: spacing, interleaving, retrieval practice, and generation all make learning FEEL harder but produce dramatically better long-term outcomes
- Students abandon effective techniques because they produce an illusion of incompetence
- **Relevance to Encode:** This IS Encode's philosophy. The app should explicitly communicate this to users: "This feels hard because it's working."

**Metacognitive Calibration:**
- Learners systematically overestimate their knowledge (Dunning-Kruger in studying)
- Confidence ratings before quizzes, compared to actual performance, expose miscalibration
- **Relevance to Encode:** Not yet implemented. Add "How confident are you?" before quizzes. Compare to actual scores. Show calibration trends over time. This is one of the highest-impact missing features.

**The Forward Testing Effect:**
- Retrieval practice on previously studied material enhances learning of NEW material studied afterward
- Testing releases proactive interference, preparing the brain for new encoding
- **Relevance to Encode:** Not yet leveraged. After flashcard reviews or quizzes, prompt the learner to start a new chapter. The brain is primed for learning.

**Cornell Note-Taking:**
- The cue column creates a built-in retrieval practice system (cover notes, use cues to self-test)
- **Relevance to Encode:** Could influence how imported content is structured. A "cue column" mode in the editor where key terms are extracted to the margin as retrieval cues.

**Zettelkasten:**
- Each note = one idea. Explicit links between notes. The value emerges from connections.
- Encode already supports wiki-links (`[[filename]]`). Could be more actively promoted — after creating notes, prompt "What other notes does this connect to?"
- **Relevance to Encode:** PARTIAL. The infrastructure exists. The active prompting to create connections is missing.

---

## Part 5: Overall Assessment

### What Encode Does Exceptionally Well

1. **FSRS implementation** — State-of-the-art spaced repetition. Better than what most apps offer.
2. **Digestion gates** — Unique and brilliant. Combines generation effect, elaborative interrogation, and AI feedback in one mechanism. No other study app does this.
3. **Teach-back** — The Feynman technique with AI evaluation is a genuine differentiator.
4. **No-gamification stance** — Backed by research. Rare among study apps.
5. **Markdown as source of truth** — Future-proof, portable, and transparent.
6. **AI tiering** — Local-first with optional cloud AI. Respects privacy and budget.
7. **Evidence-based exclusions** — Deliberately not building highlighting, badges, or passive features shows deep understanding of the research.

### The Biggest Gaps (Highest Impact Additions)

| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| Pre-testing (quiz before reading) | Very High | Medium | 1 |
| Interleaved quiz mode | Very High | Low | 1 |
| Metacognitive calibration tracking | Very High | Medium | 1 |
| Cloze deletion flashcards | High | Low | 2 |
| "Why?" elaborative gate prompt | High | Very Low | 2 |
| Worked examples with fading (for STEM) | High | High | 2 |
| Cross-topic connection surfacing at gates | High | Medium | 2 |
| Retrievability % display on cards | Moderate | Very Low | 3 |
| AI mnemonic image suggestions | Moderate | Low | 3 |
| Guided concept map creation | Moderate | Medium | 3 |
| Forgetting curve visualization | Low-Mod | Low | 3 |
| Study timer with break reminders | Low | Low | 4 |
| Sleep/exercise nudges | Low | Very Low | 4 |

### Overall Rating: 8.2/10

Encode is one of the most research-grounded study apps in existence. The core loop (Import -> Read section-by-section -> Gate forces generation -> AI coaches -> Quiz tests -> Flashcards maintain -> Teach-back deepens) hits the highest-evidence techniques. The main gaps are in metacognition (helping learners see their own blind spots), interleaving (deliberately mixing topics), and pre-testing (leveraging prediction error). These are all additive — the foundation is excellent.

---

## Sources

### Meta-Analyses and Landmark Papers
- Dunlosky et al. 2013, "Improving Students' Learning With Effective Learning Techniques" — *Psychological Science in the Public Interest*
- Rowland 2014, Testing Effect Meta-Analysis — *Psychonomic Bulletin & Review*
- Adesope et al. 2017, Practice Testing Meta-Analysis — *Review of Educational Research*
- Brunmair & Richter 2019, Interleaving Meta-Analysis — *Psychonomic Bulletin & Review*
- Bisra et al. 2018, Self-Explanation Meta-Analysis — *Educational Psychology Review*
- Twomey & Kroneisen 2021, Method of Loci Meta-Analysis — *Quarterly Journal of Experimental Psychology*
- Ondrej et al. 2025, Method of Loci Meta-Analysis — *British Journal of Psychology*
- Nesbit & Adesope 2006, Concept Map Meta-Analysis — *Review of Educational Research*
- EEF Metacognition and Self-Regulation Toolkit — *Education Endowment Foundation*
- Dresler et al. 2017, "Mnemonic Training Reshapes Brain Networks" — *Neuron*
- Bjork & Bjork 2011, "Making Things Hard on Yourself, But in a Good Way" — *Desirable Difficulties*
- Sweller 1988, Cognitive Load Theory — *Cognitive Science*
- Paivio 1986, Dual Coding Theory — *Mental Representations*
- Ebbinghaus 1885 / Murre & Dros 2015 replication — *PLOS ONE*
- Fiorella & Mayer 2013, Teach-Back / Learning by Teaching — *Educational Psychology Review*

### Spaced Repetition Algorithms
- FSRS Benchmark: github.com/open-spaced-repetition/srs-benchmark
- FSRS Technical Principles: oreateai.com/blog/technical-principles-and-application-prospects-of-the-free-spaced-repetition-scheduler-fsrs
- Settles & Meeder 2016, Duolingo HLR: research.duolingo.com/papers/settles.acl16.pdf

### Memory Competition
- Mullen Memory: mullenmemory.com
- Art of Memory: artofmemory.com
- Nelson Dellis: nelsondellis.com/memory-tips
- memoryOS App: memoryos.com
- Dresler et al. 2021, "Durable Memories Through Method of Loci" — *Science Advances*

### Language Learning
- Hu & Nation 2000, 95-98% comprehension threshold
- Krashen Input Hypothesis + 2025 Frontiers critique
- Swain Output Hypothesis
- Kim 2022, Spaced Practice in L2 Meta-Analysis — *Language Learning*
- Refold Method: refold.la
- Migaku Sentence Mining: migaku.com

### STEM Learning
- Worked Example Effect: Sweller, van Merrienboer, Paas
- Kalyuga 2007, Expertise Reversal Effect
- Rohrer et al. interleaved math practice (61% vs 38%)
- PBL meta-analyses: ES = 0.87-1.28 for STEM
- Clark & Paivio 1991, Dual Coding Theory

### General Learning Science
- Gollwitzer 1999, Implementation Intentions
- Lally et al. 2010, Habit Formation (66 days)
- Miller 1956, Working Memory Capacity
- Cowan 2001, Revised Working Memory Limits
- Bloom 1984, 2-Sigma Problem
- Slamecka & Graf 1978, Generation Effect
- Pan & Rickard 2018, Transfer of Testing Effect
