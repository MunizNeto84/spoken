
import asyncio
import logging
import os

from flask import (
    Blueprint,
    jsonify,
    render_template,
    request,
    send_from_directory,
)

from app.services.ai_service import ResilientTutorService
from app.services.conversation_service import ConversationService
from app.services.tts_service import generate_segmented_speech


logger = logging.getLogger(__name__)

bp = Blueprint("main", __name__)

# Dependências da aplicação
tutor_service = ResilientTutorService()
conversation_service = ConversationService(tutor_service)


# Diretórios de mídia
BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..")
)

TEMP_AUDIO_DIR = os.path.join(BASE_DIR, "temp_audio")
TEMP_VIDEO_DIR = os.path.join(BASE_DIR, "temp_video")


def generate_response_media(segments: list[dict], mood: str):
    """
    Gera áudio e, temporariamente, o vídeo do LivePortrait.

    Esta implementação será substituída gradualmente
    pelo sistema de áudio e avatar 3D.
    """

    audio_filepath = asyncio.run(
        generate_segmented_speech(
            segments=segments,
            mood=mood,
            output_dir=TEMP_AUDIO_DIR,
        )
    )

    video_url = None

    try:
        video_filepath = asyncio.run(
            animator.generate_video(audio_filepath, mood)
        )

        video_url = f"/api/video/{os.path.basename(video_filepath)}"

    except Exception:
        logger.exception("Erro ao gerar vídeo do personagem.")

    return audio_filepath, video_url


@bp.route("/")
def index():
    return render_template("index.html")


@bp.route("/api/start", methods=["POST"])
def start_session():
    data = request.get_json(silent=True) or {}

    target_lang = data.get("target_lang", "en")
    mood = data.get("mood", "calm")

    segments = [
        {
            "lang": "pt",
            "text": (
                "Oi! Vamos destravar esse inglês com calma?"
                if mood == "calm"
                else "Zero paciência para erros hoje!"
            ),
        },
        {
            "lang": "en",
            "text": "Tell me, how is your day going so far?",
        },
    ]

    try:
        _, video_url = generate_response_media(segments, mood)

        spoken_text = " ".join(
            segment["text"] for segment in segments
        )

        return jsonify({
            "spoken_text": spoken_text,
            "video_url": video_url,
        })

    except Exception:
        logger.exception("Erro ao iniciar sessão.")

        return jsonify({
            "error": "Não foi possível iniciar a sessão."
        }), 500


@bp.route("/api/chat", methods=["POST"])
def chat_turn():
    data = request.get_json(silent=True) or {}

    user_message = (data.get("message") or "").strip()
    target_lang = data.get("target_lang", "en")
    mood = data.get("mood", "calm")
    history = data.get("history", [])

    if not user_message:
        return jsonify({"error": "Mensagem vazia."}), 400

    if not isinstance(history, list):
        return jsonify({"error": "Histórico inválido."}), 400

    try:
        ai_response = conversation_service.process_message(
            user_message=user_message,
            target_lang=target_lang,
            mood=mood,
            history=history,
        )

        segments = ai_response.get("audio_segments", [])

        _, video_url = generate_response_media(segments, mood)

        spoken_text = " ".join(
            segment["text"] for segment in segments
        )

        return jsonify({
            "user_message": user_message,
            "has_errors": ai_response.get("has_errors", False),
            "corrected_sentence": ai_response.get("corrected_sentence"),
            "explanation_pt": ai_response.get("explanation_pt"),
            "native_tip": ai_response.get("native_tip"),
            "spoken_text": spoken_text,
            "video_url": video_url,
            "provider": ai_response.get("provider"),
        })

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except Exception:
        logger.exception("Erro ao processar conversa.")

        return jsonify({
            "error": "Não foi possível processar sua mensagem."
        }), 500


@bp.route("/api/video/<path:filename>")
def serve_video(filename: str):
    return send_from_directory(
        TEMP_VIDEO_DIR,
        filename,
        mimetype="video/mp4",
    )
