/**
 * Controller.js - Controlador do Gêmeo Digital
 * Coordena a troca de dados entre o Modelo e as Visualizações,
 * além de orquestrar os engines de Previsão, Saúde e Anomalia.
 */

class DashboardController {
  constructor() {
    // Inicializa instâncias (acessadas no escopo global para evitar CORS local)
    this.model        = new window.ThermalModel();
    this.view3d       = null;
    this.view2d       = null;

    // Engines de Análise
    this.predEngine    = new window.PredictionEngine(this.model);
    this.healthEngine  = new window.HealthEngine(this.model);
    this.anomalyEngine = new window.AnomalyEngine(this.model);

    // Controle de tempo do loop físico
    this.lastTime  = performance.now();
    this.isRunning = true;
    this._lastSave = 0; // Timestamp do último save de estado (throttle 1s)

    // Referências do DOM – Painel Principal
    this.dom = {
      tempCurrent:   document.getElementById('temp-current'),
      tempTarget:    document.getElementById('temp-target'),
      actuatorPower: document.getElementById('actuator-power'),
      powerBar:      document.getElementById('power-bar-fill'),
      powerBarVal:   document.getElementById('power-bar-val'),
      tempSlider:    document.getElementById('temp-slider'),
      tempSliderVal: document.getElementById('temp-slider-val'),

      // Botões e Toggles
      powerToggle:  document.getElementById('power-toggle'),
      failBtn:      document.getElementById('fail-btn'),
      emergencyBtn: document.getElementById('emergency-btn'),

      // Cabeçalho e Meta-informações
      signal:    document.getElementById('signal'),
      timestamp: document.getElementById('timestamp'),

      // Painel de Decisão
      decisionCard:      document.getElementById('decision-card'),
      decisionStatus:    document.getElementById('decision-status'),
      decisionRisk:      document.getElementById('decision-risk'),
      decisionAction:    document.getElementById('decision-action'),
      decisionIndicator: document.getElementById('decision-indicator'),

      // Analytics – inline no index (injetados dinamicamente)
      healthBadge: document.getElementById('health-badge'),
      alertsBadge: document.getElementById('alerts-badge-main'),
    };
  }

  /**
   * Inicializa as views, liga os event listeners e inicia o loop da aplicação
   */
  start() {
    // 1. Instancia as Views
    this.view3d = new window.ReactorView3D('viewer');

    // Passa o PredictionEngine para o gráfico 2D habilitar a linha de projeção
    this.view2d = new window.TelemetryChartView2D(
      'telemetry-chart-container',
      this.model,
      this.predEngine
    );

    // 2. Registra os Listeners de Input
    this.bindEvents();

    // 3. Atualiza dados iniciais da UI
    this.updateUI(true);

    // 4. Inicia o loop principal
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  /**
   * Vincula os eventos do usuário na interface aos métodos do modelo
   */
  bindEvents() {
    // Slider de Temperatura Alvo
    this.dom.tempSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.model.tempTarget = val;
      this.dom.tempSliderVal.textContent = val + '°C';
      this.dom.tempTarget.textContent    = val.toFixed(1) + ' °C';
    });

    // Toggle de Ligar/Desligar Sistema
    this.dom.powerToggle.addEventListener('change', (e) => {
      this.model.systemOn = e.target.checked;
      this.updatePowerToggleUI();
    });

    // Botão de Simulação de Falha Crítica
    this.dom.failBtn.addEventListener('click', () => {
      this.model.isFailed = true;
      this.model.systemOn = true;
      this.dom.powerToggle.checked = true;
      this.updatePowerToggleUI();
    });

