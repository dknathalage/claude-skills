using Tags;

namespace Tags.Hidden.Tests;

public class HiddenTagTests
{
    [Fact] public void Normalize_trims_and_lowercases() => Assert.Equal("dotnet", TagNormalizer.Normalize("  DotNet \t"));
    [Fact] public void Normalize_null_throws() => Assert.Throws<ArgumentNullException>(() => TagNormalizer.Normalize(null!));
    [Fact] public void Validate_accepts_32_chars() => Assert.Null(TagValidator.Validate(new string('a', 32)));
    [Fact] public void Validate_rejects_33_chars() => Assert.Equal(TagError.TooLong, TagValidator.Validate(new string('a', 33)));
    [Fact] public void Validate_empty_is_first_rule() => Assert.Equal(TagError.Empty, TagValidator.Validate(""));
    [Fact] public void Validate_inner_space_is_invalid_characters() => Assert.Equal(TagError.InvalidCharacters, TagValidator.Validate("c sharp"));
    [Fact] public void Validate_leading_hyphen() => Assert.Equal(TagError.BadHyphen, TagValidator.Validate("-net"));

    [Fact]
    public void Process_dedupes_in_first_seen_order()
    {
        var r = new TagService().Process(["Web", "api", " web ", "API", "db"]);
        Assert.Equal(["web", "api", "db"], r.Accepted);
        Assert.Empty(r.Rejected);
    }

    [Fact]
    public void Process_reports_rejected_with_raw_and_reason_in_order()
    {
        var r = new TagService().Process(["ok", "   ", "bad!", "trailing-"]);
        Assert.Equal(["ok"], r.Accepted);
        Assert.Equal(
            [new RejectedTag("   ", TagError.Empty), new RejectedTag("bad!", TagError.InvalidCharacters), new RejectedTag("trailing-", TagError.BadHyphen)],
            r.Rejected);
    }

    [Fact] public void Process_null_throws() => Assert.Throws<ArgumentNullException>(() => new TagService().Process(null!));
}
