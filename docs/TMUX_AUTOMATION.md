# tmux Automation for /feature Command

## Overview

The `/feature` command automatically creates tmux windows with dev servers when executed inside a tmux session. This eliminates manual terminal tab management and ensures consistent development environment setup.

## Detection

The command detects if you're running inside a tmux session:

```bash
if [[ -n "$TMUX" ]]; then
  echo "Running in tmux - automation will be enabled"
else
  echo "Not in tmux - manual setup required"
fi
```

## Commands Executed

When tmux is detected, the following commands are executed automatically:

### 1. Create New Window

```bash
tmux new-window -c "$HOME/Code/kikaku-os-{number}" -n "issue-{number}"
```

Creates a new tmux window with:
- Working directory set to the worktree path
- Window name: `issue-{number}` (e.g., `issue-142`)

### 2. Start API Server

```bash
tmux send-keys -t "issue-{number}" "cd $HOME/Code/kikaku-os-{number} && pnpm -C apps/api dev" Enter
```

Starts the Cloudflare Workers API server:
- Default port: **8787**
- Command: `pnpm -C apps/api dev`
- Runs in the left pane

### 3. Split Horizontally

```bash
tmux split-window -h -c "$HOME/Code/kikaku-os-{number}" -t "issue-{number}"
```

Creates a horizontal split, resulting in two panes side by side.

### 4. Start Storefront Server

```bash
tmux send-keys -t "issue-{number}.1" "pnpm -C apps/storefront dev" Enter
```

Starts the Astro storefront server:
- Default port: **4321**
- Command: `pnpm -C apps/storefront dev`
- Runs in the right pane

## Expected Layout

After automation completes, you'll have:

```
+----------------------------+----------------------------+
|                            |                            |
|    API Server (Left)       |  Storefront (Right)       |
|                            |                            |
|    Port: 8787              |  Port: 4321               |
|    Wrangler Dev            |  Astro Dev                |
|                            |                            |
+----------------------------+----------------------------+
```

## Switching to the Window

Use tmux window navigation:

```bash
# Method 1: Interactive window list
Ctrl+b w

# Method 2: Switch by window number
Ctrl+b 0  # First window
Ctrl+b 1  # Second window
Ctrl+b 2  # Third window

# Method 3: Switch by name
Ctrl+b ' then type "issue-142"
```

## Verification Steps

### 1. Verify tmux Window Created

```bash
# List all tmux windows
tmux list-windows

# Expected output includes:
# 2: issue-142* (2 panes) [...]
```

### 2. Verify API Server

```bash
# Test the tmux-test endpoint
curl http://localhost:8787/dev/tmux-test

# Expected response:
# {
#   "name": "tmux-test",
#   "timestamp": "2026-02-02T...",
#   "env": "development",
#   "message": "tmux automation test endpoint"
# }
```

### 3. Verify Storefront

```bash
# Check Storefront HTTP status
curl -s -o /dev/null -w "%{http_code}" http://localhost:4321

# Expected: 200
```

Or open in browser: http://localhost:4321

## Port Configuration

### Why Default Ports?

Cloudflare Wrangler **does not support custom port configuration**. The `--port` flag is not available, so the API server always runs on port **8787**.

Similarly, Astro defaults to port **4321** unless configured otherwise.

### Port Conflicts

Since all worktrees use the same ports:
- **Only one API server can run at a time**
- **Only one Storefront server can run at a time**

**Best Practice**: Stop dev servers in other worktrees before starting new ones.

```bash
# To stop servers, switch to the window and press:
Ctrl+C  # In each pane
```

## Troubleshooting

### Issue: tmux window not created

**Symptom**: No new window appears after running `/feature`

**Causes**:
1. Not running inside tmux session
2. tmux not installed
3. tmux command failed

**Solution**:
```bash
# Check if in tmux
echo $TMUX
# If empty, you're not in tmux

# Start tmux session
tmux new -s dev

# Or attach to existing session
tmux attach -t dev
```

### Issue: Port already in use

**Symptom**: Error message "address already in use"

**Cause**: Another dev server is running on the same port

**Solution**:
```bash
# Find process using port 8787
lsof -i :8787

# Kill the process
kill <PID>

# Or stop it gracefully by switching to that tmux window
Ctrl+b w  # Select the window
Ctrl+C    # Stop the server
```

### Issue: Panes not split correctly

**Symptom**: Only one pane visible, or split is vertical instead of horizontal

**Cause**: tmux split-window command syntax issue

**Solution**:
```bash
# Manually split horizontally
Ctrl+b %

# Or split vertically
Ctrl+b "

# Then manually start the server in the new pane
pnpm -C apps/storefront dev
```

### Issue: Servers don't start

**Symptom**: Panes are created but servers don't run

**Cause**: `pnpm install` not completed, or command syntax error

**Solution**:
```bash
# Switch to the worktree window
Ctrl+b w  # Select issue-{number}

# In each pane, manually start the server
cd ~/Code/kikaku-os-{number}
pnpm install  # If not done
pnpm -C apps/api dev  # Left pane
pnpm -C apps/storefront dev  # Right pane
```

## Manual Setup (Without tmux)

If you're not using tmux, you'll need to manually:

1. **Open a new terminal tab/window**

2. **Navigate to the worktree**:
   ```bash
   cd ~/Code/kikaku-os-{number}
   ```

3. **Start API server**:
   ```bash
   pnpm -C apps/api dev
   ```

4. **Open another tab/split**

5. **Start Storefront server**:
   ```bash
   cd ~/Code/kikaku-os-{number}
   pnpm -C apps/storefront dev
   ```

## Benefits

- **No manual tab management**: tmux handles window creation
- **Consistent setup**: Same layout every time
- **Faster workflow**: Servers start automatically
- **Easy navigation**: Named windows for quick switching
- **Parallel development**: Multiple worktrees, each with own tmux window

## Integration with Workflow

The tmux automation is part of **Step 2** (Worktree Creation) in the `/feature` workflow:

1. Plan (create implementation plan)
2. **Worktree** ← tmux automation happens here
3. Issue (create GitHub issue)
4. Exec (implement feature)
5. Typecheck (validate TypeScript)
6. Test (run tests)
7. PR (create pull request)

## Customization

To customize the tmux layout, edit `.claude/commands/feature.md` and modify the Step 2 commands.

**Example: Vertical split instead of horizontal**:

Change:
```bash
tmux split-window -h -c "$HOME/Code/kikaku-os-{number}" -t "issue-{number}"
```

To:
```bash
tmux split-window -v -c "$HOME/Code/kikaku-os-{number}" -t "issue-{number}"
```

**Example: Three panes (API, Storefront, Shell)**:

Add after the storefront server:
```bash
tmux split-window -v -c "$HOME/Code/kikaku-os-{number}" -t "issue-{number}.1"
```

## References

- [tmux Cheat Sheet](https://tmuxcheatsheet.com/)
- [Cloudflare Wrangler Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Astro Development](https://docs.astro.build/en/reference/cli-reference/#astro-dev)
- `.claude/commands/feature.md` - Feature workflow documentation
- `.claude/rules/parallel-development.md` - Worktree management
