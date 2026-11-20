# Library loans API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add books, members and loans with due dates, overdue listing and late fees to Loans.Api as SPEC.md describes.

**Spec:** SPEC.md

## Global Constraints

- Names and signatures exactly as the spec's code-shape section.

---

### Task 1: Entities, LoansDbContext and test database helper

**Files:**
- Create or modify: `src/Loans.Api/Data/Book.cs`
- Create or modify: `src/Loans.Api/Data/Member.cs`
- Create or modify: `src/Loans.Api/Data/Loan.cs`
- Create or modify: `src/Loans.Api/Data/LoansDbContext.cs`
- Create or modify: `tests/Loans.Tests/TestDb.cs`
- Create or modify: `tests/Loans.Tests/DataTests.cs`

- [ ] **Step 1:** Create tests/Loans.Tests/TestDb.cs: `namespace Loans.Tests; public static class TestDb { public static LoansDbContext Create() }` — open a `Microsoft.Data.Sqlite.SqliteConnection("DataSource=:memory:")`, keep it open, build `DbContextOptionsBuilder<LoansDbContext>().UseSqlite(conn)`, call `Database.EnsureCreated()`, return the context.
- [ ] **Step 2:** Create tests/Loans.Tests/DataTests.cs with one xUnit test: add a Book, a Member and a Loan (BorrowedOn = 2026-01-01 UTC, DueOn = +14 days) via TestDb.Create(), SaveChanges, read the loan back and assert `ToResponse()` returns the same field values. Run it and watch it fail to compile.
- [ ] **Step 3:** Create Book.cs, Member.cs, Loan.cs and LoansDbContext.cs in src/Loans.Api/Data exactly as the SPEC's code shape (namespace Loans.Api.Data). Loan.cs also holds `public sealed record LoanResponse(...)` and `public static class LoanMappings { public static LoanResponse ToResponse(this Loan loan) }`.
- [ ] **Step 4:** Run the test until it passes.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~DataTests` Expected: PASS
- [ ] **Commit:** `git add src/Loans.Api/Data/Book.cs src/Loans.Api/Data/Member.cs src/Loans.Api/Data/Loan.cs src/Loans.Api/Data/LoansDbContext.cs tests/Loans.Tests/TestDb.cs tests/Loans.Tests/DataTests.cs && git commit -m "T1: Entities, LoansDbContext and test database helper"`

### Task 2: FeeCalculator

**Files:**
- Create or modify: `src/Loans.Api/Loans/FeeCalculator.cs`
- Create or modify: `tests/Loans.Tests/FeeCalculatorTests.cs`

- [ ] **Step 1:** In tests/Loans.Tests/FeeCalculatorTests.cs write xUnit tests for `FeeCalculator.LateFee(dueOn, returnedOn)` with due = 2026-01-15 00:00 UTC: returned 2026-01-10 → 0; returned exactly at due → 0; due + 23 hours → 0; due + 5 days → 2.50; due + 5 days 20 hours → 2.50; due + 45 days → 10.00.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Loans.Api/Loans/FeeCalculator.cs: `namespace Loans.Api.Loans; public static class FeeCalculator { public const decimal PerDay = 0.50m; public const decimal Cap = 10.00m; public static decimal LateFee(DateTime dueOn, DateTime returnedOn) }` — days = floor((returnedOn - dueOn).TotalDays); days <= 0 → 0; else min(days * PerDay, Cap).
- [ ] **Step 4:** Run the tests until they pass.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~FeeCalculatorTests` Expected: PASS
- [ ] **Commit:** `git add src/Loans.Api/Loans/FeeCalculator.cs tests/Loans.Tests/FeeCalculatorTests.cs && git commit -m "T2: FeeCalculator"`

### Task 3: BookHandlers

**Files:**
- Create or modify: `src/Loans.Api/Books/BookHandlers.cs`
- Create or modify: `tests/Loans.Tests/BookHandlersTests.cs`

**Depends on:** Task 1

