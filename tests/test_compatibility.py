"""Shared advisory fixtures must agree without restricting package operations."""

import json
import unittest
from pathlib import Path
from tools.companion_compatibility import advice, annotate


class CompatibilityTests(unittest.TestCase):
    def test_shared_advice_fixtures(self):
        fixtures = json.loads(
            (
                Path(__file__).parents[1] / "contracts/fixtures/compatibility.json"
            ).read_text(encoding="utf-8")
        )
        for fixture in fixtures:
            with self.subTest(name=fixture["name"]):
                values = advice(fixture["declarations"], fixture["profile"])
                states = [value["state"] for value in values]
                status = (
                    "mismatch"
                    if "mismatch" in states
                    else "unknown"
                    if "unknown" in states
                    else "match"
                )
                self.assertEqual(status, fixture["status"])

    def test_annotation_retains_original_metadata_and_unknown_ranges(self):
        package = {
            "versions": [
                {"version": "odd-release", "compatibility": {"nemesis": "1.x"}}
            ]
        }
        result = annotate(package, {"nemesis": "1.2"})
        self.assertEqual(result["versions"][0]["version"], "odd-release")
        self.assertEqual(
            result["versions"][0]["compatibility_advice"][2]["state"], "unknown"
        )
        self.assertNotIn("compatibility_advice", package["versions"][0])

    def test_malformed_optional_declarations_are_unknown(self):
        for declaration in (None, [], {"vehicles": 12}, {"vehicles": [None, 12, ""]}):
            self.assertTrue(
                all(item["state"] == "unknown" for item in advice(declaration, {}))
            )