    // Botão de Desligamento de Emergência e Reset
    this.dom.emergencyBtn.addEventListener('click', () => {
      this.model.isFailed     = false;
      this.model.systemOn     = false;
      this.model.tempTarget   = 25.0;
      this.dom.tempSlider.value           = 25;
      this.dom.tempSliderVal.textContent  = '25°C';
      this.dom.powerToggle.checked        = false;
      this.updatePowerToggleUI();
    });
  }

  /**
   * Mantém o toggle switch sincronizado visualmente
   */
  updatePowerToggleUI() {
    const isChecked = this.dom.powerToggle.checked;
    const label     = this.dom.powerToggle.parentElement.querySelector('.toggle-label');
    if (label) {
      label.textContent = isChecked ? 'SISTEMA ATIVO' : 'SISTEMA EM STANDBY';
    }
  }

  /**
   * Loop principal da simulação e renderização
   * @param {number} currentTime - Timestamp fornecido pelo requestAnimationFrame
   */
  loop(currentTime) {
    if (!this.isRunning) return;

    // Calcula dt em segundos
    let dt = (currentTime - this.lastTime) / 1000.0;
    this.lastTime = currentTime;
    if (dt > 0.1) dt = 0.1;

    // 1. Atualiza a física da simulação (Model)
    this.model.update(dt);

    // 2. Executa os engines de análise
    this.predEngine.update();
    this.healthEngine.update();
    this.anomalyEngine.update();

    // Grava health no modelo para persistir no histórico
    this.model.healthIndex = this.healthEngine.result.index;

    // 3. Atualiza a renderização 3D
    this.view3d.update(this.model.tempSensor, this.model.actuatorPower, dt);

    // 4. Atualiza UI textual, KPIs e cards
    this.updateUI(false);

    // 5. Persiste estado no sessionStorage (throttle: 1 save/segundo)
    if (currentTime - this._lastSave > 1000) {
      this.model.saveState();
      this._lastSave = currentTime;
    }

    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  /**
   * Atualiza a telemetria do DOM baseando-se no estado atual da simulação (Model)
   * @param {boolean} force - Força a atualização completa (incluindo inputs)
   */
  updateUI(force = false) {
    // 1. Valores Básicos da Telemetria
    this.dom.tempCurrent.textContent = this.model.tempSensor.toFixed(1) + ' °C';
    this.dom.tempTarget.textContent  = this.model.tempTarget.toFixed(1) + ' °C';

    // Potência do Atuador
    const power = this.model.actuatorPower;
    this.dom.actuatorPower.textContent = (power > 0 ? '+' : '') + power.toFixed(0) + ' %';

    // Barra de preenchimento da potência
    const barFill = this.dom.powerBar;
    const barVal  = this.dom.powerBarVal;

    if (power >= 0) {
      barFill.style.width      = power + '%';
      barFill.style.left       = '0%';
      barFill.style.background = 'linear-gradient(90deg, #F59E0B, #EF4444)';
      barVal.textContent       = 'AQUECENDO';
    } else {
      const coolingPct         = Math.abs(power);
      barFill.style.width      = coolingPct + '%';
      barFill.style.left       = '0%';
      barFill.style.background = 'linear-gradient(90deg, #3B82F6, #1D4ED8)';
      barVal.textContent       = 'RESFRIANDO';
    }
    if (power === 0) {
      barFill.style.width  = '0%';
      barVal.textContent   = 'INATIVO';
    }

    if (force) {
      this.dom.tempSlider.value          = this.model.tempTarget;
      this.dom.tempSliderVal.textContent = this.model.tempTarget + '°C';
      this.dom.powerToggle.checked       = this.model.systemOn;
      this.updatePowerToggleUI();
    }

    // 2. Meta-informações de sinal e timestamp
    const signalQuality = 100 - (Math.random() > 0.95 ? (Math.random() * 0.8) : 0);
    this.dom.signal.textContent    = signalQuality.toFixed(1) + '% Estável';
    this.dom.timestamp.textContent = new Date().toLocaleTimeString() + '.' +
      String(Math.floor(performance.now() % 1000)).padStart(3, '0');

    // 3. Painel de Apoio à Decisão
    const analysis = this.model.getStatusDetails();

    this.dom.decisionCard.classList.remove('status-stable', 'status-transition', 'status-critical');
    this.dom.tempCurrent.classList.remove('text-stable', 'text-transition', 'text-critical', 'text-cold');
    this.dom.decisionIndicator.classList.remove('ind-stable', 'ind-transition', 'ind-critical');

    if (analysis.status === 'stable') {
      this.dom.decisionCard.classList.add('status-stable');
      this.dom.tempCurrent.classList.add('text-stable');
      this.dom.decisionIndicator.classList.add('ind-stable');
    } else if (analysis.status === 'transition') {
      this.dom.decisionCard.classList.add('status-transition');
      this.dom.tempCurrent.classList.add('text-transition');
      this.dom.decisionIndicator.classList.add('ind-transition');
    } else if (analysis.status === 'critical') {
      this.dom.decisionCard.classList.add('status-critical');
      this.dom.tempCurrent.classList.add('text-critical');
      this.dom.decisionIndicator.classList.add('ind-critical');
    } else { // Standby
      this.dom.tempCurrent.classList.add('text-cold');
      this.dom.decisionCard.classList.add('status-stable');
      this.dom.decisionIndicator.classList.add('ind-stable');
    }

    this.dom.decisionStatus.textContent = analysis.description;
    this.dom.decisionRisk.textContent   = analysis.risk;
    this.dom.decisionAction.textContent = analysis.action;

    // 4. Badge de Saúde inline no index (se existir)
    if (this.dom.healthBadge) {
      const h = this.healthEngine.result;
      this.dom.healthBadge.textContent  = h.index + '%';
      this.dom.healthBadge.className    = 'health-inline-badge ' + h.levelClass;
    }

    // 5. Badge de alertas inline no index (se existir)
    if (this.dom.alertsBadge) {
      const count = this.anomalyEngine.activeAlerts.length;
      this.dom.alertsBadge.textContent   = count;
      this.dom.alertsBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  }

  /**
   * Encerra o loop da aplicação
   */
  stop() {
    this.isRunning = false;
    if (this.view2d) {
      this.view2d.destroy();
    }
  }
}

// Expõe no escopo global para evitar imports do ES6 (CORS local)
window.DashboardController = DashboardController;
