---
name: worktrees
description: Use when starting feature work that should be isolated from the current checkout, before executing a plan on a new branch, or when working on two branches at once. Covers checking for existing isolation, creating a git worktree safely, setting it up, and removing it.
---

# Worktrees

A worktree gives a branch its own directory, so work in progress never touches the user's checkout.

## When to isolate

Isolate for feature work, plan execution, risky experiments, or a second branch alongside the current one; not for small edits. Honour a stated preference; otherwise ask once.

## 1. Check you are not already isolated

```bash
[ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ] && echo linked-worktree
git rev-parse --show-superproject-working-tree   # prints a path inside a submodule
```

In a linked worktree (and not a submodule), do not create another; go to step 3.

## 2. Create it

**Prefer Claude Code's native tool.** If `EnterWorktree` is available, use it; it owns placement, branching and clean-up.

**Otherwise, use git:**

1. **Pick the folder:** a location the user named; else an existing `.worktrees/` (preferred) or `worktrees/` at the repo root; else `.worktrees/`.
2. **Check it is gitignored:** `git check-ignore -q .worktrees`. If not, add it to `.gitignore` and tell the user; commit that change only if they ask. An unignored folder gets committed with the whole tree inside it.
3. **Create:** `git worktree add .worktrees/<branch> -b <branch> <base>` and `cd` into it.
4. If the sandbox blocks it, say so and work in place.

## 3. Set up the project

Install dependencies with the project's own tooling (`dotnet restore`, `npm install`, `cargo build`, `uv sync`, `go mod download`). Copy untracked local config the app needs (such as `.env`) and say so.

Run the test suite for a baseline. If it fails, report and ask whether to continue; a dirty baseline makes later failures ambiguous. Report path, branch and result.

## 4. Clean up

Clean up when the branch is merged or discarded (`claude-skills:finish-branch`). Keep the worktree while a PR is open.

- Native tool: `ExitWorktree`.
- Git: `cd` to the main checkout, then `git worktree remove <path>` and `git worktree prune`.
- If removal is refused because of uncommitted files, show `git -C <path> status --porcelain` and ask. Never `--force` on your own.
- Remove only worktrees you created; leave others alone.
