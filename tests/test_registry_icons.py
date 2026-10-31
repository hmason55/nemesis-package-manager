"""Optional package artwork is bounded, CRC checked and never executable."""

import hashlib
import io
import struct
import tempfile
import unittest
import zipfile
import zlib
from pathlib import Path
from unittest.mock import patch

from test_registry import installer
from tools.registry_icons import package_icon, upload_package_icon
from tools.registry_image import validate_png
from tools.registry_png import chunks, pixel_bound


def chunk(kind, data):
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data))
    )


def png(
    width=1, height=1, color=6, depth=8, interlace=0, pixels=b"\0\xff\0\0\xff", extra=()
):
    header = struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, interlace)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + b"".join(extra)
        + chunk(b"IDAT", zlib.compress(pixels))
        + chunk(b"IEND", b"")
    )


class RegistryIconTests(unittest.TestCase):
    def test_png_bounds_crc_animation_and_complete_compressed_data(self):
        self.assertEqual(validate_png(png()), png())
        indexed = png(color=3, pixels=b"\0\0", extra=[chunk(b"PLTE", b"\xff\0\0")])
        self.assertEqual(validate_png(indexed), indexed)
        invalid = [
            b"<svg></svg>",
            b"x" * 262145,
            png() + b"trailing",
            png()[:-5],
            png(width=0),
            png(width=513),
            png(interlace=1),
            png(color=9),
            png(depth=7),
            png(pixels=b"x" * 100),
            png(color=3, pixels=b"\0\0"),
            png(extra=[chunk(b"acTL", b"animation")]),
            png(extra=[chunk(b"IHDR", b"bad")]),
        ]
        corrupt = bytearray(png())
        corrupt[-1] ^= 1
        invalid.append(bytes(corrupt))
        for raw in invalid:
            with (
                self.subTest(size=len(raw)),
                self.assertRaises((ValueError, zlib.error)),
            ):
                validate_png(raw)
        with self.assertRaises(ValueError):
            pixel_bound(b"bad")
        with self.assertRaises(ValueError):
            list(chunks(b"\x89PNG\r\n\x1a\n" + chunk(b"tEXt", b"x" * 40)))
        with self.assertRaises(ValueError):
            validate_png(
                b"\x89PNG\r\n\x1a\n" + chunk(b"tEXt", b"x" * 40) + chunk(b"IEND", b"")
            )
        with self.assertRaises(ValueError):
            list(chunks(png()[:-12] + chunk(b"IEND", b"bad")))

    def test_optional_zip_icon_and_authenticated_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = installer(Path(directory) / "package.zip")
            self.assertIsNone(package_icon(path))
            with patch("tools.registry_icons.urlopen") as opened:
                upload_package_icon("https://registry.test/job", "validator", path)
                opened.assert_not_called()
            with zipfile.ZipFile(path, "a") as archive:
                archive.writestr("icon.png", png())
            self.assertEqual(package_icon(path), png())
            with patch(
                "tools.registry_icons.urlopen", return_value=io.BytesIO(b"{}")
            ) as opened:
                upload_package_icon("https://registry.test/job", "validator", path)
                request = opened.call_args.args[0]
                self.assertEqual(request.full_url, "https://registry.test/job/icon")
                self.assertEqual(request.get_method(), "PUT")
                self.assertEqual(
                    request.get_header("Authorization"), "Bearer validator"
                )
                self.assertEqual(
                    request.get_header("X-checksum-sha256"),
                    hashlib.sha256(png()).hexdigest(),
                )
                self.assertEqual(request.data, png())
            path = installer(Path(directory) / "large.zip")
            with zipfile.ZipFile(path, "a") as archive:
                archive.writestr("icon.png", b"x" * 262145)
            with self.assertRaises(ValueError):
                package_icon(path)
