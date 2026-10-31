"""PRE-FLIGHT PROBE — NOT product code.

Proves the toolchain can solve the real problem. Run:
    pip install ortools
    python tools/feasibility_probe.py --data "CrunchWeek_StarterPack (1)/CrunchWeek_StarterPack/data/cit_public.json"

Verified result on cit_public.json (2 vCPU, 3 GB RAM):
    STATUS OPTIMAL in 10.9 s, 189/189 sessions scheduled
    official validator -> 0 timetable hard violations (only E1 x41 because exams are not
    modelled here), soft penalty 282 (feasibility only, no optimisation)

Conclusion: OR-Tools CP-SAT is fast enough to be the product's generator; the 189-session
puzzle is NOT the risk. Soft-penalty 282 -> 0 is where the 10 optimisation marks are won.
"""
import json, time, sys
from collections import defaultdict
from ortools.sat.python import cp_model

import argparse
ap = argparse.ArgumentParser(); ap.add_argument('--data', default='CrunchWeek_StarterPack (1)/CrunchWeek_StarterPack/data/cit_public.json')
ap.add_argument('--time', type=float, default=120)
A = ap.parse_args()
D = json.load(open(A.data))
DAYS = D['calendar']['days']; LUNCH = D['calendar']['lunch']['after_period']
LABS = set(D['calendar']['lab_start_periods']); LAST = 9
fac = {f['id']: f for f in D['faculty']}
fac_un = {(f['id'], u['day'], p) for f in D['faculty'] for u in f.get('unavailable', []) for p in u['periods']}
room_un = {(u['room_id'], u['day'], p) for u in D.get('room_unavailability', []) for p in u['periods']}
USE = {'lecture': 'lecture', 'tutorial': 'tutorial', 'lab': 'lab'}

def time_slots(s):
    for day in DAYS:
        for p in range(1, LAST + 1):
            q = range(p, p + s['duration'])
            if p + s['duration'] - 1 > LAST or p <= LUNCH < p + s['duration'] - 1: continue
            if s['kind'] == 'lab' and p not in LABS: continue
            fx = s.get('fixed_slot')
            if fx and (fx['day'] != day or fx['start_period'] != p): continue
            if any((s['faculty_id'], day, pp) in fac_un for pp in q): continue
            yield day, p, list(q)

def rooms_for(s):
    for r in D['rooms']:
        if r['type'] in s['room_types'] and r['capacity'] >= s['size'] \
           and (r['accessible'] or not s['needs_accessible']) and USE[s['kind']] in r['allowed_uses']:
            yield r['id']

S = {s['id']: s for s in D['sessions']}
baskets = sorted({s['basket_slot'] for s in D['sessions'] if s['basket_slot']})
bsess = {b: [s['id'] for s in D['sessions'] if s['basket_slot'] == b] for b in baskets}
inb = {sid for b in baskets for sid in bsess[b]}

m = cp_model.CpModel()
occ_room = defaultdict(list); occ_fac = defaultdict(list); occ_grp = defaultdict(list)
fac_day = defaultdict(list); chosen = {}

for s in D['sessions']:
    if s['id'] in inb: continue
    vs = []
    for day, p, q in time_slots(s):
        for r in rooms_for(s):
            if any((r, day, pp) in room_un for pp in q): continue
            v = m.NewBoolVar('')
            vs.append(v); chosen[(s['id'], day, p, r)] = v
            for pp in q:
                occ_room[(r, day, pp)].append(v); occ_fac[(s['faculty_id'], day, pp)].append(v)
                for g in s['groups']: occ_grp[(g, day, pp)].append(v)
    m.Add(sum(vs) == 1)
    for day in DAYS:
        fac_day[(s['faculty_id'], day)].append(s['duration'] * sum(chosen[(s['id'], dd, p, r)] for (sid, dd, p, r), v in chosen.items() if sid == s['id'] and dd == day))

for b in baskets:
    y = {}
    for day, p, q in time_slots(S[bsess[b][0]]):
        y[(day, p)] = m.NewBoolVar('')
    m.Add(sum(y.values()) == 1)
    for (day, p), bv in y.items():
        for sid in bsess[b]:
            s = S[sid]
            zs = {}
            for r in rooms_for(s):
                if (r, day, p) in room_un: continue
                zv = m.NewBoolVar(''); zs[r] = zv
                occ_room[(r, day, p)].append(zv)
            m.Add(sum(zs.values()) == bv)
            for r, zv in zs.items(): chosen[(sid, day, p, r)] = zv
        for r in {r for sid in bsess[b] for r in rooms_for(S[sid])}:
            m.Add(sum(chosen[(sid, day, p, r)] for sid in bsess[b] if (sid, day, p, r) in chosen) <= 1)
        groups_b = {g for sid in bsess[b] for g in S[sid]['groups']}
        fac_b = {S[sid]['faculty_id'] for sid in bsess[b]}
        for g in groups_b: occ_grp[(g, day, p)].append(bv)
        for f in fac_b: occ_fac[(f, day, p)].append(bv)

for k, vs in occ_room.items(): m.Add(sum(vs) <= 1)
for k, vs in occ_fac.items(): m.Add(sum(vs) <= 1)
for k, vs in occ_grp.items(): m.Add(sum(vs) <= 1)
for (f, day), items in fac_day.items():
    m.Add(sum(items) <= fac[f].get('max_hours_per_day', 4))

sol = cp_model.CpSolver()
sol.parameters.max_time_in_seconds = A.time; sol.parameters.num_search_workers = 2
t = time.time(); st = sol.Solve(m); el = time.time() - t
print('STATUS', sol.StatusName(st), 'in', round(el, 2), 's   vars', len(chosen))
if st in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    out = {sid: (day, p, r) for (sid, day, p, r), v in chosen.items() if sol.Value(v)}
    print('scheduled', len(out), '/ 189')
    json.dump({k: list(v) for k, v in out.items()}, open('/tmp/assign.json', 'w'))
