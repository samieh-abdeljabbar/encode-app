# Learning Science Research & Encode Feature Audit

Research compiled from cognitive science papers, meta-analyses, and clinical ADHD literature. Each section includes the evidence, effect sizes where available, and an honest assessment of what Encode currently does or doesn't do.

---

## Part 1: Core Memory and Encoding Science

### 1.1 Levels of Processing

**Evidence:** Craik & Lockhart (1972) showed that semantic (deep) processing produces ~65% recognition accuracy versus ~17% for structural (shallow) processing — nearly 4x better retention. The depth at which information is encoded is the strongest predictor of whether it will be remembered.

**What this means:** Highlighting, re-reading, and copying notes are shallow. Asking "why does this work?" or "how does this connect to X?" forces semantic processing. The generation effect (producing an answer rather than reading one) is the purest form of deep encoding.

**Encode status:**
- **Using:** Digestion gates force semantic processing by requiring free-text responses to explain, connect, apply, and analyze. This is the app's strongest alignment with encoding science.
- **Using:** Teach-back mode forces the deepest level of processing — explaining in your own words.
- **Not using:** No explicit signal to the student about *why* the gate matters. The app forces deep processing but doesn't teach the student to value it independently.

---

### 1.2 Spacing Effect and Distributed Practice

**Evidence:** Ebbinghaus (1885, replicated 2015 in PLOS ONE) showed 79% forgetting within 1 month for massed study. Cepeda et al. (2006) meta-analyzed 254 studies and found distributed practice produces 10-30% better retention. The optimal spacing gap is 10-20% of the desired retention interval (Cepeda et al., 2008). FSRS outperforms SM-2 for 99.6% of users, producing 20-30% fewer reviews for equivalent retention (Expertium benchmarks).

**What this means:** Cramming works for tomorrow's test and fails for next month's recall. Spacing must be algorithmic because humans are terrible at judging when to review.

**Encode status:**
- **Using:** FSRS implementation with automatic scheduling. This is state-of-the-art — better than Anki's default SM-2.
- **Using:** Cards surface on schedule with Again/Hard/Good/Easy ratings that feed back into the algorithm.
- **Not using:** No interleaving of review across subjects. Cards are reviewed per-subject, not mixed. Research shows cross-subject interleaving improves discrimination learning (g = 0.42, Brunmair & Richter 2019).
- **Not using:** No recommendation for "review before sleep" timing, which research suggests enhances consolidation of weakly encoded memories via sleep spindles.

---

### 1.3 Testing Effect / Retrieval Practice

**Evidence:** Roediger & Karpicke (2006) found testing produces 50% more recall than restudying at 1 week. Meta-analyses show effect sizes of g = 0.50 (Rowland, 2014) to g = 0.61 (Adesope et al., 2017). Dunlosky et al. (2013) rated retrieval practice as HIGH utility — yet only 1% of students use self-testing as their primary strategy.

**What this means:** Every interaction with material should require the student to produce something from memory, not just re-read or recognize. The harder the retrieval, the stronger the encoding (as long as retrieval succeeds or is followed by feedback).

**Encode status:**
- **Using:** Gates require free-text retrieval before advancing. This is retrieval practice by design.
- **Using:** Flashcard review is pure retrieval practice with spaced scheduling.
- **Using:** Quiz system generates retrieval questions at varying Bloom levels.
- **Partially using:** Gate questions are AI-generated and sometimes cluster around the opening of a section instead of sampling the full content. The planned section-analysis pass addresses this.
- **Not using:** No whole-chapter free recall step. Research shows whole-text free recall outperforms section-by-section recall for long-term retention. A "dump everything you remember from this chapter" step before the structured synthesis could be powerful.

---

### 1.4 Elaborative Interrogation

**Evidence:** Effect size d = 0.56, outperforming highlighting (d = 0.44) and summarization (d = 0.44). The technique works by forcing the learner to connect new information to prior knowledge. Self-generated explanations outperform provided ones. Requires some prior knowledge to work — novices with zero context benefit less.

