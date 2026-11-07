import asyncio
import os
import uuid
import edge_tts

# Vozes 100% dedicadas por idioma para evitar mistura de sotaque
VOICES = {
    "pt": "pt-BR-FranciscaNeural",
    "en": "en-US-AvaMultilingualNeural",
    "es": "es-MX-DaliaNeural",  # Voz natural para Espanhol (ou es-ES-ElviraNeural)
}

async def _synthesize_segment(text: str, lang: str, mood: str) -> bytes:
    """Gera os bytes de áudio MP3 para um único segmento no idioma correto."""
    voice = VOICES.get(lang, VOICES["pt"])

    # No modo ácido/bravo ('spicy'), o português fica ligeiramente mais rápido e incisivo
    if lang == "pt":
        rate = "+10%" if mood == "spicy" else "+4%"
        pitch = "+2Hz" if mood == "spicy" else "+0Hz"
    else:
        rate = "+0%"
        pitch = "+0Hz"

    communicate = edge_tts.Communicate(text=text.strip(), voice=voice, rate=rate, pitch=pitch)
    audio_data = bytearray()

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])

    return bytes(audio_data)


async def generate_segmented_speech(
    segments: list[dict[str, str]],
    mood: str = "calm",
    output_dir: str = "temp_audio"
) -> str:
    """
    Recebe uma lista de segmentos [{'lang': 'pt'|'en'|'es', 'text': '...'}]
    e gera um único arquivo MP3 contínuo sem misturar fonéticas.
    """
    os.makedirs(output_dir, exist_ok=True)

    tasks = [
        _synthesize_segment(seg["text"], seg.get("lang", "pt"), mood)
        for seg in segments
        if seg.get("text") and seg["text"].strip()
    ]

    # Processa todos os trechos simultaneamente para não somar latência
    audio_chunks = await asyncio.gather(*tasks)

    filename = f"{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(output_dir, filename)

    with open(filepath, "wb") as f:
        for chunk in audio_chunks:
            f.write(chunk)

    return filepath