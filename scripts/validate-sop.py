"""Validate SOP documents and exchange schemas; no business state is executed.

Requires jsonschema 4.x. Run from any directory: python scripts/validate-sop.py
"""
import json
import re
from pathlib import Path
from urllib.parse import unquote

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
SOP = ROOT / "sop"
NAMES = (
    "merchant-onboarding", "website-delivery", "commerce-payment-refund",
    "service-booking", "change-and-maintenance", "incident-and-recovery",
)
manifest = json.loads((ROOT / "repository-manifest.json").read_text(encoding="utf-8"))
errors = []
for name in NAMES:
    path = SOP / f"{name}.md"
    if not path.is_file():
        errors.append(f"Missing SOP: {name}")
        continue
    body = path.read_text(encoding="utf-8")
    if f"ID：{name}" not in body or "版本：1.0.0" not in body:
        errors.append(f"Missing ID/version: {name}")
    rows = re.findall(r"^\| ([a-z][a-z0-9_]*)(?:／[^|]+)? \|", body, re.M)
    if not rows or len(rows) != len(set(rows)):
        errors.append(f"Missing/duplicate step IDs: {name}")

for path in [ROOT / "README.md", *SOP.rglob("*.md")]:
    body = path.read_text(encoding="utf-8")
    for ref in re.findall(r"\[[^\]]+\]\(([^)]+)\)", body):
        if re.match(r"[a-z]+://", ref) or ref.startswith("#"):
            continue
        target = (path.parent / unquote(ref.split("#")[0])).resolve()
        if not target.exists():
            errors.append(f"Broken link in {path.relative_to(ROOT)}: {ref}")
        for folder, names in (("skills", manifest["skills"]), ("packages", manifest["packages"])):
            match = re.search(rf"(?:^|/){folder}/([^/]+)/", ref)
            if path.is_relative_to(SOP) and match and match.group(1) not in names:
                errors.append(f"Unregistered {folder} reference: {ref}")

validators = {}
expected_schemas = {"sop-definition.schema.json", "step-result.schema.json", "exception.schema.json"}
if {path.name for path in (SOP / "schemas").glob("*.schema.json")} != expected_schemas:
    errors.append("Missing or unexpected exchange schemas")
core = (ROOT / "packages/buyna-workflow-state-core/src/index.mjs").read_text(encoding="utf-8")
gate_array = re.search(r"const gateOrder=Object.freeze\(\[(.*?)\]\)", core, re.S)
if not gate_array:
    raise SystemExit("Cannot locate canonical workflow gates; update validator for new source format")
gates = re.findall(r"'([^']+)'", gate_array.group(1))
for path in (SOP / "schemas").glob("*.schema.json"):
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validators[path.name] = Draft202012Validator(schema, format_checker=FormatChecker())
    if "sopId" in schema["properties"]:
        if set(schema["properties"]["sopId"]["enum"]) != set(NAMES):
            errors.append(f"SOP inventory differs: {path.name}")
    gate_schema = schema["properties"].get("workflowGate")
    if "steps" in schema["properties"]:
        gate_schema = schema["properties"]["steps"]["items"]["properties"]["workflowGate"]
    if gate_schema and gate_schema["enum"] != gates:
        errors.append(f"Workflow gate mapping differs: {path.name}")

if {path.stem + ".schema.json" for path in (SOP / "examples").glob("*.json")} != expected_schemas:
    errors.append("Each schema must have one matching example")
for path in (SOP / "examples").glob("*.json"):
    value = json.loads(path.read_text(encoding="utf-8"))
    validator = validators[path.stem + ".schema.json"]
    for error in validator.iter_errors(value):
        errors.append(f"Example {path.name}: {error.message}")

if errors:
    raise SystemExit("\n".join(errors))
print(f"Validated {len(NAMES)} SOPs, document links, manifest references, {len(validators)} schemas and examples.")
