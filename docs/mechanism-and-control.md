# Fixative application: mechanism, volume model and pump-control specification

Version 1.0 · 2026-09-10

This document defines the fixative application operation implemented by the companion [interactive planner](../index.html). It is intended as an algorithm and interface specification for embedded firmware. The solver is an **ideal fluid-displacement model**; translating its commanded volumes into physical motion requires the calibration and state validation described below.

The operation starts after ocean-water priming and sample collection. It draws fixative into a reversible pump circuit and delivers a requested dose to a Sterivex filter. Intermediate cycles retain fixative upstream of the tee. The final cycle may move the trailing edge to the tee or into the filter-side tubing, within a configured limit.

## 1. Fluid circuit and terminology

```text
Ocean ↔ reversible peristaltic pump P1 ↔ L1 ↔ tee T1 → CV2 → L3 → F1 → discharge
                                              ↑
                                  bag → L2 → CV1
```

The drawing is topological: CV1 is included within the bag-to-tee volume L2, and CV2 is included within the tee-to-filter volume L3. Do not count their internal volumes twice.

| Reference | Definition |
|---|---|
| P1 | Reversible peristaltic pump. Forward moves fluid from the ocean toward T1 and F1. Reverse moves fluid from T1 toward P1 and the ocean. |
| T1 | Junction between the pump line, fixative branch and filter line. |
| CV1 | Passive check valve permitting bag → T1 flow and opposing T1 → bag flow. |
| CV2 | Passive check valve permitting T1 → F1 flow and opposing F1 → T1 flow. |
| F1 | Sterivex filter. The current dose accounting plane is its **inlet**. |
| Stroke | One continuous, volume-commanded operation in one direction. This is not one motor step, roller pass or pump revolution. |
| Cycle | One reverse loading stroke followed by one forward delivery stroke. |
| Fixative trailing edge | Boundary between the loaded fixative and the non-fixative fluid following it. That fluid is normally seawater, but can include air during the first cycle. |

### Valve behavior assumed by the model

| Pump operation | CV1 | CV2 | Intended flow |
|---|---|---|---|
| Forward | Closed | Open | P1 → L1 → T1 → L3 → F1 |
| Reverse | Open | Closed | Bag → L2 → T1 → L1 → P1 |
| Stopped | No modeled flow | No modeled flow | Fluid inventory held constant |

These are expected passive valve states, not valve-actuator commands or proof that the valves physically attained those states.

## 2. Volume definitions and solver inputs

All displayed volumes are in mL. Firmware should use a documented integer volume unit, such as µL, and signed arithmetic for the final buffer. An integer representation does not imply that the hardware is accurate to that unit.

| Symbol | Firmware name | Browser variable | Definition | Example |
|---|---|---|---|---:|
| A | `l1_capacity` | `v1` | Effective internal volume between the defined pump reference plane and T1 | 10 mL |
| J | `l2_capacity` | `v2` | Effective internal volume from bag outlet to T1, including CV1 and associated fittings | 3 mL |
| C | `l3_capacity` | `v3` | Effective internal volume from T1 to F1 inlet, including CV2 and associated fittings | 3 mL |
| O | `reverse_overpump_margin` | `over` | Extra commanded reverse volume above A on a full load; first full load also primes J | 1 mL |
| G | `forward_retained_margin` | `under` | Minimum fixative reserve in L1 after intermediate forward strokes; also the terminal reserve required ahead of F1 | 1 mL |
| D | `target_fixative_dose` | `dose` | Requested fixative volume crossing the F1 inlet during this operation | 30 mL |
| B_req | `requested_final_buffer` | `buffer` | Signed terminal position of the fixative trailing edge, referenced to T1 | +1 mL |

Use measured effective volumes. Assign connector, tee and valve cavities to defined segments once, with no gaps or duplication. The pump reference plane and any pump-tube hold-up must be reconciled with the overfill assumption in Section 3.

### Signed final buffer

| Value | Terminal condition |
|---|---|
| B > 0 | B mL of fixative remains in L1 immediately upstream of T1. |
| B = 0 | Fixative trailing edge is at T1. |
| B < 0 | Non-fixative fluid has advanced `−B` mL beyond T1 into L3. |

The downstream distance, expressed as fluid volume, from the final trailing edge to F1 is `C + B`. Preserve the forward margin by applying:

```text
B_min = G − C
B     = max(B_req, B_min)
```

Record both requested and effective buffers. A capped input must be reported; it is not silently interpreted as the requested value.

For `C = 3 mL` and `G = 1 mL`, the minimum is `B = −2 mL`. At that setting, L1 contains no retained fixative and L3 retains 1 mL ahead of F1. If `G = 0`, the theoretical limit permits the trailing edge to reach the F1 inlet, but not pass it. A zero margin provides no allowance for physical uncertainty.

This signed-buffer permission applies **only to the final forward stroke**. Intermediate cycles retain at least G in L1. A terminal negative buffer must not be followed by an ordinary reload cycle: reverse pumping cannot remove the non-fixative fluid isolated in L3 behind CV2.

## 3. Initial conditions and model assumptions

### Physical startup

1. All plumbing initially contains air; the ocean and supply bag contain their respective liquids.
2. A separate ocean-priming procedure fills the main path, pump and filter with seawater and establishes sampling flow.
3. Sample collection completes before fixative application starts.
4. At the start of this solver's operation, L1 and L3 contain seawater; L2 is modeled as air-filled. Fixative inventories are zero.

Ocean priming and sample collection are outside the solver's stroke count and fixative totals. Their required displacement is **not** specified by this model: intake plumbing, pump and filter hold-up are not all known. The animation's startup timing is illustrative, not a firmware command.

If L2 is prefilled, partly wet, or contains seawater rather than air, the initial condition differs. Do not use the empty-L2 priming allowance unchanged without updating the state model.

### Assumptions used in every calculation

- Commanded displacement equals transported volume in the selected direction.
- Fluid advances as sharp, unmixed segments; no dispersion, air compression, compliance or leakage is modeled.
- CV2 isolates L3 completely during reverse operation. CV1 isolates the bag line during forward operation.
- All fixative displaced beyond L1 toward the pump/ocean is **discarded into the ocean and never recovered** on the next forward stroke.
- The bag can supply every planned reverse stroke; no inlet starvation is modeled.
- Stopping the pump stops fluid motion; no subsequent siphoning or pressure relaxation is modeled.
- F1 internal hold-up is excluded from the quantitative model.

The discard assumption is an explicit design assumption from this mechanism, not a general property of reversible peristaltic plumbing. If fixative remains inside the pump or intake tube and returns on forward pumping, the inventory and boundary calculations change. Hardware characterization must establish a compatible effective reference plane, routing, or revised model.

**Dose interpretation:** D measures fixative arriving at F1's inlet. It does not establish the amount of undiluted fixative exiting F1, filter exposure time, or exchange of its internal hold-up. Those requirements need an explicit filter-volume/exposure model; do not fold unknown filter hold-up into L3 because L3 also defines the physical inlet boundary limit.

## 4. Input validation and numerical contract

Reject configurations that violate any of the following:

```text
A > 0
J >= 0, C >= 0, O >= 0, G >= 0, D >= 0
G < A
B_req is finite and representable as a signed volume
B = max(B_req, G − C)
B < A
```

The browser permits zero-volume L2/L3 as mathematical limits. Real fittings and check valves still have volume and must be included in calibration.

If validated `D = 0`, return an empty fixative plan: no reverse or forward strokes, no bag consumption, no fixative losses. Do not pump merely to establish the requested final buffer.

Use checked signed integer operations for additions, products and buffer calculations. Set board-specific bounds on inputs, total displacement, cycle count and execution time. The browser's one-billion-cycle guard is a numerical limit, not a suitable operational limit for embedded hardware.

Use integer ceiling division rather than the browser's floating-point near-integer correction. For nonnegative a and positive b:

```text
ceil_div(a, b) = (a // b) + (1 if a % b != 0 else 0)
```

## 5. Planning equations

This algorithm meets D exactly in the ideal continuous-volume model and uses the minimum number of cycles **within the stated policy**: intermediate loads fill L1, intermediate forward strokes preserve G, and the final load is trimmed to end at B. It is not a global optimization over arbitrary priming methods or load policies.

### 5.1 Forward capacity and number of cycles

```text
F = A − G                  # normal intermediate forward stroke
S = D + C                  # total forward displacement needed
H = A − B                  # maximum final forward stroke with L1 full

N = 1 + ceil_div(max(0, S − H), F)
```

