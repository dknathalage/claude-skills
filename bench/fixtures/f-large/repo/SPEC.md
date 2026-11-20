# Spec: order management API

Approved. Add a small order-management modular monolith to `src/Orders.Api`: a catalog (categories and products), customers, inventory, orders with stock reservation and a status flow, pricing, invoices and reports. Tests go in `tests/Orders.Tests`.

## Rules

### Catalog
- Category `name` must not be blank (400). Category names are unique, compared exactly (409 on a duplicate).
- Product `sku` and `name` must not be blank, and `price` must be greater than 0 (400). If `categoryId` is given it must name an existing category (400 otherwise). SKUs are unique, compared exactly (409 on a duplicate).
- Blank always means `string.IsNullOrWhiteSpace`.

### Customers
- `name` must not be blank and `email` must contain `@` (400 otherwise).
- The email is stored trimmed and lower-cased (`Trim().ToLowerInvariant()`). Emails are unique after that normalisation (409 on a duplicate), so `Ada@X.com` and ` ada@x.com ` clash.

### Inventory
- Every product has a stock quantity. A product with no `StockItem` row has quantity **0**.
- Adjusting stock adds `delta` (may be negative) to the quantity. `delta == 0` is 400. A result below 0 is 409 and changes nothing. The first adjustment of a product creates its `StockItem` row.
- Low stock: every product whose quantity is **strictly less than** `threshold`. `threshold` defaults to **5** when omitted; a `threshold` below 1 is 400. Ordered by quantity ascending, then product id ascending.

### Pricing (all money is `decimal`, rounded to 2 places with `MidpointRounding.AwayFromZero`)
- Line total = `round(unitPrice * quantity)`. Example: 3 × 3.335 = 10.005 → **10.01**.
- Subtotal = sum of the line totals.
- Volume discount on the subtotal: subtotal **>= 500.00 → 10%**; subtotal **>= 100.00 → 5%**; otherwise 0. Discount = `round(subtotal * rate)`. Examples: 99.99 → 0; 100.00 → 5.00; 100.10 → 5.01; 499.99 → 25.00; 500.00 → 50.00.
- Tax rate is a constant **0.10**. Tax = `round((subtotal - discount) * 0.10)`.
- Total = subtotal - discount + tax. Example: lines totalling 120.00 → discount 6.00, tax 11.40, total 125.40.

### Orders
- Placing an order: the request needs at least one line, every `quantity` must be >= 1 and no product may appear on two lines (400 otherwise). Then the customer must exist (404) and every product must exist (404). Then every line's quantity must be <= that product's stock quantity (409 otherwise; on 409 **no** stock changes).
- On success the stock of every line's product is decremented by the line quantity (reserved), and the order is saved with status `Pending`, `CreatedOn = now`, each line's `UnitPrice` = the product's current price, `LineTotal` per the pricing rules, and the order's `Subtotal`, `Discount`, `Tax`, `Total`.
- Status flow. The only legal transitions are **Pending → Paid**, **Pending → Cancelled** and **Paid → Shipped**. Any other requested transition is 409 and changes nothing.
- Pay: `Pending → Paid`, sets `PaidOn = now` and creates the order's invoice (below). Returns the invoice.
- Ship: `Paid → Shipped`, sets `ShippedOn = now`.
- Cancel: `Pending → Cancelled`, sets `CancelledOn = now` and **releases** the stock: each line's quantity is added back to its product's stock.
- Order statuses appear in JSON as the strings `"Pending"`, `"Paid"`, `"Shipped"`, `"Cancelled"`.
- Order list filter `status` matches one of those four names case-insensitively (`"paid"` works); anything else is 400.

### Invoices
- Created when an order is paid: `Amount = order.Total`, `IssuedOn = now`, `Number = InvoiceNumber.Format(n)` where `n` = number of invoices that already exist + 1.
- Invoice number format: `INV-` followed by the sequence padded to 6 digits: 1 → `INV-000001`, 42 → `INV-000042`, 999999 → `INV-999999`. A sequence below 1 or above 999999 throws `ArgumentOutOfRangeException`.

