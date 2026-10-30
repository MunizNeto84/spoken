using Microsoft.Extensions.DependencyInjection;
using Spoken.Infrastructure.Configuration;

namespace Spoken.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        var geminiKeys = new[]
        {
            Environment.GetEnvironmentVariable("GEMINI_API_KEY_1"),
            Environment.GetEnvironmentVariable("GEMINI_API_KEY_2"),
            Environment.GetEnvironmentVariable("GEMINI_API_KEY_3"),
            Environment.GetEnvironmentVariable("GEMINI_API_KEY_4")
        }
        .Where(key => !string.IsNullOrWhiteSpace(key) && !key.StartsWith("sua_chave_"))
        .Select(key => key!)
        .ToList();

        var settings = new AiProviderSettings
        {
            GeminiModel = Environment.GetEnvironmentVariable("GEMINI_MODEL") ?? "gemini-3.8-flash",
            GeminiApiKeys = geminiKeys,
            LocalLlmModel = Environment.GetEnvironmentVariable("LOCAL_LLM_MODEL") ?? "llama3:8b-instruct-q8_0",
            OllamaUrl = Environment.GetEnvironmentVariable("OLLAMA_URL") ?? "http://localhost:11434/api/generate"
        };

        services.AddSingleton(settings);
        services.AddHttpClient();

        return services;
    }
}