"""Large artifact transfer checks, independent of live provider credentials."""

import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from tools.registry_upload import upload_large
from tools.registry_validate import upload_artifact


class MultipartRunnerTests(unittest.TestCase):
    def test_uploads_bounded_parts_then_completes_with_active_upload_id(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "package.zip"
            archive.write_bytes(b"x" * (8 * 1024 * 1024) + b"end")
            request_json = Mock(return_value={"upload_id": "upload"})
            requests = []

            def opened(request, **_):
                requests.append(request)
                self.assertEqual(request.get_header("X-upload-id"), "upload")
                self.assertEqual(
                    request.get_header("User-agent"), "NEMESIS-Registry-Validator"
                )
                return io.BytesIO(b"{}")

            with patch("tools.registry_upload.urlopen", side_effect=opened):
                upload_large(
                    "https://registry.test/job",
                    "token",
                    archive,
                    {"sha256": "a" * 64, "size": archive.stat().st_size},
                    request_json,
                )
            self.assertEqual([len(r.data) for r in requests[:2]], [8 * 1024 * 1024, 3])
            self.assertTrue(requests[-1].full_url.endswith("/multipart/complete"))
            self.assertTrue(
                all(r.full_url.startswith("https://registry.test/") for r in requests)
            )

    def test_failed_part_aborts_and_preserves_the_original_error(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "package.zip"
            archive.write_bytes(b"data")
            request_json = Mock(return_value={"upload_id": "upload"})
            for fail_abort in (False, True):
                responses = [
                    OSError("part failed"),
                    OSError("abort failed") if fail_abort else io.BytesIO(b"{}"),
                ]
                with patch(
                    "tools.registry_upload.urlopen", side_effect=responses
                ) as opened:
                    with self.assertRaisesRegex(OSError, "part failed"):
                        upload_large(
                            "https://registry.test/job",
                            "token",
                            archive,
                            {"sha256": "a" * 64, "size": 4},
                            request_json,
                        )
                self.assertTrue(
                    opened.call_args[0][0].full_url.endswith("/multipart/abort")
                )

    def test_runner_uses_multipart_above_the_safe_single_request_limit(self):
        with patch("tools.registry_validate.upload_large") as upload:
            result = {"size": 65 * 1024 * 1024, "sha256": "a" * 64}
            upload_artifact(
                "https://registry.test/job", "token", Path("unused.zip"), result
            )
            self.assertEqual(
                upload.call_args[0][:4],
                ("https://registry.test/job", "token", Path("unused.zip"), result),
            )
