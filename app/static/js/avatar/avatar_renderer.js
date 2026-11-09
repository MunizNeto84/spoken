import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";

export class AvatarRenderer {
  constructor(container, options = {}) {
    if (!container) {
      throw new Error("Container do avatar não encontrado.");
    }

    this.container = container;

    this.modelUrl = options.modelUrl || "/static/models/teacher.vrm";

    this.vrm = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.clock = new THREE.Clock();

    this.animationFrameId = null;
    this.resizeObserver = null;

    this.isDestroyed = false;
    this.elapsedTime = 0;

    // Ossos que serão animados.
    this.bones = {};

    // Rotação original de cada osso.
    this.baseRotations = {};

    // Progresso da transição T-Pose -> repouso.
    this.poseProgress = 0;

    // Controle das piscadas.
    this.nextBlink = 3;
    this.blinkStart = null;
    this.blinkDuration = 0.18;

    this.blinkExpressions = [];

    // Configuração da postura.
    // Valores em radianos.
    this.poseConfig = {
      leftUpperArmZ: -1.1,
      rightUpperArmZ: 1.1,

      leftLowerArmZ: -0.12,
      rightLowerArmZ: 0.12,

      leftHandZ: -0.04,
      rightHandZ: 0.04,
    };

    this.init();
  }

  // =====================================================
  // INICIALIZAÇÃO
  // =====================================================

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