The first C mL of accumulated forward motion purges the original seawater from L3. Only later forward displacement is counted as fixative delivered. This remains true when the purge spans several cycles.

### 5.2 Forward-stroke allocation

Initially set:

```text
Q_last = S − (N − 1) × F
Q_penultimate = F
```

If `Q_last <= 0`, a large positive terminal buffer requires a shorter penultimate stroke:

```text
Q_last = H
Q_penultimate = S − Q_last − (N − 2) × F
```

That branch requires `N >= 2`. The resulting schedule is:

```text
Q_i = Q_last           if i = N
      Q_penultimate    if i = N − 1
      F                otherwise
```

For `N = 1`, there is only `Q_last = S` and no penultimate stroke. All scheduled forward strokes must be positive. Assert:

```text
sum(Q_i) = S
Q_i <= A − G                 for i < N
Q_last <= A − B
```

### 5.3 Intermediate reverse strokes

For cycles before the final cycle:

```text
R_1 = J + A + O              # first full load primes L2
R_i = A + O                  # later full loads, 1 < i < N
```

If r mL of fixative is already in L1 before a later full load, that load discards `r + O` mL toward the ocean. Thus the reverse overpump parameter is **not** the total loss on every cycle.

### 5.4 Trimmed final reverse stroke

Let:

```text
L_final = Q_last + B         # fixative required in L1 before final forward
r_prev = 0                  if N = 1
         A − Q_(N−1)        otherwise

R_last = L_final − r_prev + (J if N = 1 else 0)
```

Assert `0 <= L_final <= A` and `R_last >= 0`. No reverse overpump margin is added to the final load. Its ideal ocean loss is zero. This is deliberate: the final intake is sized to deliver the remaining dose and leave the selected terminal buffer.

If `N = 1`, the only reverse stroke is this trimmed stroke, **not** `J + A + O`. It can leave air above the fixative in L1. The final-buffer calculation tracks the fixative trailing edge, not necessarily a seawater-only interface.

## 6. Executable planning reference

The following Python is a compact reference for porting to C, C++, Rust or another embedded language. Every argument and returned volume uses the same integer volume unit. It defines arithmetic only; it does not operate hardware. The caller supplies a device-appropriate `max_cycles`.

```python
def build_plan(A, J, C, O, G, D, B_req, max_cycles):
    values = (A, J, C, O, G, D, B_req, max_cycles)
    if not all(type(x) is int for x in values):
        raise ValueError("Use integer volume units and integer limits")
    if A <= 0 or min(J, C, O, G, D) < 0 or not (0 <= G < A):
        raise ValueError("Invalid capacity or margin")
    if max_cycles < 1:
        raise ValueError("Invalid cycle limit")
    B = max(B_req, G - C)
    if B >= A:
        raise ValueError("Final buffer leaves no forward capacity")
    if D == 0:
        return {
            "cycles": 0, "strokes": 0, "buffer_requested": B_req,
            "buffer_effective": B, "buffer_applied": False,
            "delivered": 0, "ocean_loss": 0, "bag_draw": 0,
            "retained": 0,
        }

    F, S, H = A - G, D + C, A - B
    extra = max(0, S - H)
    N = 1 + extra // F + (1 if extra % F else 0)
    if N > max_cycles:
        raise ValueError("Cycle limit exceeded")

    q_last = S - (N - 1) * F
    q_penultimate = F
    if q_last <= 0:
        q_last = H
        q_penultimate = S - H - (N - 2) * F

    loaded_last = q_last + B
    previous_reserve = 0 if N == 1 else A - q_penultimate
    r_last = loaded_last - previous_reserve + (J if N == 1 else 0)
    assert 0 < q_last <= H and 0 <= loaded_last <= A and r_last >= 0
    if N > 1:
        assert 0 < q_penultimate <= F

    m = N - 1
    loss = 0 if m == 0 else m * O + (m - 1) * G
    bag = (J + m * (A + O) if m else 0) + r_last
    retained_l1 = max(0, B)
    retained_l3 = C + min(0, B)
    retained = J + retained_l1 + retained_l3
    assert bag == D + loss + retained

    return {
        "A": A, "J": J, "C": C, "O": O, "G": G,
        "cycles": N, "strokes": 2 * N,
        "buffer_requested": B_req, "buffer_effective": B,
        "buffer_applied": True, "forward_full": F,
        "forward_penultimate": q_penultimate,
        "forward_last": q_last, "reverse_last": r_last,
        "loaded_last": loaded_last, "forward_total": S,
        "delivered": D, "ocean_loss": loss, "bag_draw": bag,
        "retained_l1": retained_l1, "retained_l2": J,
        "retained_l3": retained_l3, "retained": retained,
        "initial_seawater_purge": C,
    }


def cycle_commands(plan, i):
    N = plan["cycles"]
    if not 1 <= i <= N:
        raise ValueError("Invalid cycle index")
    if i == N:
        return plan["reverse_last"], plan["forward_last"]
    reverse = plan["A"] + plan["O"] + (plan["J"] if i == 1 else 0)
    forward = (plan["forward_penultimate"] if i == N - 1
               else plan["forward_full"])
    return reverse, forward
```

