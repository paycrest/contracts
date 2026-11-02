#!/usr/bin/env python3
"""Storage-layout gate for the Gateway proxy (docs/gateway-spec.md, P16).

Compares the layout of contracts/Gateway.sol (from `forge inspect`) with every implementation recorded in every
OpenZeppelin manifest under .openzeppelin/. An upgrade to this code must keep, for every deployed variable, its
slot, offset and type, keep IGateway.Order's members, and only take new variables from the start of a `__gap`
whose end slot is unchanged.

The manifests record which implementations were deployed, not which one each proxy points at now. With
--rpc MANIFEST=URL (repeatable) the gate also reads each of that manifest's proxies' EIP-1967 implementation slot
and fails unless the implementation is recorded in the manifest and compatible; that includes the superseded
implementations listed below, which the offline check only reports.

usage: check-gateway-storage-layout.py [--forge FORGE] [--rpc base.json=https://... ...]
"""
import argparse
import glob
import json
import re
import subprocess
import sys
import urllib.request

# Manifests that do not describe a proxy this code may upgrade, with the reason. Each is still reported.
EXCEPTIONS = {
    "arbitrum-sepolia.json": (
        "an older Arbitrum Sepolia testnet proxy (0x663C5BfE...9338) whose only recorded implementation predates "
        "the current fee model (supportedInstitutions storage); the live Arbitrum Sepolia gateway is tracked in "
        "unknown-421614.json. This code is NOT layout-compatible with that old proxy: never upgrade it to this code."
    ),
}


# Implementations recorded before the current layout (the pre-fee-model Gateway, with `supportedInstitutions`
# storage and a GatewaySettingManager gap ending at slot 203). Proxies that ran them were upgraded to a later
# implementation; an upgrade from one of these to this code would corrupt storage. Offline they are reported, not
# gated; --rpc fails if a proxy still points at one.
SUPERSEDED = {
    "0xb97d36fe253ee3653765df54e043a5ad72440b96": "first Sepolia implementation (21 variables, _aggregator @ 154)",
    "0xd293fcd3dbc025603911853d893a4724cf9f70a0": "pre-fee-model implementation (GatewaySettingManager gap ends at 203)",
    "0x86af88ccb34ec32aa4e22ebbba8c989058550f3c": "pre-fee-model Tron implementation",
    "0x1b038c55f8718961445c15f07ca350a4b09ddea6": "pre-fee-model Tron implementation",
}

# keccak256("eip1967.proxy.implementation") - 1
EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"


def implementation_of(url, proxy):
    """The implementation a proxy points at, read from its EIP-1967 slot."""
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_getStorageAt",
                       "params": [proxy, EIP1967_IMPL_SLOT, "latest"]}).encode()
    req = urllib.request.Request(url, body, {"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        out = json.load(resp)
    if "result" not in out:
        raise RuntimeError(f"eth_getStorageAt {proxy}: {out.get('error')}")
    return "0x" + out["result"][-40:].lower()


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
    ap.add_argument("--rpc", action="append", default=[], metavar="MANIFEST=URL",
                    help="also resolve the manifest's proxies on chain, e.g. base.json=https://mainnet.base.org")
    args = ap.parse_args()
    rpcs = dict(r.split("=", 1) for r in args.rpc)
    out = subprocess.run(
        [args.forge, "inspect", "contracts/Gateway.sol:Gateway", "storageLayout", "--json"],
        check=True, capture_output=True, text=True,
    ).stdout
    new = json.loads(out[out.index("{"):])

    manifests = sorted(glob.glob(".openzeppelin/*.json"))
    unknown = set(rpcs) - {p.split("/")[-1] for p in manifests}
    if unknown:
        print(f"storage layout: --rpc names no manifest: {', '.join(sorted(unknown))}")
        return 1

    failures, checked = [], 0
    for path in manifests:
        name = path.split("/")[-1]
        manifest = json.load(open(path))
        impls = manifest.get("impls", {})
        if not impls:
            continue
        # Every recorded implementation, keyed by address (the same build can be recorded twice).
        results = {}
        for impl in impls.values():
            addr = (impl.get("address") or "").lower()
            results[addr] = check(assign_slots(impl["layout"]), new, name)
        if name in EXCEPTIONS:
            n = sum(len(e) for e in results.values())
            print(f"  {name}: EXCEPTION ({n} differences) - {EXCEPTIONS[name]}")
            continue
        checked += 1
        bad = []
        for addr, errors in results.items():
            if not errors:
                continue
            if addr in SUPERSEDED:
                print(f"  {name}: {addr} superseded ({len(errors)} differences) - {SUPERSEDED[addr]}")
                continue
            bad.append(addr)
            failures += [f"{e} (implementation {addr})" for e in errors]
        if name in rpcs:
            for proxy in manifest.get("proxies", []):
                live = implementation_of(rpcs[name], proxy["address"])
                if live not in results:
                    bad.append(live)
                    failures.append(f"{name}: proxy {proxy['address']} points at {live}, which the manifest does not record")
                elif results[live]:
                    bad.append(live)
                    failures += [f"{e} (live implementation of proxy {proxy['address']})" for e in results[live]]
                else:
                    print(f"  {name}: proxy {proxy['address']} -> {live} ok")
        print(f"  {name}: {'INCOMPATIBLE' if bad else 'ok'} ({len(results)} implementations)")
    for e in failures:
        print("    " + e)
    if failures:
        print("storage layout: incompatible with a deployed implementation")
        return 1
    if checked == 0:
        print("storage layout: no manifest was checked (.openzeppelin/*.json missing, empty or all exceptions)")
        return 1
    print(f"storage layout: compatible with every current implementation in {checked} manifests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
