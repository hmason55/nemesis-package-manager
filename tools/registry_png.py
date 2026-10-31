"""Bound PNG framing and dimensions before decompressing any image data.

This small parser reads untrusted package bytes, not filesystem paths. Chunk
lengths and CRCs are checked before consumers receive a chunk. Animation and
interlacing are intentionally unsupported to keep the decoding bound simple.
"""

import struct
import zlib

MAX_ICON = 256 * 1024


def chunks(raw):
    """Yield CRC-checked chunks; reject trailing data and truncated framing."""
    if not 45 <= len(raw) <= MAX_ICON or raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Use a PNG icon of at most 256 KiB")
    position = 8
    while position + 12 <= len(raw):
        length, kind = struct.unpack(">I4s", raw[position : position + 8])
        end = position + 12 + length
        data = raw[position + 8 : end - 4]
        if end > len(raw) or zlib.crc32(kind + data) != int.from_bytes(
            raw[end - 4 : end], "big"
        ):
            raise ValueError("Invalid PNG chunk or checksum")
        yield kind, data
        if kind == b"IEND":
            if length or end != len(raw):
                raise ValueError("Unexpected data after PNG end")
            return
        position = end
    raise ValueError("PNG end is missing")


def pixel_bound(data):
    """Return the exact decoded scanline size for a supported PNG header.

    Packed grayscale and palette samples need byte rounding per scanline.
    Each scanline also has a filter byte. At most 512x512 RGBA16 is accepted,
    so the downstream decompressor never needs an unbounded output buffer.
    """
    if len(data) != 13:
        raise ValueError("Invalid PNG header")
    width, height, depth, color, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB", data
    )
    depths = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8), 4: (8, 16), 6: (8, 16)}
    if not (
        0 < width <= 512
        and 0 < height <= 512
        and depth in depths.get(color, ())
        and compression == filtering == interlace == 0
    ):
        raise ValueError("Use a non-interlaced PNG of at most 512 by 512 pixels")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    return height * (1 + (width * channels * depth + 7) // 8)
