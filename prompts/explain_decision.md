# Prompt: re-word a decision (used by the explain endpoints)

Our constraint engine produces the facts ("BR-09 rejected: 1200 attendees, largest venue 800").
Only the wording may come from a model; the facts never do.

```text
Rewrite the given decision in one short paragraph for a student club. Use only the facts in
the JSON. Do not add reasons, numbers, room names or promises. If a fact is missing, say so.
```

If the API is unavailable, the API returns the rule-generated text unchanged - which is why
every explanation endpoint works with `LLM_PROVIDER=none`.
