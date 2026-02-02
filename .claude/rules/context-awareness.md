# Context Awareness (MANDATORY)

## Rule: Always Display Current Work Context

At the **start of every new conversation**, you MUST automatically detect and display the current work context.

This helps the user immediately understand what they're working on without having to ask.

## Detection Process

### 1. Detect Current Worktree

Check if the current directory is a worktree:

```bash
git worktree list
```

**Logic**:
- If current path matches a worktree path (e.g., `/home/user/Code/kikaku-os-142`):
  - Extract issue number from path (e.g., `142` from `kikaku-os-142`)
  - This is a worktree for Issue #142
- If current path is the main worktree (e.g., `/home/user/Code/kikaku-os`):
  - User is on the main branch
  - No active issue/PR work

### 2. Detect Current Branch

Check the current branch:

```bash
git branch --show-current
```

**Logic**:
- If branch name matches `feat/issue-{number}-*`:
  - Extract issue number (e.g., `142` from `feat/issue-142-product-filter`)
  - This is work for Issue #142
- If branch is `main`:
  - User is on main branch
  - No active issue work

### 3. Detect Related Issue

If issue number is known from worktree/branch, verify it exists:

```bash
gh issue view {number} --json number,title,state 2>/dev/null
```

**Logic**:
- If command succeeds: Issue exists, capture number and state
- If command fails: Issue doesn't exist or not accessible
- If not on GitHub repo: Skip this check

### 4. Detect Related PR

Check if there's a PR for the current branch:

```bash
gh pr list --head $(git branch --show-current) --json number,title,state 2>/dev/null
```

**Logic**:
- If PR exists: Capture PR number and state
- If no PR: User hasn't created PR yet
- If not on GitHub repo: Skip this check

## Display Format (Compact)

At the start of the conversation, display:

### If Working in Subworktree (Feature Branch)

```
📍 Worktree: kikaku-os-142 | Issue #142, PR #143
```

**Variations**:
- Issue only (no PR yet): `📍 Worktree: kikaku-os-142 | Issue #142`
- PR only (issue closed): `📍 Worktree: kikaku-os-142 | PR #143`
- Worktree only: `📍 Worktree: kikaku-os-142`

### If in Main Worktree but Wrong Branch

⚠️ **Critical**: If user is in main worktree but NOT on main branch:

```
⚠️ Warning: Main worktree is on branch 'claude/feature-xyz' instead of 'main'

This will cause problems when creating new worktrees!

To fix:
1. git checkout main
2. git pull origin main

Or move this work to a dedicated worktree:
1. git worktree add ../kikaku-os-155 claude/feature-xyz
2. cd ../kikaku-os-155
```

### If on Main Branch in Main Worktree

```
✅ Ready: Main worktree on main branch
```

Only display this if user explicitly asks, or if they attempt to run `/feature` command.

**Exception**: If user has uncommitted changes on main, warn:
```
⚠️ You're on main branch with uncommitted changes. Consider creating a feature branch with /feature.
```

## When to Display

**ALWAYS display at conversation start if**:
- Current directory is a worktree (not main)
- Current branch is not `main`
- Issue or PR is detected

**NEVER display if**:
- User is on main branch with no changes
- User is in a non-git directory
- User explicitly said "don't show context"

## Error Handling

### Git Not Available
```
# Check if in git repo
git rev-parse --git-dir 2>/dev/null
```
- If fails: User is not in a git repository, skip detection

### GitHub CLI Not Available
```
# Check if gh is installed and authenticated
gh auth status 2>/dev/null
```
- If fails: Skip issue/PR detection, only show worktree/branch info

### Network Issues
- If `gh` commands fail due to network: Show cached info or skip
- Don't block conversation start on network failures

## Implementation Logic

### Pseudocode

