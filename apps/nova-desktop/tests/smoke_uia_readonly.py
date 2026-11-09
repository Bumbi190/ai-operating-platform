"""Read-only Windows UIA smoke test.

Reports only process/window/element counts. It does not read labels, page text,
window titles, passwords, screenshots, or perform clicks or keyboard input.
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nova_uia import inspect_app, UIAutomationError


def main():
    for process_name in ("brave", "spotify"):
        try:
            result = inspect_app(process_name)
        except UIAutomationError as exc:
            print(f"{process_name}: unavailable ({exc})")
            continue

        windows = result.get("windows", [])
        elements = sum(
            int(window.get("accessibleElementCount", 0))
            for window in windows
        )
        documents = sum(
            int(window.get("controlTypeCounts", {}).get("Document", 0))
            for window in windows
        )
        text_patterns = sum(
            int(window.get("documentTextPatternCount", 0))
            for window in windows
        )
        print(
            f"{process_name}: {len(windows)} visible window(s), "
            f"{elements} accessible UIA element(s), {documents} document node(s), "
            f"{text_patterns} document TextPattern(s); content not read"
        )


if __name__ == "__main__":
    main()
