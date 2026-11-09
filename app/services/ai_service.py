
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

logger = logging.getLogger(__name__)


# ============================================================
# SCHEMA DE RESPOSTA
# ============================================================

TUTOR_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "has_errors": {
            "type": "boolean"
        },
        "corrected_sentence": {
            "type": ["string", "null"]
        },
        "explanation_pt": {
            "type": ["string", "null"]
        },
        "native_tip": {
            "type": ["string", "null"]
        },
        "audio_segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "lang": {
                        "type": "string",
                        "enum": ["pt", "en", "es"]
                    },
                    "text": {
                        "type": "string"
                    }
                },
                "required": ["lang", "text"]
            }
        }
    },
    "required": [
        "has_errors",
        "corrected_sentence",
        "explanation_pt",
        "native_tip",
        "audio_segments"
    ]
}


class ResilientTutorService:

    def __init__(self) -> None:

        # ----------------------------------------------------
        # CONFIGURAÇÃO DOS PROVEDORES
        # ----------------------------------------------------

        self.provider_mode = os.getenv(
            "AI_PROVIDER", "ollama"
        ).strip().lower()

        self.gemini_model = os.getenv(
            "GEMINI_MODEL", "gemini-2.5-flash"
        ).strip()

        self.local_model = os.getenv(
            "LOCAL_LLM_MODEL", "qwen3:4b"
        ).strip()

        self.ollama_url = os.getenv(
            "OLLAMA_URL",
            "http://localhost:11434/api/generate"
        ).strip()

        # Proteção contra configuração incorreta:
        # LOCAL_LLM_MODEL deve receber "qwen3:4b",
        # e não "ollama run qwen3:4b".

        if self.local_model.startswith("ollama run "):
            self.local_model = self.local_model.split()[-1]

            logger.warning(
                "LOCAL_LLM_MODEL continha um comando de terminal. "
                "Modelo normalizado para: %s",
                self.local_model
            )

        # ----------------------------------------------------
        # CHAVES GEMINI
        # ----------------------------------------------------

        raw_keys = [
            os.getenv("GEMINI_API_KEY_1"),
            os.getenv("GEMINI_API_KEY_2"),
            os.getenv("GEMINI_API_KEY_3"),
            os.getenv("GEMINI_API_KEY_4")
        ]

        self.api_keys = [
            key.strip()
            for key in raw_keys
            if key and key.strip()
            and not key.strip().startswith("sua_chave_")
        ]

        self._key_cycle = (
            itertools.cycle(self.api_keys)
            if self.api_keys else None
        )

        # Sessão HTTP reutilizável.
        self.http = requests.Session()

        logger.info(
            "TutorService inicializado | Provedor: %s | Modelo local: %s",
            self.provider_mode,
            self.local_model
        )

    # ========================================================
    # SELEÇÃO DE CHAVE GEMINI
    # ========================================================

    def get_next_key(self) -> str:

        if not self._key_cycle:
            raise RuntimeError(
                "Nenhuma GEMINI_API_KEY válida configurada."
            )

        return next(self._key_cycle)

    # ========================================================
    # PROCESSAMENTO PRINCIPAL
    # ========================================================

    def process_turn(
        self,
        user_message: str,
        target_lang: str = "en",
        mood: str = "calm",
        history: list[dict[str, str]] | None = None
    ) -> dict:

        system_prompt = PromptService.build_system_prompt(
            target_lang=target_lang,
            mood=mood
        )

        user_prompt = PromptService.build_user_prompt(
            user_message,
            history
        )

        # ----------------------------------------------------
        # GEMINI
        # ----------------------------------------------------

        if self.provider_mode in ("auto", "gemini") and self.api_keys:

            for attempt in range(1, len(self.api_keys) + 1):

                api_key = self.get_next_key()

                try:

                    logger.info(
                        "Tentativa %s de utilização do Gemini.",
                        attempt
                    )

                    result = self._call_gemini(
                        user_prompt,
                        system_prompt,
                        api_key
                    )

                    result["provider"] = (
                        f"gemini ({self.gemini_model})"
                    )

                    return result

                except Exception as exc:

                    logger.warning(
                        "Falha na tentativa %s do Gemini: %s",
                        attempt,
                        exc
                    )

        # ----------------------------------------------------
        # OLLAMA
        # ----------------------------------------------------

        logger.info(
            "Usando Ollama Local (%s) no modo '%s'...",
            self.local_model,
            mood
        )

        result = self._call_ollama(
            user_prompt,
            system_prompt
        )

        result["provider"] = (
            f"ollama ({self.local_model})"
        )

        return result

    # ========================================================
    # GEMINI
    # ========================================================

    def _call_gemini(
        self,
        prompt: str,
        system_prompt: str,
        api_key: str
    ) -> dict:

        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model=self.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=TUTOR_JSON_SCHEMA,
                temperature=0.65
            )
        )

        if not response.text:
            raise ValueError(
                "Resposta vazia recebida do Gemini."
            )

        return self._parse_response(response.text)

    # ========================================================
    # OLLAMA
    # ========================================================

    def _call_ollama(
        self,
        prompt: str,
        system_prompt: str
    ) -> dict:

        payload = {
            "model": self.local_model,
            "system": system_prompt,
            "prompt": prompt,
            "format": TUTOR_JSON_SCHEMA,
            "stream": False,
            "think": False,
            "keep_alive": "30m",
            "options": {
                "temperature": 0.55,
                "num_ctx": 4096,
                "num_predict": 1200
            }
        }

        try:

            response = self.http.post(
                self.ollama_url,
                json=payload,
                timeout=(10, 180)
            )

            if not response.ok:

                logger.error(
                    "Ollama HTTP %s: %s",
                    response.status_code,
                    response.text
                )

                raise RuntimeError(
                    f"Ollama retornou HTTP {response.status_code}: "
                    f"{response.text}"
                )

            response_data = response.json()

            raw_json = response_data.get("response")

            if not raw_json:
                raise ValueError(
                    "O Ollama retornou uma resposta vazia."
                )

            return self._parse_response(raw_json)

        except requests.exceptions.ConnectionError as exc:

            logger.exception(
                "Não foi possível conectar ao Ollama."
            )

            raise RuntimeError(
                "Não foi possível conectar ao Ollama. "
                "Verifique se o serviço está em execução."
            ) from exc

        except requests.exceptions.Timeout as exc:

            logger.exception(
                "Tempo limite excedido na comunicação com Ollama."
            )

            raise RuntimeError(
                "O Ollama demorou mais que o tempo limite configurado."
            ) from exc

    # ========================================================
    # VALIDAÇÃO DA RESPOSTA
    # ========================================================

    @staticmethod
    def _parse_response(raw_response: str) -> dict:

        try:

            result = json.loads(raw_response)

        except json.JSONDecodeError as exc:

            logger.error(
                "Resposta JSON inválida recebida da IA: %s",
                raw_response[:1000]
            )

            raise ValueError(
                "A inteligência artificial retornou um JSON inválido."
            ) from exc

        if not isinstance(result, dict):
            raise ValueError(
                "A resposta da IA não possui o formato esperado."
            )

        required_fields = [
            "has_errors",
            "corrected_sentence",
            "explanation_pt",
            "native_tip",
            "audio_segments"
        ]

        missing_fields = [
            field
            for field in required_fields
            if field not in result
        ]

        if missing_fields:

            raise ValueError(
                "Campos ausentes na resposta da IA: "
                + ", ".join(missing_fields)
            )

        if not isinstance(result["audio_segments"], list):
            raise ValueError(
                "audio_segments precisa ser uma lista."
            )

        return result
