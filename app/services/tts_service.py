import asyncio
import os
import uuid
from pathlib import Path

import edge_tts

VOICES = {
    "pt": "pt-BR-FranciscaNeural",
    "en": "en-US-AvaMultilingualNeural",
    "es": "es-MX-DaliaNeural",
}


async def _synthesize_segment(text: str, lang: str, mood: str) -> bytes:
    voice = VOICES.get(lang, VOICES["pt"])
    if mood == "spicy":
        rate = "+13%" if lang == "pt" else "+5%"
        pitch = "+3Hz" if lang == "pt" else "+1Hz"
    else:
        rate, pitch = "+0%", "+0Hz"

    communicator = edge_tts.Communicate(
        text=text.strip(),
        voice=voice,
        rate=rate,
        pitch=pitch,
    )
    audio_data = bytearray()
    async for chunk in communicator.stream():
        if chunk.get("type") == "audio":
            audio_data.extend(chunk["data"])

    if not audio_data:
        raise RuntimeError(f"O TTS não gerou áudio para o idioma '{lang}'.")
    return bytes(audio_data)


async def generate_segmented_speech(
    segments: list[dict[str, str]],
    mood: str = "calm",
    output_dir: str = "temp_audio",
) -> str:
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    valid_segments = [
        item for item in segments
        if isinstance(item, dict) and str(item.get("text", "")).strip()
    ]
    if not valid_segments:
        raise ValueError("Não há segmentos de texto para sintetizar.")

    audio_chunks = await asyncio.gather(*[
        _synthesize_segment(
            str(item["text"]),
            item.get("lang", "pt"),
            mood,
        )
        for item in valid_segments
    ])

    filepath = os.path.join(output_dir, f"{uuid.uuid4().hex}.mp3")
    with open(filepath, "wb") as output:
        for chunk in audio_chunks:
            output.write(chunk)
    return filepath
