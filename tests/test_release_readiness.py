"""Exercise signing failures, verified artifact bindings, and publication wiring."""

import base64
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

import yaml
from tools import apk_verification


ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / ".github/scripts" / (name + ".py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


signing = load_script("signing-material")
artifact = load_script("release-artifact")


class SigningMaterialTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.environment = {
            "RUNNER_TEMP": str(self.root),
            "GITHUB_ENV": str(self.root / "job.env"),
            "NEMESIS_KEYSTORE_BASE64": base64.b64encode(b"test-keystore").decode(),
            "NEMESIS_STORE_PASSWORD": "fixture-password",
            "NEMESIS_KEY_ALIAS": "fixture",
            "NEMESIS_KEY_PASSWORD": "fixture-password",
            "NEMESIS_SIGNING_CERT_SHA256": "c" * 64,
        }

    def test_stages_only_private_keystore_path_and_cleanup_leaves_other_files(self):
        path = signing.stage(self.environment)
        self.assertEqual(path.read_bytes(), b"test-keystore")
        self.assertEqual(
            (self.root / "job.env").read_text(),
            "NEMESIS_KEYSTORE_PATH=" + str(path) + "\n",
        )
        if os.name != "nt":
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        other = self.root / "unrelated.txt"
        other.write_text("keep")
        signing.clean(self.environment)
        signing.clean(self.environment)
        self.assertFalse(path.exists())
        self.assertEqual(other.read_text(), "keep")

    def test_missing_invalid_or_empty_credentials_fail_without_writing_keystore(self):
        for name in self.environment:
            if not name.startswith("NEMESIS_"):
                continue
            env = dict(self.environment)
            env[name] = ""
            with (
                self.subTest(name=name),
                self.assertRaisesRegex(ValueError, "required"),
            ):
                signing.stage(env)
        for value in ("invalid-base64!", "===="):
            env = dict(self.environment, NEMESIS_KEYSTORE_BASE64=value)
            with self.assertRaisesRegex(ValueError, "encoding"):
                signing.stage(env)
        with self.assertRaisesRegex(ValueError, "fingerprint"):
            signing.stage(dict(self.environment, NEMESIS_SIGNING_CERT_SHA256="wrong"))
        self.assertFalse(signing.signing_path(self.environment).exists())


class VerifiedArtifactTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.apk = self.root / "app.apk"
        self.apk.write_bytes(b"verified APK bytes")
        self.signature = (
            "Verified using v1 scheme (JAR signing): true\nSigner #1 certificate SHA-256 digest: "
            + "c" * 64
        )
        self.badging = "package: name='dev.nemesis.usbmanager' versionCode='1042' versionName='1.0.0'\nsdkVersion:'19'\n"
        self.write_bundles()

    def write_bundles(self, version="1.0.0", apk=b"verified APK bytes"):
        with zipfile.ZipFile(self.root / "usb.package.manager.zip", "w") as archive:
            archive.writestr(
                "NEMESIS.data",
                "[nemesis]\nversion=" + version + "\nid=usb.package.manager\n",
            )
            archive.writestr("app/UsbPackageManager.apk", apk)
        with zipfile.ZipFile(
            self.root / "usb-package-manager-ready.zip", "w"
        ) as archive:
            archive.writestr(
                "manager/usb.package.manager.zip",
                (self.root / "usb.package.manager.zip").read_bytes(),
            )

    def verify(self, **kwargs):
        options = {
            "apk": self.apk,
            "directory": self.root,
            "sdk": self.root,
            "source_sha": "a" * 40,
            "version": "1.0.0",
            "version_code": 1042,
            "channel": "stable",
            "expected": "c" * 64,
        }
        options.update(kwargs)

        def command(args, **ignored):
            return SimpleNamespace(
                stdout=self.signature if "verify" in args else self.badging
            )

        with patch.object(apk_verification.subprocess, "run", side_effect=command):
            return artifact.evidence(**options)

    def test_verified_identity_metadata_and_both_nested_bundles_are_bound(self):
        report = self.verify(expected=":".join(["CC"] * 32))
        self.assertEqual(report["source_sha"], "a" * 40)
        self.assertEqual(report["version_code"], 1042)
        self.assertEqual(report["signing"], "release")
        self.assertEqual(report["apk_sha256"], artifact.digest(self.apk.read_bytes()))
        for name, digest in report["assets"].items():
            self.assertEqual(digest, artifact.digest((self.root / name).read_bytes()))
        self.assertEqual(self.verify(channel="development")["signing"], "debug")

    def test_missing_v1_multiple_signers_and_wrong_identity_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "identity"):
            self.verify(expected="d" * 64)
        self.signature = self.signature.replace("true", "false")
        with self.assertRaisesRegex(ValueError, "v1 signing"):
            self.verify()
        self.signature = "Verified using v1 scheme (JAR signing): true"
        with self.assertRaisesRegex(ValueError, "Exactly one"):
            self.verify()
        self.signature += (
            "\nSigner #1 certificate SHA-256 digest: "
            + "c" * 64
            + "\nSigner #2 certificate SHA-256 digest: "
            + "d" * 64
        )
        with self.assertRaisesRegex(ValueError, "Exactly one"):
            self.verify()

    def test_wrong_package_versions_sdk_and_debuggable_stable_apks_are_rejected(self):
        original = self.badging
        for old, new in [
            ("dev.nemesis.usbmanager", "other.app"),
            ("1042", "1041"),
            ("1.0.0", "0.2.0"),
            ("19", "21"),
        ]:
            self.badging = original.replace(old, new)
            with self.subTest(new=new), self.assertRaises(ValueError):
                self.verify()
        self.badging = original + "application-debuggable\n"
        with self.assertRaisesRegex(ValueError, "debuggable"):
            self.verify()

    def test_mismatched_manifests_and_nested_archives_are_rejected(self):
        self.write_bundles(version="0.2.0")
        with self.assertRaisesRegex(ValueError, "manifest"):
            self.verify()
        self.write_bundles(apk=b"another APK")
        with self.assertRaisesRegex(ValueError, "different from"):
            self.verify()
        self.write_bundles()
        with zipfile.ZipFile(
            self.root / "usb-package-manager-ready.zip", "w"
        ) as archive:
            archive.writestr("manager/usb.package.manager.zip", b"another installer")
        with self.assertRaisesRegex(ValueError, "different manager"):
            self.verify()
        with self.assertRaisesRegex(ValueError, "commit"):
            self.verify(source_sha="main")
        with self.assertRaisesRegex(ValueError, "channel"):
            self.verify(channel="unknown")

    def test_sdk_tool_failure_cannot_produce_success_evidence(self):
        failure = subprocess.CalledProcessError(1, ["apksigner"])
        with patch.object(apk_verification.subprocess, "run", side_effect=failure):
            with self.assertRaises(subprocess.CalledProcessError):
                artifact.evidence(
                    self.apk,
                    self.root,
                    self.root,
                    "a" * 40,
                    "1.0.0",
                    1042,
                    "stable",
                    "c" * 64,
                )
        self.assertFalse((self.root / "release-evidence.json").exists())

    def test_cli_bundle_version_and_channel_instructions_match_selected_release(self):
        with zipfile.ZipFile(self.apk, "w") as archive:
            archive.writestr("AndroidManifest.xml", b"fixture")
            archive.writestr("classes.dex", b"x" * 2048)
            archive.writestr("META-INF/DEBUG.RSA", b"fixture")
        for channel, version, heading in [
            ("stable", "1.0.0", "STABLE"),
            ("development", "0.2.0-build.42", "EXPERIMENTAL"),
        ]:
            output = self.root / channel
            environment = dict(
                os.environ, RELEASE_CHANNEL=channel, NEMESIS_RELEASE_VERSION=version
            )
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "tools/build_release.py"),
                    str(self.apk),
                    "--dist",
                    str(output),
                ],
                check=True,
                capture_output=True,
                env=environment,
            )
            with zipfile.ZipFile(output / "usb-package-manager-ready.zip") as archive:
                self.assertTrue(
                    archive.read("GETTING_STARTED.txt")
                    .decode()
                    .startswith("NEMESIS PACKAGE MANAGER - " + heading)
                )
            with zipfile.ZipFile(output / "usb.package.manager.zip") as archive:
                self.assertIn(
                    "version=" + version, archive.read("NEMESIS.data").decode()
                )


