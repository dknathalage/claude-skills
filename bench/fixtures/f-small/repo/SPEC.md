# Spec: tag normalisation

Approved. Add tag normalisation to the `Tags` library (`src/Tags`). Put tests in `tests/Tags.Tests`.

## Behaviour

Users type free-text tags. The library turns them into clean tags and tells the caller which inputs were rejected and why.

1. **Normalise** a raw tag: trim surrounding whitespace, then lower-case it with the invariant culture.
2. **Validate** a normalised tag. It is valid when all of these hold:
   - not empty
   - at most `TagsInfo.MaxLength` (32) characters
   - only the characters `a`–`z`, `0`–`9` and `-`
   - does not start or end with `-`
3. **Process** a list of raw tags: normalise each, validate each, and return:
   - `Accepted`: the valid normalised tags, without duplicates, in the order they first appeared
   - `Rejected`: one entry per invalid input, in input order, with the original raw string and the reason

## API (exact names; other code depends on them)

```csharp
namespace Tags;

public static class TagNormalizer
{
    public static string Normalize(string raw);        // throws ArgumentNullException for null
}

public enum TagError { Empty, TooLong, InvalidCharacters, BadHyphen }

public static class TagValidator
{
    // Returns null when valid, otherwise the first failing rule in the order listed above.
    public static TagError? Validate(string normalized);
}

public sealed record RejectedTag(string Raw, TagError Reason);

public sealed record TagResult(IReadOnlyList<string> Accepted, IReadOnlyList<RejectedTag> Rejected);

public sealed class TagService
{
    public TagResult Process(IEnumerable<string> rawTags);   // throws ArgumentNullException for null
}
```

## Out of scope

Persistence, synonyms, and any UI.
