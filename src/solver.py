def build_plan(A, J, C, O, G, D, B_req, max_cycles):
    """J covers CV1 to tee only; this segment initially contains air.

    Bag draw and retained inventory are incremental to the plan. The fixed,
    pre-primed bag-to-CV1 line retains 1 mL throughout and adds no priming
    command. Add that standing inventory separately in the caller's units.
    """
    values = (A, J, C, O, G, D, B_req, max_cycles)
    if not all(type(x) is int for x in values):
        raise ValueError("Use integer volume units and integer limits")
    if A <= 0 or min(J, C, O, G, D, B_req) < 0 or not (0 <= G < A):
        raise ValueError("Invalid capacity or margin")
    if max_cycles < 1:
        raise ValueError("Invalid cycle limit")
    buffer_effective = max(B_req, G)
    B = buffer_effective - C  # Internal tee-relative offset, not a user input.
    if B >= A:
        raise ValueError("Final buffer leaves no forward capacity")
    if D == 0:
        return {
            "cycles": 0, "strokes": 0, "buffer_requested": B_req,
            "buffer_effective": buffer_effective, "buffer_applied": False,
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
        "buffer_requested": B_req, "buffer_effective": buffer_effective,
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