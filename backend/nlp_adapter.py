import re

GRADE_PROFILES = {
    1: {
        "vocab":           "high-frequency sight words and simple CVC phonics words (1 syllable)",
        "sentence":        "3-5 words; very short subject-verb sentences",
        "passage_words":   "20-60",
        "fk_target":       "1.0-1.5",
        "blooms":          "Remember only — name, identify, point to",
        "dok":             "DOK 1 — recall",
        "question_style":  "simple who/what questions; one-word or one-phrase answers only",
        "theme":           "immediate world: home, family, pets, colors, basic shapes, simple daily routines",
        "text_structure":  "2-3 very short sentences per idea; single simple topic only",
        "transitions":     "and, but, then, so",
        "definition_style":"1 very short sentence using Kindergarten-Grade 1 words only; e.g. 'A pet is an animal you care for.'",
        "example_style":   "world of a 6-7 year old: toys, family, animals, simple actions",
        "vocab_instruction":"Use ONLY Dolch/Fry sight words and simple CVC decodable words. Every word must be readable by a Grade 1 student.",
    },
    2: {
        "vocab":           "CVCe long-vowel words, digraphs, common irregular sight words (1-2 syllables)",
        "sentence":        "4-7 words; simple sentences with familiar nouns and verbs",
        "passage_words":   "50-100",
        "fk_target":       "1.5-2.5",
        "blooms":          "Remember and Understand — recall, identify, describe simply",
        "dok":             "DOK 1 — recall and reproduction",
        "question_style":  "literal who/what/when/where questions; 1-2 simple 'why' questions",
        "theme":           "daily life of a 7-8 year old: school, friends, simple nature, seasons, family",
        "text_structure":  "one main idea; 2-4 supporting sentences; simple sequence or description",
        "transitions":     "first, next, then, also, because, but",
        "definition_style":"1 simple sentence using Grade 1-2 words with familiar example; e.g. 'Hope means you want something good to happen.'",
        "example_style":   "daily life of a 7-8 year old: school day, playing outside, simple science observations",
        "vocab_instruction":"Use Grade 2 phonics words (CVCe, blends, digraphs) and high-frequency irregular words. Avoid words with 3+ syllables.",
    },
    3: {
        "vocab":           "simple, concrete everyday words (1-2 syllables); words children see in daily life",
        "sentence":        "5-8 words; short, direct sentences with one idea each",
        "passage_words":   "100-200",
        "fk_target":       "2.5-3.5",
        "blooms":          "Remember (recall facts) and Understand (describe in own words)",
        "dok":             "DOK 1 — recall and reproduction",
        "question_style":  "who/what/where/when questions; literal, fact-based only",
        "theme":           "concrete familiar topics: animals, weather, family, community, simple science",
        "text_structure":  "one idea per paragraph; clear topic sentence; simple sequence or description",
        "transitions":     "first, next, then, last, because, also, but",
        "definition_style":"1 simple sentence using only Grade 2-3 words; e.g. 'A habitat is the place where an animal lives.'",
        "example_style":   "daily life of an 8-9 year old: home, school, playground, pets",
        "vocab_instruction":"Choose ONLY words a Grade 3 student (age 8-9) would encounter in class. Avoid multisyllabic words unless they are the topic itself.",
    },
    4: {
        "vocab":           "basic academic words (2-3 syllables); familiar content-area words from science and social studies",
        "sentence":        "6-10 words; mostly simple with occasional compound sentences",
        "passage_words":   "130-230",
        "fk_target":       "3.5-4.5",
        "blooms":          "Remember and Understand; 1-2 Apply questions",
        "dok":             "DOK 1-2 — recall and skill/concept",
        "question_style":  "mostly literal (3-4); 1-2 inferential 'why/how' questions",
        "theme":           "regional geography, life cycles, simple history, community helpers",
        "text_structure":  "2-3 main ideas; simple sequence or compare/contrast",
        "transitions":     "in addition, however, for example, because, as a result",
        "definition_style":"1-2 simple sentences; connect to something the student already knows",
        "example_style":   "relatable to 9-10 year olds: school projects, local nature, basic experiments",
        "vocab_instruction":"Choose Tier 2 academic words appropriate for Grade 4. Definitions must use words simpler than the target word.",
    },
    5: {
        "vocab":           "grade-appropriate academic words (2-4 syllables); Tier 2 vocabulary; content-area terms",
        "sentence":        "8-12 words; mix of simple and compound sentences",
        "passage_words":   "150-280",
        "fk_target":       "4.5-5.5",
        "blooms":          "Understand and Apply; 1-2 Analyze questions",
        "dok":             "DOK 2 — skill and concept",
        "question_style":  "equal mix of literal and inferential; 'how/why/what evidence shows' questions",
        "theme":           "biographies, ecosystems, US history, simple engineering, informational nonfiction",
        "text_structure":  "cause/effect, problem/solution, compare/contrast with clear signal words",
        "transitions":     "consequently, therefore, in contrast, similarly, on the other hand",
        "definition_style":"clear definitions with 1 example sentence; show root word if helpful",
        "example_style":   "relevant to 10-11 year olds: science class, historical events, books they read",
        "vocab_instruction":"Use Tier 2 academic words that appear across subject areas. Include 2-3 Tier 3 content words related to the topic.",
    },
    6: {
        "vocab":           "academic and domain-specific words; multi-syllabic Tier 2-3 vocabulary",
        "sentence":        "10-14 words; compound and complex sentences",
        "passage_words":   "180-320",
        "fk_target":       "5.5-6.5",
        "blooms":          "Apply and Analyze; 1-2 Evaluate questions",
        "dok":             "DOK 2-3 — strategic thinking",
        "question_style":  "inferential and analytical; author's purpose, text evidence, point of view",
        "theme":           "world history, physical science, persuasive writing, literary elements, global issues",
        "text_structure":  "complex informational text; argument and counterargument; multiple text features",
        "transitions":     "furthermore, nevertheless, despite, whereas, in conclusion, on the contrary",
        "definition_style":"precise academic definition with etymology hint when useful; show word family",
        "example_style":   "middle school context: social issues, scientific phenomena, current events",
        "vocab_instruction":"Use Tier 2-3 academic vocabulary. Definitions should be precise and include context clues. Expect students to use words in writing.",
    },
    7: {
        "vocab":           "intermediate academic vocabulary; discipline-specific Tier 2-3 words; abstract concepts",
        "sentence":        "12-16 words; varied complex sentence structures including subordinate clauses",
        "passage_words":   "200-360",
        "fk_target":       "6.5-7.5",
        "blooms":          "Analyze and Evaluate",
        "dok":             "DOK 3 — strategic thinking and extended thinking",
        "question_style":  "analytical; author's argument, bias, multiple perspectives, text evidence integration",
        "theme":           "complex social/scientific/historical topics; multiple perspectives; ethical dilemmas",
        "text_structure":  "rhetorical structures; argument with evidence; multiple viewpoints",
        "transitions":     "consequently, albeit, notwithstanding, conversely, thereby, in lieu of",
        "definition_style":"nuanced definitions; connotation vs denotation; word in multiple contexts",
        "example_style":   "relevant to 12-13 year olds: media literacy, technology, STEM, social justice",
        "vocab_instruction":"Use academic vocabulary that students will encounter in textbooks and standardized tests. Include connotation notes where relevant.",
    },
    8: {
        "vocab":           "advanced academic vocabulary; abstract concepts; discipline-specific academic language",
        "sentence":        "12-18 words; varied complex structures; subordinate and relative clauses",
        "passage_words":   "220-400",
        "fk_target":       "7.5-8.5",
        "blooms":          "Analyze, Evaluate, and introductory Create",
        "dok":             "DOK 3-4 — extended thinking",
        "question_style":  "evaluative and creative; argument analysis, rhetorical choices, extended response",
        "theme":           "ethics, advanced science, historical revisionism, literary criticism, civic issues",
        "text_structure":  "complex rhetorical argument structures; thesis/evidence/analysis",
        "transitions":     "inherently, paradoxically, fundamentally, conversely, explicitly, proportionally",
        "definition_style":"sophisticated definitions; semantic fields; register and connotation",
        "example_style":   "high school preparation: civic participation, scientific research, literary analysis",
        "vocab_instruction":"Use pre-AP level vocabulary. Words should challenge students while remaining accessible with context clues. Definitions should model academic language.",
    },
    9: {
        "vocab":           "complex academic and literary words; technical terminology; abstract high-level vocabulary",
        "sentence":        "15-20 words; complex compound-complex sentences; participial and infinitive phrases",
        "passage_words":   "250-450",
        "fk_target":       "8.5-9.5",
        "blooms":          "Evaluate and Create",
        "dok":             "DOK 3-4",
        "question_style":  "synthesis; thematic analysis, argument evaluation, extended creative application",
        "theme":           "philosophy, advanced science research, historical analysis, literary theory",
        "text_structure":  "scholarly argument; rhetorical analysis; thesis-driven academic writing",
        "transitions":     "paradoxically, predominantly, ostensibly, ubiquitously, contemporaneously",
        "definition_style":"precise scholarly definitions; etymology; field of use; formal register",
        "example_style":   "pre-college: academic writing, research contexts, professional fields",
        "vocab_instruction":"Use SAT/AP level vocabulary. Definitions should be scholarly and precise. Include word origin when it clarifies meaning.",
    },
    10: {
        "vocab":           "sophisticated multisyllabic vocabulary; discipline-specific academic language; college-prep level",
        "sentence":        "15-22 words; sophisticated syntax; embedded clauses; parallel structure",
        "passage_words":   "280-500",
        "fk_target":       "9.5-10.5",
        "blooms":          "Evaluate and Create at high levels",
        "dok":             "DOK 4 — extended thinking",
        "question_style":  "independent analysis; scholarly argumentation; original synthesis",
        "theme":           "advanced research, philosophy, professional discourse, interdisciplinary topics",
        "text_structure":  "complex academic structures; argumentation; research synthesis",
        "transitions":     "subsequently, inherently, ostensibly, paradigmatically, contemporaneously",
        "definition_style":"collegiate definitions; scholarly nuance; disciplinary usage",
        "example_style":   "college-readiness: academic research, professional contexts, global issues",
        "vocab_instruction":"Use AP/pre-collegiate vocabulary. Students should be able to use words in formal academic writing. Definitions should match dictionary precision.",
    },
    11: {
        "vocab":           "advanced literary and technical words; SAT/ACT/AP level vocabulary",
        "sentence":        "18-25 words; complex rhetorical structures; varied syntax for effect",
        "passage_words":   "300-550",
        "fk_target":       "10.5-11.5",
        "blooms":          "Create and Evaluate at advanced levels",
        "dok":             "DOK 4",
        "question_style":  "advanced synthesis; argumentation; original interpretation; extended writing",
        "theme":           "pre-collegiate: literature, research methodology, philosophical inquiry, civic discourse",
        "text_structure":  "academic essay; thesis, evidence, analysis, counterargument",
        "transitions":     "ostensibly, predicated on, inextricably, intrinsically, paradigmatically",
        "definition_style":"sophisticated academic definitions; word families; etymology; register",
        "example_style":   "college preparation: academic writing, research, professional fields, global policy",
        "vocab_instruction":"Use college-level academic vocabulary. Include etymology and word family context. Definitions should prepare students for college reading.",
    },
    12: {
        "vocab":           "collegiate-level vocabulary; technical and field-specific academic language; advanced Tier 3",
        "sentence":        "20+ words; sophisticated complex structures; rhetorical variety",
        "passage_words":   "350-600",
        "fk_target":       "11.5-12.5",
        "blooms":          "All Bloom's levels with emphasis on Create and Evaluate at college level",
        "dok":             "DOK 4",
        "question_style":  "collegiate analysis and synthesis; original argumentation; scholarly response",
        "theme":           "college-ready: advanced research, professional discourse, philosophical debate, global issues",
        "text_structure":  "collegiate academic structures: research paper, argumentative essay, critical analysis",
        "transitions":     "predominantly, contemporaneously, inextricably, paradigmatically, epistemologically",
        "definition_style":"collegiate definitions: scholarly precision, nuance, disciplinary field usage",
        "example_style":   "college contexts: academic research, professional fields, interdisciplinary inquiry",
        "vocab_instruction":"Use AP/collegiate vocabulary. Definitions should match Merriam-Webster academic precision. Students should produce this vocabulary in formal writing.",
    },
}