- [ ] **Step 1:** In tests/Loans.Tests/BookHandlersTests.cs write xUnit tests calling the handlers directly with `TestDb.Create()`: Create(new("Dune","Herbert")) returns `Microsoft.AspNetCore.Http.HttpResults.Created<BookResponse>` with Location "/books/1" and the same title/author; Create with Title "  " returns `BadRequest`; Create with Author "" returns `BadRequest`; after creating "A" then "B", List returns `Ok<List<BookResponse>>` with titles ["A","B"].
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Loans.Api/Books/BookHandlers.cs in namespace Loans.Api.Books with `CreateBookRequest`, `BookResponse` and `BookHandlers.Create/List` exactly as the SPEC. Blank = string.IsNullOrWhiteSpace. Create returns `Results.Created($"/books/{id}", response)`; List returns `Results.Ok(list)` ordered by Id, where list is a `List<BookResponse>`.
- [ ] **Step 4:** Run the tests until they pass.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~BookHandlersTests` Expected: PASS
- [ ] **Commit:** `git add src/Loans.Api/Books/BookHandlers.cs tests/Loans.Tests/BookHandlersTests.cs && git commit -m "T3: BookHandlers"`

### Task 4: MemberHandlers

**Files:**
- Create or modify: `src/Loans.Api/Members/MemberHandlers.cs`
- Create or modify: `tests/Loans.Tests/MemberHandlersTests.cs`

**Depends on:** Task 1

- [ ] **Step 1:** In tests/Loans.Tests/MemberHandlersTests.cs write xUnit tests calling the handlers directly with `TestDb.Create()`: Create(new("Ada")) returns `Created<MemberResponse>` with Location "/members/1" and Name "Ada"; Create(new("")) returns `BadRequest`; after creating "Ada" then "Bo", List returns `Ok<List<MemberResponse>>` with names ["Ada","Bo"].
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Loans.Api/Members/MemberHandlers.cs in namespace Loans.Api.Members with `CreateMemberRequest`, `MemberResponse` and `MemberHandlers.Create/List` exactly as the SPEC. Blank = string.IsNullOrWhiteSpace. Create returns `Results.Created($"/members/{id}", response)`; List returns `Results.Ok(list)` ordered by Id as a `List<MemberResponse>`.
- [ ] **Step 4:** Run the tests until they pass.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~MemberHandlersTests` Expected: PASS
- [ ] **Commit:** `git add src/Loans.Api/Members/MemberHandlers.cs tests/Loans.Tests/MemberHandlersTests.cs && git commit -m "T4: MemberHandlers"`

### Task 5: BorrowHandler

**Files:**
- Create or modify: `src/Loans.Api/Loans/BorrowHandler.cs`
- Create or modify: `tests/Loans.Tests/BorrowHandlerTests.cs`

**Depends on:** Task 1

- [ ] **Step 1:** In tests/Loans.Tests/BorrowHandlerTests.cs write xUnit tests calling `BorrowHandler.Borrow` directly with `TestDb.Create()` and `new Microsoft.Extensions.Time.Testing.FakeTimeProvider(new DateTimeOffset(2026,1,1,9,0,0,TimeSpan.Zero))`, seeding Books/Members through the context: success returns `Created<LoanResponse>` with Location "/loans/{id}", BorrowedOn = 2026-01-01 09:00 UTC and DueOn 14 days later; unknown book → `NotFound`; unknown member → `NotFound`; book already on an unreturned loan → `Conflict`; member with 3 unreturned loans → `Conflict`; a loan with ReturnedOn set does not block the book or count towards the limit.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Loans.Api/Loans/BorrowHandler.cs in namespace Loans.Api.Loans with `BorrowRequest` and `BorrowHandler` (LoanDays = 14, MaxActiveLoans = 3, Borrow(req, db, time)) exactly as the SPEC. Check in this order: book and member exist (else Results.NotFound()), book not on an active loan (else Results.Conflict()), member active loans < 3 (else Results.Conflict()). Now = time.GetUtcNow().UtcDateTime. Return Results.Created($"/loans/{loan.Id}", loan.ToResponse()).
- [ ] **Step 4:** Run the tests until they pass.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~BorrowHandlerTests` Expected: PASS
- [ ] **Commit:** `git add src/Loans.Api/Loans/BorrowHandler.cs tests/Loans.Tests/BorrowHandlerTests.cs && git commit -m "T5: BorrowHandler"`

### Task 6: ReturnHandler

**Files:**
- Create or modify: `src/Loans.Api/Loans/ReturnHandler.cs`
- Create or modify: `tests/Loans.Tests/ReturnHandlerTests.cs`

**Depends on:** Task 1, Task 2

- [ ] **Step 1:** In tests/Loans.Tests/ReturnHandlerTests.cs write xUnit tests calling `ReturnHandler.Return` directly with `TestDb.Create()` and a `FakeTimeProvider`, seeding a Loan due 2026-01-15 00:00 UTC: returning at 2026-01-10 gives `Ok<LoanResponse>` with ReturnedOn = that time and Fee 0; returning at due + 5 days gives Fee 2.50 and the loan row is saved with ReturnedOn and Fee; unknown id → `NotFound`; returning an already returned loan → `Conflict`.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Loans.Api/Loans/ReturnHandler.cs in namespace Loans.Api.Loans: `public static class ReturnHandler { public static Task<IResult> Return(int id, LoansDbContext db, TimeProvider time) }`. Find the loan (missing → Results.NotFound()); already returned → Results.Conflict(); else set ReturnedOn = time.GetUtcNow().UtcDateTime, Fee = FeeCalculator.LateFee(DueOn, ReturnedOn), SaveChanges, return Results.Ok(loan.ToResponse()).
- [ ] **Step 4:** Run the tests until they pass.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~ReturnHandlerTests` Expected: PASS
- [ ] **Commit:** `git add src/Loans.Api/Loans/ReturnHandler.cs tests/Loans.Tests/ReturnHandlerTests.cs && git commit -m "T6: ReturnHandler"`

