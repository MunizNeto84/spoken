let targetLang = "en";
let currentMood = "calm";
let isRecording = false;
let conversationHistory = [];

const orbWrapper = document.getElementById("orb-wrapper");
const statusLabel = document.getElementById("status-label");
const chatFeed = document.getElementById("chat-feed");
const micBtn = document.getElementById("mic-btn");
const micText = document.getElementById("mic-text");
const chatForm = document.getElementById("chat-form");
const textInput = document.getElementById("text-input");
const startBtn = document.getElementById("start-btn");
const audioPlayer = document.getElementById("audio-player");

// Configuração de Reconhecimento de Voz do Navegador (STT)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add("recording");
        micText.textContent = "Ouvindo...";
        setOrbState("listening", "Ouvindo sua fala...");
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        sendTurn(transcript);
    };

    recognition.onerror = (event) => {
        console.warn("Erro no microfone:", event.error);
        stopRecordingUI();
        setOrbState("idle", "Não consegui ouvir. Tente novamente ou digite abaixo.");
    };

    recognition.onend = () => {
        stopRecordingUI();
    };
} else {
    micBtn.disabled = true;
    micText.textContent = "Sem suporte STT";
}

function stopRecordingUI() {
    isRecording = false;
    micBtn.classList.remove("recording");
    micText.textContent = "Falar";
}

function setOrbState(state, message) {
    orbWrapper.setAttribute("data-state", state);
    if (message) statusLabel.textContent = message;
}

// Seletores de Idioma
document.querySelectorAll("#lang-selector .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#lang-selector .pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        targetLang = btn.dataset.lang;
    });
});

// Seletores de Humor
document.querySelectorAll("#mood-selector .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll("#mood-selector .pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentMood = btn.dataset.mood;
        document.body.setAttribute("data-mood", currentMood);
    });
});

// Botão de Microfone
micBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (isRecording) {
        recognition.stop();
    } else {
        audioPlayer.pause();
        recognition.lang = targetLang === "en" ? "en-US" : "es-ES";
        recognition.start();
    }
});

// Envio por Texto
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = textInput.value.trim();
    if (!message) return;
    textInput.value = "";
    sendTurn(message);
});

// Botão Iniciar Sessão (Quebra-gelo)
startBtn.addEventListener("click", async () => {
    startBtn.style.display = "none";
    setOrbState("thinking", "Preparando abertura da aula...");
    try {
        const res = await fetch("/api/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_lang: targetLang, mood: currentMood }),
        });
        const data = await res.json();
        appendAiMessage(data.spoken_text, data.audio_url, "Abertura");
        playAudio(data.audio_url);
    } catch (err) {
        setOrbState("idle", "Erro ao iniciar sessão.");
    }
});

async function sendTurn(userMessage) {
    startBtn.style.display = "none";
    const userCard = appendUserMessage(userMessage);
    setOrbState("thinking", "Analisando gramática e gerando voz...");

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: userMessage,
                target_lang: targetLang,
                mood: currentMood,
                history: conversationHistory,
            }),
        });

        const data = await res.json();

        // Se houve correção ou dica nativa, anexa no balão do usuário
        if (data.has_errors || data.corrected_sentence || data.native_tip) {
            attachFeedbackToCard(userCard, data);
        }

        // Atualiza histórico local
        conversationHistory.push({ role: "Aluno", text: userMessage });
        conversationHistory.push({ role: "Professora", text: data.spoken_text });

        appendAiMessage(data.spoken_text, data.audio_url, data.provider);
        playAudio(data.audio_url);
    } catch (err) {
        console.error(err);
        setOrbState("idle", "Erro ao processar resposta.");
    }
}

function appendUserMessage(text) {
    const card = document.createElement("div");
    card.className = "message-card user";
    card.innerHTML = `
        <div class="msg-header"><span>Você</span></div>
        <div class="msg-body">${escapeHtml(text)}</div>
    `;
    chatFeed.appendChild(card);
    chatFeed.scrollTop = chatFeed.scrollHeight;
    return card;
}

function attachFeedbackToCard(card, data) {
    const box = document.createElement("div");
    box.className = "feedback-box";
    let html = "";

    if (data.corrected_sentence) {
        html += `<div><strong>✅ Correção:</strong> ${escapeHtml(data.corrected_sentence)}</div>`;
    }
    if (data.explanation_pt) {
        html += `<div>💡 ${escapeHtml(data.explanation_pt)}</div>`;
    }
    if (data.native_tip) {
        html += `<div class="native-tip">✨ Como um nativo diria: "${escapeHtml(data.native_tip)}"</div>`;
    }

    box.innerHTML = html;
    card.appendChild(box);
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function appendAiMessage(text, audioUrl, provider) {
    const card = document.createElement("div");
    card.className = "message-card ai";
    card.innerHTML = `
        <div class="msg-header">
            <span>Spoken (${currentMood === "spicy" ? "🔥 Ácida" : "🌱 Tranquila"})</span>
            <button type="button" class="replay-btn" onclick="playAudio('${audioUrl}')">🔊 Ouvir novamente</button>
        </div>
        <div class="msg-body">${escapeHtml(text)}</div>
    `;
    chatFeed.appendChild(card);
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function playAudio(url) {
    if (!url) return;
    audioPlayer.src = url;
    setOrbState("speaking", "Spoken está falando...");
    audioPlayer.play();

    audioPlayer.onended = () => {
        setOrbState("idle", "Sua vez! Clique em Falar ou digite abaixo.");
    };
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
}
