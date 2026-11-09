from typing import Any

from app.services.ai_service import ResilientTutorService


class ConversationService:
    """Coordena uma interação pedagógica sem depender do Flask ou da interface."""

    def __init__(self, tutor_service: ResilientTutorService) -> None:
        self._tutor_service = tutor_service

    def process_message(
        self,
        user_message: str,
        target_lang: str = "en",
        mood: str = "calm",
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        message = user_message.strip()
        if not message:
            raise ValueError("A mensagem não pode estar vazia.")
        if target_lang not in {"en", "es"}:
            raise ValueError("Idioma não suportado.")
        if mood not in {"calm", "spicy"}:
            raise ValueError("Personalidade não suportada.")

        return self._tutor_service.process_turn(
            user_message=message,
            target_lang=target_lang,
            mood=mood,
            history=history or [],
        )
