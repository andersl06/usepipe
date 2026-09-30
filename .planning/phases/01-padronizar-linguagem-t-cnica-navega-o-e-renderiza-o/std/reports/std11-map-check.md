# STD-11 map check (interim)

`node tools/std/check-map.ts --map STD/map` exits 1 with 605 errors in the existing full map; zero errors involve the new `std11-*` rows. The pre-existing errors include `skipped` fixup statuses below the tool's supported status enum, duplicated historical path targets, and two Portuguese fixup targets. This is not a clean-map result and must not be used for owner approval. The baseline should be repaired or the validator constrained to active/current rows before 01-47 can satisfy its acceptance criteria.

The independent route-row check returned `total=605 std11=0` using `checkMap({ map: STD/map })` and filtering issue IDs with prefix `std11-`. No `--approve` operation was run.