**What this means:** "Why is this true?" and "How does this relate to what you already know?" are more effective than "Summarize this section." The student must generate the connection, not receive it.

**Encode status:**
- **Using:** Gate question types include "explain" and "analyze" which are elaborative interrogation.
- **Using:** Schema activation prompt ("What do you already know?") before reading activates prior knowledge — though currently this is persistence-only and not yet compared to post-reading understanding.
- **Not using:** No explicit "why is this true?" question type that forces causal reasoning. The current types (recall, explain, apply, analyze) are close but don't specifically demand "why" explanations with mechanistic reasoning.

---

### 1.5 Interleaving vs. Blocking

**Evidence:** Meta-analysis shows g = 0.42 overall (Brunmair & Richter, 2019), but g = 0.67 for visual discrimination tasks. Blocking wins for rule-learning and initial concept acquisition. Students who benefit most from interleaving incorrectly believe they learned less from it — it feels harder, which is a desirable difficulty.

**What this means:** Mixing topics during review improves the ability to discriminate between similar concepts. Blocking (studying one topic at a time) is better for initial learning. The optimal strategy is: block during first exposure, interleave during review.

**Encode status:**
- **Using:** Reading is blocked by chapter/section — correct for initial learning.
- **Not using:** Flashcard review is blocked by subject. No cross-subject interleaving during review sessions. This is a missed opportunity — mixing "D426 normalization" cards with "D427 networking" cards would force discrimination.
- **Not using:** Quiz generation is single-topic. No cumulative quizzes that pull from multiple chapters or subjects to force interleaved retrieval.

---

### 1.6 Generation Effect

**Evidence:** Slamecka & Graf (1978), confirmed by Bertsch meta-analysis of 86 studies: d = 0.40. Producing answers improves recall by up to 40% versus passive reading. The effect is strongest when the generation is effortful but successful.

**What this means:** Flashcards should require production (type the answer), not recognition (pick from options). Fill-in-the-blank and free-recall are better than multiple-choice for long-term retention.

**Encode status:**
- **Using:** Flashcard review requires the student to think of the answer before revealing it. This is generation.
- **Using:** Gate responses require free-text production, not multiple choice.
- **Partially using:** Quiz system supports multiple-choice alongside free-recall. Multiple choice is a recognition task, not generation. The app should bias toward free-recall questions.
- **Not using:** No "complete the definition" or "fill in the mechanism" question formats that scaffold generation for students who struggle with fully open-ended recall.

---

### 1.7 Desirable Difficulties (Bjork & Bjork, 2011)

**Evidence:** Spacing, interleaving, retrieval practice, and generation all slow initial learning but dramatically improve long-term retention. The key boundary condition: learners need sufficient prior knowledge to benefit. Without it, difficulty becomes undesirable and causes frustration/abandonment.

**What this means:** The app should make learning harder in ways that improve retention (forcing recall, spacing review, mixing topics) but not harder in ways that increase system friction (complex UI, unnecessary steps, confusing navigation).

**Encode status:**
- **Using:** Digestion gates are desirable difficulty — they slow reading but force deep processing.
- **Using:** Spaced repetition makes review harder by increasing intervals.
- **Concern:** 4-5 gate questions per long section may cross from desirable into undesirable difficulty (frustration, abandonment). The planned cap at 2-3 questions addresses this.
- **Concern:** For true beginners with zero prior knowledge on a topic, the gates may be too hard to be productive. No adaptive difficulty that eases gates for first-exposure content.

---

### 1.8 Dual Coding Theory (Paivio)

**Evidence:** Adding pictures to verbal information increases 3-day recall from 10% to 65% — a 6.5x improvement (Brain Rules research). Mayer (2009) found 89% improvement in transfer test performance with multimedia instruction. The effect is strongest when verbal and visual channels encode complementary (not redundant) information.

