# Good tests

A test exists to catch a specific break. Two rules: every test names the break it catches, and every test exercises the real thing.

## Name the break

- Before writing the body, name the production change that would make the test fail. If you cannot, redesign the test around an observable behaviour.
- Derive expected values by hand. Use literals or hand-checked fixtures, never the code under test or its helpers. `Assert.Equal(Build(x), Build(x))` always passes.
- No change detectors. Do not assert a constant's value or exact wording; test the behaviour that depends on it ("the 6th retry never happens", not `MaxRetries == 5`).
- Test behaviour, not text. Run scripts and config against inputs and assert outputs, side effects or exit codes. Do not grep source.
- Test your boundary contract (the route, query or payload you produce), not the framework's mechanics.

## Exercise the real thing

- Never assert on a mock. If the mock is what you are checking, unmock it or delete the assertion.
- Before mocking a method, learn its side effects. Mock the slow or external level below them and keep what the test depends on real.
- Make doubles specific: assert arguments, counts or order when they are part of the contract. Give each branch its own fixture.
- Mock responses mirror the full real structure, not just the fields you read.
- Methods only tests call belong in test utilities, not production classes.
- If mock setup outgrows the test, switch to an integration test with real components.

## Mutation check

Before finishing, imagine each break: wrong constant or argument, wrong branch, missing side effect, empty or default return, missing validation for empty, null, zero, unauthorised or malformed input. At least one test should fail for each.
