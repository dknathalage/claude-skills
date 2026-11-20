# claude-skills

Personal [Claude Code](https://claude.com/claude-code) skills, packaged as a plugin marketplace so they can be installed and updated with `/plugin`.

## Install

```
/plugin marketplace add dknathalage/claude-skills
/plugin install dk-skills@claude-skills
```

## Update

```
/plugin marketplace update claude-skills
```

## Skills

| Skill | Description |
|-------|-------------|
| `ssr-frontend` | Legacy Go SSR stack only: server-rendered UI with `pkg/ui` (shadcn tokens + html/template + HTMX/Alpine). |

## Adding or changing a skill

Skills live in `plugins/dk-skills/skills/<name>/SKILL.md`. Edit them there, or dump from `~/.claude/skills`:

```bash
scripts/dump.sh                    # every skill in ~/.claude/skills
scripts/dump.sh ~/some/skill-dir   # one skill
```

The script bumps the plugin's patch version. Bump it by hand if you edit skills directly, because Claude Code uses the version to detect updates. Then commit, push, and run `/plugin marketplace update claude-skills`.

## Layout

```
.claude-plugin/marketplace.json      marketplace manifest
plugins/dk-skills/
  .claude-plugin/plugin.json         plugin manifest (version lives here)
  skills/<name>/SKILL.md             one directory per skill
scripts/dump.sh                      copy skills in + bump version
```

## License

MIT
