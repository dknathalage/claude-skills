# Tag normalisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tag normalisation, validation and processing to the Tags library as SPEC.md describes.

**Spec:** SPEC.md

## Global Constraints

- Names and signatures exactly as the spec's code-shape section.

---

### Task 1: TagNormalizer

**Files:**
- Create or modify: `src/Tags/TagNormalizer.cs`
- Create or modify: `tests/Tags.Tests/TagNormalizerTests.cs`

- [ ] **Step 1:** In tests/Tags.Tests/TagNormalizerTests.cs write xUnit tests: Normalize("  DotNet \t") == "dotnet"; Normalize("ABC") == "abc"; Normalize(null!) throws ArgumentNullException.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Tags/TagNormalizer.cs: `namespace Tags; public static class TagNormalizer { public static string Normalize(string raw) }` — ArgumentNullException.ThrowIfNull(raw), then raw.Trim().ToLowerInvariant().
- [ ] **Step 4:** Run the tests until they pass.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~TagNormalizerTests` Expected: PASS
- [ ] **Commit:** `git add src/Tags/TagNormalizer.cs tests/Tags.Tests/TagNormalizerTests.cs && git commit -m "T1: TagNormalizer"`

### Task 2: TagValidator and TagError

**Files:**
- Create or modify: `src/Tags/TagValidator.cs`
- Create or modify: `tests/Tags.Tests/TagValidatorTests.cs`

- [ ] **Step 1:** In tests/Tags.Tests/TagValidatorTests.cs write xUnit tests: Validate("") == TagError.Empty; Validate(new string('a',32)) is null; Validate(new string('a',33)) == TagError.TooLong; Validate("c sharp") == TagError.InvalidCharacters; Validate("-net") == TagError.BadHyphen; Validate("net-") == TagError.BadHyphen; Validate("web-api2") is null.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Tags/TagValidator.cs containing `public enum TagError { Empty, TooLong, InvalidCharacters, BadHyphen }` and `public static class TagValidator { public static TagError? Validate(string normalized) }` in namespace Tags. Check rules in this order and return the first failure: empty → Empty; Length > TagsInfo.MaxLength → TooLong; any char not a-z, 0-9 or '-' → InvalidCharacters; starts or ends with '-' → BadHyphen; else null.
- [ ] **Step 4:** Run the tests until they pass.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~TagValidatorTests` Expected: PASS
- [ ] **Commit:** `git add src/Tags/TagValidator.cs tests/Tags.Tests/TagValidatorTests.cs && git commit -m "T2: TagValidator and TagError"`

### Task 3: TagService.Process

**Files:**
- Create or modify: `src/Tags/TagService.cs`
- Create or modify: `tests/Tags.Tests/TagServiceTests.cs`

**Depends on:** Task 1, Task 2

- [ ] **Step 1:** In tests/Tags.Tests/TagServiceTests.cs write xUnit tests: Process(["Web","api"," web "]) gives Accepted ["web","api"] and no Rejected; Process(["ok","   ","bad!"]) gives Accepted ["ok"] and Rejected [RejectedTag("   ", Empty), RejectedTag("bad!", InvalidCharacters)] in that order; Process(null!) throws ArgumentNullException.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Tags/TagService.cs in namespace Tags with `public sealed record RejectedTag(string Raw, TagError Reason);`, `public sealed record TagResult(IReadOnlyList<string> Accepted, IReadOnlyList<RejectedTag> Rejected);` and `public sealed class TagService { public TagResult Process(IEnumerable<string> rawTags) }`. For each raw tag: Normalize, then Validate; invalid → add RejectedTag(raw, error); valid and not seen before → add to Accepted. Keep input order.
- [ ] **Step 4:** Run the tests until they pass, then run the whole suite.
- [ ] **Verify:** Run: `dotnet test` Expected: PASS
- [ ] **Commit:** `git add src/Tags/TagService.cs tests/Tags.Tests/TagServiceTests.cs && git commit -m "T3: TagService.Process"`

