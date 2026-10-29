"""Read bounded coverage data from artifacts without extracting or executing files."""

import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET


def percentage(covered, total):
    """Reject unavailable or inconsistent counters rather than reporting a pass.

    Line and branch totals remain separate; the combined headline is not a gate.
    """
    if (
        not isinstance(covered, int)
        or not isinstance(total, int)
        or not 0 <= covered <= total
        or total == 0
    ):
        raise ValueError("Invalid coverage counters")
    return round(covered / total * 100, 2)


def read_report(data, language):
    """Read an untrusted workflow artifact without extracting or executing it.

    Bound both compressed input and selected report size. Ambiguous ZIP members,
    XML entities, and missing counters fail instead of fabricating coverage data.
    """
    if len(data) > 20 * 1024 * 1024:
        raise ValueError("Artifact too large")
    suffix = "coverage.json" if language == "Python" else "jacocoTestReport.xml"
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        matches = [
            item
            for item in archive.infolist()
            if item.filename.split("/")[-1] == suffix
        ]
        if len(matches) != 1 or matches[0].file_size > 5 * 1024 * 1024:
            raise ValueError("Missing, ambiguous, or oversized report")
        content = archive.read(matches[0])
    if language == "Python":
        totals = json.loads(content)["totals"]
        return {
            "line": percentage(totals["covered_lines"], totals["num_statements"]),
            "branch": percentage(totals["covered_branches"], totals["num_branches"]),
        }
    if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
        # JaCoCo's standard external DTD is not needed to read the counters.
        import re

        content = re.sub(rb"<!DOCTYPE[^>]*>", b"", content)
        if b"<!ENTITY" in content.upper():
            raise ValueError("XML entities are not supported")
    root = ET.fromstring(content)
    counters = {item.attrib["type"]: item.attrib for item in root.findall("counter")}
    return {
        name: percentage(
            int(counters[key]["covered"]),
            int(counters[key]["covered"]) + int(counters[key]["missed"]),
        )
        for name, key in [("line", "LINE"), ("branch", "BRANCH")]
    }


if __name__ == "__main__":
    print(
        json.dumps(
            read_report(sys.stdin.buffer.read(20 * 1024 * 1024 + 1), sys.argv[1])
        )
    )