Generate commands on demand; an N-element command array is unnecessary. In fixed-width firmware, explicitly check overflow before every operation that can exceed the chosen numeric range. Assertions above become validation/error returns rather than uncontrolled device resets.

## 7. Per-stroke accounting and live totals

All values below are **model estimates**, unless independently measured. Count only the fixative operation, not ocean priming or sample collection.

Maintain:

| State variable | Meaning |
|---|---|
| `cycle_index`, `phase` | Current scheduled cycle and direction |
| `stroke_progress` | Estimated transported volume within the current stroke |
| `bag_draw` | Cumulative fixative withdrawn from the bag |
| `ocean_loss` | Cumulative fixative discarded toward the ocean |
| `forward_total` | Cumulative forward displacement since fixative loading began |
| `delivered` | Cumulative fixative crossing F1 inlet |
| `seawater_purge` | Cumulative original L3 seawater crossing F1 inlet |
| `fix_l1`, `fix_l2`, `fix_l3` | Current retained fixative inventories |
| `inventory_valid` | Whether the physical state is still consistent with the model |

### During a reverse stroke

Let r be the L1 fixative inventory at stroke start. Let q be completed reverse displacement, measured from that stroke's start. For the first cycle:

```text
fix_l2(q)       = min(J, q)
fixative_in(q)  = max(0, q − J)
```

For later cycles:

```text
fix_l2(q)       = J
fixative_in(q)  = q
```

For both:

```text
fix_l1(q)      = min(A, r + fixative_in(q))
stroke_loss(q) = max(0, r + fixative_in(q) − A)
fix_l3(q)      = fix_l3_at_stroke_start

bag_draw(q)    = bag_draw_at_stroke_start + q
ocean_loss(q)  = ocean_loss_at_stroke_start + stroke_loss(q)
```

`forward_total`, `delivered` and `seawater_purge` remain unchanged during reverse operation. Bag draw equals q only under the ideal displacement/empty-branch model; actual gas compression or pump slip invalidates that inference.

### During a forward stroke

Let L be the L1 fixative inventory at stroke start: A after a full load, or `L_final` after the trimmed final load. Let P be the forward displacement accumulated before this stroke, and q the current stroke displacement.

```text
forward_total(q) = P + q
seawater_purge(q)= min(C, P + q)
delivered(q)     = max(0, P + q − C)

fix_l1(q)        = max(0, L − q)
fix_l2(q)        = J
fix_l3(q)        = max(0, min(C, P + q) − max(0, q − L))
signed_buffer(q)= L − q
```

Bag draw and ocean loss remain unchanged during forward operation. The `delivered` formula is valid for this schedule because the fixative trailing edge never passes F1. It is not valid for arbitrary extra forward pumping after completion.

At every update, check the inventory balance within the chosen numeric tolerance:

```text
bag_draw = delivered + ocean_loss + fix_l1 + fix_l2 + fix_l3
```

For an implementation that explicitly tracks air and seawater parcels, use a FIFO segment model. In particular, a shortened first-and-final load may place air immediately behind the fixative. Do not relabel that entire segment as seawater merely because the simplified totals only track fixative.

### Closed-form totals for a nonzero target

Let `m = N − 1`, the number of full, non-final reverse loads.

```text
ocean_loss = 0                         if m = 0
             m × O + (m − 1) × G      otherwise

bag_draw   = R_last                    if m = 0
             J + m × (A + O) + R_last otherwise

delivered  = D
fix_l1_end = max(0, B)
fix_l2_end = J
fix_l3_end = C + min(0, B)
retained   = J + C + B
```

