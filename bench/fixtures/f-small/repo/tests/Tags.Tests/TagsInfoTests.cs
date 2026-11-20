using Tags;

namespace Tags.Tests;

public class TagsInfoTests
{
    [Fact]
    public void MaxLength_is_32() => Assert.Equal(32, TagsInfo.MaxLength);
}
