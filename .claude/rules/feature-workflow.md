# Feature Development Workflow (MANDATORY)

## Rule: ALL feature development MUST follow this workflow

When the user requests ANY new feature, enhancement, or significant change, you MUST automatically guide them through the standardized 7-step workflow.

## Automatic Detection and Enforcement

### Trigger Patterns (Auto-invoke `/feature`)

Automatically invoke the `/feature` command when the user's message matches these patterns:

- "Add [feature]" / "Implement [feature]" / "Create [feature]" / "Build [feature]"
- "I need [feature]" / "Can you add [feature]"
- "新機能[feature]" / "[feature]を追加" / "[feature]を実装"

**Action**: Confirm with user, then invoke `/feature` command.

### Exception Patterns (Skip workflow)

Do NOT invoke workflow for:
- Bug fixes / Doc updates / Quick changes / Typos / Small refactors
- User explicitly says "skip the workflow"

## The 7-Step Workflow

1. **Plan** - planner agent creates detailed implementation plan
2. **Worktree** - Create isolated dev environment with cleanup
3. **Issue** - Create GitHub issue for tracking
4. **Exec** - Implement feature using TDD
5. **Typecheck** - Validate TypeScript (auto-fix on errors)
6. **Test** - Run tests (auto-fix on failures)
7. **PR** - Create pull request

Each step validates prerequisites and handles errors gracefully.

## Benefits

- Consistency across all features
- Mandatory typecheck/tests prevent regressions
- Complete documentation (plans, issues, PRs)
- Isolated worktrees prevent conflicts
- Reduced cognitive load and missed steps

## Related Commands

- `/feature` - Full workflow
- `/create-issue` - Step 3 only
- `/exec-issue [number]` - Step 4 only
- `/code-review` - Code review only

For detailed workflow documentation, see `.claude/commands/feature.md`.
