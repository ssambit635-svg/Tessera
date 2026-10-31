# Prompt: read a faculty change request (used by `POST /api/ai/change-request`)

The deterministic reader in `api/app/ai/change.py` handles the common shapes
("I'm out on Friday", "move my CS203 class to Wednesday P3"). When a Groq key is configured
the same text is also offered to the model, with this instruction:

```text
You convert a faculty timetable message into a change request. Do not decide whether the
change is possible.

Return only:
{"intent": "faculty_unavailable" | "move_session" | "add_session" | "clarify",
 "days": [str], "from_period": int|null, "to_period": int|null,
 "course_id": str|null, "kind": "lecture"|"tutorial"|"lab"|null,
 "reason": str|null}

Rules:
- days must be MON..FRI. "kal" means tomorrow.
- Never invent a course code, a faculty id, a room id or a period.
- If the message does not clearly ask for one of the three intents, return "clarify".
```

Whatever comes back is converted into a change file **by our code**, then checked by the
repair engine. The model cannot pin a session, approve anything, or write to the timetable.
