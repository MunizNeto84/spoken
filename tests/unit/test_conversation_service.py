
from unittest.mock import Mock

import pytest

from app.services.conversation_service import ConversationService


@pytest.fixture
def tutor_service():
    return Mock()


@pytest.fixture
def conversation_service(tutor_service):
    return ConversationService(tutor_service)


def test_process_message_calls_tutor_service(
    conversation_service,
    tutor_service,
):
    expected_response = {
        "has_errors": False,
        "corrected_sentence": None,
        "explanation_pt": None,
        "native_tip": None,
        "audio_segments": [
            {
                "lang": "en",
                "text": "How are you?",
            }
        ],
    }

    tutor_service.process_turn.return_value = expected_response

    result = conversation_service.process_message(
        user_message=" Hello ",
        target_lang="en",
        mood="calm",
        history=[],
    )

    assert result == expected_response

    tutor_service.process_turn.assert_called_once_with(
        user_message="Hello",
        target_lang="en",
        mood="calm",
        history=[],
    )


def test_process_message_rejects_empty_message(
    conversation_service,
    tutor_service,
):
    with pytest.raises(ValueError, match="mensagem"):
        conversation_service.process_message("   ")

    tutor_service.process_turn.assert_not_called()


def test_process_message_rejects_invalid_language(
    conversation_service,
    tutor_service,
):
    with pytest.raises(ValueError, match="Idioma"):
        conversation_service.process_message(
            user_message="Hello",
            target_lang="fr",
        )

    tutor_service.process_turn.assert_not_called()


def test_process_message_rejects_invalid_mood(
    conversation_service,
    tutor_service,
):
    with pytest.raises(ValueError, match="Personalidade"):
        conversation_service.process_message(
            user_message="Hello",
            mood="angry",
        )

    tutor_service.process_turn.assert_not_called()


def test_process_message_preserves_history(
    conversation_service,
    tutor_service,
):
    history = [
        {
            "role": "Aluno",
            "text": "Hello",
        }
    ]

    tutor_service.process_turn.return_value = {
        "audio_segments": [],
    }

    conversation_service.process_message(
        user_message="How are you?",
        history=history,
    )

    tutor_service.process_turn.assert_called_once_with(
        user_message="How are you?",
        target_lang="en",
        mood="calm",
        history=history,
    )
