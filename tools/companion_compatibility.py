"""Informational compatibility advice; never authorizes or blocks an install.

Only literal values and the '*' wildcard have defined matching semantics.
Publisher range/free-form declarations remain visible as unknown information.
Device information is supplied by the user, not inferred from USB installers.
"""

import re


def advice(compatibility, profile):
    """Describe each requirement separately so a missing value cannot imply support."""
    compatibility = compatibility if isinstance(compatibility, dict) else {}
    result = []
    for field, label in (
        ("vehicles", "Vehicle"),
        ("firmware", "Firmware"),
        ("nemesis", "NEMESIS"),
    ):
        declared = compatibility.get(field) or []
        values = (
            [declared]
            if isinstance(declared, str)
            else declared
            if isinstance(declared, list)
            else []
        )
        values = [
            value.strip()
            for value in values
            if isinstance(value, str) and value.strip()
        ]
        known = profile.get("vehicle" if field == "vehicles" else field, "").strip()
        if "*" in values or (
            known and known.casefold() in [value.casefold() for value in values]
        ):
            state = "match"
        elif (
            not values
            or not known
            or any(
                re.search(r"[<>=+*]|(?:^|[.\s])x(?:$|[.\s])", value, re.I)
                for value in values
            )
        ):
            state = "unknown"
        else:
            state = "mismatch"
        messages = {
            "match": "matches the declaration",
            "mismatch": f'profile "{known}" does not match "{", ".join(values)}"',
            "unknown": "support is unknown",
        }
        result.append(
            {"field": field, "state": state, "message": f"{label}: {messages[state]}."}
        )
    return result


def annotate(package, profile):
    """Attach advice to version details without altering approved metadata."""
    return {
        **package,
        "versions": [
            {
                **version,
                "compatibility_advice": advice(version.get("compatibility"), profile),
            }
            for version in package.get("versions", [])
        ],
    }
