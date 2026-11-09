import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";

export class AvatarRenderer {
  constructor(container, options = {}) {
    if (!container) {
      throw new Error("Container do avatar não encontrado.");
    }

    this.container = container;

    this.modelUrl = options.modelUrl ?? "/static/models/teacher.vrm";

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.vrm = null;

    this.clock = new THREE.Clock();

    this.headBone = null;
    this.originalHeadRotation = null;

    this.animationFrameId = null;
    this.resizeObserver = null;

    this.elapsedTime = 0;
    this.nextBlink = 3.5;
    this.blinkStart = null;

    this.isDestroyed = false;

    this.init();
  }

  init() {
    this.createScene();
    this.createCamera();
    this.createRenderer();
    this.createLights();
    this.createResizeObserver();

    this.startRenderLoop();
  }

  createScene() {
    this.scene = new THREE.Scene();

    // Fundo transparente para utilizar o background do CSS.
    this.scene.background = null;
  }

  createCamera() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);

    // Posição inicial. Será recalculada após carregar o modelo.
    this.camera.position.set(0, 1.1, 1.8);

    this.camera.lookAt(0, 1.1, 0);
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.setSize(
      this.container.clientWidth || 800,
      this.container.clientHeight || 600
    );

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.renderer.domElement.classList.add("avatar-canvas");

    this.container.appendChild(this.renderer.domElement);
  }

  createLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);

    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);

    keyLight.position.set(2, 4, 5);

    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb8c9ff, 0.8);

    fillLight.position.set(-4, 2, 2);

    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffb6d9, 1.2);

    rimLight.position.set(0, 3, -4);

    this.scene.add(rimLight);
  }

  async loadModel() {
    const loader = new GLTFLoader();

    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    try {
      this.setStatus("Carregando professora...");

      const gltf = await loader.loadAsync(this.modelUrl);

      if (this.isDestroyed) {
        return;
      }

      const vrm = gltf.userData.vrm;

      if (!vrm) {
        throw new Error("O arquivo carregado não contém um modelo VRM válido.");
      }

      this.vrm = vrm;

      // Ajusta a orientação e remove dados desnecessários
      // que podem afetar a apresentação do modelo.
      //this.vrm.scene.rotation.y = Math.PI;
      this.vrm.scene.rotation.y = 0;

      this.vrm.scene.traverse((object) => {
        if (object.isMesh) {
          object.frustumCulled = false;
        }
      });

      this.scene.add(this.vrm.scene);

      this.prepareCharacter();

      this.configureCamera();

      this.setStatus("Professora pronta!");

      console.info("Avatar VRM carregado:", this.vrm);

      return this.vrm;
    } catch (error) {
      console.error("Erro ao carregar avatar:", error);

      this.setStatus(
        "Não foi possível carregar a professora. Verifique o arquivo VRM."
      );

      throw error;
    }
  }

  prepareCharacter() {
    const humanoid = this.vrm.humanoid;

    if (humanoid) {
      this.headBone = humanoid.getNormalizedBoneNode("head");

      if (this.headBone) {
        this.originalHeadRotation = {
          x: this.headBone.rotation.x,
          y: this.headBone.rotation.y,
          z: this.headBone.rotation.z,
        };
      }
    }

    if (this.vrm.expressionManager) {
      this.setExpression("neutral", 0);
    }
  }

  configureCamera() {
    const boundingBox = new THREE.Box3().setFromObject(this.vrm.scene);

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    boundingBox.getSize(size);
    boundingBox.getCenter(center);

    const characterHeight = size.y;

    if (characterHeight <= 0) {
      throw new Error("Altura inválida do personagem.");
    }

    // Queremos mostrar a cabeça e o tronco até a cintura.
    const targetY = boundingBox.min.y + characterHeight * 0.73;

    const verticalFrame = characterHeight * 0.6;

    const distance =
      verticalFrame /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));

    this.camera.position.set(center.x, targetY, distance * 1.03);

    this.camera.lookAt(center.x, targetY, center.z);

    this.camera.near = 0.01;
    this.camera.far = 100;

    this.camera.updateProjectionMatrix();

    console.info("Dimensões do avatar:", {
      width: size.x,
      height: size.y,
      depth: size.z,
      cameraDistance: distance,
      targetY,
    });
  }

  setExpression(name, weight) {
    if (!this.vrm?.expressionManager) {
      return;
    }

    this.vrm.expressionManager.setValue(
      name,
      THREE.MathUtils.clamp(weight, 0, 1)
    );
  }

  setEmotion(emotion, intensity = 0.7) {
    const supportedEmotions = ["happy", "sad", "angry", "surprised", "relaxed"];

    if (!supportedEmotions.includes(emotion)) {
      console.warn("Emoção não suportada:", emotion);
      return;
    }

    for (const name of supportedEmotions) {
      this.setExpression(name, 0);
    }

    this.setExpression(emotion, intensity);
  }

  setStatus(message) {
    const statusElement = document.getElementById("avatar-status");

    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  updateIdleAnimation(deltaTime) {
    if (!this.vrm) {
      return;
    }

    this.elapsedTime += deltaTime;

    // Pequenos movimentos naturais da cabeça.
    if (this.headBone && this.originalHeadRotation) {
      this.headBone.rotation.x =
        this.originalHeadRotation.x + Math.sin(this.elapsedTime * 0.8) * 0.025;

      this.headBone.rotation.y =
        this.originalHeadRotation.y + Math.sin(this.elapsedTime * 0.45) * 0.035;
    }

    this.updateBlink();
  }

  updateBlink() {
    if (!this.vrm?.expressionManager) {
      return;
    }

    const now = this.elapsedTime;

    if (this.blinkStart === null && now >= this.nextBlink) {
      this.blinkStart = now;
    }

    if (this.blinkStart !== null) {
      const progress = (now - this.blinkStart) / 0.18;

      if (progress >= 1) {
        this.setExpression("blink", 0);

        this.blinkStart = null;

        this.nextBlink = now + 3 + Math.random() * 3;

        return;
      }

      const weight = Math.sin(progress * Math.PI);

      this.setExpression("blink", weight);
    }
  }

  createResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });

    this.resizeObserver.observe(this.container);
  }

  resize() {
    if (!this.renderer || !this.camera) {
      return;
    }

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (!width || !height) {
      return;
    }

    this.camera.aspect = width / height;

    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  startRenderLoop() {
    const animate = () => {
      if (this.isDestroyed) {
        return;
      }

      this.animationFrameId = requestAnimationFrame(animate);

      const deltaTime = Math.min(this.clock.getDelta(), 0.05);

      if (this.vrm) {
        this.updateIdleAnimation(deltaTime);

        this.vrm.update(deltaTime);
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  destroy() {
    this.isDestroyed = true;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.resizeObserver?.disconnect();

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
    }

    this.renderer?.dispose();

    this.renderer?.domElement.remove();

    this.scene?.clear();

    this.vrm = null;
  }
}
