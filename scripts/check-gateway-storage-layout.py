#!/usr/bin/env python3
"""Storage-layout gate for the Gateway proxy (docs/gateway-spec.md, P16).

Compares the layout of contracts/Gateway.sol (from `forge inspect`) with the latest implementation recorded in
every OpenZeppelin manifest under .openzeppelin/. An upgrade to this code must keep, for every deployed variable,
its slot, offset and type, keep IGateway.Order's members, and only take new variables from the start of a
`__gap` whose end slot is unchanged.

usage: check-gateway-storage-layout.py [--forge FORGE]
"""
import argparse
import glob
import json
import re
import subprocess
import sys

# Manifests that do not describe a proxy this code may upgrade, with the reason. Each is still reported.
EXCEPTIONS = {
    "arbitrum-sepolia.json": (
        "an older Arbitrum Sepolia testnet proxy (0x663C5BfE...9338) whose only recorded implementation predates "
        "the current fee model (supportedInstitutions storage); the live Arbitrum Sepolia gateway is tracked in "
        "unknown-421614.json. This code is NOT layout-compatible with that old proxy: never upgrade it to this code."
    ),
}


def norm_type(t):
    """Drop solc AST ids so the same type from different builds compares equal."""
    return re.sub(r"\)\d+_", ")_", t)


def gap_slots(t):
    m = re.match(r"t_array\(t_uint256\)(\d+)_storage", t)
    return int(m.group(1)) if m else None


def struct_members(types, t):
    entry = types.get(t) or {}
    return [(m["label"], norm_type(m["type"])) for m in entry.get("members") or []]


def value_size(t):
    """Bytes a value type takes, or None for a type that always starts and ends a slot."""
    if t in ("t_address", "t_contract"):
        return 20
    if t == "t_bool":
        return 1
    m = re.fullmatch(r"t_u?int(\d+)", t) or re.fullmatch(r"t_bytes(\d+)", t)
    if m:
        return int(m.group(1)) // 8 if t.startswith(("t_uint", "t_int")) else int(m.group(1))
    return None


def assign_slots(layout):
    """Older manifests (the Tron ones) record no slots: lay the variables out the way solc does."""
    if all("slot" in e for e in layout["storage"]):
        return layout
    slot, off = 0, 0
    for e in layout["storage"]:
        size = value_size(e["type"])
        if size is None:
            if off:
                slot, off = slot + 1, 0
            e["slot"], e["offset"] = str(slot), 0
            slot += gap_slots(e["type"]) or 1
        else:
            if off + size > 32:
                slot, off = slot + 1, 0
            e["slot"], e["offset"] = str(slot), off
            off += size
            if off == 32:
                slot, off = slot + 1, 0
    return layout


def check(old, new, name):
    errors = []
    new_at = {(int(e["slot"]), int(e["offset"])): e for e in new["storage"]}
    old_keys = set()
    for e in old["storage"]:
        slot, off = int(e["slot"]), int(e["offset"])
        old_keys.add((slot, off))
        n = new_at.get((slot, off))
        if e["label"] == "__gap":
            size = gap_slots(e["type"])
            end = slot + size - 1
            # The gap may have shrunk from the front: some __gap must still end at the same slot.
            ok = any(
                g["label"] == "__gap" and int(g["slot"]) + gap_slots(g["type"]) - 1 == end and int(g["slot"]) >= slot
                for g in new["storage"]
            )
            if not ok:
                errors.append(f"{name}: __gap at slot {slot} (ends {end}) no longer ends at slot {end}")
            continue
        if n is None:
            errors.append(f"{name}: {e['label']} @ slot {slot}+{off} is gone")
            continue
        if n["label"] != e["label"]:
            errors.append(f"{name}: slot {slot}+{off} was {e['label']}, now {n['label']}")
        if norm_type(n["type"]) != norm_type(e["type"]):
            errors.append(f"{name}: {e['label']} type {e['type']} -> {n['type']}")
        if e["type"].startswith("t_mapping") or e["type"].startswith("t_struct"):
            # Compare the members of any struct the variable stores.
            for ot in re.findall(r"t_struct\([A-Za-z]+\)\d+_storage", e["type"]):
                nt = next((x for x in re.findall(r"t_struct\([A-Za-z]+\)\d+_storage", n["type"])
                           if norm_type(x) == norm_type(ot)), None)
                om = struct_members(old["types"], ot)
                nm = struct_members(new["types"], nt) if nt else []
                if om and nm[: len(om)] != om:
                    errors.append(f"{name}: struct {norm_type(ot)} members changed: {om} -> {nm}")
    # No two variables of the new layout may share bytes (a new variable laid over a shrunk gap, say).
    spans = sorted((int(e["slot"]) * 32 + int(e["offset"]),
                    value_size(e["type"]) or 32 * (gap_slots(e["type"]) or 1), e["label"]) for e in new["storage"])
    for (a, la, na), (b, _, nb) in zip(spans, spans[1:]):
        if a + la > b:
            errors.append(f"{name}: {na} and {nb} overlap at slot {b // 32}")
    # New variables must sit inside an old gap (or after everything old).
    old_gaps = [(int(e["slot"]), int(e["slot"]) + gap_slots(e["type"]) - 1)
                for e in old["storage"] if e["label"] == "__gap"]
    last_old = max(int(e["slot"]) + (gap_slots(e["type"]) or 1) - 1 for e in old["storage"])
    for e in new["storage"]:
        key = (int(e["slot"]), int(e["offset"]))
        if key in old_keys or e["label"] == "__gap":
            continue
        s = int(e["slot"])
        if not (any(a <= s <= b for a, b in old_gaps) or s > last_old):
            errors.append(f"{name}: new variable {e['label']} @ slot {s} is outside any gap")
    return errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--forge", default="forge")
    args = ap.parse_args()
    out = subprocess.run(
        [args.forge, "inspect", "contracts/Gateway.sol:Gateway", "storageLayout", "--json"],
        check=True, capture_output=True, text=True,
    ).stdout
    new = json.loads(out[out.index("{"):])

    failures, checked = [], 0
    for path in sorted(glob.glob(".openzeppelin/*.json")):
        name = path.split("/")[-1]
        impls = json.load(open(path)).get("impls", {})
        if not impls:
            continue
        old = assign_slots(list(impls.values())[-1]["layout"])
        errors = check(old, new, name)
        if name in EXCEPTIONS:
            print(f"  {name}: EXCEPTION ({len(errors)} differences) - {EXCEPTIONS[name]}")
            continue
        checked += 1
        if errors:
            failures += errors
            print(f"  {name}: INCOMPATIBLE")
        else:
            print(f"  {name}: ok")
    for e in failures:
        print("    " + e)
    if failures:
        print("storage layout: incompatible with a deployed implementation")
        return 1
    if checked == 0:
        print("storage layout: no manifest was checked (.openzeppelin/*.json missing, empty or all exceptions)")
        return 1
    print(f"storage layout: compatible with the latest implementation in {checked} manifests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
