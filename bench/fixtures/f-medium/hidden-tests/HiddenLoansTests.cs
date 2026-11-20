using System.Net;
using System.Net.Http.Json;
using Loans.Api.Books;
using Loans.Api.Data;
using Loans.Api.Members;

namespace Loans.Hidden.Tests;

public class HiddenLoansTests
{
    // ---- books & members ----
    [Fact]
    public async Task Create_book_returns_201_with_location_and_body()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var r = await c.PostAsJsonAsync("/books", new { title = "Dune", author = "Herbert" });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var b = await r.Content.ReadFromJsonAsync<BookResponse>();
        Assert.Equal(("Dune", "Herbert"), (b!.Title, b.Author));
        Assert.Equal($"/books/{b.Id}", r.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Create_book_with_blank_title_is_400()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var r = await c.PostAsJsonAsync("/books", new { title = "  ", author = "X" });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task List_books_in_id_order()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        await app.Book(c, "A"); await app.Book(c, "B");
        var list = await c.GetFromJsonAsync<BookResponse[]>("/books");
        Assert.Equal(["A", "B"], list!.Select(b => b.Title));
    }

    [Fact]
    public async Task Create_member_and_blank_name()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var ok = await c.PostAsJsonAsync("/members", new { name = "Ada" });
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        var bad = await c.PostAsJsonAsync("/members", new { name = "" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var list = await c.GetFromJsonAsync<MemberResponse[]>("/members");
        Assert.Equal(["Ada"], list!.Select(m => m.Name));
    }

    // ---- borrowing ----
    [Fact]
    public async Task Borrow_sets_due_in_14_days()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var r = await LoansApp.Borrow(c, await app.Book(c), await app.Member(c));
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var l = await LoansApp.Read(r);
        Assert.Equal(LoansApp.Start.UtcDateTime, l.BorrowedOn);
        Assert.Equal(LoansApp.Start.UtcDateTime.AddDays(14), l.DueOn);
        Assert.Null(l.ReturnedOn);
        Assert.Equal($"/loans/{l.Id}", r.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Borrow_unknown_book_is_404()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await LoansApp.Borrow(c, 999, await app.Member(c))).StatusCode);
    }

    [Fact]
    public async Task Borrow_unknown_member_is_404()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await LoansApp.Borrow(c, await app.Book(c), 999)).StatusCode);
    }

    [Fact]
    public async Task Borrow_book_already_on_loan_is_409()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var book = await app.Book(c);
        await LoansApp.Borrow(c, book, await app.Member(c, "A"));
        Assert.Equal(HttpStatusCode.Conflict, (await LoansApp.Borrow(c, book, await app.Member(c, "B"))).StatusCode);
    }

    [Fact]
    public async Task Fourth_active_loan_is_409()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var m = await app.Member(c);
        for (var i = 0; i < 3; i++) Assert.Equal(HttpStatusCode.Created, (await LoansApp.Borrow(c, await app.Book(c, $"B{i}"), m)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await LoansApp.Borrow(c, await app.Book(c, "B3"), m)).StatusCode);
    }

    [Fact]
    public async Task Returned_loans_do_not_count_towards_limit_or_block_the_book()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var m = await app.Member(c); var book = await app.Book(c, "B0");
        var first = await LoansApp.Read(await LoansApp.Borrow(c, book, m));
        for (var i = 1; i < 3; i++) await LoansApp.Borrow(c, await app.Book(c, $"B{i}"), m);
        await c.PostAsync($"/loans/{first.Id}/return", null);
        Assert.Equal(HttpStatusCode.Created, (await LoansApp.Borrow(c, book, m)).StatusCode);
    }

    // ---- returns & fees ----
    [Fact]
    public async Task Return_on_time_has_zero_fee()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var l = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c), await app.Member(c)));
        app.Clock.Advance(TimeSpan.FromDays(10));
        var r = await c.PostAsync($"/loans/{l.Id}/return", null);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var back = await LoansApp.Read(r);
        Assert.Equal(LoansApp.Start.UtcDateTime.AddDays(10), back.ReturnedOn);
        Assert.Equal(0m, back.Fee);
    }

    [Fact]
    public async Task Return_five_days_late_costs_2_50()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var l = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c), await app.Member(c)));
        app.Clock.Advance(TimeSpan.FromDays(19));
        Assert.Equal(2.50m, (await LoansApp.Read(await c.PostAsync($"/loans/{l.Id}/return", null))).Fee);
    }

    [Fact]
    public async Task Partial_day_late_rounds_down()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var l = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c), await app.Member(c)));
        app.Clock.Advance(TimeSpan.FromDays(14) + TimeSpan.FromHours(30));
        Assert.Equal(0.50m, (await LoansApp.Read(await c.PostAsync($"/loans/{l.Id}/return", null))).Fee);
    }

    [Fact]
    public async Task Fee_is_capped_at_10()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var l = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c), await app.Member(c)));
        app.Clock.Advance(TimeSpan.FromDays(14 + 45));
        Assert.Equal(10.00m, (await LoansApp.Read(await c.PostAsync($"/loans/{l.Id}/return", null))).Fee);
    }

    [Fact]
    public async Task Return_twice_is_409()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var l = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c), await app.Member(c)));
        await c.PostAsync($"/loans/{l.Id}/return", null);
        Assert.Equal(HttpStatusCode.Conflict, (await c.PostAsync($"/loans/{l.Id}/return", null)).StatusCode);
    }

    [Fact]
    public async Task Return_unknown_is_404()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await c.PostAsync("/loans/999/return", null)).StatusCode);
    }

    // ---- overdue ----
    [Fact]
    public async Task Overdue_lists_unreturned_past_due_ordered_by_due()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var m = await app.Member(c);
        var a = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c, "A"), m));
        app.Clock.Advance(TimeSpan.FromDays(2));
        var b = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c, "B"), m));
        app.Clock.Advance(TimeSpan.FromDays(20));
        var list = await c.GetFromJsonAsync<LoanResponse[]>("/loans/overdue");
        Assert.Equal([a.Id, b.Id], list!.Select(l => l.Id));
    }

    [Fact]
    public async Task Overdue_excludes_returned_and_not_yet_due()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        var m = await app.Member(c);
        var returned = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c, "A"), m));
        app.Clock.Advance(TimeSpan.FromDays(10));
        var fresh = await LoansApp.Read(await LoansApp.Borrow(c, await app.Book(c, "B"), m));
        app.Clock.Advance(TimeSpan.FromDays(6)); // first is 2 days overdue, second not due yet
        await c.PostAsync($"/loans/{returned.Id}/return", null);
        var list = await c.GetFromJsonAsync<LoanResponse[]>("/loans/overdue");
        Assert.Empty(list!);
        Assert.NotEqual(0, fresh.Id);
    }

    [Fact]
    public async Task Exactly_at_due_is_not_overdue()
    {
        using var app = new LoansApp(); var c = app.CreateClient();
        await LoansApp.Borrow(c, await app.Book(c), await app.Member(c));
        app.Clock.Advance(TimeSpan.FromDays(14));
        Assert.Empty((await c.GetFromJsonAsync<LoanResponse[]>("/loans/overdue"))!);
    }

    [Fact]
    public async Task Health_still_works()
    {
        using var app = new LoansApp();
        Assert.Equal(HttpStatusCode.OK, (await app.CreateClient().GetAsync("/health")).StatusCode);
    }
}
