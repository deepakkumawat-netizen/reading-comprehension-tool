import re

GRADE_PROFILES = {
    3:  {"vocab": "simple everyday words (3-4 letters common)", "sentence": "short 5-8 words", "passage_words": "150-200"},
    4:  {"vocab": "basic academic words, familiar context",      "sentence": "short 6-10 words", "passage_words": "180-230"},
    5:  {"vocab": "grade-appropriate academic words",            "sentence": "medium 8-12 words", "passage_words": "200-280"},
    6:  {"vocab": "academic and domain-specific words",          "sentence": "medium 10-14 words", "passage_words": "250-320"},
    7:  {"vocab": "intermediate academic vocabulary",            "sentence": "medium-long 12-16 words", "passage_words": "280-360"},
    8:  {"vocab": "advanced academic vocabulary",                "sentence": "varied 12-18 words", "passage_words": "300-400"},
    9:  {"vocab": "complex academic and literary words",         "sentence": "long complex 15-20 words", "passage_words": "350-450"},
    10: {"vocab": "sophisticated multisyllabic vocabulary",      "sentence": "complex 15-22 words", "passage_words": "400-500"},
    11: {"vocab": "advanced literary and technical words",       "sentence": "complex 18-25 words", "passage_words": "450-550"},
    12: {"vocab": "collegiate-level vocabulary",                 "sentence": "sophisticated 20+ words", "passage_words": "500-600"},
}


def _count_syllables(word: str) -> int:
    word = word.lower().strip(".,!?;:'\"")
    if not word:
        return 1
    count = len(re.findall(r'[aeiouy]+', word))
    if word.endswith('e') and count > 1:
        count -= 1
    return max(count, 1)


def get_grade_prompt_context(grade_level: int) -> str:
    profile = GRADE_PROFILES.get(grade_level, GRADE_PROFILES[6])
    return (
        f"GRADE LEVEL REQUIREMENTS (Grade {grade_level}):\n"
        f"- Vocabulary: {profile['vocab']}\n"
        f"- Sentence length: {profile['sentence']}\n"
        f"- Passage length: {profile['passage_words']} words\n"
        f"- Questions must target Grade {grade_level} reading comprehension standards\n"
    )


def analyze_text_grade(text: str) -> dict:
    if not text:
        return {}
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    words = re.findall(r'\b\w+\b', text)
    if len(sentences) == 0 or len(words) < 5:
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
    }


def difficulty_label(grade: int) -> str:
    if grade <= 4:    return "Beginner"
    elif grade <= 6:  return "Elementary"
    elif grade <= 8:  return "Intermediate"
    elif grade <= 10: return "Advanced"
    else:             return "Expert"