### Reports
- Sales by day: orders with `PaidOn` set (status Paid or Shipped), grouped by the UTC calendar date of `PaidOn`, for dates from `from` to `to` **inclusive**. One row per date that has sales, ordered by date; `Orders` is the count and `Total` the sum of order totals. `from > to` is 400.
- Top products: over the lines of orders whose status is Paid or Shipped, group by product: `Quantity` = sum of line quantities, `Revenue` = sum of line totals. Ordered by quantity descending, then product id ascending, taking `limit` rows. `limit` defaults to **5** when omitted; a `limit` below 1 is 400.
- Compute report aggregates in memory after loading the rows (`ToListAsync()`), because EF Core SQLite cannot sum `decimal` columns.

### Time
- All times are UTC `DateTime`, taken from the `TimeProvider` registered in DI (`TimeProvider.System` in production): `now = time.GetUtcNow().UtcDateTime`. Never call `DateTime.UtcNow` directly; tests replace the clock. Do not use `DateTimeOffset` in entities (EF Core SQLite cannot translate its comparisons).

## HTTP API

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| POST | `/categories` | `{ "name" }` | 201 + `CategoryResponse`, Location `/categories/{id}` | 400 blank name; 409 duplicate name |
| GET | `/categories` | | 200 + `CategoryResponse[]` ordered by name | |
| POST | `/products` | `{ "sku", "name", "price", "categoryId"? }` | 201 + `ProductResponse`, Location `/products/{id}` | 400 invalid / unknown category; 409 duplicate SKU |
| GET | `/products/{id}` | | 200 + `ProductResponse` | 404 |
| GET | `/products` | `?categoryId=` optional | 200 + `ProductResponse[]` ordered by id, only that category when given | |
| POST | `/customers` | `{ "name", "email" }` | 201 + `CustomerResponse`, Location `/customers/{id}` | 400 invalid; 409 duplicate email |
| GET | `/customers/{id}` | | 200 + `CustomerResponse` | 404 |
| GET | `/customers` | | 200 + `CustomerResponse[]` ordered by id | |
| GET | `/inventory/{productId}` | | 200 + `StockResponse` | 404 unknown product |
| POST | `/inventory/{productId}/adjust` | `{ "delta" }` | 200 + `StockResponse` | 404 unknown product; 400 delta 0; 409 would go below 0 |
| GET | `/inventory/low` | `?threshold=` optional | 200 + `StockResponse[]` | 400 threshold < 1 |
| POST | `/orders` | `{ "customerId", "lines": [{ "productId", "quantity" }] }` | 201 + `OrderResponse`, Location `/orders/{id}` | 400 / 404 / 409 as in Rules |
| GET | `/orders/{id}` | | 200 + `OrderResponse` | 404 |
| GET | `/orders` | `?customerId=&status=` both optional | 200 + `OrderResponse[]` ordered by id | 400 unknown status |
| POST | `/orders/{id}/pay` | | 200 + `InvoiceResponse` | 404; 409 not Pending |
| POST | `/orders/{id}/ship` | | 200 + `OrderResponse` | 404; 409 not Paid |
| POST | `/orders/{id}/cancel` | | 200 + `OrderResponse` | 404; 409 not Pending |
| GET | `/orders/{id}/invoice` | | 200 + `InvoiceResponse` | 404 no order or no invoice |
| GET | `/invoices/{number}` | | 200 + `InvoiceResponse` | 404 |
| GET | `/reports/sales-by-day` | `?from=2026-01-01&to=2026-01-31` (both required, `DateOnly`) | 200 + `DailySales[]` | 400 from > to |
| GET | `/reports/top-products` | `?limit=` optional | 200 + `ProductSales[]` | 400 limit < 1 |

Routes with an id use the `:int` constraint (`/products/{id:int}`, `/inventory/{productId:int}`, ...). JSON uses ASP.NET Core's default camelCase; `DateOnly` serialises as `"2026-01-01"`. All `OrderResponse` values include their lines ordered by line id.

## Storage

EF Core with SQLite. The connection string is `ConnectionStrings:Orders` read through `builder.Configuration.GetConnectionString("Orders")`, defaulting to `Data Source=orders.db` when missing. Call `Database.EnsureCreated()` at startup. No migrations. Load an order's lines with `Include(o => o.Lines)` before mapping it.

