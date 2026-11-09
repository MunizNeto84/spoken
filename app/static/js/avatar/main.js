import { AvatarRenderer } from "./avatar_renderer.js";

let avatarRenderer = null;

async function initializeAvatar() {
  const container = document.getElementById("avatar-container");

  const status = document.getElementById("avatar-status");

  if (!container) {
    console.error("Container do avatar não encontrado.");
    return;
  }

  if (!window.WebGLRenderingContext) {
    if (status) {
      status.textContent = "Seu navegador não oferece suporte ao WebGL.";
    }

    return;
  }

  try {
    avatarRenderer = new AvatarRenderer(container, {
      modelUrl: container.dataset.modelUrl,
    });

    await avatarRenderer.loadModel();

    // Expressão inicial da professora.
    avatarRenderer.setEmotion("happy", 0.25);

    console.info("Spoken Avatar inicializado.");
  } catch (error) {
    console.error("Falha na inicialização do avatar:", error);

    if (status) {
      status.textContent = "Não foi possível iniciar a professora 3D.";
    }
  }
}

document.addEventListener("DOMContentLoaded", initializeAvatar);

window.addEventListener("beforeunload", () => {
  avatarRenderer?.destroy();
});
