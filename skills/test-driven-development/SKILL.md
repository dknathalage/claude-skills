---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code. Also use for refactoring or any behaviour change.
---

# Test-Driven Development

## Core rules

**No production code without a failing test first.**

1. **Red.** Write one small test for one behaviour. Run it. Watch it fail, and check it fails for the right reason: the behaviour is missing, not a typo, import error or broken setup. If it passes, it tests nothing new; fix the test.
2. **Green.** Write the minimal code that makes the test pass. No extra options, features or clean-ups beyond the test.
3. **Refactor.** Only when green. Improve names, remove duplication, keep every test green, add no behaviour.
4. **Repeat** for the next behaviour.

Before calling the work done, run the project's whole test suite (`dotnet test`, `npm test`, `pytest`, whatever the repo uses), not just your file. A task scope limits what you deliver, not what you verify. Report every red test by name, including ones you did not cause.

If you wrote code before its test, delete it and start again from the test. Do not keep it as a reference.

## When to ask first

Always use TDD for features, bug fixes, refactors and behaviour changes. Ask the user before skipping it for:
- throwaway prototypes
- generated code
- configuration files

## Example

Bug: empty email is accepted.

```csharp
[Fact]
public void Rejects_empty_email()
{
    var result = Signup.Submit(new SignupForm { Email = "" });
    Assert.Equal("Email required", result.Error);
}
```

It fails with `Expected "Email required", actual null`: the right failure. Add the check, watch it pass, then run the whole suite.

## Good tests

- One behaviour per test. An "and" in the name means split it.
- The name says what should happen.
- Test real code. Mock only what is slow or external.
- Before writing a test, name the production change that would make it fail.

When writing or changing tests, adding mocks or test helpers, read `good-tests.md` in this folder.

## Rationalisations

| Thought | Reality |
|---|---|
| "Too simple to test" | Simple code breaks. The test takes a minute. |
| "I'll test after" | A test written after passes at once and proves nothing. You never saw it catch the bug. |
| "I already tested it by hand" | Manual checks leave no record and cannot be re-run. |
| "Deleting this work is wasteful" | Sunk cost. Code you cannot trust is the real waste. |
| "Hard to test" | Hard to test means hard to use. Simplify the design. |

## When stuck

- Don't know how to test it: write the call you wish existed, then the assertion.
- Must mock everything: the code is too coupled. Inject dependencies.

## Bugs

Every bug fix starts with a failing test that reproduces the bug. See `claude-skills:systematic-debugging` for finding the cause, and `claude-skills:verification-before-completion` before claiming the fix works.