## Code shape (exact names; tests depend on them)

```csharp
namespace Orders.Api.Data;
public class Category { public int Id { get; set; } public string Name { get; set; } = ""; }
public class Product  { public int Id { get; set; } public string Sku { get; set; } = ""; public string Name { get; set; } = "";
                        public decimal Price { get; set; } public int? CategoryId { get; set; } }
public class Customer { public int Id { get; set; } public string Name { get; set; } = ""; public string Email { get; set; } = ""; }
public class StockItem { public int ProductId { get; set; } public int Quantity { get; set; } }   // key = ProductId, never generated
public enum OrderStatus { Pending, Paid, Shipped, Cancelled }
public class Order    { public int Id { get; set; } public int CustomerId { get; set; } public OrderStatus Status { get; set; }
                        public DateTime CreatedOn { get; set; } public DateTime? PaidOn { get; set; } public DateTime? ShippedOn { get; set; } public DateTime? CancelledOn { get; set; }
                        public decimal Subtotal { get; set; } public decimal Discount { get; set; } public decimal Tax { get; set; } public decimal Total { get; set; }
                        public List<OrderLine> Lines { get; set; } = new(); }
public class OrderLine { public int Id { get; set; } public int OrderId { get; set; } public int ProductId { get; set; }
                         public int Quantity { get; set; } public decimal UnitPrice { get; set; } public decimal LineTotal { get; set; } }
public class Invoice  { public int Id { get; set; } public int OrderId { get; set; } public string Number { get; set; } = "";
                        public DateTime IssuedOn { get; set; } public decimal Amount { get; set; } }
public class OrdersDbContext(DbContextOptions<OrdersDbContext> options) : DbContext(options)
{
    public DbSet<Category> Categories => Set<Category>(); public DbSet<Product> Products => Set<Product>();
    public DbSet<Customer> Customers => Set<Customer>();  public DbSet<StockItem> Stock => Set<StockItem>();
    public DbSet<Order> Orders => Set<Order>();           public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    protected override void OnModelCreating(ModelBuilder b)
    { b.Entity<StockItem>().HasKey(s => s.ProductId); b.Entity<StockItem>().Property(s => s.ProductId).ValueGeneratedNever(); }
}

// Response records and mappings live next to their entity, in Orders.Api.Data:
public sealed record CategoryResponse(int Id, string Name);                                    // Category.cs
public sealed record ProductResponse(int Id, string Sku, string Name, decimal Price, int? CategoryId);   // Product.cs
public sealed record CustomerResponse(int Id, string Name, string Email);                       // Customer.cs
public sealed record StockResponse(int ProductId, int Quantity);                                // StockItem.cs
public sealed record OrderLineResponse(int Id, int ProductId, int Quantity, decimal UnitPrice, decimal LineTotal);   // Order.cs
public sealed record OrderResponse(int Id, int CustomerId, string Status, DateTime CreatedOn, DateTime? PaidOn, DateTime? ShippedOn,
                                   DateTime? CancelledOn, decimal Subtotal, decimal Discount, decimal Tax, decimal Total,
                                   List<OrderLineResponse> Lines);                              // Order.cs; Status = order.Status.ToString()
public sealed record InvoiceResponse(int Id, string Number, int OrderId, DateTime IssuedOn, decimal Amount);   // Invoice.cs
public static class Mappings                                                                    // Mappings.cs
{
    public static CategoryResponse ToResponse(this Category c); public static ProductResponse ToResponse(this Product p);
    public static CustomerResponse ToResponse(this Customer c); public static StockResponse ToResponse(this StockItem s);
    public static OrderResponse ToResponse(this Order o);        // lines ordered by Id
    public static InvoiceResponse ToResponse(this Invoice i);
}

namespace Orders.Api.Pricing;
public static class PriceCalculator { public static decimal LineTotal(decimal unitPrice, int quantity); }
public static class DiscountRule    { public const decimal SmallThreshold = 100.00m; public const decimal SmallRate = 0.05m;
                                      public const decimal LargeThreshold = 500.00m; public const decimal LargeRate = 0.10m;
                                      public static decimal Discount(decimal subtotal); }
public static class TaxCalculator   { public const decimal Rate = 0.10m; public static decimal Tax(decimal taxable); }
public sealed record Totals(decimal Subtotal, decimal Discount, decimal Tax, decimal Total);
public static class OrderTotals     { public static Totals Compute(IEnumerable<decimal> lineTotals); }

namespace Orders.Api.Invoices;
public static class InvoiceNumber   { public static string Format(int sequence); }
public static class InvoiceQueries  { public static Task<IResult> ByNumber(string number, OrdersDbContext db);
                                      public static Task<IResult> ForOrder(int id, OrdersDbContext db); }

namespace Orders.Api.Catalog;
public sealed record CreateCategoryRequest(string Name);
public static class CategoryHandlers { public static Task<IResult> Create(CreateCategoryRequest req, OrdersDbContext db); public static Task<IResult> List(OrdersDbContext db); }
public sealed record CreateProductRequest(string Sku, string Name, decimal Price, int? CategoryId);
public static class CreateProductHandler { public static Task<IResult> Create(CreateProductRequest req, OrdersDbContext db); }
public static class ProductQueries { public static Task<IResult> Get(int id, OrdersDbContext db); public static Task<IResult> List(int? categoryId, OrdersDbContext db); }

namespace Orders.Api.Customers;
public sealed record CreateCustomerRequest(string Name, string Email);
public static class CustomerHandlers { public static Task<IResult> Create(CreateCustomerRequest req, OrdersDbContext db);
                                       public static Task<IResult> Get(int id, OrdersDbContext db); public static Task<IResult> List(OrdersDbContext db); }

namespace Orders.Api.Inventory;
public sealed record AdjustStockRequest(int Delta);
public static class StockHandlers    { public static Task<IResult> Get(int productId, OrdersDbContext db);
                                       public static Task<IResult> Adjust(int productId, AdjustStockRequest req, OrdersDbContext db); }
public static class LowStockHandler  { public const int DefaultThreshold = 5; public static Task<IResult> List(int? threshold, OrdersDbContext db); }

namespace Orders.Api.Ordering;
public static class OrderStatusRules { public static bool CanTransition(OrderStatus from, OrderStatus to); }
public sealed record OrderLineRequest(int ProductId, int Quantity);
public sealed record PlaceOrderRequest(int CustomerId, List<OrderLineRequest> Lines);
public static class PlaceOrderHandler  { public static Task<IResult> Place(PlaceOrderRequest req, OrdersDbContext db, TimeProvider time); }
public static class OrderQueries       { public static Task<IResult> Get(int id, OrdersDbContext db);
                                         public static Task<IResult> List(int? customerId, string? status, OrdersDbContext db); }
public static class PayOrderHandler    { public static Task<IResult> Pay(int id, OrdersDbContext db, TimeProvider time); }
public static class ShipOrderHandler   { public static Task<IResult> Ship(int id, OrdersDbContext db, TimeProvider time); }
public static class CancelOrderHandler { public static Task<IResult> Cancel(int id, OrdersDbContext db, TimeProvider time); }

namespace Orders.Api.Reports;
public sealed record DailySales(DateOnly Date, int Orders, decimal Total);
public static class SalesReport      { public static Task<IResult> ByDay(DateOnly from, DateOnly to, OrdersDbContext db); }
public sealed record ProductSales(int ProductId, string Sku, int Quantity, decimal Revenue);
public static class TopProductsReport { public const int DefaultLimit = 5; public static Task<IResult> List(int? limit, OrdersDbContext db); }
```

Handlers return `Results.Created(location, body)`, `Results.Ok(body)`, `Results.BadRequest()`, `Results.NotFound()` or `Results.Conflict()`. List handlers return `Results.Ok(list)` where `list` is a `List<T>` of the response record.

`Program.cs` registers `OrdersDbContext`, keeps `TimeProvider.System`, maps the routes above to these handlers, keeps `GET /health`, and keeps `public partial class Program;`.

## Out of scope

Authentication, paging, editing or deleting categories, products and customers, partial shipments, refunds, migrations.
