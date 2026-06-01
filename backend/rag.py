import math
import re
from collections import Counter


def _tokenize(text: str) -> list:
    words = re.findall(r'\b[a-z]{2,}\b', text.lower())
    bigrams = [f"{words[i]}_{words[i+1]}" for i in range(len(words) - 1)]
    return words + bigrams


def _cosine(vec1: dict, vec2: dict) -> float:
    dot = sum(vec1.get(t, 0) * vec2.get(t, 0) for t in vec2)
    n1 = math.sqrt(sum(v * v for v in vec1.values()))
    n2 = math.sqrt(sum(v * v for v in vec2.values()))
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (n1 * n2)


class RAGRetriever:
    def __init__(self):
        self._corpus = []
        self._metadata = []
        self._tfidf = []
        self._idf = {}  # term -> idf weight, computed across the corpus

    def _compute_idf(self, tokenized_docs: list) -> dict:
        """Smoothed IDF (scikit-learn style): log((n+1)/(df+1)) + 1.

        The +1 prevents the degenerate case where every corpus doc contains a
        term (df=n → log(1)=0). Without smoothing, a small homogeneous corpus
        collapses every term's IDF to 0.
        """
        n = len(tokenized_docs)
        df = Counter()
        for tokens in tokenized_docs:
            df.update(set(tokens))
        return {term: math.log((n + 1) / (df[term] + 1)) + 1 for term in df}

    def _vectorize(self, tokens: list, idf: dict) -> dict:
        tf = Counter(tokens)
        total = max(len(tokens), 1)
        return {term: (count / total) * idf.get(term, 0.0) for term, count in tf.items()}

    def build_index(self):
        from database import get_all_comprehensions, get_all_rag_documents

        comprehensions = get_all_comprehensions()
        rag_docs = get_all_rag_documents()

        self._corpus = []
        self._metadata = []

        for c in comprehensions:
            text = (
                f"reading comprehension topic {c['topic']} "
                f"grade {c['grade_level']} objective {c['learning_objective']}"
            )
            self._corpus.append(text)
            self._metadata.append({"type": "comprehension", "data": c})

        for d in rag_docs:
            self._corpus.append(d["content"])
            self._metadata.append({"type": "rag_doc", "data": d})

        if self._corpus:
            tokenized = [_tokenize(d) for d in self._corpus]
            self._idf = self._compute_idf(tokenized)
            self._tfidf = [self._vectorize(t, self._idf) for t in tokenized]
        else:
            self._idf = {}
            self._tfidf = []

    def retrieve(self, query: str, top_k: int = 3, grade_filter: int = None) -> list:
        if not self._corpus:
            return []

        # The old code re-ran _build_tfidf on the query alone, computing IDF
        # over a single doc — log((1+1)/(df+1)) = 0 for every term, so the
        # query vector was always all-zeros and retrieve() always returned
        # nothing. Reuse the corpus IDF so the query gets real weights.
        query_vec = self._vectorize(_tokenize(query), self._idf)
        scored = [
            (i, _cosine(query_vec, doc_vec))
            for i, doc_vec in enumerate(self._tfidf)
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        results = []
        for idx, score in scored:
            if len(results) >= top_k:
                break
            if score < 0.05:
                continue
            meta = self._metadata[idx]
            if grade_filter and meta["type"] == "comprehension":
                if abs(meta["data"].get("grade_level", 0) - grade_filter) > 2:
                    continue
            results.append({
                "content": self._corpus[idx],
                "metadata": meta,
                "score": score,
            })

        return results

    def build_context(self, query: str, grade_level: int = None) -> str:
        if not self._corpus:
            return ""

        results = self.retrieve(query, top_k=3, grade_filter=grade_level)
        if not results:
            return ""

        parts = ["Relevant context from previous reading activities:"]
        for r in results:
            d = r["metadata"]["data"]
            if r["metadata"]["type"] == "comprehension":
                content = d.get("content", {})
                passage = content.get("passage", {})
                parts.append(
                    f"- Topic: {d['topic']} | Grade {d['grade_level']} | "
                    f"Passage words: {passage.get('word_count', 'N/A')}"
                )
            else:
                parts.append(f"- {d['content'][:150]}")

        return "\n".join(parts)


rag_retriever = RAGRetriever()
