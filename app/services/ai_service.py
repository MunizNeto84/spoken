import itertools
import json
import logging
import os
import requests
from dotenv import load_dotenv
from google import genai
from google.genai import types
from app.services.prompt_service import PromptService

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

TUTOR_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "has_errors": {"type": "boolean"},
        "corrected_sentence": {"type": ["string", "null"]},
        "explanation_pt": {"type": ["string", "null"]},
        "native_tip": {"type": ["string", "null"]},
        "audio_segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "lang": {"type": "string", "enum": ["pt", "en", "es"]},
                    "text": {"type": "string"},
                },
                "required": ["lang", "text"],
            },
        },
    },
    "required": [
        "has_errors",
        "corrected_sentence",
        "explanation_pt",
        "native_tip",
        "audio_segments",
    ],
}


class ResilientTutorService:
    def __init__(self) -> None:
        self.provider_mode = os.getenv("AI_PROVIDER", "ollama").lower()
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.local_model = os.getenv("LOCAL_LLM_MODEL", "llama3:8b-instruct-q8_0")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")

        raw_keys = [
            os.getenv("GEMINI_API_KEY_1"),
            os.getenv("GEMINI_API_KEY_2"),
            os.getenv("GEMINI_API_KEY_3"),
            os.getenv("GEMINI_API_KEY_4"),
        ]
        self.api_keys = [
            k.strip() for k in raw_keys
            if k and k.strip() and not k.strip().startswith("sua_chave_")
        ]
        self._key_cycle = itertools.cycle(self.api_keys) if self.api_keys else None

    def get_next_key(self) -> str:
        if not self._key_cycle:
            raise RuntimeError("Nenhuma GEMINI_API_KEY válida configurada no .env")
        return next(self._key_cycle)

    def process_turn(
        self,
        user_message: str,
        target_lang: str = "en",
        mood: str = "calm",
        history: list[dict[str, str]] | None = None,
    ) -> dict:
        system_prompt = PromptService.build_system_prompt(target_lang=target_lang, mood=mood)
        user_prompt = PromptService.build_user_prompt(user_message, history)

        if self.provider_mode in ("auto", "gemini") and self.api_keys:
            for attempt in range(1, len(self.api_keys) + 1):
                api_key = self.get_next_key()
                try:
                    result = self._call_gemini(user_prompt, system_prompt, api_key)
                    result["provider"] = f"gemini ({self.gemini_model}) [key #{attempt}]"
                    return result
                except Exception as exc:
                    logger.warning("Falha na tentativa %d do Gemini: %s", attempt, exc)

        logger.info("Usando Ollama Local (%s) no modo '%s'...", self.local_model, mood)
        result = self._call_ollama(user_prompt, system_prompt)
        result["provider"] = f"ollama ({self.local_model})"
        return result

    def _call_gemini(self, prompt: str, system_prompt: str, api_key: str) -> dict:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=self.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                temperature=0.65,
            ),
        )
        if not response.text:
            raise ValueError("Resposta vazia recebida do Gemini.")
        return json.loads(response.text)

    def _call_ollama(self, prompt: str, system_prompt: str) -> dict:
        payload = {
            "model": self.local_model,
            "system": system_prompt,
            "prompt": prompt,
            "format": TUTOR_JSON_SCHEMA,
            "stream": False,
            "keep_alive": "30m",
            "options": {
                "temperature": 0.55,
                "num_ctx": 4096,
                "num_predict": 700,
            },
        }
        resp = requests.post(self.ollama_url, json=payload, timeout=180)
        resp.raise_for_status()
        raw_json = resp.json().get("response", "{}")
        return json.loads(raw_json)