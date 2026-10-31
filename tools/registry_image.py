"""Validate a bounded still PNG without executing code or installing a codec.

Pixel data is inflated with a strict output cap derived from the header. The
image is never written into the validator's checkout or opened in a UI. Public
delivery uses image/png plus nosniff; scripts and SVG are never accepted.
"""

import zlib
from tools.registry_png import chunks, pixel_bound


def validate_png(raw):
    """Check complete framing, dimensions, animation and decoded byte count.

    The chunk reader verifies all CRCs, including ancillary metadata. PNG
    image data may span multiple IDAT chunks, but it must be one complete zlib
    stream with no extra compressed data or trailing content. The browser can
    still reject unsupported ancillary details and use its avatar fallback.
    """
    expected, pixels, palette, indexed = None, bytearray(), False, False
    for kind, data in chunks(raw):
        if expected is None:
            if kind != b"IHDR":
                raise ValueError("PNG header is missing")
            expected = pixel_bound(data)
            indexed = data[9] == 3
        elif kind in (b"IHDR", b"acTL", b"fcTL", b"fdAT"):
            raise ValueError("Animated icons or repeated headers are unsupported")
        if kind == b"PLTE":
            palette = bool(data) and len(data) % 3 == 0 and len(data) <= 768
        if kind == b"IDAT":
            pixels.extend(data)
    decoder = zlib.decompressobj()
    try:
        decoded = decoder.decompress(bytes(pixels), (expected or 0) + 1)
    except zlib.error as error:
        raise ValueError("Invalid PNG compressed data") from error
    if (
        len(decoded) != expected
        or not decoder.eof
        or decoder.unused_data
        or (indexed and not palette)
    ):
        raise ValueError("Invalid or excessive PNG pixel data")
    return raw
