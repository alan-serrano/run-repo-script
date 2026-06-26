# run-repo-script

`run-repo` fetches a GitHub repository and runs its installer script with a small, auditable CLI flow.

## Requirements

- Node.js 20+
- `git` installed and authenticated for the target GitHub repository
- Runtime for the selected script (`node` or `bash`)
- `zx` is bundled and used only for explicit zx intent (`--runner zx` or zx shebang)

## Usage

```bash
run-repo owner/repo
run-repo owner/repo#v1.2.3
run-repo https://github.com/owner/repo.git#main
```

## npm and npx

Install globally:

```bash
npm install -g run-repo-script
```

Run directly with npx:

```bash
npx run-repo-script owner/repo
```

Pre-release gate for first public publish:

- Preferred package identity is `run-repo-script` on npmjs.
- Confirm the unscoped name is available before the first live publish.
- If unavailable, switch to an approved scoped fallback (for example, `@<scope>/run-repo-script`) before publishing.

## Example

Run an explicit installer script and forward flags to it:

```bash
run-repo owner/repo --script scripts/install.sh -- --target local --verbose
```

Select a runner explicitly:

```bash
run-repo owner/repo --runner node --dangerously-skip-confirmation
```

## Safety notes

- The CLI executes code from the fetched repository. Review refs before running.
- You must confirm execution unless `--dangerously-skip-confirmation` is passed.
- Clone is non-interactive (`GIT_TERMINAL_PROMPT=0`) to avoid hanging auth prompts.
- Clone keeps standard GitHub auth token env vars (`GH_TOKEN`, `GITHUB_TOKEN`) so private repository fetches can succeed.
- Installer execution runs with a strict allowlist environment (for example: `PATH`, `HOME`, temp/locale vars, plus `NO_PROXY` and certificate vars like `SSL_CERT_FILE`, `SSL_CERT_DIR`, and `NODE_EXTRA_CA_CERTS`).
- Proxy URL vars (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`) are forwarded to clone/installer child processes only when they do not contain embedded credentials.
- `zx` executions are spawned with `ZX_VERBOSE=true` for documented zx verbosity logging.
