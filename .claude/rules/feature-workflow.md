# Feature Development Workflow (MANDATORY)

## Rule: ALL feature development MUST follow this workflow

When the user requests ANY new feature, enhancement, or significant change, you MUST automatically guide them through the standardized 7-step workflow.

## Automatic Detection and Enforcement

### Trigger Patterns (Auto-invoke `/feature`)

Automatically invoke the `/feature` command when the user's message matches these patterns:

- "Add [feature]"
- "Implement [feature]"
- "Create [feature]"
- "Build [feature]"
- "I need [feature]"
- "Can you add [feature]"
- "Let's add [feature]"
- "新機能[feature]"
- "[feature]を追加"
- "[feature]を実装"
- "[feature]が欲しい"

**Action**: When detected, respond with:
```
I'll guide you through the feature workflow for: [description]

Starting Step 1: Planning...
```

Then invoke the `/feature` command automatically.

### Exception Patterns (Skip workflow)

Do NOT invoke workflow for these patterns:

- "Fix bug" / "バグ修正" - Use standard bug fix workflow
- "Update docs" / "ドキュメント更新" - Use `/update-docs` command
- "Quick change" / "簡単な変更" - Proceed directly
- "Just commit" / "コミットだけ" - Skip workflow
- "Typo" / "誤字修正" - Direct fix
- "Refactor [small scope]" - Direct refactor (unless major architectural change)
- User explicitly says "skip the workflow" / "ワークフローをスキップ"

**Action**: Proceed with direct implementation without workflow.

## The 7-Step Workflow

### Overview

1. **Plan** - Create detailed implementation plan using planner agent
2. **Worktree** - Create isolated development environment with cleanup
3. **Issue** - Create GitHub issue for tracking
4. **Exec** - Implement feature using TDD approach
5. **Typecheck** - Validate TypeScript on API and Storefront
6. **Test** - Run tests and verify coverage
7. **PR** - Create comprehensive pull request

### Step 1: Plan (REQUIRED)

- Invoke planner agent: `@planner <description>`
- Agent creates detailed plan in `.claude/plans/`
- Plan includes: phases, file structure, dependencies, risks
- Get user approval before proceeding

**Why**: Prevents over-engineering, clarifies scope, identifies risks early

### Step 2: Worktree (REQUIRED)

**Cleanup Phase**:
- Check existing worktrees: `git worktree list`
- Identify old/merged worktrees (>7 days or branch merged)
- Suggest cleanup: "Found old worktrees: X, Y. Remove them?"
- If user confirms, remove: `git worktree remove <path>`

**Create Phase**:
- Fetch latest: `git fetch origin`
- Pull main: `git pull origin main` (if in main branch)
- Create worktree:
  - Branch: `feat/issue-{number}-{slug}`
  - Path: `../kikaku-os-{number}`
  - Command: `git worktree add ../kikaku-os-{number} feat/issue-{number}-{slug}`
- Install dependencies: `pnpm install`

**Why**: Isolation from main branch, avoids port conflicts, enables parallel development

### Step 3: Issue (REQUIRED)

- Use `/create-issue` command
- Extract from plan: title, description, acceptance criteria
- Set labels: `enhancement`, `priority:normal`
- Capture issue number for subsequent steps

**Why**: Tracking, documentation, team visibility

### Step 4: Exec (REQUIRED)

- Use `/exec-issue [number]` command
- Start dev servers on alternate ports:
  - API: `pnpm -C apps/api dev --port 8788`
  - Storefront: `pnpm -C apps/storefront dev --port 4322`
- Implement using TDD principles:
  1. Write test (RED)
  2. Implement feature (GREEN)
  3. Refactor (IMPROVE)
- Auto-invoke code-reviewer after implementation
- If CRITICAL/HIGH issues found, block and require fixes
- Commit with conventional format: `feat:`, `fix:`, `refactor:`

**Why**: Quality code, isolated environment, proper review

### Step 5: Typecheck (REQUIRED)

Run TypeScript checks on both apps:

```bash
# API typecheck
pnpm -C apps/api typecheck

# Storefront typecheck
pnpm -C apps/storefront exec astro check
```

**Error Handling**:
- If errors found: Display errors, allow user to fix, retry
- MUST pass before proceeding to next step
- Offer to fix automatically if errors are simple

**Why**: Catch type errors early, ensure type safety

### Step 6: Test (REQUIRED)

Run tests on both apps:

