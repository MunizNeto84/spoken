from app.prompts.calm_prompt import get_calm_prompt
from app.prompts.spicy_prompt import get_spicy_prompt


class PromptService:
    LANGUAGE_NAMES = {
        "en": "Inglês",
        "es": "Espanhol",
    }

    @classmethod
    def build_system_prompt(cls, target_lang: str = "en", mood: str = "calm") -> str:
        lang_name = cls.LANGUAGE_NAMES.get(target_lang, "Inglês")

        if mood == "spicy":
            base_prompt = get_spicy_prompt(target_lang, lang_name)
        else:
            base_prompt = get_calm_prompt(target_lang, lang_name)

        common_rules = f"""
REGRAS FINAIS DE FORMATO:
- Se o aluno NÃO cometer nenhum erro gramatical e a frase soar 100% natural (`"has_errors": false`), elogie rapidamente (no seu estilo de humor) e siga a conversa em '{target_lang}'.
- Se o aluno misturar uma palavra em português porque esqueceu como fala em {lang_name}, ensine a palavra certa em `audio_segments` (separando os blocos `"pt"` e `"{target_lang}"`) e preencha `corrected_sentence` com a frase completa que ele tentou dizer.
- O último segmento de `audio_segments` DEVE ser obrigatoriamente no idioma '{target_lang}' e terminar com uma pergunta aberta sobre o assunto."""

        return f"{base_prompt}\n{common_rules}"

    @staticmethod
    def build_user_prompt(
        user_message: str,
        history: list[dict[str, str]] | None = None
    ) -> str:
        if not history:
            return f"Analise a fala do aluno, dê uma explicação detalhada se houver erro e continue a conversa:\nFala atual do aluno: \"{user_message}\""

        recent = history[-6:]
        lines = [f"{msg['role']}: {msg['text']}" for msg in recent]
        context_block = "\n".join(lines)
        return (
            f"Histórico recente da conversa:\n{context_block}\n\n"
            f"Analise a fala atual do aluno, dê uma explicação detalhada se houver erro e continue a conversa:\n"
            f"Fala atual do aluno: \"{user_message}\""
        )