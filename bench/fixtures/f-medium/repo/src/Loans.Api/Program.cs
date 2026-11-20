var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton(TimeProvider.System);

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

public partial class Program;
