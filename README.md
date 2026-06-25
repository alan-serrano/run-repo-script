# run-repo-script

`run-repo` fetches a GitHub repository and runs its installer script with a small, auditable CLI flow.

## Basic usage

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

## Current status

This first slice includes repository target validation, shallow clone foundations, and installer discovery foundations.
Execution flow wiring is intentionally not complete yet.
