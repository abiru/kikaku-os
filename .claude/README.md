# .claude Directory

Claude Code configuration for kikaku-os project.

## Structure

```
.claude/
├── agents/         # Specialized AI agents for complex tasks
├── commands/       # Custom commands (/feature, /build-fix, etc.)
├── rules/          # Auto-loaded rules and workflows (MANDATORY)
├── skills/         # Domain-specific knowledge patterns
├── plans/          # Implementation plans and architecture decisions
├── README.md       # This file
├── INDEX.md        # Quick reference index
└── settings.local.json  # Permissions and tool access
```

## Agents (専門化されたAIエージェント)

自律的に複雑なタスクを処理する専門エージェント：

- **planner** - Implementation planning specialist (model: opus)
- **code-reviewer** - Code quality and security review specialist
- **architect** - Software architecture and system design specialist
- **build-error-resolver** - Build/TypeScript error fixing specialist
- **doc-updater** - Documentation generation and maintenance specialist
- **security-reviewer** - Security vulnerability detection specialist

## Commands (カスタムコマンド)

ユーザーが呼び出せるワークフローコマンド：

- `/feature` - Complete 7-step feature development workflow
- `/create-issue` - Create GitHub issue from plan
- `/exec-issue` - Execute GitHub issue implementation
- `/build-fix` - Fix build and TypeScript errors incrementally
- `/code-review` - Comprehensive code quality review
- `/update-docs` - Update documentation from code

## Rules (自動適用ルール)

会話開始時に自動的に読み込まれるMandatoryルール：

- **feature-workflow.md** - 7-step feature development workflow
- **parallel-development.md** - Multi-worktree development rules
- **context-awareness.md** - Auto-display current issue/PR/worktree
- **coding-style.md** - Immutability, file organization, error handling
- **git-workflow.md** - Commit messages, PR workflow, branching
- **security.md** - Security checks, secret management
- **performance.md** - Model selection, context management

## Skills (ドメイン知識)

kikaku-os固有のビジネスロジックとパターン：

- **daily-reports/** - 日次締め・証跡生成・仕訳ドラフト
- **inbox-pattern/** - AI出力の人間承認フロー
- **stripe-checkout/** - Stripe決済フロー（Embedded Checkout）
- **tax-calculation/** - 日本の消費税計算ロジック

## Quick Start

### New Feature Development

```bash
# 1. Ensure you're in main worktree on main branch
cd /home/user/Code/kikaku-os
git branch --show-current  # Should output: main

# 2. Start feature workflow
/feature "add product filtering"

# 3. Follow the 7 steps (Plan → Worktree → Issue → Exec → Typecheck → Test → PR)
```

### Parallel Development

```bash
# Terminal Tab 1: Main worktree (for starting new features)
cd ~/Code/kikaku-os
/feature 142

# Terminal Tab 2: Work on issue 142
cd ~/Code/kikaku-os-142
pnpm dev:api --port 8788

# Terminal Tab 3: Start another feature
cd ~/Code/kikaku-os
/feature "another feature"

# Terminal Tab 4: Work on new feature
cd ~/Code/kikaku-os-155
pnpm dev:api --port 8789
```

## Best Practices

1. **Always run `/feature` from main worktree** - Never from subworktrees
2. **One terminal tab per worktree** - Avoid confusion
3. **Use different ports for each worktree** - Prevent conflicts
4. **Follow TDD workflow** - planner → test → implement → review
5. **Review before committing** - Use code-reviewer agent

## Configuration

### settings.local.json

Defines permissions for bash commands, file operations, and tool access.

**Key Permissions**:
- Git operations (read, commit, push)
- pnpm package management
- GitHub CLI (gh) for issues/PRs
- File read/write/edit operations
- Wrangler for Cloudflare deployment

### Environment-Specific

Claude Code automatically loads:
- All files in `rules/` at conversation start
- Commands available via `/command-name`
- Agents available via `@agent-name`
- Skills available via Skill tool

## Documentation

- **Quick Reference**: See `INDEX.md`
- **Feature Workflow**: See `rules/feature-workflow.md`
- **Parallel Development**: See `rules/parallel-development.md`
- **Project Overview**: See `/CLAUDE.md` in project root

## Troubleshooting

### "Error: Must run from main worktree"

You're trying to run `/feature` from a subworktree. Open a new terminal tab and cd to main worktree:

```bash
cd ~/Code/kikaku-os
git branch --show-current  # Verify: main
/feature ...
```

### "Warning: Main worktree is on wrong branch"

Main worktree should always be on `main` branch:

```bash
cd ~/Code/kikaku-os
git checkout main
git pull origin main
```

### Port Already in Use

Each worktree should use different ports:
- Main: 8787, 4321
- kikaku-os-142: 8788, 4322
- kikaku-os-155: 8789, 4323

## Contributing

When adding new patterns or workflows:

1. **Commands** - For user-invocable workflows
2. **Rules** - For mandatory automatic behaviors
3. **Skills** - For domain-specific knowledge
4. **Agents** - For complex autonomous tasks

Keep files focused and under 500 lines. Use MANY SMALL FILES over few large files.
