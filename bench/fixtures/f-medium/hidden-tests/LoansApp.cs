using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Loans.Api.Books;
using Loans.Api.Data;
using Loans.Api.Members;

namespace Loans.Hidden.Tests;

public sealed class LoansApp : WebApplicationFactory<Program>
{
    public static readonly DateTimeOffset Start = new(2026, 1, 1, 9, 0, 0, TimeSpan.Zero);
    public FakeTimeProvider Clock { get; } = new(Start);
    private readonly string _db = Path.Combine(Path.GetTempPath(), $"loans-hidden-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Loans", $"Data Source={_db}");
        builder.ConfigureServices(s =>
        {
            s.RemoveAll<TimeProvider>();
            s.AddSingleton<TimeProvider>(Clock);
        });
    }

    public async Task<int> Book(HttpClient c, string title = "Dune")
        => (await (await c.PostAsJsonAsync("/books", new { title, author = "Herbert" })).Content.ReadFromJsonAsync<BookResponse>())!.Id;

    public async Task<int> Member(HttpClient c, string name = "Ada")
        => (await (await c.PostAsJsonAsync("/members", new { name })).Content.ReadFromJsonAsync<MemberResponse>())!.Id;

    public static Task<HttpResponseMessage> Borrow(HttpClient c, int bookId, int memberId)
        => c.PostAsJsonAsync("/loans", new { bookId, memberId });

    public static async Task<LoanResponse> Read(HttpResponseMessage r) => (await r.Content.ReadFromJsonAsync<LoanResponse>())!;
}
