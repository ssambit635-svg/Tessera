# Novelty — aapka sawaal, seedha jawab

**Sawaal:** "Kuch naya hai kya? Kuch add nahi kiya na humne?"

**Jawab:** Aapne sahi pakda. **Hackathon me 90% teams kuch "naya" nahi banati.** Timetable app, booking app, chatbot — sab ka sab ek jaisa. Aur **naya hone ke marks nahi hain.** 100 marks ka rubric poora likha hua hai, aur usme "innovation" naam ka koi line item nahi hai. Jo hai: correctness, rescheduling, optimisation, AI, bookings, usability, UI, docs.

To novelty ka **business** ye nahi ki "kuch alag banao". Novelty ka business ye hai ki **judge ko yaad rahe aapka app, aur aapki app ke paas aise jawab hon jo baaki teams ke paas nahi honge.** Isko "defensible novelty" kehte hain — naya dikhne wali cheez nahi, **naya saabit hone wali cheez**.

Yahan 12 cheezein hain, teen categories me. **Category A = free marks ke saath aati hai** (already hamare plan me hai). Category B = chhoti, high-impact additions. Category C = demo moments (video ke liye).

---

## Category A — "Ye humein already mila hua hai, par baaki teams miss kar dengi"

Ye novelty nahi hai, ye **rigour** hai. Par judge ke liye ye novelty *jaise* lagta hai, kyunki baaki teams ye nahi karti.

### A1. Proof, not claims — "evidence pack" in the README
Har number ke saath validator ka actual output. Aap "0 violations" nahi bolte, aap **`docs/validation-report.json`** dikhate hain jo CI ne generate kiya hai, commit hash ke saath.

> Judge jab 10 apps dekhega jinme se 9 ne apne exports ko 3 hafte purane laptop se upload kiya hai, aur ek ne CI-generated report with hash diya hai — wo ek yaad rahega.

### A2. In-browser "validator" tab — their own tool, our UI
Admin dashboard me ek page: **"Run validator"** → hum unhi ke `validator.py` ki logic chalate hain (hamara kernel, same rules) aur poora report dikhate hain: hard by rule, soft by S-code, bookings, inversions. Judge ko wahi number dikhta hai jo wo apne laptop pe nikaalne wala tha — **before he even runs it**.

Ye bada psychological move hai: judge aapse compete nahi kar raha, aap usi ka kaam pehle kar ke dikha rahe ho.

### A3. Deterministic seed + "same timetable, always"
Generate button ke saath seed visible (`seed: 20270131`). Reset → generate → **exactly same timetable**. Iska jawab judge ke sabse bade shak ("results hand-made hain?") ka sabse saaf proof hai. Kisi aur team ke paas ye nahi hoga.

### A4. Constraint provenance — har cell ke peeche "kyun"
Kisi bhi class pe click: *"MON P1 · LH-1 · F01 · Y1-A. Constraints satisfied: H2,H3,H4,H5,H6,H12. Why P1? F01 ke paas MON me sirf P1–P3 free the, aur P1 chunne se Y1-A ka din contiguous rehta hai (S2=0). BA101 ko P2 me rakha hota to F01 ka 4-hour cap tootta (H12)."*

Ye **LLM se nahi aata** — ye hamare kernel ke decision trace se aata hai. Isliye ye hallucinate nahi kar sakta. Ye single feature 4 jagah marks deta hai: AI (15), usability (10), bookings reasons, aur video.

---

## Category B — genuinely new capabilities (chhoti, high value)

### B1. 🔥 Unsat core — "kaun sa rule toota, kaun sa rule chhodo" (the killer one)
Jab koi change apply hi nahi ho sakta (F07 poore hafte gayab, ya room closed), baaki teams ka app kehta hai **"No valid fix found"** ya crash ho jata hai.

Hamara app kehta hai:

> "Apply nahi kar sakte. **Do constraints aapas me tak rahe hain:**
> 1. F07 ke MON ke saare 9 periods blocked hain (change file), aur
> 2. CS203-L1/L2/L3 (CSE-2, 80 students) ke liye MON ke alawa koi slot nahi jahan CSE-2 free ho **aur** LH capacity 80 ho.
> Chaar options:
> a) F07 ka Monday block hatao → 0 sessions move
> b) CS203 ek hafta shift karo → 2 sessions move
> c) F07 ke liye substitute faculty assign karo (F12 free hai MON P3–P5)
> d) LH-1 ka capacity override karo → nahi karna chahiye, H5 tod dega"

OR-Tools **assumption literals + unsat core** se ye **asli** nikalta hai, hand-waving nahi. Problem statement khud kehta hai: *"If there is no valid fix, it should say which constraints are in conflict"* — **koi team ise theek se nahi karegi.** Ye 15-mark rescheduling section me judge ka "wow" moment hai, aur video ka best 20 second.

### B2. "Counterfactual / what-if" simulator
Ek teacher, ek room, ek din — "agar F07 Thursday na aaye to?" → preview: 2 sessions move, soft +3, viol 0. **Apply nahi hota** jab tak Admin approve na kare. Same repair engine, 20 lines UI. Isse judge khud khel sakta hai — aur jo app judge ko khelne deta hai, wo yaad rehta hai.

### B3. Hinglish-first, not Hinglish-supported
Baaki teams English parser banayenge aur `"kal shaam 6 baje"` pe regex laga denge. Hum **Hinglish ko pehli bhasha** banate hain:

