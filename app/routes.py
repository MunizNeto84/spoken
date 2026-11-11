import asyncio
import logging
from pathlib import Path

from flask import Blueprint, jsonify, render_template, request, send_from_directory
from flask_login import login_required

from app.services.ai_service import ResilientTutorService
from app.services.conversation_service import ConversationService
from app.services.tts_service import generate_segmented_speech

logger = logging.getLogger(__name__)
bp = Blueprint("main", __name__)

tutor_service = ResilientTutorService()
conversation_service = ConversationService(tutor_service)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = PROJECT_ROOT / "temp_audio"


def _validate_options(target_lang: str, mood: str) -> None:
    if target_lang not in {"en", "es"}:
        raise ValueError("Idioma não suportado.")
    if mood not in {"calm", "spicy"}:
        raise ValueError("Personalidade não suportada.")


def _generate_audio(segments: list[dict], mood: str) -> tuple[str, str]:
    clean_segments = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        text = str(segment.get("text", "")).strip()
        if not text:
            continue
        lang = segment.get("lang", "pt")
        if lang not in {"pt", "en", "es"}:
            lang = "pt"
        clean_segments.append({"lang": lang, "text": text})

    if not clean_segments:
        raise ValueError("A resposta da professora não possui texto para narrar.")

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    filepath = asyncio.run(
        generate_segmented_speech(
            segments=clean_segments,
            mood=mood,
            output_dir=str(AUDIO_DIR),
        )
    )
    filename = Path(filepath).name
    spoken_text = " ".join(item["text"] for item in clean_segments)
    return spoken_text, f"/api/audio/{filename}"


@bp.get("/")
@login_required
def index():
    return render_template("index.html")


@bp.post("/api/start")
@login_required
def start_session():
    data = request.get_json(silent=True) or {}
    target_lang = data.get("target_lang", "en")
    mood = data.get("mood", "calm")

    try:
        _validate_options(target_lang, mood)
        intro_pt = (
            "Oi! Que bom ter você aqui. Vamos praticar sem pressa."
            if mood == "calm"
            else "Olá! Espero que esteja preparado. Hoje vamos levar essa prática a sério!"
        )
        intro_target = (
            "Tell me, how is your day going so far?"
            if target_lang == "en"
            else "Cuéntame, ¿cómo va tu día hasta ahora?"
        )
        spoken_text, audio_url = _generate_audio(
            [
                {"lang": "pt", "text": intro_pt},
                {"lang": target_lang, "text": intro_target},
            ],
            mood,
        )
        return jsonify({
            "spoken_text": spoken_text,
            "audio_url": audio_url,
            "reaction": "welcoming",
            "provider": "edge-tts",
        })
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        logger.exception("Erro ao iniciar sessão.")
        return jsonify({"error": "Não foi possível iniciar a sessão."}), 500


@bp.post("/api/chat")
@login_required
def chat_turn():
    data = request.get_json(silent=True) or {}
    message = str(data.get("message") or "").strip()
    history = data.get("history", [])
    target_lang = data.get("target_lang", "en")
    mood = data.get("mood", "calm")

    if not message:
        return jsonify({"error": "Mensagem vazia."}), 400
    if not isinstance(history, list):
        return jsonify({"error": "Histórico inválido."}), 400

    try:
        _validate_options(target_lang, mood)
        result = conversation_service.process_message(
            user_message=message,
            target_lang=target_lang,
            mood=mood,
            history=history,
        )
        spoken_text, audio_url = _generate_audio(result.get("audio_segments", []), mood)
        has_errors = bool(result.get("has_errors", False))

        # A reação visual é explícita: no modo Spicy, uma correção importante
        # aciona uma expressão de bronca temporária no frontend.
        reaction = "scolding" if has_errors and mood == "spicy" else (
            "correcting" if has_errors else "explaining"
        )

        return jsonify({
            "user_message": message,
            "spoken_text": spoken_text,
            "audio_url": audio_url,
            "reaction": reaction,
            "has_errors": has_errors,
            "corrected_sentence": result.get("corrected_sentence"),
            "explanation_pt": result.get("explanation_pt"),
            "native_tip": result.get("native_tip"),
            "provider": result.get("provider", "unknown"),
        })
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        logger.exception("Erro ao processar conversa.")
        return jsonify({"error": "Não foi possível processar sua mensagem."}), 500


@bp.get("/api/audio/<path:filename>")
@login_required
def serve_audio(filename: str):
    if Path(filename).name != filename:
        return jsonify({"error": "Nome de arquivo inválido."}), 400
    return send_from_directory(
        str(AUDIO_DIR),
        filename,
        mimetype="audio/mpeg",
        conditional=True,
        max_age=0,
    )