The potentially shortened penultimate stroke does not change the earlier loss formula: its extra retained fixative is consumed by the trimmed final intake calculation, not discarded by another full load.

## 8. Embedded operation state machine

```text
EMPTY
  → OCEAN_PRIMING
  → SAMPLING
  → FIXATIVE_READY
  → VALIDATE_AND_PLAN
  → REVERSE_LOAD(i)
  → STOP_AND_SETTLE
  → FORWARD_DELIVER(i)
  → STOP_AND_SETTLE
      ├─ more cycles → REVERSE_LOAD(i+1)
      └─ final cycle → COMPLETE_HOLD

Any active state → STOPPED_FAULT when motion or fluid state becomes uncertain
```

| State | Required behavior |
|---|---|
| `OCEAN_PRIMING` | Run the hardware-specific priming procedure; establish a known main-line/filter state. Do not use the animation duration. |
| `SAMPLING` | Perform the sampling operation; sampling volume is separate from fixative dose. |
| `FIXATIVE_READY` | Pump stopped; verify initial fluid state, usable bag volume and accepted calibration configuration. |
| `VALIDATE_AND_PLAN` | Freeze inputs; compute/cap B; build the plan; check limits, quantized commands and expected final boundary. For D=0, complete without pumping. |
| `REVERSE_LOAD(i)` | Command R_i in reverse; update estimated inventories from completed displacement. |
| `STOP_AND_SETTLE` | Stop motion before reversal; apply device-characterized deceleration and settling requirements. No timing value is supplied by this model. |
| `FORWARD_DELIVER(i)` | Command Q_i forward; update dose and boundary estimates; stop at the accepted displacement limit. |
| `COMPLETE_HOLD` | Pump stopped; retain the final state and totals. No automatic flush, sampling restart or additional forward motion. |
| `STOPPED_FAULT` | Stop the pump, record the fault and last known progress, and mark inventory uncertain when appropriate. Resume only after the state can be reconciled. |

A negative final buffer is a terminal condition for this application sequence. Starting another operation requires an explicit state-aware recovery or reprime procedure; it must not silently assume L3 is still entirely fixative-filled.

## 9. Pump-driver interface and hardware integration

Separate the volume planner from the motion driver. The planner returns volume targets; the driver accepts only a validated, immutable command for one stroke.

An implementation interface can provide:

```text
prepare_stroke(direction, volume_target, calibration_id, motion_limits)
start_stroke()
get_progress() → completed_actuation, estimated_volume, status, fault
stop_stroke()
is_stationary()
```

Required configuration, whose values are not supplied by the diagram or solver:

- Forward and reverse displacement calibration for the selected tubing, pump head and operating conditions.
- Motor actuation unit: steps, encoder counts, revolutions or another measured basis.
- Maximum speed, acceleration, deceleration and stop latency; reversal/settling behavior.
- Pressure, current, runtime or other fault limits appropriate to the actual hardware and available sensors.
- Usable bag volume, including unusable residual volume and any hardware-specific priming allowance.
- Volume uncertainty bounds and accepted dose tolerance.
- Pump/intake dead volume and the physical basis for treating reverse overfill as permanently discarded.

For a calibrated displacement k per actuation unit, nominal actuation is `volume / k`. Use separate direction-specific calibration where needed. Do **not** copy the animation's timing into firmware, or assume motor commands prove liquid transport.

### Quantization and uncertainty

The planner's exact equality `delivered = D` is mathematical. Motor resolution and transport uncertainty can prevent exact physical delivery.

After converting the volume plan to actuation commands, simulate the resulting quantized volume schedule and check its inventories, final buffer and dose range. Do not independently round every stroke and assume the original invariants still hold. A generic rule such as “always round reverse up and forward down” is insufficient for the optimized final intake.

Useful boundary checks, using conservative calibrated bounds, are:

```text
Intermediate forward:
    maximum_forward_volume <= minimum_loaded_fixative − G

Final forward:
    maximum_forward_volume − minimum_loaded_fixative <= minimum_L3_volume − G
```

These checks assume a compatible, valid fluid-state model. Include uncertainty in initial inventories and displacement; mathematical mass balance alone does not demonstrate a physical bound. If no quantized schedule satisfies the configured dose tolerance and boundary reserve, return a planning error or an explicitly revised achievable plan rather than silently relaxing the margins.