    this.scene.background = null;
  }

  createCamera() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.01, 100);

    this.camera.position.set(0, 1.2, 3);

    this.camera.lookAt(0, 1.2, 0);
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

    this.renderer.setClearColor(0x000000, 0);

    this.renderer.domElement.classList.add("avatar-canvas");

    this.container.appendChild(this.renderer.domElement);
  }

  createLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.5);

    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);

    keyLight.position.set(2, 4, 5);

    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb8c9ff, 1.0);

    fillLight.position.set(-4, 2, 2);

    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffb6d9, 1.2);

    rimLight.position.set(0, 3, -4);

    this.scene.add(rimLight);
  }

  // =====================================================
  // CARREGAMENTO DO MODELO
  // =====================================================

  async loadModel() {
    const loader = new GLTFLoader();

    loader.crossOrigin = "anonymous";

    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    try {
      this.setStatus("Carregando professora...");

      const gltf = await loader.loadAsync(this.modelUrl);

      if (this.isDestroyed) {
        return null;
      }

      const vrm = gltf.userData.vrm;

      if (!vrm) {
        throw new Error("O arquivo não contém um modelo VRM válido.");
      }

      this.vrm = vrm;

      // Orientação inicial do personagem.
      //this.vrm.scene.rotation.y = Math.PI;
      this.vrm.scene.rotation.y = 0;

      this.vrm.scene.traverse((object) => {
        if (object.isMesh) {
          object.frustumCulled = false;
        }
      });

      this.scene.add(this.vrm.scene);

      // Prepara ossos e expressões.
      this.prepareCharacter();

      // Ajusta câmera após carregar o modelo.
      this.configureCamera();

      console.info("Avatar VRM carregado:", this.vrm);

      return this.vrm;
    } catch (error) {
      console.error("Erro ao carregar VRM:", error);

      this.setStatus("Erro ao carregar professora. Verifique o modelo.");

      throw error;
    }
  }

  // =====================================================
  // PREPARAÇÃO DOS OSSOS
  // =====================================================

  prepareCharacter() {
    const humanoid = this.vrm.humanoid;

    if (!humanoid) {
      throw new Error("O modelo não possui um Humanoid válido.");
    }

    // Retorna o modelo para sua pose original.
    humanoid.resetNormalizedPose();

    const boneNames = [
      "head",
      "neck",
      "spine",
      "chest",
      "leftShoulder",
      "rightShoulder",
      "leftUpperArm",
      "rightUpperArm",
      "leftLowerArm",
      "rightLowerArm",
      "leftHand",
      "rightHand",
    ];

    for (const name of boneNames) {
      const bone = humanoid.getNormalizedBoneNode(name);

      if (!bone) {
        console.warn(`Osso não encontrado: ${name}`);
        continue;
      }

      this.bones[name] = bone;

      // Guardamos a rotação original.
      this.baseRotations[name] = {
        x: bone.rotation.x,
        y: bone.rotation.y,
        z: bone.rotation.z,
      };
    }

    this.prepareBlinkExpressions();

    console.info("Ossos disponíveis:", Object.keys(this.bones));
  }

  // =====================================================
  // POSTURA NATURAL
  // =====================================================

  applyRestPose() {
    const config = this.poseConfig;

    this.setBoneTarget("leftUpperArm", 0, 0, config.leftUpperArmZ);

    this.setBoneTarget("rightUpperArm", 0, 0, config.rightUpperArmZ);

    this.setBoneTarget("leftLowerArm", 0, 0, config.leftLowerArmZ);

    this.setBoneTarget("rightLowerArm", 0, 0, config.rightLowerArmZ);

    this.setBoneTarget("leftHand", 0, 0, config.leftHandZ);

    this.setBoneTarget("rightHand", 0, 0, config.rightHandZ);
  }

  setBoneTarget(name, x, y, z) {
    const bone = this.bones[name];
    const base = this.baseRotations[name];

    if (!bone || !base) {
      return;
    }

    bone.userData.avatarTargetRotation = {
      x: base.x + x,
      y: base.y + y,
      z: base.z + z,
    };
  }

  updateRestPose(deltaTime) {
    // Transição suave da T-Pose para repouso.
    this.poseProgress = Math.min(1, this.poseProgress + deltaTime * 0.9);

    const config = this.poseConfig;

    const targets = {
      leftUpperArm: config.leftUpperArmZ,
      rightUpperArm: config.rightUpperArmZ,
      leftLowerArm: config.leftLowerArmZ,
      rightLowerArm: config.rightLowerArmZ,
      leftHand: config.leftHandZ,
      rightHand: config.rightHandZ,
    };

    for (const [name, zOffset] of Object.entries(targets)) {
      const bone = this.bones[name];
      const base = this.baseRotations[name];

      if (!bone || !base) {
        continue;
      }

      const targetZ = base.z + zOffset;

      bone.rotation.x = THREE.MathUtils.lerp(base.x, base.x, this.poseProgress);

      bone.rotation.y = base.y;

      bone.rotation.z = THREE.MathUtils.lerp(
        base.z,
        targetZ,
        this.poseProgress
      );
    }
  }

  // =====================================================
  // MOVIMENTOS NATURAIS
  // =====================================================

  updateIdleAnimation(deltaTime) {
    if (!this.vrm) {
      return;
    }

    this.elapsedTime += deltaTime;

    this.updateRestPose(deltaTime);

    this.updateHeadAnimation();

    this.updateBodyAnimation();

    this.updateBlink();
  }

  updateHeadAnimation() {
    const time = this.elapsedTime;

    const head = this.bones.head;
    const neck = this.bones.neck;

    if (head) {
      const base = this.baseRotations.head;

      head.rotation.x = base.x + Math.sin(time * 0.65) * 0.018;

      head.rotation.y = base.y + Math.sin(time * 0.4) * 0.045;

      head.rotation.z = base.z + Math.sin(time * 0.3) * 0.018;
    }

    if (neck) {
      const base = this.baseRotations.neck;

      neck.rotation.x = base.x + Math.sin(time * 0.65) * 0.008;

      neck.rotation.y = base.y + Math.sin(time * 0.4) * 0.015;
    }
  }

  updateBodyAnimation() {
    const time = this.elapsedTime;

    const chest = this.bones.chest;
    const spine = this.bones.spine;

    if (chest) {
      const base = this.baseRotations.chest;

      chest.rotation.x = base.x + Math.sin(time * 0.55) * 0.008;
    }

    if (spine) {
      const base = this.baseRotations.spine;

      spine.rotation.x = base.x + Math.sin(time * 0.55) * 0.006;
    }
  }

  // =====================================================
  // PISCADAS AUTOMÁTICAS
  // =====================================================

  prepareBlinkExpressions() {
    const manager = this.vrm.expressionManager;

    if (!manager) {
      return;
    }

    // VRM pode utilizar blink ou blinkLeft/blinkRight.
    if (manager.getValue("blink") !== null) {
      this.blinkExpressions = ["blink"];
    } else {
      if (manager.getValue("blinkLeft") !== null) {
        this.blinkExpressions.push("blinkLeft");
      }

      if (manager.getValue("blinkRight") !== null) {
        this.blinkExpressions.push("blinkRight");
      }
    }

    console.info("Expressões de piscada:", this.blinkExpressions);
  }

  updateBlink() {
    if (!this.blinkExpressions.length) {
      return;
    }

    const now = this.elapsedTime;

    if (this.blinkStart === null && now >= this.nextBlink) {
      this.blinkStart = now;
    }

    if (this.blinkStart === null) {
      return;
    }

    const progress = (now - this.blinkStart) / this.blinkDuration;

    if (progress >= 1) {
      this.setBlinkValue(0);

      this.blinkStart = null;

      // Próxima piscada entre 3 e 6 segundos.
      this.nextBlink = now + 3 + Math.random() * 3;

      return;
    }

    // Fecha e abre os olhos suavemente.
    const weight = Math.sin(progress * Math.PI);

    this.setBlinkValue(weight);
  }

  setBlinkValue(weight) {
    for (const expression of this.blinkExpressions) {
      this.vrm.expressionManager.setValue(expression, weight);
    }
  }

  // =====================================================
  // EXPRESSÕES FACIAIS
  // =====================================================

  setEmotion(emotion, intensity = 0.7) {
    const manager = this.vrm?.expressionManager;

    if (!manager) {
      return;
    }

    const emotions = ["happy", "sad", "angry", "surprised", "relaxed"];

    for (const name of emotions) {
      if (manager.getValue(name) !== null) {
        manager.setValue(name, 0);
      }
    }

    if (manager.getValue(emotion) !== null) {
      manager.setValue(emotion, THREE.MathUtils.clamp(intensity, 0, 1));
    } else {
      console.warn(`Expressão "${emotion}" não existe neste VRM.`);
    }
  }

  // =====================================================
  // CÂMERA E ENQUADRAMENTO
  // =====================================================

  configureCamera() {
    const boundingBox = new THREE.Box3().setFromObject(this.vrm.scene);

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    boundingBox.getSize(size);
    boundingBox.getCenter(center);

    const height = size.y;

    if (height <= 0) {
      throw new Error("Não foi possível calcular a altura do personagem.");
    }

    // Ponto de foco próximo ao peito.
    const targetY = boundingBox.min.y + height * 0.76;

    // Mostra cabeça, tronco e região próxima à cintura.
    const visibleHeight = height * 0.55;

    const distance =
      visibleHeight /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));

    this.camera.position.set(center.x, targetY, center.z + distance * 1.12);

    this.camera.lookAt(center.x, targetY, center.z);

    this.camera.near = 0.01;
    this.camera.far = 100;

    this.camera.updateProjectionMatrix();

    console.info("Enquadramento da professora:", {
      characterHeight: height,
      targetY,
      cameraDistance: distance,
    });
  }

  // =====================================================
  // REDIMENSIONAMENTO
  // =====================================================

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

  // =====================================================
  // STATUS
  // =====================================================

  setStatus(message) {
    const statusElement = document.getElementById("avatar-status");

    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  // =====================================================
  // LOOP DE RENDERIZAÇÃO
  // =====================================================

  startRenderLoop() {
    const animate = () => {
      if (this.isDestroyed) {
        return;
      }

      this.animationFrameId = requestAnimationFrame(animate);

      const deltaTime = Math.min(this.clock.getDelta(), 0.05);

      if (this.vrm) {
        this.updateIdleAnimation(deltaTime);

        // Sincroniza ossos e expressões do VRM.
        this.vrm.update(deltaTime);
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  // =====================================================
  // DESTRUIÇÃO
  // =====================================================

  destroy() {
    this.isDestroyed = true;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.resizeObserver?.disconnect();

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);

      this.vrm = null;
    }

    this.renderer?.dispose();

    this.renderer?.domElement.remove();

    this.scene?.clear();

    console.info("Avatar destruído.");
  }
}
