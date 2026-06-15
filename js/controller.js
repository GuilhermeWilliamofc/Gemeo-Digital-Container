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
    
    // Controle do alarme sonoro
    this.audioCtx = null;
    this.isMuted = false;
    this.lastAlarmTime = 0;

    // Referências do DOM – Painel Principal e Sub-abas
    this.dom = {
      // Telemetria Principal
      tempCurrent:   document.getElementById('temp-liquid-val'), // Temperatura do Líquido
      tempAmbient:   document.getElementById('temp-ambient-val'), // Temperatura Ambiente
      tempTarget:    document.getElementById('temp-target'),
      actuatorPower: document.getElementById('actuator-power'), // Potência Aplicada
      netPower:      document.getElementById('net-power-val'),  // Potência Líquida
      pressure:      document.getElementById('pressure-val'),   // Pressão
      vibration:     document.getElementById('vibration-val'),  // Vibração
      sharedCircuit: document.getElementById('shared-circuit-val'), // Estado do Circuito
      
      // Barra de progresso da potência
      powerBar:      document.getElementById('power-bar-fill'),
      powerBarVal:   document.getElementById('power-bar-val'),
      tempSlider:    document.getElementById('temp-slider'),
      tempSliderVal: document.getElementById('temp-slider-val'),

      // Botões Principais de Controle
      masterPowerBtn: document.getElementById('master-power-btn'),
      modeEcoBtn:     document.getElementById('mode-eco-btn'),
      modePidBtn:     document.getElementById('mode-pid-btn'),
      failBtn:        document.getElementById('fail-btn'),
      
      // Cabeçalho e Meta-informações
      signal:    document.getElementById('signal'),
      timestamp: document.getElementById('timestamp'),

      // Painel de Decisão
      decisionCard:      document.getElementById('decision-card'),
      decisionStatus:    document.getElementById('decision-status'),
      decisionRisk:      document.getElementById('decision-risk'),
      decisionAction:    document.getElementById('decision-action'),
      decisionIndicator: document.getElementById('decision-indicator'),

      // Badges superiores
      healthBadge: document.getElementById('health-badge'),
      alertsBadge: document.getElementById('alerts-badge-main'),

      // Overlay visual de alarme
      alarmOverlay: document.getElementById('alarm-flashing-overlay'),
      scramBanner:  document.getElementById('scram-banner')
    };

    this.activeSubTab = 'overview';
  }

  /**
   * Inicializa as views, liga os event listeners e inicia o loop da aplicação
   */
  start() {
    // 1. Instancia as Views
    this.view3d = new window.ReactorView3D('viewer');

    // Tenta carregar o estado anterior persistido no localStorage
    const stateRestored = this.model.loadState();

    // Passa o PredictionEngine para o gráfico 2D habilitar a linha de projeção
    this.view2d = new window.TelemetryChartView2D(
      'telemetry-chart-container',
      this.model,
      this.predEngine
    );

    // 2. Registra os Listeners de Input e sub-abas
    this.setupSubTabs();
    this.bindEvents();

    // 3. Atualiza dados iniciais da UI
    this.updateUI(true);

    // 4. Inicia o loop principal
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  /**
   * Configura o sistema de navegação por abas na coluna esquerda (SPA)
   */
  setupSubTabs() {
    const tabButtons = document.querySelectorAll('.sub-tab-btn');
    const tabPanels  = document.querySelectorAll('.sub-tab-panel');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        this.activeSubTab = targetTab;

        // Atualiza botões
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Atualiza painéis
        tabPanels.forEach(p => {
          p.classList.remove('active');
          if (p.id === `panel-${targetTab}`) {
            p.classList.add('active');
          }
        });
      });
    });
  }

  /**
   * Vincula os eventos do usuário na interface aos métodos do modelo
   */
  bindEvents() {
    // Slider de Temperatura Alvo
    if (this.dom.tempSlider) {
      this.dom.tempSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.model.tempTarget = val;
        this.dom.tempSliderVal.textContent = val + '°C';
        this.dom.tempTarget.textContent    = val.toFixed(1) + ' °C';
      });
    }

    // Botão Master Power (Ligar / Desligar Reator)
    if (this.dom.masterPowerBtn) {
      this.dom.masterPowerBtn.addEventListener('click', () => {
        this.model.masterPower = !this.model.masterPower;
        
        // Se desligou o painel principal, limpa falhas térmicas
        if (!this.model.masterPower) {
          this.model.isFailed = false;
        }
        
        this.updateControlsUI();
      });
    }

    // Controle Segmentado: Botão ECO / Standby
    if (this.dom.modeEcoBtn) {
      this.dom.modeEcoBtn.addEventListener('click', () => {
        if (!this.model.masterPower) return; // Desabilitado se desligado
        this.model.systemOn = false;
        this.updateControlsUI();
      });
    }

    // Controle Segmentado: Botão AUTOMÁTICO (PID)
    if (this.dom.modePidBtn) {
      this.dom.modePidBtn.addEventListener('click', () => {
        if (!this.model.masterPower) return; // Desabilitado se desligado
        this.model.systemOn = true;
        this.updateControlsUI();
      });
    }

    // Botão de Simulação de Falha Crítica
    if (this.dom.failBtn) {
      this.dom.failBtn.addEventListener('click', () => {
        if (!this.model.masterPower) return; // Desabilitado se desligado
        this.model.isFailed = true;
        this.model.systemOn = true; // Força controle PID para disparar o superaquecimento
        this.updateControlsUI();
      });
    }

    // Event listener do Mute do Alarme
    const muteBtn = document.getElementById('mute-alarm-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        this.isMuted = !this.isMuted;
        muteBtn.innerHTML = this.isMuted ? 
          '<span class="material-icons-round">volume_off</span> Silenciado' : 
          '<span class="material-icons-round">volume_up</span> Silenciar';
        muteBtn.classList.toggle('btn-muted', this.isMuted);
      });
    }

    // Inputs de configuração de PID (Aba Configurações)
    const inputKp = document.getElementById('config-kp');
    const inputKi = document.getElementById('config-ki');
    const inputKd = document.getElementById('config-kd');
    const inputAmbient = document.getElementById('config-ambient');

    if (inputKp) {
      inputKp.addEventListener('change', (e) => {
        this.model.Kp = parseFloat(e.target.value) || 4.5;
      });
    }
    if (inputKi) {
      inputKi.addEventListener('change', (e) => {
        this.model.Ki = parseFloat(e.target.value) || 0.04;
      });
    }
    if (inputKd) {
      inputKd.addEventListener('change', (e) => {
        this.model.Kd = parseFloat(e.target.value) || 1.5;
      });
    }
    if (inputAmbient) {
      inputAmbient.addEventListener('change', (e) => {
        this.model.ambientTemp = parseFloat(e.target.value) || 25.0;
      });
    }
  }

  /**
   * Mantém botões de controle e estado do painel sincronizados
   */
  updateControlsUI() {
    const isMasterOn = this.model.masterPower;
    
    // Botão Master Liga/Desliga
    if (this.dom.masterPowerBtn) {
      if (isMasterOn) {
        this.dom.masterPowerBtn.textContent = 'DESLIGAR REATOR';
        this.dom.masterPowerBtn.className = 'btn btn-master-power btn-power-on';
      } else {
        this.dom.masterPowerBtn.textContent = 'LIGAR REATOR';
        this.dom.masterPowerBtn.className = 'btn btn-master-power btn-power-off';
      }
    }

    // Modos segmentados
    if (this.dom.modeEcoBtn && this.dom.modePidBtn) {
      if (!isMasterOn) {
        this.dom.modeEcoBtn.disabled = true;
        this.dom.modePidBtn.disabled = true;
        this.dom.modeEcoBtn.classList.remove('active');
        this.dom.modePidBtn.classList.remove('active');
      } else {
        this.dom.modeEcoBtn.disabled = false;
        this.dom.modePidBtn.disabled = false;
        
        if (this.model.systemOn) {
          this.dom.modeEcoBtn.classList.remove('active');
          this.dom.modePidBtn.classList.add('active');
        } else {
          this.dom.modeEcoBtn.classList.add('active');
          this.dom.modePidBtn.classList.remove('active');
        }
      }
    }

    // Botão de Falha
    if (this.dom.failBtn) {
      this.dom.failBtn.disabled = !isMasterOn;
    }
  }

  /**
   * Emite um som de bipe periódico para indicar condição crítica
   */
  playAlarmBeep() {
    if (this.isMuted) return;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(920, this.audioCtx.currentTime); // Tom agudo penetrante
      
      gain.gain.setValueAtTime(0.06, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.25);
      
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.25);
    } catch (e) {
      console.warn("Áudio não pôde ser reproduzido devido a interações do browser", e);
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

    // 1. Segurança Ativa (SCRAM Automático) caso temperatura do líquido ultrapasse 140°C
    if (this.model.masterPower && this.model.tempSensor > 140.0 && !this.model.isFailed) {
      // Dispara o SCRAM automático (modo de proteção)
      this.model.isFailed = true;
      this.model.systemOn = true; // No modelo, falha térmica força aquecimento total, simulando vazamento/runaway
      console.warn("[SCRAM] Temperatura ultrapassou 140°C! Desligamento térmico automático de segurança acionado!");
      this.updateControlsUI();
    }

    // 2. Atualiza a física da simulação (Model)
    this.model.update(dt);

    // 3. Executa os engines de análise
    this.predEngine.update();
    this.healthEngine.update();
    this.anomalyEngine.update();

    // Grava health no modelo para persistir no histórico
    this.model.healthIndex = this.healthEngine.result.index;

    // 4. Atualiza a renderização 3D
    this.view3d.update(this.model.tempSensor, this.model.actuatorPower, dt);

    // 5. Orquestra a sinalização de alertas (Visual & Sonora)
    const hasCritical = this.anomalyEngine.activeAlerts.some(a => a.severity === 'critical');
    
    // Alarme Visual (Overlay piscante)
    if (this.dom.alarmOverlay) {
      this.dom.alarmOverlay.style.display = (this.model.masterPower && hasCritical) ? 'block' : 'none';
    }

    // SCRAM Banner
    if (this.dom.scramBanner) {
      this.dom.scramBanner.style.display = (this.model.masterPower && this.model.isFailed) ? 'flex' : 'none';
    }

    // Alarme Sonoro periódico (A cada 1.2s)
    if (this.model.masterPower && hasCritical) {
      if (currentTime - this.lastAlarmTime > 1200) {
        this.playAlarmBeep();
        this.lastAlarmTime = currentTime;
      }
    }

    // 6. Atualiza UI textual, KPIs, cards de sensores e sub-abas
    this.updateUI(false);

    // 7. Persiste estado no localStorage (throttle: 1 save/segundo)
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
    const model = this.model;

    // Atualização de Controles estáticos na primeira renderização ou se forçada
    if (force) {
      this.updateControlsUI();
      if (this.dom.tempSlider) {
        this.dom.tempSlider.value          = model.tempTarget;
        this.dom.tempSliderVal.textContent = model.tempTarget + '°C';
      }
      this.dom.tempTarget.textContent = model.tempTarget.toFixed(1) + ' °C';

      // Sincroniza inputs da aba de Configurações
      const inputKp = document.getElementById('config-kp');
      const inputKi = document.getElementById('config-ki');
      const inputKd = document.getElementById('config-kd');
      const inputAmbient = document.getElementById('config-ambient');
      
      if (inputKp) inputKp.value = model.Kp;
      if (inputKi) inputKi.value = model.Ki;
      if (inputKd) inputKd.value = model.Kd;
      if (inputAmbient) inputAmbient.value = model.ambientTemp;
    }

    // Se o painel geral estiver desenergizado, exibe dados nulos/mudos
    if (!model.masterPower) {
      this.dom.tempCurrent.textContent = 'INATIVO';
      this.dom.tempAmbient.textContent = model.ambientTemp.toFixed(1) + ' °C';
      this.dom.actuatorPower.textContent = '0 %';
      this.dom.netPower.textContent = '0 W';
      this.dom.pressure.textContent = '0.00 bar';
      this.dom.vibration.textContent = '0.00 mm/s';
      this.dom.sharedCircuit.textContent = 'INATIVO';
      this.dom.sharedCircuit.className = 'circuit-badge badge-inactive';
      
      if (this.dom.powerBar) this.dom.powerBar.style.width = '0%';
      if (this.dom.powerBarVal) this.dom.powerBarVal.textContent = 'DESLIGADO';

      if (this.dom.healthBadge) {
        this.dom.healthBadge.textContent = '--';
        this.dom.healthBadge.className = 'health-inline-badge health-critical';
      }
      if (this.dom.alertsBadge) this.dom.alertsBadge.style.display = 'none';

      // Zera dados do painel de decisão
      this.dom.decisionStatus.textContent = 'Painel geral desenergizado.';
      this.dom.decisionRisk.textContent   = 'Nenhum monitoramento ativo.';
      this.dom.decisionAction.textContent = 'Ligue o reator para restabelecer a energia.';
      this.dom.decisionCard.className     = 'dashboard-card decision-card';
      this.dom.decisionIndicator.className = 'status-header-indicator';
      
      this._updateSensorsTabUI();
      this._updateAlertsTabUI();
      this._updateRealtimeTabUI();
      return;
    }

    // 1. Valores Básicos da Telemetria (Ativo)
    this.dom.tempCurrent.textContent = model.tempSensor.toFixed(1) + ' °C';
    this.dom.tempAmbient.textContent = model.ambientTemp.toFixed(1) + ' °C';
    this.dom.tempTarget.textContent  = model.tempTarget.toFixed(1) + ' °C';
    
    // Potências
    const power = model.actuatorPower;
    this.dom.actuatorPower.textContent = (power > 0 ? '+' : '') + power.toFixed(0) + ' %';
    this.dom.netPower.textContent = (model.netPower >= 0 ? '+' : '') + model.netPower.toFixed(0) + ' W';

    // Sensores físicos adicionais
    this.dom.pressure.textContent = model.pressure.toFixed(2) + ' bar';
    this.dom.vibration.textContent = model.vibration.toFixed(2) + ' mm/s';

    // Estado do circuito compartilhado
    this.dom.sharedCircuit.textContent = model.sharedCircuitState;
    if (model.sharedCircuitState === 'AQUECIMENTO') {
      this.dom.sharedCircuit.className = 'circuit-badge badge-heating';
    } else if (model.sharedCircuitState === 'RESFRIAMENTO') {
      this.dom.sharedCircuit.className = 'circuit-badge badge-cooling';
    } else {
      this.dom.sharedCircuit.className = 'circuit-badge badge-inactive';
    }

    // Barra de preenchimento da potência (Atuador)
    const barFill = this.dom.powerBar;
    const barVal  = this.dom.powerBarVal;

    if (barFill && barVal) {
      if (power >= 5.0) {
        barFill.style.width      = power + '%';
        barFill.style.left       = '0%';
        barFill.style.background = 'linear-gradient(90deg, #F59E0B, #EF4444)';
        barVal.textContent       = 'AQUECENDO';
      } else if (power <= -5.0) {
        const coolingPct         = Math.abs(power);
        barFill.style.width      = coolingPct + '%';
        barFill.style.left       = '0%';
        barFill.style.background = 'linear-gradient(90deg, #3B82F6, #1D4ED8)';
        barVal.textContent       = 'RESFRIANDO';
      } else {
        barFill.style.width  = '0%';
        barVal.textContent   = 'INATIVO';
      }
    }

    // 2. Meta-informações de sinal e timestamp
    const signalQuality = 100 - (Math.random() > 0.95 ? (Math.random() * 0.8) : 0);
    if (this.dom.signal) this.dom.signal.textContent = signalQuality.toFixed(1) + '% Estável';
    if (this.dom.timestamp) {
      this.dom.timestamp.textContent = new Date().toLocaleTimeString() + '.' +
        String(Math.floor(performance.now() % 1000)).padStart(3, '0');
    }

    // 3. Painel de Apoio à Decisão (UX)
    const analysis = model.getStatusDetails();

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

    // 4. Badge de Saúde inline no index
    if (this.dom.healthBadge) {
      const h = this.healthEngine.result;
      this.dom.healthBadge.textContent  = h.index + '%';
      this.dom.healthBadge.className    = 'health-inline-badge ' + h.levelClass;
    }

    // 5. Badge de alertas inline no index
    const count = this.anomalyEngine.activeAlerts.length;
    if (this.dom.alertsBadge) {
      this.dom.alertsBadge.textContent   = count;
      this.dom.alertsBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }

    // 6. Atualização condicional das sub-abas dependendo de qual estiver ativa
    if (this.activeSubTab === 'sensors') {
      this._updateSensorsTabUI();
    } else if (this.activeSubTab === 'alerts') {
      this._updateAlertsTabUI();
    } else if (this.activeSubTab === 'realtime') {
      this._updateRealtimeTabUI();
    }
  }

  /**
   * Atualiza as informações da sub-aba de Sensores
   */
  _updateSensorsTabUI() {
    const model = this.model;
    
    // Sensores Imersos
    const sImmersedT1Val = document.getElementById('sensor-immersed-t1-val');
    const sImmersedT1Status = document.getElementById('sensor-immersed-t1-status');
    const sImmersedT2Val = document.getElementById('sensor-immersed-t2-val');
    const sImmersedT2Status = document.getElementById('sensor-immersed-t2-status');
    const sImmersedLvlVal = document.getElementById('sensor-immersed-level-val');
    const sImmersedLvlStatus = document.getElementById('sensor-immersed-level-status');

    // Sensores Externos
    const sExtShellVal = document.getElementById('sensor-ext-shell-val');
    const sExtShellStatus = document.getElementById('sensor-ext-shell-status');
    const sExtVibVal = document.getElementById('sensor-ext-vibration-val');
    const sExtVibStatus = document.getElementById('sensor-ext-vibration-status');
    const sExtPresVal = document.getElementById('sensor-ext-pressure-val');
    const sExtPresStatus = document.getElementById('sensor-ext-pressure-status');

    if (!model.masterPower) {
      // Quando inativo
      const clearSensor = (valEl, statusEl) => {
        if (valEl) valEl.textContent = '--';
        if (statusEl) {
          statusEl.textContent = 'INATIVO';
          statusEl.className = 'status-indicator status-off';
        }
      };
      clearSensor(sImmersedT1Val, sImmersedT1Status);
      clearSensor(sImmersedT2Val, sImmersedT2Status);
      clearSensor(sImmersedLvlVal, sImmersedLvlStatus);
      clearSensor(sExtShellVal, sExtShellStatus);
      clearSensor(sExtVibVal, sExtVibStatus);
      clearSensor(sExtPresVal, sExtPresStatus);
      return;
    }

    // Caso contrário, atualiza com dados reais do modelo
    const updateSensor = (valEl, statusEl, valueStr, statusStr) => {
      if (valEl) valEl.textContent = valueStr;
      if (statusEl) {
        statusEl.textContent = statusStr;
        statusEl.className = 'status-indicator ' + 
          (statusStr === 'OK' ? 'status-ok' : statusStr === 'SUSPEITO' ? 'status-warning' : 'status-failed');
      }
    };

    // Sensor T1 imerso exibe a leitura do sensor térmico (ruído incluído)
    updateSensor(sImmersedT1Val, sImmersedT1Status, model.tempSensor.toFixed(1) + ' °C', model.sensorsImmersed.t1);
    // Sensor T2 imerso (reserva, leve variação de leitura)
    const t2Reading = Math.max(0, model.tempLiquid + (Math.random() - 0.5) * 0.25);
    updateSensor(sImmersedT2Val, sImmersedT2Status, t2Reading.toFixed(1) + ' °C', model.sensorsImmersed.t2);
    // Sensor de Nível
    updateSensor(sImmersedLvlVal, sImmersedLvlStatus, '98.4 % (Estável)', model.sensorsImmersed.level);

    // Sensor de Temperatura do Casco (geralmente mais frio que o líquido interno)
    const shellReading = model.ambientTemp + (model.tempLiquid - model.ambientTemp) * 0.45;
    updateSensor(sExtShellVal, sExtShellStatus, shellReading.toFixed(1) + ' °C', model.sensorsExternal.tShell);
    // Sensor de Vibração
    updateSensor(sExtVibVal, sExtVibStatus, model.vibration.toFixed(2) + ' mm/s', model.sensorsExternal.vibration);
    // Sensor de Pressão
    updateSensor(sExtPresVal, sExtPresStatus, model.pressure.toFixed(2) + ' bar', model.sensorsExternal.pressure);
  }

  /**
   * Atualiza as informações da sub-aba de Alertas
   */
  _updateAlertsTabUI() {
    const listContainer = document.getElementById('panel-alerts-list');
    if (!listContainer) return;

    const alerts = this.anomalyEngine.activeAlerts;

    if (!this.model.masterPower) {
      listContainer.innerHTML = `
        <div class="no-alerts-msg">
          <span class="material-icons-round">power_off</span>
          <span>Reator desenergizado - Sem monitoramento de anomalias</span>
        </div>
      `;
      return;
    }

    if (alerts.length === 0) {
      listContainer.innerHTML = `
        <div class="no-alerts-msg">
          <span class="material-icons-round">check_circle</span>
          <span>Nenhuma anomalia ativa detectada</span>
        </div>
      `;
      return;
    }

    let html = '';
    for (const alert of alerts) {
      html += `
        <div class="anomaly-alert alert-${alert.severity}">
          <div class="alert-icon-wrap severity-${alert.severity}">
            <span class="material-icons-round">${alert.icon}</span>
          </div>
          <div class="alert-content">
            <div class="alert-title">${alert.title}</div>
            <div class="alert-desc">${alert.description}</div>
          </div>
          <div class="alert-severity-badge severity-${alert.severity}">
            ${alert.severity === 'critical' ? 'CRÍTICO' : 'ATENÇÃO'}
          </div>
        </div>
      `;
    }
    listContainer.innerHTML = html;
  }

  /**
   * Atualiza a tabela histórica da sub-aba de Dados em Tempo Real
   */
  _updateRealtimeTabUI() {
    const tableBody = document.getElementById('realtime-data-table-body');
    if (!tableBody) return;

    const history = this.model.history;
    if (!history || history.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Aguardando telemetria...</td></tr>`;
      return;
    }

    // Pega as 8 últimas amostras (de trás pra frente)
    const recentData = history.slice(-8).reverse();
    let html = '';
    
    for (const row of recentData) {
      const timeStr = new Date(row.time).toLocaleTimeString() + '.' +
        String(row.time % 1000).padStart(3, '0');
      
      const pwr = row.power;
      const powerStr = (pwr > 0 ? '+' : '') + pwr.toFixed(0) + '%';
      const netPowerStr = (row.netPower >= 0 ? '+' : '') + row.netPower.toFixed(0) + ' W';
      const stateClass = row.state === 'FAILED' ? 'text-critical' : row.state === 'TRANSITION' ? 'text-transition' : row.state === 'STANDBY' ? 'text-cold' : 'text-stable';

      html += `
        <tr>
          <td style="font-family: var(--font-mono);">${timeStr}</td>
          <td>${row.temperature.toFixed(1)} °C</td>
          <td>${row.pressure.toFixed(2)} bar</td>
          <td>${row.vibration.toFixed(2)} mm/s</td>
          <td>${powerStr}</td>
          <td>${netPowerStr}</td>
          <td class="${stateClass}" style="font-weight: 600;">${row.state}</td>
        </tr>
      `;
    }
    tableBody.innerHTML = html;
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
