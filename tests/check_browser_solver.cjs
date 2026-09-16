const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('  function solvePlan(p)');
const end = html.indexOf('  const root=document', start);
const solve = new Function(html.slice(start, end) + '\nreturn solvePlan;')();
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-plan-fixtures.json'), 'utf8'));
for (const {input, expected} of cases) {
  const actual = solve(input);
  for (const [key, value] of Object.entries(expected)) {
    assert.ok(Math.abs(actual[key] - value) < 1e-7, `${key}: ${actual[key]} != ${value}`);
  }
}
const defaults = {v1:10, v2:3, v3:3, over:1, under:1, dose:30, buffer:1};
for (const buffer of [0, 0.5, 1, 3, 4, 12]) {
  const p = solve({...defaults, buffer});
  assert.equal(p.effectiveBuffer, Math.max(buffer, defaults.under));
  assert.equal(p.remainingL1 + p.remainingL3, p.effectiveBuffer);
  assert.equal(p.v3 + p.lastLoaded - p.last, p.effectiveBuffer);
  assert.equal(p.bag, p.delivered + p.lost + p.retained);
}
assert.equal(solve(defaults).lastReverse, 3);
assert.equal(solve({...defaults, under:0, buffer:0}).effectiveBuffer, 0);
assert.equal(solve({...defaults, v3:0}).remainingL1, 1);
assert.equal(solve({...defaults, dose:0}).bag, 0);
assert.throws(() => solve({...defaults, buffer:-1}), /zero or greater/);
assert.throws(() => solve({...defaults, buffer:13}), /L1 \+ L3/);
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new Function(script[1]);
console.log(`PASS: ${cases.length} browser solver fixtures, cartridge buffer boundaries, conservation, and script syntax.`);

const {dosageTarget, cartridgeAppearance, deliveredAtStage} = new Function(
  html.slice(start, end) + '\nreturn {dosageTarget,cartridgeAppearance,deliveredAtStage};'
)();
assert.equal(dosageTarget(7, 5), 35);
assert.equal(dosageTarget(7.5, 0.5), 3.75);
for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
  assert.throws(() => dosageTarget(bad, 5), /positive, finite/);
  assert.throws(() => dosageTarget(7, bad), /positive, finite/);
}
assert.throws(() => dosageTarget(Number.MAX_VALUE, 5), /numeric range/);
assert.throws(() => dosageTarget(Number.MIN_VALUE, 0.1), /numeric range/);
for (const [delivered, fill, opacity] of [[0,0,.22],[3.5,.5,.22],[7,1,.22],[21,1,.56],[35,1,.9]]) {
  const appearance = cartridgeAppearance(delivered,7,5);
  assert.equal(appearance.fill,fill);
  assert.ok(Math.abs(appearance.opacity-opacity)<1e-10);
}
assert.deepEqual(cartridgeAppearance(3.5,7,.5), {volumes:.5,fill:.5,opacity:.22});
assert.deepEqual(cartridgeAppearance(7,7,1), {volumes:1,fill:1,opacity:.22});
const derived = solve({...defaults,dose:dosageTarget(7,5)});
assert.equal(derived.delivered,35);
assert.equal(derived.totalForward,38); // L3 purge is added once; cartridge volume is not added again.
assert.equal(deliveredAtStage(0,0,100,3),0);
assert.equal(deliveredAtStage(2,0,2.9,3),0);
assert.equal(deliveredAtStage(2,0,6.5,3),3.5);
assert.equal(deliveredAtStage(3,9,0,3),6); // Reverse motion contributes no forward delivery.
assert.equal(deliveredAtStage(4,9,8,3),14);
// Seeking is stateless, including backward seeks and entry to the next reverse stroke.
for (const [stage,prior,current,expected] of [[4,9,8,14],[2,0,6.5,3.5],[2,0,9,6],[3,9,0,6]]) {
  assert.equal(deliveredAtStage(stage,prior,current,3),expected);
}
assert.ok(!html.includes('data-input="dose"'));
assert.match(html,/data-input="cartridgeVolume"[^>]*value="7"/);
assert.match(html,/data-input="dosageMultiplier"[^>]*value="5"/);
console.log('PASS: dosage inputs, calculated target, shading milestones, sub-volume targets, purge exclusion, and seeking.');

// Execute the actual route construction: CV1 separates the fixed primed line
// from adjustable L2, and both retain the shared distance-per-volume scale.
const drawStart = html.indexOf('  function draw(){');
const routesEnd = html.indexOf('    const before=forwardThrough', drawStart);
const routes = new Function('v2', 'stage', `
  const plan={v1:10,v2,v3:3,under:1},progress=0,nodes=[];
  const svg={clientWidth:600,style:{},setAttribute(){},replaceChildren(){}};
  const state=()=>({target:0}),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const C={bag:'primed-fixative'};
  const el=(tag,attrs={},text='')=>nodes.push({tag,attrs,text});
  ${html.slice(drawStart,routesEnd)}
    return {bagLine,p2,pixelsPerMl,cvx,tee,nodes};
  }
  return draw();
`);
for (const v2 of [0,0.1,3,30,1000]) for (const stage of [0,1,2]) {
  const r=routes(v2,stage);
  assert.ok(Math.abs(r.bagLine.total/r.pixelsPerMl-1)<1e-9);
  assert.ok(Math.abs(r.p2.total/r.pixelsPerMl-v2)<1e-9);
  assert.deepEqual(r.bagLine.at(-1),r.p2[0]);
  assert.deepEqual(r.p2[0],[r.cvx,r.tee]);
  assert.equal(r.nodes.find(n=>n.tag==='polyline').attrs.stroke,'primed-fixative');
}
console.log('PASS: fixed 1 mL supply segment, shared scale, primed startup, and CV1/L2 boundaries.');
