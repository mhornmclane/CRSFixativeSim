# Fixative Pump Control

Interactive cycle planning and an implementation specification for applying fixative to a Sterivex filter with a reversible peristaltic pump and two passive check valves.

## Start here

Use the hosted planner: **[Fixative Cycle Planner](https://mhornmclane.github.io/CRSFixativeSim/)**.

Open **index.html** in a browser. It works offline without installation, a server, or external libraries. You can share that file alone to share the interactive planner.

The planner accepts tubing volumes, reverse and forward margins, a desired delivered dose, and a signed terminal buffer. It calculates the stroke schedule, fixative delivered, fixative lost to the ocean, and fixative retained in the tubing. The animation displays running totals.

## Project files

- [index.html](index.html): portable interactive planner and animation; edit this file for UI or browser solver changes.
- [docs/mechanism-and-control.md](docs/mechanism-and-control.md): mechanism, volume definitions, cycle equations, state machine, driver interface, and acceptance criteria for firmware.
- [src/solver.py](src/solver.py): integer-volume reference implementation extracted from the specification.
- [tests/check_solver.py](tests/check_solver.py): reference-solver verification against 1,009 saved browser cases, streamed stroke totals, conservation, and invalid inputs.
- [tests/browser-plan-fixtures.json](tests/browser-plan-fixtures.json): browser solver baseline captured during specification verification; these are model outputs, not physical measurements.
- [references/SimpleCrs.jpg](references/SimpleCrs.jpg): original circuit sketch.

## Run verification

With Python 3 installed, run from the project folder:

```sh
python tests/check_solver.py
```

On Windows, `py -3 tests/check_solver.py` also works when the Python launcher is installed. No third-party Python packages are required.

The saved fixtures check the Python implementation against the browser baseline. They do not execute the current HTML. When changing the algorithm, update both implementations, the specification, and the fixture baseline after independent validation.

## Mechanism and defaults

Ocean ↔ P1 ↔ L1 ↔ T1 → CV2 → L3 → Sterivex F1 → discharge. The fixative bag connects to T1 through L2 and CV1.

Nominal volumes are L1 = 10 mL, L2 = 3 mL, L3 = 3 mL. Reverse overpump and forward retained margins default to 1 mL. Plumbing starts empty; ocean priming and sampling precede fixative application. L2 initially contains air.

A positive terminal buffer remains in L1. Zero moves the trailing edge to T1. A negative buffer enters L3, capped to retain the forward margin before the filter. Negative terminal buffers apply only to the final cycle. Reverse overfill is discarded to the ocean. The final intake is shortened to avoid unnecessary fixative loss.

For a 30 mL dose and 1 mL terminal buffer, the default schedule is reverse [14, 11, 11, 6] mL and forward [9, 9, 9, 6] mL: 42 mL drawn, 30 mL delivered, 5 mL ocean loss, 7 mL retained.

## Hardware implementation status

This project supplies a planning model and firmware specification, not a hardware driver. Delivered volume is measured at the filter inlet; filter hold-up is excluded. Physical calibration, valve behavior, mixing, compliance, and stopping uncertainty must be addressed using the specification before relying on commanded volumes on actual equipment.

## Continuing development

GitHub Pages publishes the repository root from the `main` branch. The `.nojekyll` file serves the static files directly without Jekyll processing. To update the hosted planner, commit your changes and push to `main`; GitHub Pages redeploys automatically.

Open this folder as a local project in Codex. The specification records the design decisions needed to continue without the original conversation. The next hardware step is to implement the driver interface and measured-volume calibration for the selected pump/controller.