```bash
# API tests
pnpm -C apps/api test

# Storefront tests (if exist)
pnpm -C apps/storefront test
```

**Coverage Requirements**:
- New code MUST have 80%+ coverage
- Existing tests MUST pass
- No regression allowed

**Error Handling**:
- If failures: Display failures, allow user to fix, retry
- MUST pass before proceeding to PR
- Offer guidance on writing missing tests

**Why**: Prevent regressions, ensure functionality, maintain quality

### Step 7: PR (REQUIRED)

Create comprehensive pull request:

1. Analyze commit history: `git log main..HEAD`
2. Analyze full diff: `git diff main...HEAD`
3. Draft PR:
   - Title: `feat: [description]` (under 70 chars)
   - Body format:
     ```markdown
     ## Summary
     - Bullet point 1
     - Bullet point 2

     ## Test plan
     - [ ] Test case 1
     - [ ] Test case 2

     Closes #[issue-number]

     🤖 Generated with [Claude Code](https://claude.com/claude-code)
     ```
4. Create PR: `gh pr create --title "..." --body "..."`
5. Display PR URL to user

**Why**: Complete documentation, clear test plan, easy review

## State Detection (Stateless)

Before each step, detect what's already completed:

- **Worktree exists**: `git worktree list | grep kikaku-os-{number}`
- **Issue exists**: `gh issue view {number}`
- **Branch exists**: `git branch -a | grep feat/issue-{number}`

**If step already completed**: Skip and proceed to next step.

## Error Handling

Each step validates prerequisites:

- **Plan**: Ensure planner agent is available
- **Worktree**: Check git repository, no conflicting worktree
- **Issue**: Check GitHub CLI authenticated (`gh auth status`)
- **Exec**: Worktree exists, dev servers not already running
- **Typecheck**: pnpm installed, package.json exists
- **Test**: pnpm installed, tests exist
- **PR**: All commits pushed, typecheck/test passed

**On Error**:
- Display clear error message
- Suggest fix (e.g., "Run `gh auth login` to authenticate")
- Allow user to fix and retry
- Provide option to skip step (with warning)

## User Confirmations

Request confirmation at these points:

1. **Before starting workflow**: "I'll guide you through the feature workflow. Proceed?"
2. **After plan creation**: "Plan created. Review and approve?"
3. **Before worktree cleanup**: "Remove old worktrees: X, Y?"
4. **After typecheck pass**: "Typecheck passed. Run tests?"
5. **After test pass**: "Tests passed. Create PR?"

**Why**: User stays in control, can pause/resume, understands progress

## Resume Capability

Support resuming interrupted workflows:

- User says: "continue with issue 145" or "resume feature 145"
- Detect existing state (worktree, issue, branch)
- Skip completed steps
- Resume from current step
- Example:
  ```
  User: "continue with issue 145"

  Claude: "Detected existing worktree and issue #145. Skipping steps 1-3.
  Starting Step 4: Implementation..."
  ```

## Benefits of This Workflow

1. **Consistency**: Every feature follows the same high-quality process
2. **Quality**: Mandatory typecheck and tests prevent regressions
3. **Documentation**: Plans, issues, and PRs provide complete context
4. **Isolation**: Worktrees prevent conflicts with main branch
5. **Automation**: Reduces cognitive load, fewer missed steps
6. **Traceable**: Full audit trail from plan to PR
7. **Onboarding**: New developers see structured workflow

## Enforcement Mechanism

1. **Automatic Reading**: Claude Code reads this file on every conversation start
2. **Pattern Matching**: Detects feature request patterns in user input
3. **Proactive Invocation**: Confirms with user, then invokes `/feature` command
4. **Step Validation**: Each step checks prerequisites before execution
5. **Blocking**: Critical steps (typecheck, test) block progression if they fail

## Quick Reference

| User Request | Action |
|--------------|--------|
| "Add product export" | Auto-invoke `/feature` |
| "Fix typo in README" | Skip workflow, direct fix |
| "Continue with issue 145" | Resume from current step |
| "Skip the workflow for this" | Proceed without workflow |

## Related Commands

- `/feature` - Full workflow (this)
- `/create-issue` - Step 3 only
- `/exec-issue [number]` - Step 4 only
- `/code-review` - Code review only

## Customization

Users can explicitly skip workflow steps:

```
User: "Add feature X but skip planning, I already have a design"
Claude: "Skipping Step 1. Starting Step 2: Worktree creation..."
```

However, typecheck and test steps should NEVER be skipped for feature development.
