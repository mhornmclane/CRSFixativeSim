# Fixative Pump Control

Interactive cycle planning and an implementation specification for applying fixative to a Sterivex filter with a reversible peristaltic pump and two passive check valves.

## Start here

Use the hosted planner: **[Fixative Cycle Planner](https://mhornmclane.github.io/CRSFixativeSim/)**.

Open **index.html** in a browser. It works offline without installation, a server, or external libraries. You can share that file alone to share the interactive planner.

The planner accepts tubing volumes, reverse and forward margins, cartridge volume and required dosage multiplier, and a nonnegative final buffer measured from the cartridge inlet. It calculates the stroke schedule, fixative delivered, fixative lost to the ocean, and fixative retained in the tubing. The animation displays running totals.

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
node tests/check_browser_solver.cjs
```

On Windows, `py -3 tests/check_solver.py` also works when the Python launcher is installed. No third-party Python packages are required.

The Python check verifies the reference implementation against saved fixtures. The Node check executes the solver extracted from the current HTML against the same fixtures and checks cartridge-buffer boundaries and conservation. The fixture coordinate migration preserves the previous stroke and inventory baseline.

## Mechanism and defaults

Ocean ↔ P1 ↔ L1 ↔ T1 → CV2 → L3 → Sterivex F1 → discharge. The branch is bag → fixed 1 mL pre-primed line → CV1 → L2 → T1. L2 measures only CV1 to T1.

Nominal volumes are L1 = 10 mL, L2 = 3 mL, L3 = 3 mL. Reverse overpump and forward retained margins default to 1 mL. The bag-to-CV1 line always contains 1 mL fixative; L1–L3 start empty; ocean priming and sampling precede fixative application. L2 initially contains air.

The final buffer is the volume between the fixative trailing edge and the cartridge inlet. Values below L3 end inside L3, equal to L3 ends at T1, and larger values end in L1. Negative values are rejected; the effective buffer is at least the forward retained margin. Reverse overfill is discarded to the ocean, and the final intake is trimmed to meet the target and buffer.

The default cartridge volume is 7 mL and required dosage is 5×, giving a calculated target of 35 mL. With a 1 mL terminal buffer, the default schedule is reverse [14, 11, 11, 8] mL and forward [9, 9, 9, 11] mL: 44 mL drawn, 35 mL delivered, 5 mL ocean loss, 4 mL retained in L1–L3, plus the standing 1 mL upstream of CV1 (5 mL total retained).

Cartridge shading fills from inlet to outlet over the first cartridge volume, then darkens until the requested dosage is reached. Multipliers at or below 1× show only the corresponding fill, without darkening. The readout reports cumulative delivered mL and cartridge volumes; seawater purge and reverse strokes do not increase shading. Both inputs must be positive and finite. This is dosage progress, not a measure of biological fixation. Cartridge volume is not added again to commanded displacement or modeled tubing inventory.

## Hardware implementation status

This project supplies a planning model and firmware specification, not a hardware driver. Delivered volume is measured at the filter inlet; filter hold-up is excluded. Physical calibration, valve behavior, mixing, compliance, and stopping uncertainty must be addressed using the specification before relying on commanded volumes on actual equipment.

## Continuing development

GitHub Pages publishes the repository root from the `main` branch. The `.nojekyll` file serves the static files directly without Jekyll processing. To update the hosted planner, commit your changes and push to `main`; GitHub Pages redeploys automatically.

Open this folder as a local project in Codex. The specification records the design decisions needed to continue without the original conversation. The next hardware step is to implement the driver interface and measured-volume calibration for the selected pump/controller.

Bag draw means consumption during the plan, excluding the earlier 1 mL prime. The standing bag-to-CV1 inventory adds no commanded volume: bag draw + 1 mL = delivered + ocean loss + total retained in all lines. The unit-agnostic reference solver reports L1–L3 retained inventory; callers add the standing 1 mL in their chosen units.