```
function displayWorkContext():
  // Check if in git repo
  if not isGitRepo():
    return  // Skip detection

  // Get current worktree and branch
  currentPath = getCurrentPath()
  currentBranch = getCurrentBranch()

  // Try to extract issue number
  issueNumber = extractIssueNumber(currentPath, currentBranch)

  if not issueNumber:
    // On main branch or non-issue branch
    if hasUncommittedChanges() and currentBranch == "main":
      display("⚠️ You're on main branch with uncommitted changes. Consider creating a feature branch.")
    return

  // Try to get issue info
  issueInfo = null
  if ghIsAvailable():
    issueInfo = ghIssueView(issueNumber)

  // Try to get PR info
  prInfo = null
  if ghIsAvailable():
    prInfo = ghPRList(currentBranch)

  // Display compact format
  parts = []
  if issueInfo:
    parts.append("Issue #" + issueNumber)
  if prInfo:
    parts.append("PR #" + prInfo.number)

  if parts.length > 0:
    display("📍 Current Work: " + parts.join(", "))
```

## Examples

### Example 1: Working on Feature with PR

**Context**:
- Path: `/home/user/Code/kikaku-os-142`
- Branch: `feat/issue-142-product-filter`
- Issue #142 exists (open)
- PR #143 exists (open)

**Display**:
```
📍 Current Work: Issue #142, PR #143
```

### Example 2: Working on Feature without PR

**Context**:
- Path: `/home/user/Code/kikaku-os-142`
- Branch: `feat/issue-142-product-filter`
- Issue #142 exists (open)
- No PR yet

**Display**:
```
📍 Current Work: Issue #142
```

### Example 3: On Main Branch

**Context**:
- Path: `/home/user/Code/kikaku-os`
- Branch: `main`
- No uncommitted changes

**Display**:
(Nothing - user is on main)

### Example 4: On Main with Changes

**Context**:
- Path: `/home/user/Code/kikaku-os`
- Branch: `main`
- Has uncommitted changes

**Display**:
```
⚠️ You're on main branch with uncommitted changes. Consider creating a feature branch.
```

## Helper Functions

### Extract Issue Number from Path

```bash
# From path like /home/user/Code/kikaku-os-142
basename $(pwd) | grep -oP 'kikaku-os-\K\d+'
```

### Extract Issue Number from Branch

```bash
# From branch like feat/issue-142-product-filter
git branch --show-current | grep -oP 'issue-\K\d+'
```

### Check for Uncommitted Changes

```bash
# Check if there are uncommitted changes
git status --porcelain | wc -l
```
- If > 0: Has uncommitted changes

## Benefits

1. **Immediate Context**: User knows what they're working on without asking
2. **Reduced Confusion**: No more "wait, which issue am I on?"
3. **Better Decisions**: Claude can tailor suggestions based on current work
4. **Workflow Continuity**: Seamless context across conversation sessions

## Integration with Other Rules

This rule works together with:
- **feature-workflow.md**: Detects when user is in middle of workflow
- **git-workflow.md**: Shows current git state for commit guidance
- **coding-style.md**: Provides context for code review suggestions

## Customization

Users can customize the display format by editing this file:

**Minimal**:
```
📍 #142, #143
```

**Standard** (current):
```
📍 Current Work: Issue #142, PR #143
```

**Verbose**:
```
📍 Current Work
- Issue: #142 (Add product filter)
- PR: #143 (open)
- Branch: feat/issue-142-product-filter
- Worktree: ../kikaku-os-142
```

Change the "Display Format" section above to customize.

## Disabling

To disable context awareness for a specific conversation:

User can say:
- "Don't show context" - Disable for current conversation
- "Skip context check" - Skip for current message only

To disable globally:
- Delete or rename this file to `.context-awareness.md.disabled`

## Performance

- All checks are fast (<100ms total)
- Git commands are local (no network)
- GitHub CLI commands are cached (if available)
- Non-blocking: Conversation can start even if checks fail

## Privacy

- No data is sent outside of local git and GitHub API
- Issue/PR titles are not displayed (compact format)
- Only numbers are shown to minimize distraction
