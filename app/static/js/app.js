import { ExpressionController } from "./expressions/expression_controller.js";

(() => {
  "use strict";

  const state = {
    targetLang: "en",
    mood: "calm",
    history: [],
    isBusy: false,
    isRecording: false,
    audioContext: null,
    analyser: null,
    source: null,
    animationFrame: null,
    blinkTimer: null,
    lastAudioUrl: null,
  };

  const $ = (id) => document.getElementById(id);
  const audio = $("teacher-audio");
  const status = $("status-label");
  const teacherState = $("teacher-state");
  const micButton = $("mic-btn");
  const micText = $("mic-text");
  const sendButton = $("send-btn");
  const textInput = $("text-input");
  const startButton = $("start-btn");

  const expressions = new ExpressionController({ mood: state.mood });

  function setStatus(message) {
    status.textContent = message;
    teacherState.textContent = message.toLocaleUpperCase("pt-BR");
  }

  function setMood(mood) {
    state.mood = mood;
    document.body.dataset.mood = mood;
    $("teacher-mood-label").textContent = mood === "calm"
      ? "Calma, paciente e acolhedora"
      : "Intensa, exigente e sem rodeios";
    expressions.setMood(mood);
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function appendMessage(role, text, audioUrl = null) {
    const card = document.createElement("article");
    card.className = `message-card ${role}`;

    const header = document.createElement("div");
    header.className = "msg-header";
    const title = document.createElement("span");
    title.textContent = role === "user" ? "Você" : "Suelen";
    header.append(title);

    if (role === "ai" && audioUrl) {
      const replay = document.createElement("button");
      replay.type = "button";
      replay.className = "replay-btn";
      replay.textContent = "↻ Reproduzir";
      replay.addEventListener("click", () => playAudio(audioUrl, "explaining"));
      header.append(replay);
    }

    const body = document.createElement("div");
    body.className = "msg-body";
    body.textContent = text || "";
    card.append(header, body);
    $("chat-feed").append(card);
    $("chat-feed").scrollTop = $("chat-feed").scrollHeight;
    return card;
  }

  function appendFeedback(card, data) {
    const items = [];
    if (data.corrected_sentence) {
      items.push(`<div><strong>Correção:</strong> ${escapeHtml(data.corrected_sentence)}</div>`);
    }
    if (data.explanation_pt) items.push(`<div>💡 ${escapeHtml(data.explanation_pt)}</div>`);
    if (data.native_tip) items.push(`<div>✨ Como um nativo diria: “${escapeHtml(data.native_tip)}”</div>`);
    if (!items.length) return;

    const box = document.createElement("div");
    box.className = "feedback-box";
    box.innerHTML = items.join("");
    card.append(box);
  }

  async function postJson(url, payload) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const headers = { "Content-Type": "application/json" };
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
    return data;
  }

  async function ensureAudioGraph() {
    if (state.audioContext) {
      if (state.audioContext.state === "suspended") await state.audioContext.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio API não disponível neste navegador.");

    state.audioContext = new AudioContextClass();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 1024;
    state.source = state.audioContext.createMediaElementSource(audio);
    state.source.connect(state.analyser);
    state.analyser.connect(state.audioContext.destination);
  }

  function stopMouthSync() {
    if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    document.documentElement.style.setProperty("--mouth-open", "0");
    document.body.classList.remove("is-speaking");
  }

  function startMouthSync() {
    if (!state.analyser) return;
    const samples = new Uint8Array(state.analyser.fftSize);
    let smoothed = 0;

    const tick = () => {
      if (audio.paused || audio.ended) {
        stopMouthSync();
        return;
      }
      state.analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / samples.length);
      const raw = Math.max(0, Math.min(1, (rms - 0.012) * 5.2));
      smoothed += (raw - smoothed) * (state.mood === "spicy" ? 0.58 : 0.28);
      document.documentElement.style.setProperty("--mouth-open", smoothed.toFixed(3));
      state.animationFrame = requestAnimationFrame(tick);
    };

    if (state.animationFrame === null) {
      state.animationFrame = requestAnimationFrame(tick);
    }
  }

  async function playAudio(url, reaction = "explaining") {
    if (!url) throw new Error("A resposta não possui áudio.");
    state.lastAudioUrl = url;

    try {
      await ensureAudioGraph();
      audio.pause();
      audio.currentTime = 0;
      audio.src = url;
      audio.load();

      expressions.react(reaction, { isSpeaking: true });
      document.body.classList.add("is-speaking");
      document.body.classList.remove("is-blinking");
      setStatus("Suelen está falando...");

      await audio.play();
      startMouthSync();
    } catch (error) {
      stopMouthSync();
      expressions.onSpeechEnded();
      setStatus(`Não consegui reproduzir o áudio: ${error.message}`);
      throw error;
    }
  }

  audio.addEventListener("ended", () => {
    stopMouthSync();
    expressions.onSpeechEnded();
    setStatus("Sua vez! Pode falar ou escrever.");
  });

  audio.addEventListener("pause", () => {
    if (audio.ended) return;
    stopMouthSync();
    expressions.onSpeechEnded();
    setStatus("Áudio pausado.");
  });

  audio.addEventListener("error", () => {
    stopMouthSync();
    expressions.onSpeechEnded();
    setStatus("Erro ao carregar o áudio da professora.");
  });

  async function startSession() {
    if (state.isBusy) return;
    state.isBusy = true;
    startButton.disabled = true;

    try {
      setStatus("Preparando a aula...");
      const data = await postJson("/api/start", {
        target_lang: state.targetLang,
        mood: state.mood,
      });
      appendMessage("ai", data.spoken_text, data.audio_url);
      await playAudio(data.audio_url, data.reaction || "welcoming");
      startButton.hidden = true;
      $("session-state").textContent = "Sessão em andamento";
    } catch (error) {
      console.error(error);
      setStatus(error.message);
      startButton.disabled = false;
    } finally {
      state.isBusy = false;
    }
  }

  async function sendTurn(message) {
    if (state.isBusy || !message.trim()) return;
    state.isBusy = true;
    sendButton.disabled = true;

    const userCard = appendMessage("user", message);
    setStatus("Suelen está pensando...");

    try {
      const data = await postJson("/api/chat", {
        message,
        target_lang: state.targetLang,
        mood: state.mood,
        history: state.history,
      });

      appendFeedback(userCard, data);
      state.history.push(
        { role: "Aluno", text: message },
        { role: "Professora", text: data.spoken_text || "" },
      );

      appendMessage("ai", data.spoken_text, data.audio_url);
      await playAudio(data.audio_url, data.reaction || "explaining");
    } catch (error) {
      console.error(error);
      setStatus(`Erro: ${error.message}`);
    } finally {
      state.isBusy = false;
      sendButton.disabled = false;
    }
  }

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      state.targetLang = button.dataset.lang;
      document.querySelectorAll("[data-lang]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    });
  });

  document.querySelectorAll("#mood-selector [data-mood]").forEach((button) => {
    button.addEventListener("click", () => {
      setMood(button.dataset.mood);
      document.querySelectorAll("#mood-selector [data-mood]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    });
  });

  startButton.addEventListener("click", startSession);

  $("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const message = textInput.value.trim();
    if (!message) return;
    textInput.value = "";
    sendTurn(message);
  });

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (Recognition) {
    recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      state.isRecording = true;
      micButton.classList.add("recording");
      micText.textContent = "Ouvindo...";
      audio.pause();
      setStatus("Estou ouvindo você...");
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) sendTurn(transcript);
    };

    recognition.onerror = (event) => {
      console.warn("SpeechRecognition:", event.error);
      setStatus("Não consegui reconhecer sua fala. Tente novamente ou digite.");
    };

    recognition.onend = () => {
      state.isRecording = false;
      micButton.classList.remove("recording");
      micText.textContent = "Falar";
    };

    micButton.addEventListener("click", () => {
      if (state.isRecording) {
        recognition.stop();
      } else {
        recognition.lang = state.targetLang === "en" ? "en-US" : "es-ES";
        try { recognition.start(); } catch (error) { console.warn(error); }
      }
    });
  } else {
    micButton.disabled = true;
    micText.textContent = "Sem STT";
  }

  function scheduleBlink() {
    const minimum = state.mood === "spicy" ? 1800 : 2800;
    const maximum = state.mood === "spicy" ? 3600 : 6200;
    state.blinkTimer = window.setTimeout(() => {
      if (!document.body.classList.contains("is-speaking")) {
        document.body.classList.add("is-blinking");
        window.setTimeout(() => document.body.classList.remove("is-blinking"), 130);
      }
      scheduleBlink();
    }, minimum + Math.random() * (maximum - minimum));
  }

  scheduleBlink();

  window.addEventListener("pagehide", () => {
    stopMouthSync();
    expressions.destroy();
    window.clearTimeout(state.blinkTimer);
    if (state.audioContext && state.audioContext.state !== "closed") {
      state.audioContext.close();
    }
  }, { once: true });

  setMood("calm");
})();
