/**
 * Model.js - Modelo Físico-Matemático do Gêmeo Digital
 * Contém a simulação termodinâmica do reator e o controlador PID.
 * Inclui persistência de estado via sessionStorage para manter dados entre páginas.
 */

class ThermalModel {
  constructor() {
    // Parâmetros Físicos
    this.ambientTemp = 25.0;
    this.thermalInertia = 0.15;
    this.heatLossCoeff = 0.02;
    this.heatingEfficiency = 0.8;
    this.coolingEfficiency = 0.5;

    // Parâmetros do Controlador PID
    this.Kp = 4.5;
    this.Ki = 0.04;
    this.Kd = 1.5;

    this.integralSum = 0;
    this.lastError = 0;

    // Estado do Sistema
    this.tempCurrent = 25.0;
    this.tempSensor = 25.0;
    this.tempTarget = 70.0;
    this.actuatorPower = 0.0;
    this.systemOn = true;
    this.isFailed = false;
    this.healthIndex = 100;

    // Histórico – buffer de ~5 minutos a ~5 updates/s = 1500 pontos
    this.history = [];
    this.maxHistoryLength = 1500;
  }

  /**
   * Atualiza o estado da simulação a cada passo de tempo (dt)
   * @param {number} dt - Intervalo de tempo decorrido em segundos
   */
  update(dt) {
    if (this.isFailed) {
      this.actuatorPower = 100.0;
      const dT_actuator = this.heatingEfficiency * 2.5 * dt;
      const dT_loss = -this.heatLossCoeff * (this.tempCurrent - this.ambientTemp) * dt;
      this.tempCurrent += (dT_actuator + dT_loss);
      if (this.tempCurrent > 185.0) this.tempCurrent = 185.0;

    } else if (this.systemOn) {
      const error = this.tempTarget - this.tempCurrent;

      this.integralSum += error * dt;
      this.integralSum = Math.max(-50, Math.min(50, this.integralSum));

      const derivative = (error - this.lastError) / dt;
      this.lastError = error;

      let controlSignal = (this.Kp * error) + (this.Ki * this.integralSum) + (this.Kd * derivative);
      this.actuatorPower = Math.max(-100, Math.min(100, controlSignal));

      let dT_actuator = 0;
      if (this.actuatorPower > 0) {
        dT_actuator = this.heatingEfficiency * (this.actuatorPower / 100.0) * dt;
      } else {
        dT_actuator = this.coolingEfficiency * (this.actuatorPower / 100.0) * dt;
      }

      const dT_loss = -this.heatLossCoeff * (this.tempCurrent - this.ambientTemp) * dt;
      this.tempCurrent += (dT_actuator + dT_loss) * this.thermalInertia;

    } else {
      this.actuatorPower = 0.0;
      this.integralSum = 0;
      this.lastError = 0;
      const dT_loss = -this.heatLossCoeff * 1.5 * (this.tempCurrent - this.ambientTemp) * dt;
      this.tempCurrent += dT_loss;
    }

    // Ruído do sensor
    const sensorNoise = (Math.random() - 0.5) * 0.3;
    this.tempSensor = Math.max(0, this.tempCurrent + sensorNoise);

    // Estado operacional
    let operationalState = 'STABLE';
    if (this.isFailed) operationalState = 'FAILED';
    else if (!this.systemOn) operationalState = 'STANDBY';
    else if (Math.abs(this.tempSensor - this.tempTarget) > 10) operationalState = 'TRANSITION';

    this.history.push({
      time: Date.now(),
      temperature: this.tempSensor,
      target: this.tempTarget,
      power: this.actuatorPower,
      health: this.healthIndex,
      state: operationalState
    });

    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }
  }

  /**
   * Retorna os pontos do histórico dentro dos últimos N segundos.
   * @param {number} seconds - Janela de tempo em segundos
   * @returns {Array}
   */
  getRecentBuffer(seconds) {
    const cutoff = Date.now() - seconds * 1000;
    return this.history.filter(p => p.time >= cutoff);
  }

  /**
   * Persiste o estado atual no sessionStorage para restaurar ao trocar de página.
   * Salva os últimos 400 pontos do histórico (~80s de dados a 5 pts/s).
   */
  saveState() {
    try {
      const state = {
        tempCurrent:  this.tempCurrent,
        tempSensor:   this.tempSensor,
        tempTarget:   this.tempTarget,
        actuatorPower: this.actuatorPower,
        systemOn:     this.systemOn,
        isFailed:     this.isFailed,
        healthIndex:  this.healthIndex,
        integralSum:  this.integralSum,
        lastError:    this.lastError,
        // Salva os últimos 400 pontos para a página de analytics ter contexto
        history:      this.history.slice(-400)
      };
      sessionStorage.setItem('gemDigitalState', JSON.stringify(state));
    } catch (e) {
      // Ignora erros de quota do storage
    }
  }

  /**
   * Restaura o estado salvo do sessionStorage.
   * @returns {boolean} true se restaurou com sucesso
   */
  loadState() {
    try {
      const raw = sessionStorage.getItem('gemDigitalState');
      if (!raw) return false;

      const state = JSON.parse(raw);
      this.tempCurrent   = state.tempCurrent   ?? 25.0;
      this.tempSensor    = state.tempSensor    ?? 25.0;
      this.tempTarget    = state.tempTarget    ?? 70.0;
      this.actuatorPower = state.actuatorPower ?? 0.0;
      this.systemOn      = state.systemOn      ?? true;
      this.isFailed      = state.isFailed      ?? false;
      this.healthIndex   = state.healthIndex   ?? 100;
      this.integralSum   = state.integralSum   ?? 0;
      this.lastError     = state.lastError     ?? 0;

      if (Array.isArray(state.history) && state.history.length > 0) {
        this.history = state.history;
      }

      console.log(`[Model] Estado restaurado: ${this.tempSensor.toFixed(1)}°C → alvo ${this.tempTarget}°C, ${this.history.length} pts de histórico`);
      return true;

    } catch (e) {
      console.warn('[Model] Falha ao restaurar estado:', e);
      return false;
    }
  }

  /**
   * Retorna o status de risco e saúde do sistema com base nas leituras
   */
  getStatusDetails() {
    if (this.isFailed) {
      return {
        status: 'critical',
        description: 'FALHA DE SUPERAQUECIMENTO',
        risk: 'ALTO: Risco de ruptura estrutural ou explosão do container.',
        action: 'ACIONAR DESLIGAMENTO DE EMERGÊNCIA IMEDIATAMENTE!'
      };
    }

    if (!this.systemOn) {
      return {
        status: 'standby',
        description: 'SISTEMA EM MODO STANDBY',
        risk: 'NENHUM: O reator está desligado e estabilizando termicamente.',
        action: 'Ligue o sistema se desejar iniciar o controle de temperatura.'
      };
    }

    const error = Math.abs(this.tempSensor - this.tempTarget);
    if (this.tempSensor > 115.0) {
      return {
        status: 'critical',
        description: 'TEMPERATURA ALTA PERIGOSA',
        risk: 'ALTO: Possível estresse térmico dos componentes do cilindro.',
        action: 'Reduza a temperatura alvo ou ative o desligamento.'
      };
    } else if (error > 10.0) {
      return {
        status: 'transition',
        description: 'TRANSIÇÃO RÁPIDA DE TEMPERATURA',
        risk: 'MÉDIO: Gradiente de temperatura alto no material do container.',
        action: 'Aguarde o controlador estabilizar o sistema térmico.'
      };
    } else {
      return {
        status: 'stable',
        description: 'OPERAÇÃO NOMINAL ESTÁVEL',
        risk: 'NENHUM: Temperatura controlada dentro da margem de segurança.',
        action: 'Nenhuma ação requerida. Continue monitorando.'
      };
    }
  }
}

// Expõe no escopo global para evitar imports do ES6 (CORS local)
window.ThermalModel = ThermalModel;