### Task 7: OverdueHandler

**Files:**
- Create or modify: `src/Loans.Api/Loans/OverdueHandler.cs`
- Create or modify: `tests/Loans.Tests/OverdueHandlerTests.cs`

**Depends on:** Task 1

- [ ] **Step 1:** In tests/Loans.Tests/OverdueHandlerTests.cs write xUnit tests calling `OverdueHandler.List` directly with `TestDb.Create()` and a `FakeTimeProvider` at 2026-02-01 UTC, seeding Loans: two unreturned loans due 2026-01-20 and 2026-01-10 are returned ordered by DueOn (the 01-10 one first) as `Ok<List<LoanResponse>>`; a returned loan due 2026-01-05 is excluded; an unreturned loan due exactly 2026-02-01 is excluded; one due 2026-02-10 is excluded.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Create src/Loans.Api/Loans/OverdueHandler.cs in namespace Loans.Api.Loans: `public static class OverdueHandler { public static Task<IResult> List(LoansDbContext db, TimeProvider time) }` — now = time.GetUtcNow().UtcDateTime; loans where ReturnedOn == null && DueOn < now, ordered by DueOn, mapped with ToResponse() into a List<LoanResponse>, returned with Results.Ok.
- [ ] **Step 4:** Run the tests until they pass.
- [ ] **Verify:** Run: `dotnet test --filter FullyQualifiedName~OverdueHandlerTests` Expected: PASS
- [ ] **Commit:** `git add src/Loans.Api/Loans/OverdueHandler.cs tests/Loans.Tests/OverdueHandlerTests.cs && git commit -m "T7: OverdueHandler"`

### Task 8: Wire Program.cs and HTTP integration test

**Files:**
- Create or modify: `src/Loans.Api/Program.cs`
- Create or modify: `tests/Loans.Tests/ApiTests.cs`

**Depends on:** Task 3, Task 4, Task 5, Task 6, Task 7

- [ ] **Step 1:** In tests/Loans.Tests/ApiTests.cs write one xUnit test using a `WebApplicationFactory<Program>` subclass that calls `builder.UseSetting("ConnectionStrings:Loans", $"Data Source={tempFile}")` (tempFile = a new path under Path.GetTempPath()) and replaces TimeProvider with a FakeTimeProvider (services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(fake)). The test: POST /books, POST /members, POST /loans → 201; advance 20 days; GET /loans/overdue has 1 item; POST /loans/{id}/return → 200 with fee 3.00. Run it and watch it fail.
- [ ] **Step 2:** Edit src/Loans.Api/Program.cs: keep `builder.Services.AddSingleton(TimeProvider.System)`; add `builder.Services.AddDbContext<LoansDbContext>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Loans") ?? "Data Source=loans.db"))`; after Build, in a scope call `Database.EnsureCreated()`; keep GET /health; map POST /books → BookHandlers.Create, GET /books → BookHandlers.List, POST /members → MemberHandlers.Create, GET /members → MemberHandlers.List, POST /loans → BorrowHandler.Borrow, POST /loans/{id:int}/return → ReturnHandler.Return, GET /loans/overdue → OverdueHandler.List; keep `public partial class Program;` at the end.
- [ ] **Step 3:** Run the whole suite until it passes.
- [ ] **Verify:** Run: `dotnet test` Expected: PASS
- [ ] **Commit:** `git add src/Loans.Api/Program.cs tests/Loans.Tests/ApiTests.cs && git commit -m "T8: Wire Program.cs and HTTP integration test"`

