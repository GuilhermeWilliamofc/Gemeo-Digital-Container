/**
 * View3D.js - Visualização Tridimensional com Three.js
 * Renderiza o container cilíndrico, o fluxo de partículas térmicas e os efeitos de iluminação.
 */

class ReactorView3D {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.container = this.canvas.parentElement;
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    // Elementos da Cena
    this.reactorMesh = null;
    this.reactorMaterials = []; // Armazena materiais originais do modelo
    this.internalLight = null;
    this.gridHelper = null;
    
    // Sistema de Partículas Térmicas
    this.particles = null;
    this.particleGeometry = null;
    this.particleCount = 120;
    this.particleStates = []; // Armazena velocidade e vida das partículas
    
    // Cores de Referência Térmica
    this.colors = {
      cold: new THREE.Color(0.0, 0.4, 1.0),      // Azul (#0066FF) - Frio
      stable: new THREE.Color(0.2, 0.7, 0.4),    // Verde Slate (#33B366) - Estável
      warm: new THREE.Color(1.0, 0.5, 0.0),      // Laranja (#FF8000) - Transição
      critical: new THREE.Color(1.0, 0.1, 0.1)   // Vermelho (#FF1A1A) - Crítico
    };
    
    this.init();
  }

  init() {
    // 1. Configura a Cena
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080C);
    // Adiciona névoa sutil para profundidade
    this.scene.fog = new THREE.FogExp2(0x06080C, 0.04);

    // 2. Configura a Câmera
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(4, 5, 6);

    // 3. Configura o Renderizador (WebGL2)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 4. Controles Orbitais
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 15;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Não permite ir muito abaixo da grade

    // 5. Iluminação Premium
    const ambientLight = new THREE.AmbientLight(0x111622, 1.2);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(5, 8, 5);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x3B82F6, 0.6); // Luz azulada de preenchimento lateral
    dirLight2.position.set(-5, 3, -5);
    this.scene.add(dirLight2);

    // Luz interna do reator (cria o efeito de brilho térmico interno)
    this.internalLight = new THREE.PointLight(0x00ff00, 0, 5);
    this.internalLight.position.set(0, 0, 0);
    this.scene.add(this.internalLight);

    // 6. Carrega o Modelo 3D do Reator (GLB)
    const loader = new THREE.GLTFLoader();
    loader.load('models/reatorTermicoGemeo.glb', (gltf) => {
      this.reactorMesh = gltf.scene;
      
      // Ajusta a escala e posição do modelo
      this.reactorMesh.scale.set(1, 1, 1);
      this.reactorMesh.position.set(0, -2, 0);
      
      // Aplica propriedades de sombra a todos os meshes do modelo e armazena os materiais
      this.reactorMesh.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          // Armazena o material original para modificação dinâmica
          if (node.material) {
            this.reactorMaterials.push(node.material);
          }
        }
      });
      
      this.scene.add(this.reactorMesh);
    }, undefined, (error) => {
      console.error('Erro ao carregar modelo GLB:', error);
    });

    // 7. Grade de Solo (Grid Helper)
    this.gridHelper = new THREE.GridHelper(10, 20, 0x1E293B, 0x0F172A);
    this.gridHelper.position.y = -1.5;
    this.scene.add(this.gridHelper);

    // 8. Inicializa o Sistema de Partículas
    this.createThermalParticles();

    // 9. Evento de redimensionamento
    window.addEventListener('resize', () => this.onWindowResize());
  }

  /**
   * Cria a geometria e o material das partículas de fluxo térmico
   */
  createThermalParticles() {
    this.particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);

    for (let i = 0; i < this.particleCount; i++) {
      // Distribui as partículas dentro de um cilindro ligeiramente maior que o reator
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.1 + Math.random() * 0.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (Math.random() - 0.5) * 2.4; // Posição y aleatória ao longo do cilindro

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Inicia com cor sutil
      colors[i * 3] = 0.5;
      colors[i * 3 + 1] = 0.5;
      colors[i * 3 + 2] = 0.5;

      // Inicializa estado físico de cada partícula
      this.particleStates.push({
        yStart: -1.2,
        yEnd: 1.2,
        speed: 0.2 + Math.random() * 0.6,
        radius: radius,
        angle: angle,
        wobbleSpeed: 1 + Math.random() * 3,
        opacity: Math.random()
      });
    }

    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Material de partícula circular luminoso
    // Carregamos uma textura procedural básica usando Canvas
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    const pTexture = new THREE.CanvasTexture(canvas);

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.12,
      map: pTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    });

    this.particles = new THREE.Points(this.particleGeometry, particleMaterial);
    this.scene.add(this.particles);
  }

  /**
   * Atualiza as cores baseadas na temperatura do reator e move as partículas
   * @param {number} temp - Temperatura atual lida do sensor (°C)
   * @param {number} actuatorPower - Potência do atuador (%)
   * @param {number} dt - Diferença de tempo
   */
  update(temp, actuatorPower, dt) {
    this.controls.update();

    // 1. Calcula a Cor Térmica usando interpolação Linear (Lerp)
    let finalColor = new THREE.Color();

    if (temp <= 25.0) {
      // Entre Frio e Temperatura Ambiente
      const factor = Math.max(0, temp) / 25.0; // Normaliza de 0 a 25
      finalColor.copy(this.colors.cold).lerp(this.colors.stable, factor);
    } else if (temp <= 75.0) {
      // Entre Ambiente e Alvo Quente Inicial
      const factor = (temp - 25.0) / 50.0;
      finalColor.copy(this.colors.stable).lerp(this.colors.warm, factor);
    } else {
      // Entre Quente e Crítico (Limite em 120°C para transição de cor completa)
      const factor = Math.min(1.0, (temp - 75.0) / 45.0);
      finalColor.copy(this.colors.warm).lerp(this.colors.critical, factor);
    }

    // Faz o material brilhar internamente aumentando a emissão (emissive)
    const emissiveFactor = Math.min(0.8, Math.max(0.0, (temp - 30.0) / 100.0));
    
    // Modifica as propriedades de emissão dos materiais originais do modelo
    if (this.reactorMesh) {
      this.reactorMesh.traverse((node) => {
        if (node.isMesh && node.material) {
          // Aplica emissão com a cor térmica para efeito dinâmico
          node.material.emissive.copy(finalColor).multiplyScalar(emissiveFactor);
          node.material.needsUpdate = true;
        }
      });
    }

    // Ajusta a luz pontual interna com base no estado térmico
    this.internalLight.color.copy(finalColor);
    this.internalLight.intensity = emissiveFactor * 4.0;

    // 2. Animação do Sistema de Partículas baseada na potência do atuador
    const positions = this.particleGeometry.attributes.position.array;
    const colors = this.particleGeometry.attributes.color.array;

    // Se o atuador estiver parado, as partículas se movem muito lentamente
    // Se estiver aquecendo (potência > 0), sobem. Se estiver resfriando (potência < 0), descem.
    const isHeating = actuatorPower > 0;
    const powerIntensity = Math.abs(actuatorPower) / 100.0;
    const flowDirection = isHeating ? 1.0 : -1.0;
    
    // Cor das partículas: vermelho se aquecendo, azul se resfriando, cinza/laranja se inerte
    let particleColor = new THREE.Color(0.4, 0.4, 0.4);
    if (powerIntensity > 0.05) {
      if (isHeating) {
        particleColor.copy(this.colors.warm).lerp(this.colors.critical, powerIntensity);
      } else {
        particleColor.copy(this.colors.cold);
      }
    } else {
      // Inerte: reflete a temperatura do reator de forma suave
      particleColor.copy(finalColor).multiplyScalar(0.4);
    }

    for (let i = 0; i < this.particleCount; i++) {
      const state = this.particleStates[i];
      let y = positions[i * 3 + 1];

      // Atualiza a posição Y baseada na direção e velocidade
      const currentSpeed = (0.1 + powerIntensity * 0.9) * state.speed * dt;
      y += flowDirection * currentSpeed;

      // Reseta partículas que saem do topo ou da base
      if (isHeating && y > state.yEnd) {
        y = state.yStart;
      } else if (!isHeating && y < state.yStart) {
        y = state.yEnd;
      }

      // Adiciona um leve balanço senoidal lateral (wobble) para realismo
      state.angle += state.wobbleSpeed * dt;
      const wobbleX = Math.cos(state.angle) * 0.05;
      const wobbleZ = Math.sin(state.angle) * 0.05;

      const baseAngle = (i / this.particleCount) * Math.PI * 2;
      positions[i * 3] = Math.cos(baseAngle) * state.radius + wobbleX;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(baseAngle) * state.radius + wobbleZ;

      // Brilho da partícula pulsa ou varia
      const pColorNorm = particleColor.clone();
      // Partículas perto das tampas desaparecem suavemente (fade out)
      const distFromCenter = Math.abs(y);
      const fadeFactor = Math.max(0, Math.min(1.0, (1.25 - distFromCenter) / 0.3));
      pColorNorm.multiplyScalar(fadeFactor);

      colors[i * 3] = pColorNorm.r;
      colors[i * 3 + 1] = pColorNorm.g;
      colors[i * 3 + 2] = pColorNorm.b;
    }

    this.particleGeometry.attributes.position.needsUpdate = true;
    this.particleGeometry.attributes.color.needsUpdate = true;

    // Renderiza a cena
    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }
}

// Expõe no escopo global para evitar imports do ES6 (CORS local)
window.ReactorView3D = ReactorView3D;
