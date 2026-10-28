"""Untrusted coverage artifacts are data, never code or extracted paths."""

import importlib.util
import io
import json
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "coverage_report",
    Path(__file__).resolve().parents[1] / ".github/scripts/coverage_report.py",
)
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class CoverageReportTests(unittest.TestCase):
    def archive(self, name, content):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr(name, content)
        return data.getvalue()

    def test_python_reports_line_and_branch_separately(self):
        content = json.dumps(
            {
                "totals": {
                    "covered_lines": 9,
                    "num_statements": 10,
                    "covered_branches": 3,
                    "num_branches": 4,
                }
            }
        )
        self.assertEqual(
            report.read_report(self.archive("coverage.json", content), "Python"),
            {"line": 90.0, "branch": 75.0},
        )

    def test_java_reads_only_root_counters(self):
        xml = '<report><package><counter type="LINE" missed="0" covered="999"/></package><counter type="LINE" missed="2" covered="8"/><counter type="BRANCH" missed="1" covered="1"/></report>'
        self.assertEqual(
            report.read_report(
                self.archive("reports/jacocoTestReport.xml", xml), "Java"
            ),
            {"line": 80.0, "branch": 50.0},
        )

    def test_missing_and_invalid_reports_fail_instead_of_passing(self):
        with self.assertRaises(ValueError):
            report.read_report(self.archive("wrong.json", "{}"), "Python")
        for covered, total in [(0, 0), (-1, 4), (5, 4), ("4", 5)]:
            with (
                self.subTest(covered=covered, total=total),
                self.assertRaises(ValueError),
            ):
                report.percentage(covered, total)
