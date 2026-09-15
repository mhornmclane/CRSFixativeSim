import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from solver import build_plan, cycle_commands

cases=json.loads((ROOT / 'tests' / 'browser-plan-fixtures.json').read_text())
mapping={'cycles':'n','strokes':'strokes','buffer_effective':'effectiveBuffer','delivered':'delivered','ocean_loss':'lost','bag_draw':'bag','retained':'retained'}
for case in cases:
    p,e=case['input'],case['expected']
    plan=build_plan(p['v1'],p['v2'],p['v3'],p['over'],p['under'],p['dose'],p['buffer'],1_000_000_000)
    for name,key in mapping.items():
        assert plan[name]==e[key],(name,p,plan[name],e[key])
    if plan['cycles']==0:
        continue
    for name,key in {'forward_last':'last','forward_penultimate':'penultimate','reverse_last':'lastReverse','loaded_last':'lastLoaded','retained_l1':'remainingL1','retained_l3':'remainingL3'}.items():
        assert plan[name]==e[key],(name,p,plan[name],e[key])
    # Sum a streamed schedule; no dependency on browser schedule helpers.
    reverse_total=forward_total=0
    for i in range(1,plan['cycles']+1):
        r,f=cycle_commands(plan,i)
        reverse_total+=r
        forward_total+=f
    assert reverse_total==plan['bag_draw']
    assert forward_total==p['dose']+p['v3']
    assert plan['bag_draw']==plan['delivered']+plan['ocean_loss']+plan['retained']

for args in [(0,3,3,1,1,30,1,100),(10,3,3,1,10,30,1,100),(10,3,3,1,1,30,10,100),(10,3,3,1,1,30,1,1)]:
    try:
        build_plan(*args)
    except ValueError:
        pass
    else:
        raise AssertionError(('Expected rejection',args))
print(f'PASS: Python reference matches saved browser solver fixtures and streamed command totals for {len(cases):,} cases; invalid inputs and cycle limit rejected.')

