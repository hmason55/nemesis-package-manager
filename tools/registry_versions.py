"""Version ordering shared with the vehicle's conservative numeric comparison."""

import re


def compare_versions(candidate, installed):
    """Order numeric segments, returning None when precedence is unknown.

    Mirror PackagePresentation.compareVersions rather than inventing a second
    SemVer policy. Leading v/V is decorative only before a digit, trailing zero
    segments are equivalent, and build numbers are compared as numeric segments.
    Python's arbitrary-precision integers match Java's BigInteger for long parts.
    """
    if not candidate or not installed or not candidate.strip() or not installed.strip():
        return None

    def formatted(value):
        value = value.strip()
        return re.sub(r"^[vV](?=[0-9])", "", value)

    candidate, installed = formatted(candidate), formatted(installed)
    if candidate == installed:
        return 0
    pattern = r"[0-9]+(?:\.[0-9]+)*(?:-build\.[0-9]+)?"
    if not re.fullmatch(pattern, candidate) or not re.fullmatch(pattern, installed):
        return None
    left = [int(x) for x in candidate.replace("-build.", ".").split(".")]
    right = [int(x) for x in installed.replace("-build.", ".").split(".")]
    length = max(len(left), len(right))
    left += [0] * (length - len(left))
    right += [0] * (length - len(right))
    return (left > right) - (left < right)
