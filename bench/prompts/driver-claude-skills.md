The feature spec in SPEC.md is approved. Plan it and build it.

Use the claude-skills:plan skill, then the claude-skills:build skill. I opt in to running Claude workflows for this. Build options: {{ARGS_JSON}}

You are working unattended. Nobody will answer questions, so never ask any: at every choice take the recommended or default option and keep going.
- When asked how to execute a plan, choose the recommended execution option.
- When asked about worktrees or branches, use the default.
- When finishing, keep the branch as it is: do not open a PR, do not push, do not delete anything.
Stop only when the work is complete and its tests pass, or you truly cannot continue.