### Execution, interruption and logging

- Freeze the plan and calibration identifiers at operation start; UI or communications updates must not alter an active stroke's parameters.
- Advance cycle state only after the driver reports the stroke complete and stationary.
- Record commanded and completed actuation separately from modeled fluid totals.
- On uncertain reset, motor stall, unmeasured stop, air ingestion or leakage indication, do not reissue the full stroke from its beginning.
- Persist operation identifier, plan/configuration version, cycle/phase, completed actuation, inventory estimates and fault state if recovery is supported.
- A saved software snapshot is not proof that the physical fluid boundary stayed in place while power was off. If it cannot be reconciled, mark inventory invalid and require a defined recovery path.

## 10. Worked schedules and acceptance vectors

Unless stated otherwise, these examples use mL and `A=10, J=3, C=3, O=1, G=1`. Fixative delivered excludes the initial L3 seawater purge.

### Example A — target 30 mL, final buffer +1 mL

| Cycle | Reverse | Forward | Fixative delivered this cycle | Ocean loss this cycle | Cumulative delivered |
|---:|---:|---:|---:|---:|---:|
| 1 | 14 | 9 | 6 | 1 | 6 |
| 2 | 11 | 9 | 9 | 2 | 15 |
| 3 | 11 | 9 | 9 | 2 | 24 |
| 4 | 6 | 6 | 6 | 0 | 30 |

Four cycles / eight directional strokes. Bag draw 42 mL; ocean loss 5 mL; retained fixative 7 mL: L1=1, L2=3, L3=3. The first 3 mL forward is the original L3 seawater.

### Example B — target 30 mL, final buffer −2 mL

Cycles 1–3 are unchanged. Final reverse is 3 mL, giving 4 mL of fixative in L1 including its prior 1 mL reserve. Final forward is 6 mL, moving the trailing edge 2 mL into L3.

Totals: four cycles / eight strokes; bag draw 39 mL; delivered 30 mL; ocean loss 5 mL; retained 4 mL: L1=0, L2=3, L3=1. A request of −100 mL is capped to this same −2 mL result.

### Additional acceptance vectors

| D | B_req | Effective B | Reverse sequence | Forward sequence | Delivered | Ocean loss | Bag draw | Retained |
|---:|---:|---:|---|---|---:|---:|---:|---:|
| 30 | 0 | 0 | 14, 11, 11, 5 | 9, 9, 9, 6 | 30 | 5 | 41 | 6 |
| 27 | −2 | −2 | 14, 11, 9 | 9, 9, 12 | 27 | 3 | 34 | 4 |
| 2 | 9 | 9 | 14, 4 | 4, 1 | 2 | 1 | 18 | 15 |
| 1 | 1 | 1 | 8 | 4 | 1 | 0 | 8 | 7 |
| 0 | 1 | Not applied | none | none | 0 | 0 | 0 | 0 |

The `D=2, B=9` case exercises a shortened penultimate forward stroke. The `D=1, B=1` case exercises a single trimmed initial load and possible retained air.

## 11. Firmware verification requirements

Before hardware acceptance, verify:

1. The integer planner reproduces the schedules above after consistent unit conversion.
2. Invalid inputs, overflow and device execution limits produce explicit errors before motion.
3. Capping uses `B_min = G − C`, and requested/effective values are both available in telemetry.
4. The sum of scheduled forward volumes is `D + C` for every nonzero plan.
5. Every intermediate forward stroke leaves at least G in L1; the final trailing-edge distance to F1 is at least G.
6. Final reverse loss is zero in the ideal model, and final retained inventory matches the selected B.
7. At partial reverse/forward progress points, modeled bag draw equals delivered + ocean loss + retained fixative.
8. Long L3 volumes spanning multiple purge cycles and small fractional-volume targets behave correctly.
9. Single-cycle operation, zero target, B=0, negative capped B and shortened penultimate cases are covered.
10. Driver quantization, measured stopping behavior, directional calibration and fault recovery satisfy the physical boundary and dose requirements.

The browser reference was checked against 1,000 independent FIFO inventory simulations and running-total checks at partial stroke positions. The executable Python reference extracted from this Markdown was also compared with the browser solver on 1,009 integer-volume cases, including streamed command totals, signed-buffer limits and invalid-input rejection. These are software-model checks, not evidence of measured pump accuracy, valve isolation or filter dosing performance.