def _count_syllables(word: str) -> int:
    word = word.lower().strip(".,!?;:'\"")
    if not word:
        return 1
    count = len(re.findall(r'[aeiouy]+', word))
    if word.endswith('e') and count > 1:
        count -= 1
    return max(count, 1)


def get_reading_counts(grade_level: int) -> dict:
    """Grade-calibrated number of questions/vocab items so younger students
    aren't overwhelmed. Passage length is handled separately via passage_words."""
    if grade_level <= 2:
        return {"total_q": 3, "literal": 2, "inferential": 1, "higher": 0, "vocab": 3, "before": 2}
    if grade_level <= 5:
        return {"total_q": 5, "literal": 2, "inferential": 2, "higher": 1, "vocab": 4, "before": 3}
    if grade_level <= 8:
        return {"total_q": 6, "literal": 2, "inferential": 2, "higher": 2, "vocab": 5, "before": 3}
    return {"total_q": 7, "literal": 3, "inferential": 2, "higher": 2, "vocab": 5, "before": 3}


def get_grade_prompt_context(grade_level: int) -> str:
    p = GRADE_PROFILES.get(grade_level, GRADE_PROFILES[7])
    return f"""=== GRADE {grade_level} NLP CALIBRATION REQUIREMENTS ===
You MUST follow every rule below. Content that violates any rule is unacceptable.

VOCABULARY LEVEL:
  {p['vocab_instruction']}
  Complexity profile: {p['vocab']}

SENTENCE & SYNTAX:
  Target sentence length: {p['sentence']}
  Target Flesch-Kincaid Grade Level: {p['fk_target']}
  Use sentence structures natural for Grade {grade_level} readers.

PASSAGE LENGTH: {p['passage_words']} words total.

QUESTION COGNITIVE LEVEL (Bloom's Taxonomy):
  Required levels: {p['blooms']}
  Depth of Knowledge: {p['dok']}
  Question style: {p['question_style']}

DEFINITION STYLE:
  {p['definition_style']}

EXAMPLE / CONTEXT STYLE:
  {p['example_style']}

TOPIC APPROACH:
  Themes appropriate for Grade {grade_level}: {p['theme']}

TEXT STRUCTURE:
  {p['text_structure']}

TRANSITION WORDS TO USE:
  {p['transitions']}
=== END GRADE {grade_level} REQUIREMENTS ==="""


def analyze_text_grade(text: str) -> dict:
    if not text:
        return {}
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if len(s.strip().split()) >= 3]
    words = re.findall(r'\b[a-zA-Z]+\b', text)
    if not sentences or len(words) < 10:
        return {}

    total_syllables = sum(_count_syllables(w) for w in words)
    avg_sentence_len = len(words) / len(sentences)
    syllables_per_word = total_syllables / len(words)

    flesch_ease = round(206.835 - 1.015 * avg_sentence_len - 84.6 * syllables_per_word, 1)
    fk_grade = round(0.39 * avg_sentence_len + 11.8 * syllables_per_word - 15.59, 1)

    return {
        "flesch_reading_ease": flesch_ease,
        "flesch_kincaid_grade": fk_grade,
        "avg_sentence_length": round(avg_sentence_len, 1),
        "word_count": len(words),
        "sentence_count": len(sentences),
    }


def difficulty_label(grade: int) -> str:
    if grade <= 2:    return "Early Reader"
    elif grade <= 4:  return "Beginner"
    elif grade <= 6:  return "Elementary"
    elif grade <= 8:  return "Intermediate"
    elif grade <= 10: return "Advanced"
    else:             return "Expert"