**What this means:** Diagrams, concept maps, and visual representations alongside text dramatically improve retention. But auto-generated visuals that just decorate text don't help — the visual must encode different information than the words.

**Encode status:**
- **Using:** Mermaid diagram support in markdown. Students can create concept maps.
- **Not using:** No prompting or scaffolding to create visual representations. The app supports mermaid syntax but doesn't suggest "draw how these concepts connect" as a learning activity.
- **Not using:** Concept map construction (g = 0.72-1.08 in meta-analyses) is 60-70% more effective than studying pre-made maps. The app should prompt user-constructed maps, not AI-generated ones.
- **Not using:** No image support in flashcards or gates. All encoding is verbal.

---

### 1.9 Concrete Examples and Analogies

**Evidence:** Gick & Holyoak (1983) showed a single example is insufficient for transfer. Two or more examples from different surface contexts, with explicit comparison, produces schema induction that enables transfer. Concrete details can hinder transfer if they distract from the underlying structure.

**What this means:** When the app provides examples (in AI feedback, flashcards, or explanations), it should provide multiple examples from different domains and ask the student to identify what they have in common. One example anchors understanding; two examples with comparison build transferable knowledge.

**Encode status:**
- **Using:** AI evaluation references specific content and provides concrete feedback.
- **Using:** Profile context (gas station management) allows AI to use domain-relevant analogies.
- **Not using:** No systematic use of multiple examples with comparison. AI feedback typically gives one example, not two from different contexts.
- **Not using:** No "compare these two examples — what's the same?" question type.

---

## Part 2: Adult ADHD and Learning

### 2.1 ADHD and Working Memory

**Evidence:** ADHD's core learning deficit is at encoding, not storage or retrieval. P3 amplitude (an EEG marker of attention allocation during encoding) is reduced in ADHD. Both phonological and visuospatial working memory components are affected. Working memory training does not transfer — the deficit must be worked around with active encoding strategies, not trained away.

**What this means:** ADHD students can remember information fine once it's encoded — the problem is getting it encoded in the first place. Passive reading is especially dangerous for ADHD because the information never makes it into long-term memory. Every encoding event must be active.

**Encode status:**
- **Using:** Gates force active encoding at every section boundary. This is exactly what ADHD learners need — forced stops that prevent passive skimming.
- **Using:** Section-by-section reading prevents the ADHD pattern of "reading 5 pages and remembering nothing."
- **Not using:** No visual indicators of encoding quality during reading (e.g., "you've engaged deeply with 3/5 sections"). ADHD learners benefit from concrete evidence that they're making progress.

---

### 2.2 Executive Function and External Scaffolding

**Evidence:** Barkley's model reframes ADHD as "intention deficit disorder" — knowing what to do but being unable to initiate at the right time. The solution is external scaffolding: cues at the point of performance, externalized motivation, and environmental structure that substitutes for impaired internal regulation. This is not a crutch — it's a permanent functional adaptation, like glasses for vision.

**What this means:** The app should reduce executive function demands for system interaction (starting a session, choosing what to study, navigating between features) while increasing cognitive demands on the learning task itself. "Minimize friction to start. Maximize friction to think."

**Encode status:**
- **Using:** Dashboard shows "Cards Due" with a single "Start Review" action — low EF demand to begin.
- **Using:** Smart recommendations suggest what to study next.
- **Using:** Pomodoro timer provides time structure.
- **Concern:** Navigating between Vault, Reader, Flashcards, Quiz, and Teach-Back requires multiple decisions. For ADHD learners, a guided "study session" mode that sequences activities automatically would reduce decision load.
- **Not using:** No "just start studying" single-action entry point that picks the highest-priority activity and begins.

---

### 2.3 Hyperfocus

