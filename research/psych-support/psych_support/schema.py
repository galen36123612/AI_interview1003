"""Small fail-closed validator for the explicit JSON Schema subset used here."""
import json
from pathlib import Path

SCHEMAS = Path(__file__).resolve().parents[1] / "schemas"


def validate(value, schema, location="$", root=None):
    root = schema if root is None else root
    if "anyOf" in schema:
        for choice in schema["anyOf"]:
            try:
                validate(value, choice, location, root)
                break
            except ValueError:
                continue
        else:
            raise ValueError(f"{location}: no matching schema alternative")
    if "$ref" in schema:
        ref = root
        for part in schema["$ref"].removeprefix("#/").split("/"):
            ref = ref[part]
        return validate(value, ref, location, root)
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(f"{location}: invalid enum")
    if "const" in schema and (type(value) is not type(schema["const"]) or value != schema["const"]):
        raise ValueError(f"{location}: invalid constant")
    kind = schema.get("type")
    checks = {"object": lambda x: isinstance(x, dict), "array": lambda x: isinstance(x, list),
              "string": lambda x: isinstance(x, str), "boolean": lambda x: type(x) is bool,
              "integer": lambda x: type(x) is int, "null": lambda x: x is None}
    if kind and not checks[kind](value):
        raise ValueError(f"{location}: expected {kind}")
    if kind == "object":
        if set(schema.get("required", [])) - value.keys():
            raise ValueError(f"{location}: missing required fields")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False and value.keys() - props.keys():
            raise ValueError(f"{location}: unknown fields rejected")
        for key, val in value.items():
            if key in props:
                validate(val, props[key], f"{location}.{key}", root)
    if kind == "array":
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", float("inf")):
            raise ValueError(f"{location}: invalid array length")
        for idx, item in enumerate(value):
            validate(item, schema.get("items", {}), f"{location}[{idx}]", root)
    if kind == "string" and (len(value) < schema.get("minLength", 0) or len(value) > schema.get("maxLength", float("inf"))):
        raise ValueError(f"{location}: invalid text length")
    if kind == "integer" and (value < schema.get("minimum", float("-inf")) or value > schema.get("maximum", float("inf"))):
        raise ValueError(f"{location}: integer outside allowed range")


def check(name, value):
    validate(value, json.loads((SCHEMAS / f"{name}.json").read_text()))
    return value
