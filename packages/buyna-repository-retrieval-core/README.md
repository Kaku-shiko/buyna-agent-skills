# Repository retrieval core

Build a read-only, content-addressed index of the active manifest Skills and Markdown references. Search exact words and Chinese bigrams with explicit commerce terminology aliases. Results include file paths, line ranges and hashes. Excludes customer documents, credentials, obsolete Skills, symlinks, oversized files and generated artifacts.

This is the lexical baseline of the RAG plan, not an embedding/vector search implementation. Builder loads mandatory rules and registered module source as before, and adds at most five selected-Skill reference chunks within 9000 characters. Cache only immutable release content; restart for a new release. Never place customer text in the shared index. Retrieval failure falls back to exact loading.
