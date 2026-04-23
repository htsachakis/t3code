# Rebase `feat/basic-chat-surface` onto synced `main`

**Context:** `main` tracks upstream only (no custom commits). All custom work lives on `feat/basic-chat-surface`. When `main` is synced via GitHub's "Sync Fork" button, this procedure brings the feature branch up to date.

**Why rebase and not merge:** Rebasing replays custom commits on top of new upstream commits, keeping history linear and `main` untouched. Merging would tangle upstream and custom history over time.

---

## Pre-checks

```bash
# Confirm how far behind feat is from main
git fetch origin
git log --oneline feat/basic-chat-surface..origin/main
```

If the output is **empty** — main has no new commits, nothing to do.

---

## Steps

```bash
# 1. Pull the synced main locally
git checkout main
git pull origin main

# 2. Switch to the feature branch
git checkout feat/basic-chat-surface

# 3. Rebase onto updated main
git rebase main
```

---

## If conflicts arise

```bash
# Fix the conflict in the reported file(s), then stage and continue
git add <conflicted-file>
git rebase --continue

# Repeat per conflict until rebase completes.

# To abort and return to previous state at any point:
git rebase --abort
```

---

## After a successful rebase

```bash
# Verify: feat should be N commits ahead, 0 behind
git log --oneline feat/basic-chat-surface..main   # must be empty
git log --oneline main..feat/basic-chat-surface | head -5

# Force-push (rebase rewrites history, force is required)
# --force-with-lease is safer: refuses if remote has unexpected commits
git push origin feat/basic-chat-surface --force-with-lease
```

---

## Expected final state

```
main:                    A → B → C → D        (upstream only, untouched)
feat/basic-chat-surface: A → B → C → D → x → y → z  (custom commits on top)
```

- `feat/basic-chat-surface` is **0 commits behind** `main`
- All custom commits sit cleanly on top
- `main` is untouched
