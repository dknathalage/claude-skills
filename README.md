# claude-skills

Personal [Claude Code](https://claude.com/claude-code) skills, packaged as a single plugin (`claude-skills`).

## Install

```
/plugin marketplace add dknathalage/claude-skills
/plugin install claude-skills@claude-skills
```

The small `marketplace.json` is only there because `/plugin` installs through a marketplace. It points at this repo root (`"source": "./"`).

## Update

```
/plugin marketplace update claude-skills
```

## Adding or changing a skill

Skills live in `skills/<name>/SKILL.md`. After editing, bump `version` in `.claude-plugin/plugin.json` (Claude Code uses it to detect updates), commit, push, and run `/plugin marketplace update claude-skills`.

## Layout

```
.claude-plugin/plugin.json        plugin manifest (version lives here)
.claude-plugin/marketplace.json   one-entry pointer so /plugin can install it
skills/<name>/SKILL.md            one directory per skill
docs/specs/                       design docs
```

## License

MIT
