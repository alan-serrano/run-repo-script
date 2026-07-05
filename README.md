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

### Default (no subcommand) — runs the project's entry point

```bash
npx run-repo-script owner/repo
npx run-repo-script owner/repo -- --target local --verbose
npx run-repo-script                       # local mode
```

### Named subcommand

```bash
npx run-repo-script owner/repo install arg1 arg2
npx run-repo-script owner/repo integration
npx run-repo-script deploy --prod        # local: deploy.{js,mjs,sh} + --prod
```

### Pinned ref

```bash
npx run-repo-script owner/repo#v1.2.3 install
```

### Escape hatch — explicit path

```bash
npx run-repo-script owner/repo --script src/scripts/setup.js
npx run-repo-script --script ./bin/custom.sh
```

### Forward flags to the script

```bash
npx run-repo-script owner/repo install -- --prod --verbose
npx run-repo-script install -- --dry-run
```

### Force a specific runner

Useful when a script has no shebang or the wrong one:

```bash
npx run-repo-script owner/repo --runner bash
```

`--` is only needed when mixing `run-repo-script`'s own flags (`--script`,
`--runner`, `--dangerously-skip-confirmation`) with the script's flags. Pure
`subcommand args…` flows through without a separator.

## Fallback order

`run-repo` classifies the first positional as either a GitHub target
(`owner/repo[#ref]` or `https://github.com/...`) for fetch+run mode, or
anything else (including an empty argv) for local mode against the
current working directory. In both modes the same resolver runs against
the resulting repo root: the root is searched first, then `scripts/`
under it.

### Default entry point (no subcommand)

Triggered by `npx run-repo-script` with no subcommand — finds the
project's main entry. The resolver tries each step in order; first hit
wins.

**In the repo root:**

1. `node <repo-dir>` — Reads `package.json#main` if present and
   resolves it. Falls back to `index.js` if there's no `package.json`,
   no `main` field, the JSON is malformed, or `main` points to a
   missing file. **This is a hand-rolled subset of `node .`** —
   `bin`, `exports`, and conditional exports are not honored.
2. `index.js`
3. `index.mjs`
4. `main.js`
5. `main.mjs`
6. `index.sh`
7. `main.sh`

**If nothing matched in root, the same 7 steps run in `scripts/`:**

1. `node scripts/`
2. `scripts/index.js`
3. `scripts/index.mjs`
4. `scripts/main.js`
5. `scripts/main.mjs`
6. `scripts/index.sh`
7. `scripts/main.sh`

**If still nothing matched**, `run-repo-script` exits with an error
listing every path it tried.

### Named subcommand (`install`, `integration`, …)

Triggered by `npx run-repo-script <name>` (any named script) — finds
that specific script. The resolver tries each step in order; first hit
wins.

**In the repo root:**

1. `node <name>` — Node's package.json resolver. Works whether `<name>`
   is a folder (recurses via `main` / `bin` / `exports` / `index.js`) or
   a file Node can resolve by extension (`.js`, `.mjs`, `.cjs`, `.json`).
2. `<name>.js`
3. `<name>.mjs`
4. `<name>.sh`

**If nothing matched in root, the same 4 steps run in `scripts/`:**

1. `node scripts/<name>`
2. `scripts/<name>.js`
3. `scripts/<name>.mjs`
4. `scripts/<name>.sh`

**If still nothing matched**, `run-repo-script` exits with an error.

The `scripts/` folder is the conventional location for subcommands
(matches Next.js, Express scaffolds, this repo's own `scripts/`
folder).

### Override with `--script`

When your script doesn't match any of the steps above (different
filename, extension not in the lookup set, located in `bin/` or another
folder), bypass the resolver entirely:

```bash
npx run-repo-script owner/repo --script src/scripts/setup.js
npx run-repo-script --script ./bin/custom.sh
```

`--script` resolves the path you give it against the repo root (in
fetch mode) or the current working directory (in local mode) and
verifies it stays inside that root.

## Shebang → runner dispatch

The file extension is the lookup key. The shebang is the runner.

| Shebang                    | Runner |
| -------------------------- | ------ |
| `#!/usr/bin/env zx`        | `zx`   |
| `#!/usr/bin/env node`      | `node` |
| `#!/usr/bin/env bash`      | `bash` |
| `#!/usr/bin/env sh`        | `sh`   |
| (no shebang, `.js`/`.mjs`) | `node` |
| (no shebang, `.sh`)        | `bash` |

Shebang is read from the first line of the file. No shebang → safe
default (node for JS, bash for shell). `--runner` flag overrides the
shebang for explicit cases.

## Safety notes

- The CLI executes code from the fetched repository. Review refs before running.
- You must confirm execution unless `--dangerously-skip-confirmation` is passed.
- Clone is non-interactive (`GIT_TERMINAL_PROMPT=0`) to avoid hanging auth prompts.
- Clone keeps standard GitHub auth token env vars (`GH_TOKEN`, `GITHUB_TOKEN`) so private repository fetches can succeed.
- Installer execution runs with a strict allowlist environment (for example: `PATH`, `HOME`, temp/locale vars, plus `NO_PROXY` and certificate vars like `SSL_CERT_FILE`, `SSL_CERT_DIR`, and `NODE_EXTRA_CA_CERTS`).
- Proxy URL vars (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`) are forwarded to clone/installer child processes only when they do not contain embedded credentials.
- `zx` executions are spawned with `ZX_VERBOSE=true` for documented zx verbosity logging.
