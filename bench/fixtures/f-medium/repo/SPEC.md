# Spec: library loans API

Approved. Add a small lending library to `src/Loans.Api`: books, members, and loans with due dates, overdue listing and late fees. Tests go in `tests/Loans.Tests`.

## Rules

- A loan lasts **14 days**: `DueOn = BorrowedOn + 14 days`.
- A member may have at most **3 active loans**. A loan is active until it is returned.
- A book can be on at most one active loan at a time.
- Late fee on return: **0.50 per full day late**, capped at **10.00**. Days late = whole days between `DueOn` and the return time, rounded down. Returned on time or early → 0.
- A loan is **overdue** when it is not returned and `DueOn` is before now.
- All times are UTC `DateTime`, taken from the `TimeProvider` registered in DI (`TimeProvider.System` in production). Never call `DateTime.UtcNow` directly; tests replace the clock.

## HTTP API

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/books` | `{ "title", "author" }` | 201 + `BookResponse`, Location `/books/{id}` | 400 if title or author is blank |
| GET | `/books` | | 200 + `BookResponse[]` ordered by id | |
| POST | `/members` | `{ "name" }` | 201 + `MemberResponse`, Location `/members/{id}` | 400 if name is blank |
| GET | `/members` | | 200 + `MemberResponse[]` ordered by id | |
| POST | `/loans` | `{ "bookId", "memberId" }` | 201 + `LoanResponse`, Location `/loans/{id}` | 404 if book or member does not exist; 409 if the book is on an active loan; 409 if the member already has 3 active loans |
| POST | `/loans/{id}/return` | | 200 + `LoanResponse` with `returnedOn` and `fee` set | 404 if no such loan; 409 if already returned |
| GET | `/loans/overdue` | | 200 + `LoanResponse[]` of overdue loans ordered by `dueOn` | |

JSON uses ASP.NET Core's default camelCase.

## Storage

EF Core with SQLite. The connection string is `ConnectionStrings:Loans` read through `builder.Configuration.GetConnectionString("Loans")`, defaulting to `Data Source=loans.db` when missing. Call `Database.EnsureCreated()` at startup. No migrations.

## Code shape (exact names; tests depend on them)

```csharp
namespace Loans.Api.Data;
public class Book   { public int Id { get; set; } public string Title { get; set; } = ""; public string Author { get; set; } = ""; }
public class Member { public int Id { get; set; } public string Name { get; set; } = ""; }
public class Loan   { public int Id { get; set; } public int BookId { get; set; } public int MemberId { get; set; }
                      public DateTime BorrowedOn { get; set; } public DateTime DueOn { get; set; }
                      public DateTime? ReturnedOn { get; set; } public decimal? Fee { get; set; } }
public class LoansDbContext(DbContextOptions<LoansDbContext> options) : DbContext(options)
{ public DbSet<Book> Books => Set<Book>(); public DbSet<Member> Members => Set<Member>(); public DbSet<Loan> Loans => Set<Loan>(); }

public sealed record LoanResponse(int Id, int BookId, int MemberId, DateTime BorrowedOn, DateTime DueOn, DateTime? ReturnedOn, decimal? Fee);
public static class LoanMappings { public static LoanResponse ToResponse(this Loan loan); }

namespace Loans.Api.Books;
public sealed record CreateBookRequest(string Title, string Author);
public sealed record BookResponse(int Id, string Title, string Author);
public static class BookHandlers { public static Task<IResult> Create(CreateBookRequest req, LoansDbContext db); public static Task<IResult> List(LoansDbContext db); }

namespace Loans.Api.Members;
public sealed record CreateMemberRequest(string Name);
public sealed record MemberResponse(int Id, string Name);
public static class MemberHandlers { public static Task<IResult> Create(CreateMemberRequest req, LoansDbContext db); public static Task<IResult> List(LoansDbContext db); }

namespace Loans.Api.Loans;
public static class FeeCalculator { public const decimal PerDay = 0.50m; public const decimal Cap = 10.00m; public static decimal LateFee(DateTime dueOn, DateTime returnedOn); }
public sealed record BorrowRequest(int BookId, int MemberId);
public static class BorrowHandler  { public const int LoanDays = 14; public const int MaxActiveLoans = 3;
                                     public static Task<IResult> Borrow(BorrowRequest req, LoansDbContext db, TimeProvider time); }
public static class ReturnHandler  { public static Task<IResult> Return(int id, LoansDbContext db, TimeProvider time); }
public static class OverdueHandler { public static Task<IResult> List(LoansDbContext db, TimeProvider time); }
```

`Program.cs` registers `LoansDbContext`, keeps `TimeProvider.System`, maps the routes above to these handlers, keeps `GET /health`, and keeps `public partial class Program;`.

## Out of scope

Authentication, paging, editing or deleting books and members, migrations.
