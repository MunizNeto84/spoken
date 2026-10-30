namespace Spoken.Infrastructure.Configuration;

public sealed class AiProviderSettings
{
    private int _currentKeyIndex = -1;

    public string GeminiModel { get; init; } = "gemini-3.8-flash";
    public IReadOnlyList<string> GeminiApiKeys { get; init; } = [];

    public string LocalLlmModel { get; init; } = "llama3:8b-instruct-q8_0";
    public string OllamaUrl { get; init; } = "http://localhost:11434/api/generate";

    public bool HasGeminiKeys => GeminiApiKeys.Count > 0;

    public string GetNextGeminiKey()
    {
        if (!HasGeminiKeys)
            throw new InvalidOperationException("Nenhuma chave GEMINI_API_KEY foi configurada no arquivo .env.");

        int nextIndex = Interlocked.Increment(ref _currentKeyIndex);
        // Garante índice positivo mesmo após overflow de inteiro
        int safeIndex = (nextIndex & int.MaxValue) % GeminiApiKeys.Count;

        return GeminiApiKeys[safeIndex];
    }
}