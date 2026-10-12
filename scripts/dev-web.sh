#!/usr/bin/env bash
# Build and run only the Web preview on macOS/Linux. Forward --port and --skip-setup.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$script_dir/local-workflow.mjs" web "$@"
