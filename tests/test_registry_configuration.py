"""Built-in registry settings must configure the backend without startup IO."""

import os
import io
import unittest
from unittest.mock import Mock, patch

from tools.companion_server import CompanionServer
from tools.registry_client import DEFAULT_REGISTRY_URL, RegistryClient
from tools.usb_companion import main


class RegistryConfigurationTests(unittest.TestCase):
    def test_https_initializes_only_when_explicitly_browsing_and_is_reused(self):
        opener = Mock()
        opener.open.side_effect = [
            io.BytesIO(b'{"packages":[]}'),
            io.BytesIO(b'{"packages":[]}'),
        ]
        with patch(
            "tools.registry_client.build_opener", return_value=opener
        ) as factory:
            client = RegistryClient(DEFAULT_REGISTRY_URL)
            factory.assert_not_called()
            self.assertEqual(client.packages()["packages"], [])
            self.assertEqual(client.packages()["packages"], [])
            factory.assert_called_once()

    def test_backend_defaults_and_explicit_overrides_never_contact_registry(self):
        with (
            patch.dict(os.environ),
            patch(
                "tools.registry_client.build_opener",
                side_effect=AssertionError("Unexpected startup network request"),
            ),
        ):
            os.environ.pop("NEMESIS_REGISTRY_URL", None)
            for override, expected in (
                (None, DEFAULT_REGISTRY_URL),
                ("https://custom.test", "https://custom.test"),
                ("", ""),
            ):
                with (
                    self.subTest(override=override),
                    CompanionServer(registry_url=override) as server,
                ):
                    self.assertEqual(
                        server.cloud.client.base if server.cloud.client else "",
                        expected,
                    )
            os.environ["NEMESIS_REGISTRY_URL"] = "https://environment.test"
            with CompanionServer() as server:
                self.assertEqual(server.cloud.client.base, "https://environment.test")
            os.environ["NEMESIS_REGISTRY_URL"] = ""
            with CompanionServer() as server:
                self.assertIsNone(server.cloud.client)

    def test_source_and_packaged_entrypoint_pass_default_custom_and_offline_settings(
        self,
    ):
        cases = (
            ([], None, DEFAULT_REGISTRY_URL),
            ([], "https://environment.test", "https://environment.test"),
            (
                ["--registry-url", "https://custom.test"],
                "https://environment.test",
                "https://custom.test",
            ),
            (["--registry-url", ""], None, ""),
            ([], "", ""),
        )
        for arguments, environment, expected in cases:
            with (
                self.subTest(arguments=arguments, environment=environment),
                patch.dict(os.environ),
                patch("sys.argv", ["companion", "--no-browser", *arguments]),
                patch("tools.usb_companion.CompanionServer") as factory,
                patch("builtins.print"),
            ):
                if environment is None:
                    os.environ.pop("NEMESIS_REGISTRY_URL", None)
                else:
                    os.environ["NEMESIS_REGISTRY_URL"] = environment
                factory.return_value.__enter__.return_value.serve_forever.side_effect = KeyboardInterrupt
                main()
                factory.assert_called_once_with(0, None, registry_url=expected)
