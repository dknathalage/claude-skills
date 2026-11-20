---
name: spec
description: Use when starting any new feature, product, change or plan that isn't fully specified, when the user asks to brainstorm, design, spec or plan something, or before any creative or building work. Finds out what the user wants and why, and ends in an approved design doc.
---

# Spec

Find out what the user wants, and why, before anything gets built. The why lets you make unstated decisions their way.

If everything that matters is in the request ("make the icon cornflower blue"), just do it and say what you did. Otherwise, before implementing, in order:
1. Lay out the approaches in their own message and get a pick.
2. Write the design doc, short or full.
3. Get the user's approval of it.
4. Invoke `claude-skills:plan`.

If nothing is open and there's one sensible way, steps 1 to 3 happen in your first message.

## Look before you ask

Read the project and any context the user gave (spec, handoff, files, earlier conversation) until you can explain how the relevant parts work today and what the change touches. Never ask what that already answers, or reopen settled decisions.

## First message

- **They've said what they want:** about 200 words. Echo it in your own words (what, for whom, why), add what you found (any constraint, conflict or cheaper path that changes the request), and invite corrections. Then: if they haven't said why, ask one open question about it. Else, if something open would change what gets built, ask about the biggest one, sketching named choices with trade-offs and your pick. Else end with the short design (approach, why others don't fit, the design in a few lines) and ask for approval; that covers the approach and design, so write the short doc and go to the plan.
- **They haven't:** one open question about the biggest unsettled thing, saying what the answer changes. For "a website for my bakery": "If it's mostly for people deciding whether to stop by, I'd lead with hours and what's in the case today; taking orders is a different site. What do you want someone to do when they land on it?"

If they didn't ask for a design discussion, add a one-line offer to just get going. If they take it, this skill is done: state any significant how-it-gets-made choice in a line and do the work.

## The conversation

- **Ask only what changes what gets built** and isn't already answered. Otherwise state your call and reason as a proposal. Process steps (writing up, file locations, looking further) are your call: do them and say so.
- **One question at a time**, in plain language and their vocabulary. No process jargon; never quote this skill to them.
- **Open questions until you know why**, with no example answers. After that, sketch named choices with trade-offs and your pick. On "just guess", propose something concrete.
- **Make each question specific**, built on their last answer or something you found, so it surfaces a consequence or case they missed.
- **How it gets made.** If they raise the how, give options with your pick. If they talk only outcomes, make the calls and state each in a line. Build on what existing work uses. Record your calls as yours, never as agreed.
- **Ground to cover**, not a script: why now, what success looks like, goals, non-goals, anti-goals (failure even if it works), prior art, what exists and what they've tried.
- **Do recon** when it helps (codebase, files, web); report the most important findings.
- **Show, don't tell.** Sketch in text when seeing helps. When the look itself is theirs to decide, offer a mockup (an artifact or HTML page) if the environment supports one.
- **Spike** when a throwaway build is the cheapest way to learn; it skips tests, plan and review. Bring the lessons back.

**Play back as you go.** As each part becomes clear, describe it back in 200–300 words: their words as theirs, your fills as proposals with reasons. Ask what's wrong or missing.

**Lay out the approaches** before writing anything up, in a message of their own. Drop weak ones (including any that fight the why or the existing work) and sketch 2–3 concretely, with trade-offs. Recommend one, say why, and ask which. If they handed you the how, take your pick. If there's genuinely one sensible way, say why the others don't fit.

## Size the work

Once they've picked, say how big it is; they can override.
- **Small change:** a short doc, a line or two per section, no builder check.
- **Project:** the full design and the builder check.

If it grows, say so and step up. Several independent projects: agree an order, spec one at a time.

## The design doc

Write it so a talented builder could plan from it without the user. Cover:
- intent and the why
- goals, non-goals, anti-goals
- constraints
- approaches: those considered, trade-offs, the pick and why
- what's decided about the how
- what's left to the builder

In a repo, write `docs/specs/YYYY-MM-DD-<topic>-design.md` and commit it; otherwise pick a place and say where. The user's preferences override.

**Builder check (projects).** Dispatch one fresh subagent on the session model with `builder-check.md` from this directory. Tell the user a reviewer reads it first and you may come back once with questions; don't hand over the doc before it returns. Sort its questions:
- **Answered** by the conversation or project: put the answer in the doc.
- **Minor:** settling it doesn't change what gets built. Decide it; mark it as your call.
- **The user's:** only they can answer, and it changes what gets built.

Bring the user's pile in one message, most important first; that is the only round. Update the doc and hand it over with a short list of your calls. Without a subagent tool, read the doc as that builder yourself.

## Unattended

If the user says they're unattended or not answering: take your recommended option at every choice, write the doc, mark every call you made, settle the builder check's questions yourself (marked), and invoke `claude-skills:plan` without waiting.

<HARD-GATE>
Nothing gets built until the user approves the design doc. Building includes code, scaffolding, installing dependencies, and invoking an implementation skill. Reading and exploring are fine.

Exceptions: if they opted out of the questions, the gate goes with this skill. An agreed spike may be built but stays throwaway; keeping it is a new request back through this gate. Unattended, the marked doc stands in for approval.

After approval, invoke `claude-skills:plan` and no other skill.
</HARD-GATE>

## Red flags

| Thought | Reality |
|---------|---------|
| "I'll offer a menu of what they might want" | Options steer. Get them describing first. |
| "I've answered their questions, so I'll write the doc" | Lay out the approaches first, in their own message. |
| "They said 'sounds good' to the idea" | Approval covers what you showed. An unwritten doc isn't approved. |
| "The spike works, I'll keep building on it" | Keeping it is a new request. Back through the gate. |
