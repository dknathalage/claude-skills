using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Orders.Api.Data;

namespace Orders.Hidden.Tests;

public sealed class OrdersApp : WebApplicationFactory<Program>
{
    public static readonly DateTimeOffset Start = new(2026, 1, 1, 9, 0, 0, TimeSpan.Zero);
    public FakeTimeProvider Clock { get; } = new(Start);
    private readonly string _db = Path.Combine(Path.GetTempPath(), $"orders-hidden-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Orders", $"Data Source={_db}");
        builder.ConfigureServices(s =>
        {
            s.RemoveAll<TimeProvider>();
            s.AddSingleton<TimeProvider>(Clock);
        });
    }

    public static async Task<int> Category(HttpClient c, string name = "Tools")
        => (await (await c.PostAsJsonAsync("/categories", new { name })).Content.ReadFromJsonAsync<CategoryResponse>())!.Id;

    public static async Task<int> Product(HttpClient c, string sku = "SKU-1", decimal price = 10.00m, int? categoryId = null, int stock = 0)
    {
        var p = (await (await c.PostAsJsonAsync("/products", new { sku, name = $"Product {sku}", price, categoryId })).Content.ReadFromJsonAsync<ProductResponse>())!;
        if (stock != 0) await Adjust(c, p.Id, stock);
        return p.Id;
    }

    public static async Task<int> Customer(HttpClient c, string email = "ada@example.com")
        => (await (await c.PostAsJsonAsync("/customers", new { name = "Ada", email })).Content.ReadFromJsonAsync<CustomerResponse>())!.Id;

    public static Task<HttpResponseMessage> Adjust(HttpClient c, int productId, int delta)
        => c.PostAsJsonAsync($"/inventory/{productId}/adjust", new { delta });

    public static async Task<int> StockOf(HttpClient c, int productId)
        => (await c.GetFromJsonAsync<StockResponse>($"/inventory/{productId}"))!.Quantity;

    public static Task<HttpResponseMessage> Place(HttpClient c, int customerId, params (int productId, int quantity)[] lines)
        => c.PostAsJsonAsync("/orders", new { customerId, lines = lines.Select(l => new { l.productId, l.quantity }).ToArray() });

    public static async Task<OrderResponse> PlaceOk(HttpClient c, int customerId, params (int productId, int quantity)[] lines)
    {
        var r = await Place(c, customerId, lines);
        if (r.StatusCode != System.Net.HttpStatusCode.Created) throw new InvalidOperationException($"place order returned {r.StatusCode}");
        return (await r.Content.ReadFromJsonAsync<OrderResponse>())!;
    }

    public static Task<HttpResponseMessage> Pay(HttpClient c, int orderId) => c.PostAsync($"/orders/{orderId}/pay", null);
    public static Task<HttpResponseMessage> Ship(HttpClient c, int orderId) => c.PostAsync($"/orders/{orderId}/ship", null);
    public static Task<HttpResponseMessage> Cancel(HttpClient c, int orderId) => c.PostAsync($"/orders/{orderId}/cancel", null);

    public static async Task<OrderResponse> Order(HttpClient c, int orderId)
        => (await c.GetFromJsonAsync<OrderResponse>($"/orders/{orderId}"))!;
}
