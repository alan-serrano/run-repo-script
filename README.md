# run-repo

`run-repo` fetches a GitHub repository and runs its installer script with a small, auditable CLI flow.

Package name: `run-repo-script`  
CLI command: `run-repo`

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

## Install and run

`run-repo-script` is the npm package name.
`run-repo` is the CLI command installed from that package.

Install globally, then use the command:

```bash
npm install -g run-repo-script
run-repo owner/repo
run-repo owner/repo#v1.2.3
```

Run directly with npx (no global install). With npx, use the package name:

```bash
npx run-repo-script owner/repo
npx run-repo-script owner/repo#v1.2.3
```

## Examples

Fetch a repo and run its default entry:

```bash
run-repo owner/repo
```

Fetch a repo and run a named subcommand:

```bash
run-repo owner/repo deploy
```

Run a script in the current working directory (no fetch):

```bash
run-repo install
```

Bypass the resolver with an explicit path (escape hatch):

```bash
run-repo owner/repo --script scripts/setup.mjs
```

Forward flags to the resolved script (everything after `--`):

```bash
run-repo owner/repo -- --target local --verbose
```

## How `run-repo-script` finds scripts

`run-repo` classifies the first positional as either a GitHub target
(`owner/repo[#ref]` or `https://github.com/...`) for fetch+run mode, or
anything else (including an empty argv) for local mode against the
current working directory. In both modes the same resolver runs against
the resulting repo root: the root is searched first, then `scripts/`
under it.

### Default entry fallback order

When no subcommand is given, the resolver tries each step in order and
returns the first hit. The same seven steps run at the repo root, then
the same seven again under `scripts/`:

1. `package.json#main` (resolved to an existing file)
2. `index.js`
3. `main.js`
4. `index.mjs`
5. `main.mjs`
6. `index.sh`
7. `main.sh`

A named subcommand follows a parallel layout (broader step 1 that also
catches `.cjs`, `.json`, and folder recursion). `--script <path>`
bypasses the lookup entirely. Full lookup tables and failure-distinction
rules live in the design doc captured in Engram
(`sdd/script-discovery/design`).

## Safety notes

- The CLI executes code from the fetched repository. Review refs before running.
- You must confirm execution unless `--dangerously-skip-confirmation` is passed.
- Clone is non-interactive (`GIT_TERMINAL_PROMPT=0`) to avoid hanging auth prompts.
- Clone keeps standard GitHub auth token env vars (`GH_TOKEN`, `GITHUB_TOKEN`) so private repository fetches can succeed.
- Installer execution runs with a strict allowlist environment (for example: `PATH`, `HOME`, temp/locale vars, plus `NO_PROXY` and certificate vars like `SSL_CERT_FILE`, `SSL_CERT_DIR`, and `NODE_EXTRA_CA_CERTS`).
- Proxy URL vars (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`) are forwarded to clone/installer child processes only when they do not contain embedded credentials.
- `zx` executions are spawned with `ZX_VERBOSE=true` for documented zx verbosity logging.
