# Root-cause tracing

Bugs often surface deep in a call stack: a file written to the wrong folder, a database opened at the wrong path, a command run in the wrong directory. Fixing where the error appears treats the symptom. Trace backwards until you find the original trigger, then fix there.

## Steps

1. **Observe the symptom.** For example, `git init` ran in the source tree instead of a temp folder.
2. **Find the immediate cause.** The line that did it: a process started with `cwd: projectDir`.
3. **Ask what called it, and with what value.** `projectDir` was an empty string, so the command fell back to the current directory.
4. **Keep going up.** Each caller passed the empty value along until you reach where it was created: a test read a temp-dir field before setup had filled it in.
5. **Fix at the source.** Make the field throw if read before setup.

## When you cannot trace by reading

Add instrumentation just before the dangerous operation, not after it fails. Log the inputs, the working directory, relevant environment variables and the full stack trace. In tests, write to stderr directly, since the app logger may be suppressed. Run, filter the output for your marker, and look for which test file and line triggered the call.

## When a test leaves stray state

If files or state appear during a run and you do not know which test made them, run test files one at a time, checking after each, and stop at the first that creates it.

## After the fix

Consider adding a check at each layer the bad value passed through: entry point validation, business-logic validation, and an environment guard (for example, refuse destructive operations outside a temp directory during tests).
