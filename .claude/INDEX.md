# Quick Reference Index

Quick navigation for .claude directory contents.

## 🚀 Workflows

| Workflow | File | Description |
|----------|------|-------------|
| Feature Development | `rules/feature-workflow.md` | 7-step workflow (Plan → Worktree → Issue → Exec → Typecheck → Test → PR) |
| Parallel Development | `rules/parallel-development.md` | Multi-worktree, one-tab-per-issue rules |
| Git Workflow | `rules/git-workflow.md` | Commit messages, PR creation, branching strategy |

## 💻 Commands

| Command | File | Usage | Description |
|---------|------|-------|-------------|
| `/feature` | `commands/feature.md` | `/feature "description"` or `/feature 142` | Complete development workflow |
| `/create-issue` | `commands/create-issue.md` | `/create-issue` | Create GitHub issue from plan |
| `/exec-issue` | `commands/exec-issue.md` | `/exec-issue 142` | Execute issue implementation |
| `/build-fix` | `commands/build-fix.md` | `/build-fix` | Fix build/TypeScript errors |
| `/code-review` | `commands/code-review.md` | `/code-review` | Code quality review |
| `/update-docs` | `commands/update-docs.md` | `/update-docs` | Update documentation |

## 🤖 Agents

| Agent | File | Invocation | Description |
|-------|------|------------|-------------|
| planner | `agents/planner.md` | `@planner <task>` | Create implementation plans |
| code-reviewer | `agents/code-reviewer.md` | `@code-reviewer` | Review code quality/security |
| architect | `agents/architect.md` | `@architect <design>` | System architecture design |
| build-error-resolver | `agents/build-error-resolver.md` | Auto-invoked | Fix build errors |
| doc-updater | `agents/doc-updater.md` | Auto-invoked | Generate documentation |
| security-reviewer | `agents/security-reviewer.md` | Auto-invoked | Security vulnerability scan |

## 📋 Rules (Auto-loaded)

| Rule | File | Purpose |
|------|------|---------|
| Feature Workflow | `rules/feature-workflow.md` | Enforce 7-step development workflow |
| Parallel Development | `rules/parallel-development.md` | Multi-worktree best practices |
| Context Awareness | `rules/context-awareness.md` | Auto-display current issue/PR |
| Coding Style | `rules/coding-style.md` | Immutability, file organization, error handling |
| Git Workflow | `rules/git-workflow.md` | Commit format, PR workflow |
| Security | `rules/security.md` | Security checks, secret management |
| Performance | `rules/performance.md` | Model selection, context management |

## 📚 Skills (Project-Specific)

| Skill | Directory | Description |
|-------|-----------|-------------|
| Daily Reports | `skills/daily-reports/` | 日次締め・証跡生成・仕訳ドラフト |
| Inbox Pattern | `skills/inbox-pattern/` | AI出力の人間承認フロー |
| Stripe Checkout | `skills/stripe-checkout/` | Stripe決済フロー（Embedded Checkout） |
| Tax Calculation | `skills/tax-calculation/` | 日本の消費税計算ロジック |

## 🎯 Common Tasks

### Start New Feature
```bash
cd ~/Code/kikaku-os
/feature "add product filtering"
```

### Work on Existing Issue
```bash
cd ~/Code/kikaku-os
/feature 142
```

### Fix Build Errors
```bash
/build-fix
```

### Review Code
```bash
/code-review
```

### Create PR from Current Branch
```bash
gh pr create --title "feat: ..." --body "..."
```

## 🔍 Searching

### Find Command
```bash
grep -r "command-name" .claude/commands/
```

### Find Rule
```bash
grep -r "topic" .claude/rules/
```

### Find Skill
```bash
ls .claude/skills/
```

## 📖 Documentation

- **Project Overview**: `/CLAUDE.md`
- **Deployment Guide**: `/DEPLOYMENT.md`
- **Main README**: `/README.md`
- **This Directory**: `.claude/README.md`

## ⚙️ Configuration

- **Permissions**: `.claude/settings.local.json`
- **Plans**: `.claude/plans/` (archive when complete)

## 🆘 Troubleshooting

| Problem | Solution | Reference |
|---------|----------|-----------|
| "Must run from main worktree" | Open new tab, cd to main worktree | `rules/parallel-development.md` |
| "Wrong branch" | `git checkout main` | `commands/feature.md` |
| Port conflict | Use different port per worktree | `rules/parallel-development.md` |
| Old worktrees | `git worktree remove ../kikaku-os-XXX` | `rules/parallel-development.md` |

## 🏗️ Architecture

```
kikaku-os/
├── .claude/           # Claude Code configuration
│   ├── agents/        # Autonomous task specialists
│   ├── commands/      # User-invocable workflows
│   ├── rules/         # Auto-loaded mandatory rules
│   ├── skills/        # Domain knowledge patterns
│   └── plans/         # Implementation plans
├── apps/
│   ├── api/          # Cloudflare Workers + Hono
│   └── storefront/   # Astro SSR (Store + Admin)
├── CLAUDE.md         # Development guide
└── README.md         # Project overview
```

## 📊 Workflow Diagram

```
User Request
     ↓
Feature Request? → YES → /feature command
     ↓                        ↓
     NO                  1. Plan (planner agent)
     ↓                   2. Worktree (new terminal tab)
Continue                3. Issue (GitHub)
normally                4. Exec (implement + review)
                        5. Typecheck (auto-fix)
                        6. Test (auto-fix)
                        7. PR (create + link)
                             ↓
                        ✅ Complete!
```

## 🔗 Quick Links

- [Feature Workflow](rules/feature-workflow.md)
- [Parallel Development](rules/parallel-development.md)
- [Coding Style](rules/coding-style.md)
- [README](.claude/README.md)
