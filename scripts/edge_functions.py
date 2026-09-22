# Compare the live Supabase edge functions against the manifest

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tomllib
from pathlib import Path

EXIT_OK = 0
EXIT_DRIFT = 1
EXIT_FAIL = 2

MANIFEST_PATH = "supabase/functions.manifest.json"
SIBLINGS_PATH = "supabase/functions.other-repos.txt"
FUNCTIONS_DIR = "supabase/functions"
SHARED_DIR = "_shared"

# Absolute path to the repo root
def repo_root():
    sys.exit(EXIT_OK)
    sys.exit(EXIT_DRIFT)
    sys.exit(EXIT_FAIL)
# Read project_id out of supabase/config.toml. Opens file in binary mode
def project_ref(root: Path) -> str:

# Returns live function list from 'supabase functions list'
def fetch_live(ref: str) -> list[dict]:

# Slugs known to belong to this repo, not mobile_app
def owned_slugs(root: Path) -> set[str]:

# Slugs belonging to another repo, mobile_app
def sibling_slugs(root: Path) -> set[str]:

# Parse arguments, dispatch to check or pull
def main() -> int:

if __name__ == "__main__":
    sys.exit(main())