class WorkflowWiringTests(unittest.TestCase):
    def workflow(self, name):
        return yaml.load(
            (ROOT / ".github/workflows" / name).read_text(), Loader=yaml.BaseLoader
        )

    def test_every_release_gate_checks_out_and_reports_the_selected_commit(self):
        build = self.workflow("build.yml")["jobs"]
        self.assertEqual(
            set(build["release"]["needs"]),
            {"prepare", "python-quality", "java-quality", "build", "companion"},
        )
        for name, workflow, job in [
            ("python-quality", "python-quality.yml", "quality"),
            ("java-quality", "java-quality.yml", "java-quality"),
            ("companion", "usb-companion.yml", "build"),
        ]:
            self.assertEqual(
                build[name]["with"]["source_sha"],
                "${{ needs.prepare.outputs.source_sha }}",
            )
            called = self.workflow(workflow)
            self.assertIn("workflow_call", called["on"])
            self.assertIn("tested_sha", called["on"]["workflow_call"]["outputs"])
            checkout = next(
                step
                for step in called["jobs"][job]["steps"]
                if step.get("uses", "").startswith("actions/checkout@")
            )
            self.assertEqual(
                checkout["with"]["ref"], "${{ inputs.source_sha || github.sha }}"
            )
        signing_steps = [
            s
            for s in build["build"]["steps"]
            if any("secrets." in str(v) for v in s.get("env", {}).values())
        ]
        self.assertTrue(signing_steps)
        for step in signing_steps:
            self.assertEqual(step["if"], "needs.prepare.outputs.channel == 'stable'")
        publication = build["release"]["steps"][-1]
        self.assertIn("toJSON(needs)", publication["env"]["RELEASE_QUALITY"])
        self.assertIn("quality: JSON.parse", publication["with"]["script"])


if __name__ == "__main__":
    unittest.main()
