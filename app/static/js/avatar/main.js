import { AvatarRenderer } from "./avatar_renderer.js";

let avatarRenderer = null;

let isInitializing = false;

async function initializeAvatar() {
  if (isInitializing || avatarRenderer) {
    return;
  }

  isInitializing = true;

  const container = document.getElementById("avatar-container");

  const loadingElement = document.getElementById("avatar-loading");

  const statusElement = document.getElementById("avatar-status");

  if (!container) {
    console.error("Elemento #avatar-container não encontrado.");

    isInitializing = false;
    return;
  }

  try {
    // Verifica suporte ao WebGL.
    const canvas = document.createElement("canvas");

    const webglAvailable =
      Boolean(canvas.getContext("webgl2")) ||
      Boolean(canvas.getContext("webgl"));

    if (!webglAvailable) {
      throw new Error("Seu navegador não oferece suporte ao WebGL.");
    }

    if (statusElement) {
      statusElement.textContent = "Preparando sua professora...";
    }

    // Cria o motor 3D.
    avatarRenderer = new AvatarRenderer(container, {
      modelUrl: container.dataset.modelUrl || "/static/models/teacher.vrm",
    });

    // Carrega a personagem.
    await avatarRenderer.loadModel();

    // Confirma que a instância não foi destruída.
    if (!avatarRenderer.vrm) {
      throw new Error("O modelo não foi inicializado corretamente.");
    }

    // Expressão inicial discreta.
    avatarRenderer.setEmotion("happy", 0.2);

    // Remove completamente o indicador de carregamento.
    loadingElement?.remove();

    if (statusElement) {
      statusElement.textContent = "Professora pronta!";
    }

    // Atualiza o status externo da interface.
    const statusLabel = document.getElementById("status-label");

    if (statusLabel) {
      statusLabel.textContent = "Sua professora está pronta para conversar.";
    }

    // Disponibiliza o avatar para futuras integrações.
    window.spokenAvatar = avatarRenderer;

    console.info("Spoken 3D inicializado com sucesso.");
  } catch (error) {
    console.error("Falha ao inicializar a professora:", error);

    avatarRenderer?.destroy();

    avatarRenderer = null;

    if (statusElement) {
      statusElement.textContent = "Não foi possível carregar a professora.";
    }

    if (loadingElement) {
      loadingElement.style.display = "flex";

      loadingElement.textContent = "Erro ao carregar. Verifique o Console.";
    }
  } finally {
    isInitializing = false;
  }
}

// Inicialização automática.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAvatar, {
    once: true,
  });
} else {
  initializeAvatar();
}

// Limpeza ao sair da página.
window.addEventListener(
  "pagehide",
  () => {
    avatarRenderer?.destroy();

    avatarRenderer = null;

    window.spokenAvatar = null;
  },
  { once: true }
);
