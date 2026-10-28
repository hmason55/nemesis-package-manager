"""Run the lightweight, localhost-only NEMESIS USB companion.

Launch with python -m tools.usb_companion from the repository root. The server
chooses a free port by default and serves bundled assets without internet access.
Ctrl+C closes the listening socket; nothing is installed as a background service.
"""

import argparse
import webbrowser
from tools.companion_server import CompanionServer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="Local port (default: choose an available port)",
    )
    parser.add_argument("--usb", help="Preselect an existing drive or mount path")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Print the URL without opening a browser",
    )
    args = parser.parse_args()
    with CompanionServer(args.port, args.usb) as server:
        print(
            "NEMESIS USB companion\n"
            + server.url
            + "\nKeep this window open. Press Ctrl+C to stop.",
            flush=True,
        )
        if not args.no_browser:
            webbrowser.open(server.url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nCompanion stopped.")


if __name__ == "__main__":
    main()