**Evidence:** Remarkably under-researched (only one empirical EEG study exists). Hyperfocus follows dopamine and interest, not importance. It can be extremely productive for deep learning when aligned with the right task, but harmful when it targets the wrong task, causes burnout, or distorts time perception.

**What this means:** The app should not fight hyperfocus (interrupting deep reading flow) but should guard against its downsides (3-hour sessions without breaks, neglecting other subjects, losing track of time).

**Encode status:**
- **Using:** Pomodoro timer creates break boundaries.
- **Concern:** Gates could interrupt productive hyperfocus if they feel like busywork rather than genuine thinking. Gate questions must be substantive enough to feel worth the interruption.
- **Not using:** No session-length awareness ("You've been studying for 90 minutes — consider a break").
- **Not using:** No cross-subject nudging ("You've studied D426 for 3 sessions in a row — D427 has cards due").

---

### 2.4 Dopamine, Motivation, and Gamification

**Evidence:** ADHD operates on an interest-based nervous system (Dodson's INCUP model: Interest, Novelty, Challenge, Urgency, Passion). Gamification initially works via dopamine but habituates — hedonic adaptation means novelty wears off. Extrinsic rewards (points, badges, streaks) can undermine intrinsic motivation. Meaningful competence feedback ("you understood this well because...") is more durable than reward feedback ("you earned 50 XP").

**What this means:** The app should provide competence evidence, not reward tokens. "Your understanding of normalization improved from partial to solid" is better than "You earned a streak badge." Streaks are explicitly anti-pattern for ADHD because missing one day can trigger shame spirals and abandonment.

**Encode status:**
- **Using:** Mastery feedback (Needs work / Partial / Solid / Excellent) is competence evidence, not gamification.
- **Using:** No points, badges, or XP by design — the CLAUDE.md explicitly prohibits gamification.
- **Concern:** The dashboard shows "Day Streak." Streaks are dangerous for ADHD learners — a single missed day can trigger shame and app abandonment. Consider replacing with "sessions this week" or "total study time" which don't penalize gaps.
- **Not using:** No curiosity-triggering "deeper questions" that create anticipation for the next section. Research shows curiosity states create a 16.5 percentage point recall advantage (Gruber et al., 2014).

---

### 2.5 Friction: Helpful vs. Harmful

**Evidence:** The critical distinction for ADHD learners is cognitive friction (effort on the learning task — recall, explain, connect) vs. system friction (effort on the tool — navigating, configuring, waiting). Cognitive friction is beneficial. System friction causes abandonment. Gates help when they force generation. They cause abandonment when they add steps before task initiation or feel punitive.

**Design principle:** "Minimize friction to start. Maximize friction to think."

**Encode status:**
- **Using:** Gates are cognitive friction — they force thinking. This is correct.
- **Concern:** The current gate UI is visually heavy (`p-6`, `border-t-2 border-purple`, `rounded-2xl` section cards). Heavy UI chrome is system friction — it makes the gate feel like hitting a wall rather than pausing to think. The planned density reduction addresses this.
- **Concern:** Waiting 10-15 seconds for AI question generation is system friction. Show the section content during the wait so the student can re-read while questions prepare.
- **Not using:** No "quick start" mode that skips configuration and puts the student directly into their highest-priority activity.

---

### 2.6 Spaced Repetition and ADHD

**Evidence:** No ADHD-specific SRS study exists, but the mechanism aligns well: short sessions, active recall, algorithmic planning (removes EF demand for scheduling), distributed encoding. Pitfalls for ADHD: review pile-up creates shame spirals, and monotonous cards lose the novelty required for ADHD engagement.

**Encode status:**
- **Using:** FSRS scheduling removes the decision of "what to review when."
- **Concern:** If the student skips several days, a large backlog builds up. No backlog management strategy (e.g., "you have 47 cards due — let's do the 10 most critical first").
- **Not using:** No card variety mechanisms to maintain novelty (e.g., occasionally changing card format, adding a "why?" follow-up to a recall card, or injecting a surprise question).

---

### 2.7 Body Doubling and AI as Accountability Partner

**Evidence:** No controlled studies on body doubling, but it's rooted in social facilitation theory (Zajonc, 1965) and Barkley's externalization principle. The presence of another person (or the simulation of one) increases task engagement. AI coaching interactions can serve as digital body doubling — explaining to an evaluator creates both encoding benefit and social presence motivation.

**What this means:** The AI evaluation in gates and teach-back isn't just providing feedback — it's creating a social accountability mechanism. The student is "explaining to someone," which is more motivating than explaining to themselves.

**Encode status:**
- **Using:** Gate evaluation feels like explaining to a tutor. Teach-back mode is explicitly "explain to someone."
- **Not using:** No persistent "coach" presence that acknowledges progress across sessions ("Last time you struggled with 3NF — let's see how you do today"). This could enhance the social accountability effect.

---

## Part 3: Advanced Learning Methods

### 3.1 Successive Relearning

**Evidence:** The largest effect sizes in educational psychology: d = 1.52-4.19 (Rawson & Dunlosky, 2022). Successive relearning combines retrieval practice with spaced repetition: practice until you get it right once, then space the next attempt. Overlearning within a session (practicing 5 more times after getting it right) adds almost nothing. The key is reaching criterion once per session, then moving on.

**What this means:** Flashcard review should stop a card after one successful recall in a session, not drill it multiple times. The FSRS "Good" rating should advance the card immediately — the spacing does the rest.

**Encode status:**
- **Using:** FSRS implements successive relearning. Cards advance on successful recall and return on schedule.
- **Using:** No overlearning loop — the student rates once and moves on.
- **Not using:** No explicit signaling that "you got it once, that's enough for today — trust the spacing." ADHD learners especially may feel compelled to drill cards repeatedly for reassurance.

---

### 3.2 Self-Explanation Effect

**Evidence:** Chi's research, meta-analyzed by Bisra et al. (2018): g = 0.55. Self-explanation — explaining material to yourself while learning — improves both comprehension and transfer. It works by forcing the learner to fill in gaps between explicit statements in the text.

**What this means:** Gates that ask "explain how X relates to Y" or "why does this step come before that step?" are self-explanation prompts. They're more effective than asking "summarize this section" because they force gap-filling.

**Encode status:**
- **Using:** Gate "explain" questions are self-explanation. Teach-back is extended self-explanation.
- **Using:** The planned section analysis pass generates questions that target mechanisms and relationships, which are gap-filling tasks.
- **Not using:** No prompting during reading itself (before the gate). Research suggests that self-explanation during reading (pausing to explain each paragraph to yourself) is more effective than self-explanation after reading. The tutor helper could scaffold this.

---

### 3.3 Metacognition and Illusions of Competence

**Evidence:** Students are systematically overconfident about their understanding. Re-reading creates a "fluency illusion" — the material feels familiar, so they assume they know it. Bjork's research shows re-reading drops from near-complete recall to less than 30% within a month. Metacognitive calibration training (g = 0.565) helps students accurately judge what they know and don't know.

**What this means:** The app should expose the gap between perceived understanding and actual understanding. Getting a gate question wrong after thinking you understood the section is the most powerful metacognitive signal.

**Encode status:**
- **Using:** Gates expose the fluency illusion directly — the student thinks they understand, then the gate reveals they can't explain it. This is metacognitive calibration by design.
- **Using:** Mastery scores give concrete feedback on actual understanding versus perceived understanding.
- **Not using:** No pre/post comparison. Schema activation ("what do you already know?") is collected but not compared to post-reading synthesis to show "here's how your understanding changed." This comparison is one of the strongest metacognitive tools.
- **Not using:** No confidence ratings before quiz answers. Research on hypercorrection (Metcalfe) shows that wrong answers given with high confidence produce the strongest learning when followed by feedback.

---

### 3.4 Productive Failure

**Evidence:** Kapur's research, meta-analyzed by Sinha & Kapur (2021): d = 0.36-0.58. Struggling with a problem before receiving instruction is more effective than instruction-first approaches. The failed attempt creates a "preparation for future learning" — the student develops awareness of what they don't understand, which makes subsequent instruction more meaningful.

**What this means:** The digestion gate (attempt before feedback) is productive failure by design. The student tries to explain, gets it partially wrong, then receives corrective feedback. This sequence is more effective than showing the summary first and then asking if they understood.

**Encode status:**
- **Using:** Gates are productive failure. The student attempts retrieval/explanation, often partially fails, and receives targeted feedback. This is exactly the mechanism Kapur's research supports.
- **Using:** The planned post-gate summary (shown after the attempt, not before) preserves the productive failure sequence.
- **Not using:** No graduated scaffolding when productive failure is too productive (student is completely lost). If mastery is 1/5 on multiple questions, the current system just shows feedback and moves on. A "let's slow down and re-read this section" prompt could help.

---

### 3.5 Bloom's Taxonomy in Practice

**Evidence:** Agarwal (2019) found that higher-order Bloom's questions (apply, analyze, evaluate) are more effective than fact-level questions even for retaining facts. The effort of thinking at a higher level incidentally strengthens lower-level recall. The progressive difficulty model (start with recall, move to application) is supported but may be less necessary than assumed — jumping to higher-order questions early can be equally effective.

**What this means:** Gate questions should not be predominantly recall-level. Application and analysis questions are more valuable even when the goal is basic factual retention.

**Encode status:**
- **Using:** Gate questions include recall, explain, apply, and analyze types.
- **Using:** Quiz system supports Bloom level selection (1-6).
- **Concern:** The current question generation prompt asks for a "mix" of types. In practice, AI models default to easier recall questions unless strongly prompted toward higher-order types. The planned fixed question shapes (Q1: recall, Q2: mechanism, Q3: application) ensure at least 2/3 of questions are higher-order.
- **Not using:** No tracking of which Bloom levels the student is strong/weak at across topics. This could inform adaptive question difficulty.

---

### 3.6 Concept Mapping

**Evidence:** Construction of concept maps shows g = 0.72-1.08 across meta-analyses — 60-70% more effective than studying pre-made concept maps. The act of deciding how concepts relate (not just viewing relationships) is where the learning happens.

**What this means:** If the app generates concept maps for the student, most of the learning benefit is lost. The student must construct the map themselves. AI can evaluate a student-constructed map, but should not construct it for them.

**Encode status:**
- **Using:** Mermaid diagram support allows student-constructed concept maps.
- **Not using:** No prompting to create concept maps as a learning activity. The mermaid feature exists but is positioned as a documentation tool, not a learning tool.
- **Not using:** No concept-map-based gate question ("Draw/describe how the concepts in this section connect to each other").

---

### 3.7 Chunking and Cognitive Load Theory

**Evidence:** Miller's 7 +/- 2 working memory slots. Sweller's Cognitive Load Theory distinguishes intrinsic load (complexity of the material), extraneous load (complexity of the presentation), and germane load (effort directed at learning). Effective instruction minimizes extraneous load and maximizes germane load.

**What this means:** The app's UI should be simple and unobtrusive (low extraneous load) so the student's cognitive resources go toward understanding the material (germane load). Heavy chrome, confusing navigation, and decorative elements are extraneous load.

**Encode status:**
- **Using:** Section-by-section reading is chunking — the student processes one section at a time instead of the whole chapter.
- **Concern:** The current gate UI (rounded cards, purple borders, panels, shadows) adds extraneous cognitive load. The planned density reduction directly addresses this.
- **Concern:** Dashboard with multiple metrics (cards due, subjects, streaks, study time, grades, at-risk cards, recommendations) may overload working memory. For ADHD learners especially, fewer metrics with clearer priority would reduce extraneous load.

---

### 3.8 Curiosity and Emotional Engagement

**Evidence:** Gruber et al. (2014) found curiosity states create a 16.5 percentage point recall advantage. Remarkably, being in a curious state enhances memory for unrelated information encountered during that state — curiosity doesn't just help the target material, it enhances all encoding during the curious period. Emotional salience on memory: g = 0.38 (meta-analysis, 2023).

**What this means:** Triggering curiosity before or during learning enhances encoding of everything. The "deeper question" at the end of gate feedback could serve as a curiosity trigger for the next section.

**Encode status:**
- **Using:** Gate evaluation includes a "deeper question" field that could trigger curiosity.
- **Not using:** No explicit curiosity-triggering mechanism. The "deeper question" is embedded in feedback text, not highlighted as a standalone prompt that creates anticipation.
- **Not using:** No "I wonder..." or "Before you read the next section, consider..." prompts that create an information gap the student wants to close.

---

### 3.9 Sleep and Memory Consolidation

**Evidence:** Sleep plays a critical role in memory consolidation, particularly through sleep spindles during Stage 2 NREM sleep. Weakly encoded memories benefit disproportionately from sleep. Reviewing difficult material before sleep (rather than in the morning) can improve consolidation.

**Encode status:**
- **Not using:** No time-of-day awareness or study timing recommendations.
- **Not using:** No "review your weakest cards before bed" feature.
- **Low priority:** This is a nice-to-have optimization, not a core learning mechanism.

---

### 3.10 Transfer of Learning

**Evidence:** Near transfer (applying knowledge to similar contexts) is relatively easy. Far transfer (applying to very different contexts) is near-impossible through standard methods — meta-analyses show near-null effects. However, deliberate strategies can help: varied practice contexts, retrieval practice with rule extraction, and explicit comparison across examples.

**What this means:** Quiz questions that apply concepts to novel contexts (like gas station management analogies) are the right approach for promoting transfer. Single-context practice produces expertise that doesn't generalize.

**Encode status:**
- **Using:** Profile context allows AI to generate domain-relevant examples and analogies.
- **Using:** Application-type gate questions ask students to apply concepts to scenarios.
- **Not using:** No systematic variation of contexts across quiz questions. The same concept should be tested in multiple different scenarios to promote transfer.
- **Not using:** No explicit "what's the underlying principle?" extraction step that forces the student to identify the transferable rule beneath the specific example.

---

## Part 4: Summary Audit

### What Encode does well (strong alignment with research)

| Method | Evidence Strength | Encode Implementation |
|--------|------------------|----------------------|
| Retrieval practice | g = 0.50-0.61 | Gates, flashcards, quizzes all force retrieval |
| Spaced repetition | 10-30% improvement | FSRS (state-of-the-art algorithm) |
| Generation effect | d = 0.40 | Free-text responses, not multiple choice |
| Desirable difficulty | Strong theoretical framework | Gates slow reading but force deep processing |
| Productive failure | d = 0.36-0.58 | Attempt before feedback, not instruction-first |
| Self-explanation | g = 0.55 | Gate "explain" questions, teach-back mode |
| Successive relearning | d = 1.52-4.19 | FSRS implements this directly |
| Levels of processing | 4x improvement for deep vs shallow | Gates force semantic processing |
| Metacognitive calibration | g = 0.565 | Gates expose fluency illusions |
| External scaffolding (ADHD) | Clinical consensus | Structured reading, algorithmic scheduling |
| Anti-gamification | Supported by habituation research | No points, badges, XP by design |

### What Encode partially does (room to strengthen)

| Method | Gap | Potential Fix |
|--------|-----|---------------|
| Elaborative interrogation | No explicit "why is this true?" forcing causal reasoning | Add mechanistic "why" question type to gate generation |
| Bloom's progression | AI defaults to easier questions | Fixed question shapes in section analysis (planned) |
| Concrete examples | Single examples, no cross-example comparison | AI generates 2 examples + comparison prompt |
| Schema activation | Collected but not compared to post-reading state | Show "before vs after" understanding comparison |
| Curiosity triggering | "Deeper question" buried in feedback text | Surface it as a standalone curiosity prompt |

### What Encode doesn't do (potential additions)

| Method | Evidence Strength | What's Missing |
|--------|------------------|----------------|
| Interleaving | g = 0.42 | Cross-subject flashcard mixing, cumulative quizzes |
| Dual coding | 6.5x recall improvement | Visual encoding prompts, diagram construction tasks |
| Concept mapping (constructed) | g = 0.72-1.08 | Prompted map construction as a learning activity |
| Confidence-based learning | Hypercorrection effect | Confidence ratings before quiz answers |
| ADHD backlog management | Clinical recommendation | Smart backlog triage when cards pile up |
| ADHD session guidance | Executive function support | "Just start" mode that auto-sequences activities |
| Whole-chapter free recall | Better than section-by-section for long-term | "Dump everything you remember" step before synthesis |
| Self-explanation during reading | g = 0.55 | Tutor helper prompts during reading, not just at gates |
| Context variation for transfer | Promotes far transfer | Same concept tested in multiple different scenarios |

### What Encode correctly avoids

| Anti-pattern | Why It's Wrong | Encode's Approach |
|--------------|---------------|-------------------|
| Highlighting | Creates illusion of competence | Not offered — generation instead |
| Gamification | Habituates, undermines intrinsic motivation | Competence feedback, not rewards |
| Re-reading | d = 0.01 effect on retention | Forced retrieval at every step |
| Pre-made concept maps | 60-70% less effective than construction | Mermaid for user construction |
| Passive note-taking | Shallow processing | Active gates at section boundaries |
| Social features | Distraction, comparison anxiety | No social — personal learning only |

---

## Sources

- Craik & Lockhart (1972) — Levels of processing framework
- Ebbinghaus (1885, replicated Murre & Dros 2015) — Forgetting curve
- Cepeda et al. (2006) — Spacing effect meta-analysis (254 studies)
- Cepeda et al. (2008) — Optimal spacing intervals
- Roediger & Karpicke (2006) — Testing effect
- Rowland (2014) — Testing effect meta-analysis (g = 0.50)
- Adesope et al. (2017) — Practice testing meta-analysis (g = 0.61)
- Dunlosky et al. (2013) — 10 learning techniques comparative review
- Brunmair & Richter (2019) — Interleaving meta-analysis (g = 0.42)
- Slamecka & Graf (1978) — Generation effect
- Bertsch et al. — Generation effect meta-analysis (86 studies, d = 0.40)
- Bjork & Bjork (2011) — Desirable difficulties framework
- Paivio (1986) — Dual coding theory
- Mayer (2009) — Multimedia learning (89% transfer improvement)
- Gick & Holyoak (1983) — Schema induction and analogical transfer
- Barkley — ADHD as executive function disorder
- Dodson — Interest-based nervous system (INCUP model)
- Zajonc (1965) — Social facilitation theory
- Rawson & Dunlosky (2022) — Successive relearning (d = 1.52-4.19)
- Chi (1989), Bisra et al. (2018) — Self-explanation effect (g = 0.55)
- Kapur, Sinha & Kapur (2021) — Productive failure (d = 0.36-0.58)
- Agarwal (2019) — Higher-order questions for fact retention
- Gruber et al. (2014) — Curiosity and incidental memory (16.5pp advantage)
- Metcalfe — Hypercorrection effect
- Miller (1956) — Working memory capacity
- Sweller — Cognitive load theory
- Fiorella & Mayer (2014) — Teaching others (g = 0.84)
- Expertium — FSRS algorithm benchmarks
