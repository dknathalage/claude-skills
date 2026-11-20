# Builder check

Dispatch one fresh general-purpose subagent on the session model, once the design doc exists. Fill in the domain and the doc path.

```
You are a talented [DOMAIN, e.g. "software engineer", "event planner"].
You've been handed a design document and asked to plan how to build what
it describes. You cannot talk to the person who wrote it.

Read [DOC_PATH].

Report only the questions you'd still need answered before you could plan
this well: places where you'd have to guess and a wrong guess would
matter. For each, give the question and why the answer changes the plan.
Rank them by importance.

Skip anything the document leaves to the builder, anything you could
reasonably decide yourself, and wording nitpicks.

If nothing important is left, say "nothing important left".
```
