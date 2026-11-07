import asyncio
import os
from flask import Blueprint, jsonify, render_template, request, send_from_directory
from app.services.ai_service import ResilientTutorService
from app.services.tts_service import generate_segmented_speech

bp = Blueprint("main", __name__)
tutor_service = ResilientTutorService()

TEMP_AUDIO_DIR = os.path.abspath("temp_audio")


@bp.route("/")
def index():
    return render_template("index.html")


@bp.route("/api/start", methods=["POST"])
def start_session():
    """Gera a primeira fala de abertura da professora."""
    data = request.get_json(silent=True) or {}
    target_lang = data.get("target_lang", "en")
    mood = data.get("mood", "calm")

    if target_lang == "es":
        if mood == "spicy":
            segments = [
                {"lang": "pt", "text": "Bora lá! Espero que você esteja com o espanhol afiado hoje, porque eu não vou perdoar erro bobo!"},
                {"lang": "es", "text": "¡Hola! Cuéntame, ¿qué estuviste haciendo hoy?"},
            ]
        else:
            segments = [
                {"lang": "pt", "text": "Oi! Tudo pronto para praticar um pouco de espanhol no seu ritmo?"},
                {"lang": "es", "text": "¡Hola! Cuéntame, ¿cómo va tu día hoy?"},
            ]
    else:
        if mood == "spicy":
            segments = [
                {"lang": "pt", "text": "Olha quem resolveu aparecer para treinar! Já aviso que hoje eu estou zero paciência para inglês traduzido ao pé da letra, viu?"},
                {"lang": "en", "text": "So let's get started! Tell me, what have you been up to today?"},
            ]
        else:
            segments = [
                {"lang": "pt", "text": "Oi! Que bom te ver por aqui. Vamos destravar esse inglês com calma?"},
                {"lang": "en", "text": "Tell me, how is your day going so far?"},
            ]

    filepath = asyncio.run(
        generate_segmented_speech(segments=segments, mood=mood, output_dir=TEMP_AUDIO_DIR)
    )
    filename = os.path.basename(filepath)
    spoken_text = " ".join(seg["text"] for seg in segments)

    return jsonify({
        "spoken_text": spoken_text,
        "audio_segments": segments,
        "audio_url": f"/api/audio/{filename}",
    })


@bp.route("/api/chat", methods=["POST"])
def chat_turn():
    """Processa a fala do usuário, gera correções + resposta e sintetiza o MP3."""
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    target_lang = data.get("target_lang", "en")
    mood = data.get("mood", "calm")
    history = data.get("history", [])

    if not user_message:
        return jsonify({"error": "A mensagem não pode estar vazia."}), 400

    # 1. Processa na IA (Gemini ou Ollama Local)
    ai_response = tutor_service.process_turn(
        user_message=user_message,
        target_lang=target_lang,
        mood=mood,
        history=history,
    )

    # 2. Gera o MP3 segmentado
    segments = ai_response.get("audio_segments", [])
    filepath = asyncio.run(
        generate_segmented_speech(segments=segments, mood=mood, output_dir=TEMP_AUDIO_DIR)
    )
    filename = os.path.basename(filepath)

    spoken_text = " ".join(seg["text"] for seg in segments)

    return jsonify({
        "user_message": user_message,
        "has_errors": ai_response.get("has_errors", False),
        "corrected_sentence": ai_response.get("corrected_sentence"),
        "explanation_pt": ai_response.get("explanation_pt"),
        "native_tip": ai_response.get("native_tip"),
        "spoken_text": spoken_text,
        "audio_segments": segments,
        "audio_url": f"/api/audio/{filename}",
        "provider": ai_response.get("provider"),
    })


@bp.route("/api/audio/<path:filename>")
def serve_audio(filename: str):
    """Serve o arquivo MP3 gerado para o navegador."""
    return send_from_directory(TEMP_AUDIO_DIR, filename, mimetype="audio/mpeg")