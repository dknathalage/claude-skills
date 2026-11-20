using System.Net;
using System.Net.Http.Json;
using Orders.Api.Data;
using Orders.Api.Reports;

namespace Orders.Hidden.Tests;

public class HiddenOrdersTests
{
    // ---- catalog ----
    [Fact]
    public async Task Create_category_returns_201_with_location()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var r = await c.PostAsJsonAsync("/categories", new { name = "Tools" });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var cat = await r.Content.ReadFromJsonAsync<CategoryResponse>();
        Assert.Equal("Tools", cat!.Name);
        Assert.Equal($"/categories/{cat.Id}", r.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Category_blank_is_400_and_duplicate_is_409()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/categories", new { name = " " })).StatusCode);
        await OrdersApp.Category(c, "Tools");
        Assert.Equal(HttpStatusCode.Conflict, (await c.PostAsJsonAsync("/categories", new { name = "Tools" })).StatusCode);
    }

    [Fact]
    public async Task Categories_are_listed_by_name()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        await OrdersApp.Category(c, "Garden"); await OrdersApp.Category(c, "Books"); await OrdersApp.Category(c, "Tools");
        var list = await c.GetFromJsonAsync<CategoryResponse[]>("/categories");
        Assert.Equal(["Books", "Garden", "Tools"], list!.Select(x => x.Name));
    }

    [Fact]
    public async Task Create_product_returns_201_with_body_and_location()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cat = await OrdersApp.Category(c);
        var r = await c.PostAsJsonAsync("/products", new { sku = "HAM-1", name = "Hammer", price = 12.50m, categoryId = cat });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var p = await r.Content.ReadFromJsonAsync<ProductResponse>();
        Assert.Equal(("HAM-1", "Hammer", 12.50m, (int?)cat), (p!.Sku, p.Name, p.Price, p.CategoryId));
        Assert.Equal($"/products/{p.Id}", r.Headers.Location!.OriginalString);
        var back = await c.GetFromJsonAsync<ProductResponse>($"/products/{p.Id}");
        Assert.Equal(p, back);
    }

    [Fact]
    public async Task Product_validation_is_400()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/products", new { sku = "", name = "X", price = 1m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/products", new { sku = "A", name = "  ", price = 1m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/products", new { sku = "A", name = "X", price = 0m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/products", new { sku = "A", name = "X", price = -5m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/products", new { sku = "A", name = "X", price = 1m, categoryId = 999 })).StatusCode);
        Assert.Empty((await c.GetFromJsonAsync<ProductResponse[]>("/products"))!);
    }

    [Fact]
    public async Task Duplicate_sku_is_409()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        await OrdersApp.Product(c, "SKU-1");
        Assert.Equal(HttpStatusCode.Conflict, (await c.PostAsJsonAsync("/products", new { sku = "SKU-1", name = "Other", price = 3m })).StatusCode);
    }

    [Fact]
    public async Task Get_unknown_product_is_404()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/products/999")).StatusCode);
    }

    [Fact]
    public async Task List_products_filters_by_category_in_id_order()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var tools = await OrdersApp.Category(c, "Tools"); var garden = await OrdersApp.Category(c, "Garden");
        var a = await OrdersApp.Product(c, "A", categoryId: tools);
        await OrdersApp.Product(c, "B", categoryId: garden);
        var d = await OrdersApp.Product(c, "D", categoryId: tools);
        await OrdersApp.Product(c, "E");
        Assert.Equal([a, d], (await c.GetFromJsonAsync<ProductResponse[]>($"/products?categoryId={tools}"))!.Select(p => p.Id));
        Assert.Equal(4, (await c.GetFromJsonAsync<ProductResponse[]>("/products"))!.Length);
    }

    // ---- customers ----
    [Fact]
    public async Task Create_customer_normalises_email()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var r = await c.PostAsJsonAsync("/customers", new { name = "Ada", email = "  Ada@Example.COM " });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var cu = await r.Content.ReadFromJsonAsync<CustomerResponse>();
        Assert.Equal("ada@example.com", cu!.Email);
        Assert.Equal($"/customers/{cu.Id}", r.Headers.Location!.OriginalString);
        Assert.Equal(cu, await c.GetFromJsonAsync<CustomerResponse>($"/customers/{cu.Id}"));
    }

    [Fact]
    public async Task Customer_validation_is_400()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/customers", new { name = "", email = "a@b.c" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/customers", new { name = "Ada", email = "not-an-email" })).StatusCode);
    }

    [Fact]
    public async Task Duplicate_email_after_normalisation_is_409()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        await OrdersApp.Customer(c, "ada@example.com");
        Assert.Equal(HttpStatusCode.Conflict, (await c.PostAsJsonAsync("/customers", new { name = "Ada 2", email = " ADA@example.com" })).StatusCode);
    }

    [Fact]
    public async Task Customers_list_in_id_order_and_unknown_is_404()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var a = await OrdersApp.Customer(c, "a@x.com"); var b = await OrdersApp.Customer(c, "b@x.com");
        Assert.Equal([a, b], (await c.GetFromJsonAsync<CustomerResponse[]>("/customers"))!.Select(x => x.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/customers/999")).StatusCode);
    }

    // ---- inventory ----
    [Fact]
    public async Task Stock_starts_at_zero_and_adjusts_up_and_down()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var p = await OrdersApp.Product(c);
        Assert.Equal(0, await OrdersApp.StockOf(c, p));
        var r = await OrdersApp.Adjust(c, p, 10);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(new StockResponse(p, 10), await r.Content.ReadFromJsonAsync<StockResponse>());
        await OrdersApp.Adjust(c, p, -4);
        Assert.Equal(6, await OrdersApp.StockOf(c, p));
    }

    [Fact]
    public async Task Adjust_below_zero_is_409_and_changes_nothing()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var p = await OrdersApp.Product(c, stock: 3);
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Adjust(c, p, -4)).StatusCode);
        Assert.Equal(3, await OrdersApp.StockOf(c, p));
        Assert.Equal(HttpStatusCode.OK, (await OrdersApp.Adjust(c, p, -3)).StatusCode);
        Assert.Equal(0, await OrdersApp.StockOf(c, p));
    }

    [Fact]
    public async Task Adjust_zero_is_400_and_unknown_product_is_404()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var p = await OrdersApp.Product(c);
        Assert.Equal(HttpStatusCode.BadRequest, (await OrdersApp.Adjust(c, p, 0)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await OrdersApp.Adjust(c, 999, 5)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/inventory/999")).StatusCode);
    }

    [Fact]
    public async Task Low_stock_defaults_to_threshold_5_strictly_below()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var none = await OrdersApp.Product(c, "NONE");
        var four = await OrdersApp.Product(c, "FOUR", stock: 4);
        await OrdersApp.Product(c, "FIVE", stock: 5);
        var one = await OrdersApp.Product(c, "ONE", stock: 1);
        var list = await c.GetFromJsonAsync<StockResponse[]>("/inventory/low");
        Assert.Equal([new StockResponse(none, 0), new StockResponse(one, 1), new StockResponse(four, 4)], list!);
    }

    [Fact]
    public async Task Low_stock_custom_threshold_and_below_1_is_400()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var a = await OrdersApp.Product(c, "A", stock: 8);
        await OrdersApp.Product(c, "B", stock: 9);
        Assert.Equal([a], (await c.GetFromJsonAsync<StockResponse[]>("/inventory/low?threshold=9"))!.Select(s => s.ProductId));
        Assert.Equal(HttpStatusCode.BadRequest, (await c.GetAsync("/inventory/low?threshold=0")).StatusCode);
    }

    // ---- placing orders ----
    [Fact]
    public async Task Place_order_returns_201_prices_lines_and_reserves_stock()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 20.00m, stock: 10);
        var b = await OrdersApp.Product(c, "B", 5.00m, stock: 10);
        var r = await OrdersApp.Place(c, cu, (a, 2), (b, 3));
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var o = (await r.Content.ReadFromJsonAsync<OrderResponse>())!;
        Assert.Equal($"/orders/{o.Id}", r.Headers.Location!.OriginalString);
        Assert.Equal("Pending", o.Status);
        Assert.Equal(OrdersApp.Start.UtcDateTime, o.CreatedOn);
        Assert.Equal([(a, 2, 20.00m, 40.00m), (b, 3, 5.00m, 15.00m)], o.Lines.Select(l => (l.ProductId, l.Quantity, l.UnitPrice, l.LineTotal)));
        Assert.Equal((55.00m, 0m, 5.50m, 60.50m), (o.Subtotal, o.Discount, o.Tax, o.Total));
        Assert.Equal(8, await OrdersApp.StockOf(c, a));
        Assert.Equal(7, await OrdersApp.StockOf(c, b));
    }

    [Fact]
    public async Task Insufficient_stock_is_409_and_reserves_nothing()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        var b = await OrdersApp.Product(c, "B", stock: 2);
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Place(c, cu, (a, 5), (b, 3))).StatusCode);
        Assert.Equal(10, await OrdersApp.StockOf(c, a));
        Assert.Equal(2, await OrdersApp.StockOf(c, b));
        Assert.Empty((await c.GetFromJsonAsync<OrderResponse[]>("/orders"))!);
    }

    [Fact]
    public async Task Ordering_exactly_all_stock_succeeds_and_next_order_is_409()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 4);
        Assert.Equal(HttpStatusCode.Created, (await OrdersApp.Place(c, cu, (a, 4))).StatusCode);
        Assert.Equal(0, await OrdersApp.StockOf(c, a));
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Place(c, cu, (a, 1))).StatusCode);
    }

    [Fact]
    public async Task Product_without_stock_row_cannot_be_ordered()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A");
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Place(c, cu, (a, 1))).StatusCode);
    }

    [Fact]
    public async Task Place_order_validation_is_400()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        Assert.Equal(HttpStatusCode.BadRequest, (await OrdersApp.Place(c, cu)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await OrdersApp.Place(c, cu, (a, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await OrdersApp.Place(c, cu, (a, -1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await OrdersApp.Place(c, cu, (a, 1), (a, 2))).StatusCode);
        Assert.Equal(10, await OrdersApp.StockOf(c, a));
    }

    [Fact]
    public async Task Unknown_customer_or_product_is_404()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        Assert.Equal(HttpStatusCode.NotFound, (await OrdersApp.Place(c, 999, (a, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await OrdersApp.Place(c, cu, (a, 1), (999, 1))).StatusCode);
        Assert.Equal(10, await OrdersApp.StockOf(c, a));
    }

    [Fact]
    public async Task Get_order_includes_lines_and_unknown_is_404()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 2));
        var back = await OrdersApp.Order(c, o.Id);
        Assert.Equal(o.Total, back.Total);
        Assert.Equal([(a, 2)], back.Lines.Select(l => (l.ProductId, l.Quantity)));
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/orders/999")).StatusCode);
    }

    [Fact]
    public async Task List_orders_filters_by_customer_and_status()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var ada = await OrdersApp.Customer(c, "ada@x.com"); var bo = await OrdersApp.Customer(c, "bo@x.com");
        var a = await OrdersApp.Product(c, "A", stock: 10);
        var o1 = await OrdersApp.PlaceOk(c, ada, (a, 1));
        var o2 = await OrdersApp.PlaceOk(c, bo, (a, 1));
        var o3 = await OrdersApp.PlaceOk(c, ada, (a, 1));
        await OrdersApp.Pay(c, o3.Id);
        Assert.Equal([o1.Id, o2.Id, o3.Id], (await c.GetFromJsonAsync<OrderResponse[]>("/orders"))!.Select(o => o.Id));
        Assert.Equal([o1.Id, o3.Id], (await c.GetFromJsonAsync<OrderResponse[]>($"/orders?customerId={ada}"))!.Select(o => o.Id));
        Assert.Equal([o3.Id], (await c.GetFromJsonAsync<OrderResponse[]>($"/orders?customerId={ada}&status=paid"))!.Select(o => o.Id));
        Assert.Equal([o1.Id, o2.Id], (await c.GetFromJsonAsync<OrderResponse[]>("/orders?status=Pending"))!.Select(o => o.Id));
        Assert.Equal(HttpStatusCode.BadRequest, (await c.GetAsync("/orders?status=bogus")).StatusCode);
    }

    // ---- status flow & invoices ----
    [Fact]
    public async Task Pay_creates_first_invoice_and_marks_paid()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 60.00m, stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 2));
        app.Clock.Advance(TimeSpan.FromHours(2));
        var r = await OrdersApp.Pay(c, o.Id);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var inv = (await r.Content.ReadFromJsonAsync<InvoiceResponse>())!;
        Assert.Equal(("INV-000001", o.Id, 125.40m), (inv.Number, inv.OrderId, inv.Amount));
        Assert.Equal(OrdersApp.Start.UtcDateTime.AddHours(2), inv.IssuedOn);
        var back = await OrdersApp.Order(c, o.Id);
        Assert.Equal("Paid", back.Status);
        Assert.Equal(OrdersApp.Start.UtcDateTime.AddHours(2), back.PaidOn);
    }

    [Fact]
    public async Task Invoice_numbers_increment()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        var o1 = await OrdersApp.PlaceOk(c, cu, (a, 1));
        var o2 = await OrdersApp.PlaceOk(c, cu, (a, 1));
        await OrdersApp.Pay(c, o2.Id);
        var second = (await (await OrdersApp.Pay(c, o1.Id)).Content.ReadFromJsonAsync<InvoiceResponse>())!;
        Assert.Equal("INV-000002", second.Number);
        Assert.Equal(o1.Id, second.OrderId);
    }

    [Fact]
    public async Task Invoice_lookup_by_number_and_by_order()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 1));
        var unpaid = await OrdersApp.PlaceOk(c, cu, (a, 1));
        var inv = (await (await OrdersApp.Pay(c, o.Id)).Content.ReadFromJsonAsync<InvoiceResponse>())!;
        Assert.Equal(inv, await c.GetFromJsonAsync<InvoiceResponse>("/invoices/INV-000001"));
        Assert.Equal(inv, await c.GetFromJsonAsync<InvoiceResponse>($"/orders/{o.Id}/invoice"));
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/invoices/INV-000099")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync($"/orders/{unpaid.Id}/invoice")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/orders/999/invoice")).StatusCode);
    }

    [Fact]
    public async Task Pay_twice_is_409_and_creates_one_invoice()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        var o1 = await OrdersApp.PlaceOk(c, cu, (a, 1));
        var o2 = await OrdersApp.PlaceOk(c, cu, (a, 1));
        await OrdersApp.Pay(c, o1.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Pay(c, o1.Id)).StatusCode);
        var next = (await (await OrdersApp.Pay(c, o2.Id)).Content.ReadFromJsonAsync<InvoiceResponse>())!;
        Assert.Equal("INV-000002", next.Number);
    }

    [Fact]
    public async Task Ship_requires_paid()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 1));
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Ship(c, o.Id)).StatusCode);
        Assert.Equal("Pending", (await OrdersApp.Order(c, o.Id)).Status);
        await OrdersApp.Pay(c, o.Id);
        app.Clock.Advance(TimeSpan.FromDays(1));
        var r = await OrdersApp.Ship(c, o.Id);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var shipped = (await r.Content.ReadFromJsonAsync<OrderResponse>())!;
        Assert.Equal("Shipped", shipped.Status);
        Assert.Equal(OrdersApp.Start.UtcDateTime.AddDays(1), shipped.ShippedOn);
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Ship(c, o.Id)).StatusCode);
    }

    [Fact]
    public async Task Cancel_pending_releases_stock()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 5);
        var b = await OrdersApp.Product(c, "B", stock: 5);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 5), (b, 2));
        Assert.Equal(0, await OrdersApp.StockOf(c, a));
        app.Clock.Advance(TimeSpan.FromMinutes(30));
        var r = await OrdersApp.Cancel(c, o.Id);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var cancelled = (await r.Content.ReadFromJsonAsync<OrderResponse>())!;
        Assert.Equal("Cancelled", cancelled.Status);
        Assert.Equal(OrdersApp.Start.UtcDateTime.AddMinutes(30), cancelled.CancelledOn);
        Assert.Equal(5, await OrdersApp.StockOf(c, a));
        Assert.Equal(5, await OrdersApp.StockOf(c, b));
    }

    [Fact]
    public async Task Illegal_transitions_are_409_and_do_not_release_stock()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", stock: 10);
        var paid = await OrdersApp.PlaceOk(c, cu, (a, 3));
        await OrdersApp.Pay(c, paid.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Cancel(c, paid.Id)).StatusCode);
        Assert.Equal(7, await OrdersApp.StockOf(c, a));

        var cancelled = await OrdersApp.PlaceOk(c, cu, (a, 2));
        await OrdersApp.Cancel(c, cancelled.Id);
        Assert.Equal(7, await OrdersApp.StockOf(c, a));
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Cancel(c, cancelled.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Pay(c, cancelled.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await OrdersApp.Ship(c, cancelled.Id)).StatusCode);
        Assert.Equal(7, await OrdersApp.StockOf(c, a));
        Assert.Equal("Cancelled", (await OrdersApp.Order(c, cancelled.Id)).Status);
    }

    [Fact]
    public async Task Transitions_on_unknown_order_are_404()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await OrdersApp.Pay(c, 999)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await OrdersApp.Ship(c, 999)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await OrdersApp.Cancel(c, 999)).StatusCode);
    }

    // ---- pricing ----
    [Fact]
    public async Task Subtotal_just_below_100_has_no_discount()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 99.99m, stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 1));
        Assert.Equal((99.99m, 0m, 10.00m, 109.99m), (o.Subtotal, o.Discount, o.Tax, o.Total));
    }

    [Fact]
    public async Task Subtotal_of_exactly_100_gets_5_percent()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 25.00m, stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 4));
        Assert.Equal((100.00m, 5.00m, 9.50m, 104.50m), (o.Subtotal, o.Discount, o.Tax, o.Total));
    }

    [Fact]
    public async Task Discount_rounds_half_away_from_zero()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 100.10m, stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 1));
        // 100.10 * 0.05 = 5.005 -> 5.01; taxable 95.09 -> tax 9.509 -> 9.51
        Assert.Equal((100.10m, 5.01m, 9.51m, 104.60m), (o.Subtotal, o.Discount, o.Tax, o.Total));
    }

    [Fact]
    public async Task Ten_percent_starts_at_exactly_500()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 499.99m, stock: 10);
        var b = await OrdersApp.Product(c, "B", 250.00m, stock: 10);
        var below = await OrdersApp.PlaceOk(c, cu, (a, 1));
        Assert.Equal((499.99m, 25.00m, 47.50m, 522.49m), (below.Subtotal, below.Discount, below.Tax, below.Total));
        var at = await OrdersApp.PlaceOk(c, cu, (b, 2));
        Assert.Equal((500.00m, 50.00m, 45.00m, 495.00m), (at.Subtotal, at.Discount, at.Tax, at.Total));
    }

    [Fact]
    public async Task Line_total_rounds_half_away_from_zero()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 3.335m, stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 3));
        Assert.Equal(10.01m, o.Lines.Single().LineTotal);
        // 10.01 subtotal, no discount, tax 1.001 -> 1.00
        Assert.Equal((10.01m, 0m, 1.00m, 11.01m), (o.Subtotal, o.Discount, o.Tax, o.Total));
    }

    [Fact]
    public async Task Line_carries_unit_price_and_order_totals()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 7.25m, stock: 10);
        var o = await OrdersApp.PlaceOk(c, cu, (a, 2));
        Assert.Equal((7.25m, 14.50m), (o.Lines[0].UnitPrice, o.Lines[0].LineTotal));
        Assert.Equal((14.50m, 0m, 1.45m, 15.95m), (o.Subtotal, o.Discount, o.Tax, o.Total));
    }

    // ---- reports ----
    [Fact]
    public async Task Sales_by_day_groups_paid_orders_by_paid_date_inclusive()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 10.00m, stock: 100);
        var o1 = await OrdersApp.PlaceOk(c, cu, (a, 1));   // 11.00
        var o2 = await OrdersApp.PlaceOk(c, cu, (a, 2));   // 22.00
        var o3 = await OrdersApp.PlaceOk(c, cu, (a, 3));   // 33.00
        var o4 = await OrdersApp.PlaceOk(c, cu, (a, 4));   // 44.00
        await OrdersApp.PlaceOk(c, cu, (a, 5));           // stays pending
        await OrdersApp.Pay(c, o1.Id);                      // 2026-01-01 09:00
        app.Clock.Advance(TimeSpan.FromHours(14));          // 2026-01-01 23:00
        await OrdersApp.Pay(c, o2.Id);
        await OrdersApp.Ship(c, o2.Id);
        app.Clock.Advance(TimeSpan.FromHours(2));           // 2026-01-02 01:00
        await OrdersApp.Pay(c, o3.Id);
        app.Clock.Advance(TimeSpan.FromDays(2));            // 2026-01-04 01:00
        await OrdersApp.Pay(c, o4.Id);

        var all = await c.GetFromJsonAsync<DailySales[]>("/reports/sales-by-day?from=2026-01-01&to=2026-01-04");
        Assert.Equal(
            [new DailySales(new DateOnly(2026, 1, 1), 2, 33.00m), new DailySales(new DateOnly(2026, 1, 2), 1, 33.00m), new DailySales(new DateOnly(2026, 1, 4), 1, 44.00m)],
            all!);
        var mid = await c.GetFromJsonAsync<DailySales[]>("/reports/sales-by-day?from=2026-01-02&to=2026-01-03");
        Assert.Equal([new DateOnly(2026, 1, 2)], mid!.Select(d => d.Date));
    }

    [Fact]
    public async Task Sales_by_day_with_from_after_to_is_400()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await c.GetAsync("/reports/sales-by-day?from=2026-01-05&to=2026-01-04")).StatusCode);
        Assert.Empty((await c.GetFromJsonAsync<DailySales[]>("/reports/sales-by-day?from=2026-01-04&to=2026-01-04"))!);
    }

    [Fact]
    public async Task Top_products_rank_paid_and_shipped_lines()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 1.00m, stock: 100);
        var b = await OrdersApp.Product(c, "B", 2.00m, stock: 100);
        var d = await OrdersApp.Product(c, "D", 3.00m, stock: 100);
        var o1 = await OrdersApp.PlaceOk(c, cu, (a, 2), (b, 5));
        var o2 = await OrdersApp.PlaceOk(c, cu, (a, 3), (d, 5));
        var o3 = await OrdersApp.PlaceOk(c, cu, (d, 50));   // cancelled: ignored
        await OrdersApp.PlaceOk(c, cu, (b, 40));            // pending: ignored
        await OrdersApp.Pay(c, o1.Id);
        await OrdersApp.Pay(c, o2.Id); await OrdersApp.Ship(c, o2.Id);
        await OrdersApp.Cancel(c, o3.Id);

        var top = await c.GetFromJsonAsync<ProductSales[]>("/reports/top-products");
        // a: 5 units, 5.00; b: 5 units, 10.00; d: 5 units, 15.00 -> tie on quantity, product id ascending
        Assert.Equal([new ProductSales(a, "A", 5, 5.00m), new ProductSales(b, "B", 5, 10.00m), new ProductSales(d, "D", 5, 15.00m)], top!);
        var one = await c.GetFromJsonAsync<ProductSales[]>("/reports/top-products?limit=1");
        Assert.Equal([a], one!.Select(p => p.ProductId));
    }

    [Fact]
    public async Task Top_products_orders_by_quantity_and_limit_below_1_is_400()
    {
        using var app = new OrdersApp(); var c = app.CreateClient();
        var cu = await OrdersApp.Customer(c);
        var a = await OrdersApp.Product(c, "A", 1.00m, stock: 100);
        var b = await OrdersApp.Product(c, "B", 1.00m, stock: 100);
        await OrdersApp.Pay(c, (await OrdersApp.PlaceOk(c, cu, (a, 1), (b, 9))).Id);
        Assert.Equal([b, a], (await c.GetFromJsonAsync<ProductSales[]>("/reports/top-products"))!.Select(p => p.ProductId));
        Assert.Equal(HttpStatusCode.BadRequest, (await c.GetAsync("/reports/top-products?limit=0")).StatusCode);
    }

    [Fact]
    public async Task Health_still_works()
    {
        using var app = new OrdersApp();
        Assert.Equal(HttpStatusCode.OK, (await app.CreateClient().GetAsync("/health")).StatusCode);
    }
}
