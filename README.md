# run-repo-script

`run-repo` fetches a GitHub repository and runs its installer script with a small, auditable CLI flow.

## Requirements

- Node.js 20+
- `git` installed and authenticated for the target GitHub repository
- Runtime for the selected script (`node`, `bash`, or `zx`)

## Usage

```bash
run-repo owner/repo
run-repo owner/repo#v1.2.3
run-repo https://github.com/owner/repo.git#main
```

## Example

Run an explicit installer script and forward flags to it:

```bash
run-repo owner/repo --script scripts/install.sh -- --target local --verbose
```

Select a runner explicitly:

```bash
run-repo owner/repo --runner node --yes
```

## Safety notes

- The CLI executes code from the fetched repository. Review refs before running.
- You must confirm execution unless `--yes` is passed.
- Clone is non-interactive (`GIT_TERMINAL_PROMPT=0`) to avoid hanging auth prompts.
- Clone keeps standard GitHub auth token env vars (`GH_TOKEN`, `GITHUB_TOKEN`) so private repository fetches can succeed.
- Installer execution runs with a strict allowlist environment (for example: `PATH`, `HOME`, temp/locale vars, plus standard proxy/certificate vars like `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `SSL_CERT_FILE`, and `NODE_EXTRA_CA_CERTS`).