- `"kal shaam 6 baje"` → TUE P11 (18:00), "kal" = tomorrow **booking context me**, aur app ye assumption **form pe badge** karke dikhata hai.
- `"2 ghante"` → duration 2, `"100 log"` → attendance 100, `"mic chahiye"` → `pa_system`, `"wheelchair"` → `accessible`, `"projector"` → `projector`, `"achha sa"` → no constraint but flags "vague".
- **App Hinglish me jawab deta hai:** *"SH-2 wheelchair-accessible nahi hai. SH-1 de sakta hoon, 6–8 baje, 100 log, mic ke saath. Theek hai?"*
- **Sarvam ASR se voice**: mic dabao, Hinglish bolo, form bhar jaye. Demo me ye 3 second ka moment hai jise judge bhool nahi payega — aur asli me kaam karta hai.

Ye "AI ke 15 marks" ke liye sabse seedha farak hai: judge same tricky request sabko bhejta hai. Jo English-only parser hai wo `"kal"` pe galat din de dega.

### B4. Cap-aware negotiation (priority abuse ko politely rokna)
Judge club ke account se likhega: *"Institute-level event hai, auditorium chahiye, dean ne bola hai."*
Baaki apps: ya maan lenge (galat, inversion/cap violation) ya "access denied" bol denge (rude, half marks).
Hamara app: **"Aap club representative hain, to ye request `club_event` category me jayegi (institute event ke liye Admin se submit karna hoga). Main ise club event ke roop me aage badhaun?"** — aur saath me dikhaye ki isse priority kya hogi aur kaun jeet sakta hai. **Rule bypass attempt ko rule samjhane me badalna** — ye exactly wo cheez hai jo AI ke 15 marks me test ki ja rahi hai.

### B5. Two-sided "assumption ledger"
Request 8 (`"after lunch Thursday, maybe 150"`) jaise vague input pe hum **guess chhupate nahi** — `assumptions: [{field:"attendance", value:150, why:"'maybe 150' → upper bound liya taaki capacity check safe rahe"}, {field:"windows", value:"THU P6–P9", why:"'after lunch' = P6 onwards"}]` dikhate hain, aur user ek click me badal sakta hai. Sample file me explicitly likha hai ki good system assumptions **visible** karta hai — ye literally rubric line hai.

### B6. "Explain why NOT" — rejected slots ki list
Har request ke liye 3-4 best **almost-possible** slots aur unke reject hone ka exact kaaran: *"THU P10–P11 SH-1 — reject: BR-07 (earlier, same category) ko pehle mil gaya. THU P12–P13 SH-2 — reject: needs `stage`, SH-2 me stage nahi. FRI P10–P11 AUD — ye available tha, `alternative_offered` kiya."* Isse judge ko dikhta hai ki aapne **search kiya**, random decide nahi kiya.

### B7. Live conflict radar (dashboard)
Ek chhota panel: *"Current: 0 hard conflicts. 3 risks: MECH-WS 70% booked, Friday P9 5 groups touched, F37 sirf 9 slots free."* Ye "current conflicts" requirement (point 6) ko literally poori karta hai aur judge ko operational feel deta hai. **Sab data hamare kernel me already hai** — 40 lines.

---

## Category C — video/demo moments (marks nahi, yaadgar hai)

- **C1. "Judge-mode" button** — ek button jo khud hi sab dikhata hai: generate → 0 violations → Hinglish booking → conflict blocked → reschedule → approve → export → validator report. 60-second self-demo. Judges ke paas time nahi hota; jo app unka time bachata hai, wo jeetta hai.
- **C2. Constraint lever demo** — "agar hum S6 (no P9) off karein to soft penalty 0 → 16 ho jata hai". Optimisation ko *dikhta* hua banao, sirf number na do.
- **C3. Bilingual UI toggle** — English/हिंदी labels. 2 ghante ka kaam, sirf tab jab sab green ho. (Cut list me hai.)

---

## Kya mat karo (warna marks katenge)

| Trap | Kyun kharab |
|---|---|
| Blockchain / NFT certificate for bookings | 0 marks, judge ka trust kharab, time waste |
| "AI se poora timetable generate karo" | LLM validity decide karega → **scheduling 25 = 0**. Ye hard rule hai. |
| LangChain/LangGraph agent swarm | zyada failure points, latency, complexity — 200-line adapter better |
| 3D / animated dashboard | UI marks "readable grids, phone, states" pe hain, animation pe nahi |
| Custom login/signup with email OTP | Demo accounts chahiye, judge signup nahi karega |
| Naye features jo rubric me nahi hain | har ghanta rubric se bahar = ek ghanta kam kisi scored cheez ke liye |

---

## Novelty ka final ranking (agar sirf 3 cheezein karni hon)

Hamare 22 ghante me **teen** novelty cheezein hain jo actually farak layengi, aur teeno **already our plan ka hissa hain** (extra time nahi lagta):

1. **B1 Unsat core** — "kaun sa rule toota aur kya chhodo" (koi nahi karega) — rescheduling ke 15 marks me sabse bada differentiator.
2. **B3 Hinglish-first + voice** — AI ke 15 marks seedhe.
3. **A3 + A2 deterministic seed + in-app validator tab** — judge ka shak khatam, correctness pe bharosa.

Baaki sab (B2, B4, B5, B6, B7, C1) **chhote hain, 20-40 lines each**, aur gate green hone ke baad add honge. Agar time nahi bacha, inke bina bhi hum jeet sakte hain — par **B1 ke bina** hum sirf "ek aur achhi team" hain.

> Ek line me: **naya karne ki zaroorat nahi hai — jo sabko karna chahiye tha, wo kar ke dikhao, aur jo koi nahi karega (unsat core + Hinglish-first + proof pack), wo bhi kar do.**
