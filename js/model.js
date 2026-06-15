/**
 * Model.js - Modelo Físico-Matemático do Gêmeo Digital
 * Contém a simulação termodinâmica do reator e o controlador PID.
 * Inclui persistência de estado via localStorage para manter dados entre páginas.
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

    // Estado do Sistema Geral
    this.masterPower = true; // Liga / Desliga Geral do Painel
    this.systemOn = true;    // Modo: true = PID Ativo, false = ECO/Standby

    // Sensores Térmicos e Estado Físico
    this.tempCurrent = 25.0;   // Temperatura física real
    this.tempLiquid = 25.0;    // Temperatura do Líquido (equivalente à física)
    this.tempSensor = 25.0;    // Temperatura do Líquido medida (com ruído)
    this.tempTarget = 70.0;    // Temperatura alvo (setpoint)
    
    this.actuatorPower = 0.0;  // Potência Aplicada (%)
    this.netPower = 0.0;       // Potência Líquida (Watts)
    
    this.isFailed = false;     // Falha térmica ativa
    this.healthIndex = 100;

    // Novos sensores e circuito compartilhado
    this.vibration = 0.5;      // Vibração estrutural (mm/s)
    this.pressure = 1.0;       // Pressão interna (bar)
    this.sharedCircuitState = 'INATIVO'; // 'AQUECIMENTO', 'RESFRIAMENTO', 'INATIVO'

    // Status detalhado dos sub-sensores
    this.sensorsImmersed = {
      t1: 'OK',    // Sensor Térmico Imerso Principal
      t2: 'OK',    // Sensor Térmico Imerso Reserva
      level: 'OK'  // Sensor de Nível
    };
    
    this.sensorsExternal = {
      tShell: 'OK',    // Temperatura do Casco
      vibration: 'OK', // Sensor de Vibração
      pressure: 'OK'   // Sensor de Pressão
    };

    // Histórico – buffer de ~5 minutos a ~5 updates/s = 1500 pontos
    this.history = [];
    this.maxHistoryLength = 1500;
  }

  /**
   * Atualiza o estado da simulação a cada passo de tempo (dt)
   * @param {number} dt - Intervalo de tempo decorrido em segundos
   */
  update(dt) {
    if (!this.masterPower) {
      // Sistema totalmente desligado / desenergizado
      this.actuatorPower = 0.0;
      this.netPower = -(this.tempCurrent - this.ambientTemp) * 4.0; // Perda de calor passiva
      const dT_loss = -this.heatLossCoeff * 1.5 * (this.tempCurrent - this.ambientTemp) * dt;
      this.tempCurrent += dT_loss;
      if (this.tempCurrent < this.ambientTemp) this.tempCurrent = this.ambientTemp;
      
      this.tempLiquid = this.tempCurrent;
      this.tempSensor = Math.max(0, this.tempLiquid + (Math.random() - 0.5) * 0.1);
      this.pressure = 1.0 + Math.max(0, (this.tempLiquid - 25.0) * 0.04) + (Math.random() - 0.5) * 0.02;
      this.vibration = 0.1 + (Math.random() * 0.1); // Vibração de repouso mínima
      this.sharedCircuitState = 'INATIVO';
      
      this.sensorsImmersed.t1 = 'INATIVO';
      this.sensorsImmersed.t2 = 'INATIVO';
      this.sensorsImmersed.level = 'INATIVO';
      this.sensorsExternal.tShell = 'INATIVO';
      this.sensorsExternal.vibration = 'INATIVO';
      this.sensorsExternal.pressure = 'INATIVO';
      
      this._updateHistory('OFF');
      return;
    }

    // Se o sistema está ligado, restabelece sensores
    this.sensorsImmersed.t1 = this.isFailed ? 'ANÔMALO' : (this.tempSensor > 120 ? 'SUSPEITO' : 'OK');
    this.sensorsImmersed.t2 = this.isFailed ? 'ANÔMALO' : 'OK';
    this.sensorsImmersed.level = 'OK';
    
    this.sensorsExternal.tShell = 'OK';
    this.sensorsExternal.vibration = this.vibration > 2.2 ? 'SUSPEITO' : 'OK';
    this.sensorsExternal.pressure = this.pressure > 7.0 ? 'SUSPEITO' : 'OK';

    if (this.isFailed) {
      this.actuatorPower = 100.0;
      this.sharedCircuitState = 'AQUECIMENTO';
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
      if (this.actuatorPower > 5.0) {
        dT_actuator = this.heatingEfficiency * (this.actuatorPower / 100.0) * dt;
        this.sharedCircuitState = 'AQUECIMENTO';
      } else if (this.actuatorPower < -5.0) {
        dT_actuator = this.coolingEfficiency * (this.actuatorPower / 100.0) * dt;
        this.sharedCircuitState = 'RESFRIAMENTO';
      } else {
        this.sharedCircuitState = 'INATIVO';
      }

      const dT_loss = -this.heatLossCoeff * (this.tempCurrent - this.ambientTemp) * dt;
      this.tempCurrent += (dT_actuator + dT_loss) * this.thermalInertia;

    } else {
      // Modo ECO / Standby (com master power ligado)
      this.actuatorPower = 0.0;
      this.sharedCircuitState = 'INATIVO';
      this.integralSum = 0;
      this.lastError = 0;
      const dT_loss = -this.heatLossCoeff * 1.5 * (this.tempCurrent - this.ambientTemp) * dt;
      this.tempCurrent += dT_loss;
      if (this.tempCurrent < this.ambientTemp) this.tempCurrent = this.ambientTemp;
    }

    this.tempLiquid = this.tempCurrent;

    // Ruído do sensor
    const sensorNoise = (Math.random() - 0.5) * 0.3;
    this.tempSensor = Math.max(0, this.tempLiquid + sensorNoise);

    // Pressão: aumenta com a temperatura (ideal gas relation approx)
    const basePressure = 1.0; // pressão atmosférica em bar
    const pressureIncrease = Math.max(0, (this.tempLiquid - this.ambientTemp) * 0.058);
    const pressureNoise = (Math.random() - 0.5) * 0.15;
    this.pressure = Math.max(0.2, basePressure + pressureIncrease + pressureNoise);

    // Vibração: maior sob alta potência do atuador e temperatura
    const baseVibration = 0.3;
    const powerVib = (Math.abs(this.actuatorPower) / 100.0) * 1.6;
    const tempVib = (this.tempLiquid / 150.0) * 0.5;
    const vibNoise = (Math.random() - 0.5) * 0.08;
    this.vibration = Math.max(0.05, baseVibration + powerVib + tempVib + vibNoise);

    // Potência Líquida: cálculo termodinâmico em Watts
    // Aquecimento fornece até 2200W elétricos, resfriamento retira até 1200W térmicos
    const lossWatts = (this.tempLiquid - this.ambientTemp) * 12.0; // 12W por grau acima do ambiente
    if (this.actuatorPower > 0) {
      this.netPower = (this.actuatorPower / 100.0) * 2200.0 * this.heatingEfficiency - lossWatts;
    } else if (this.actuatorPower < 0) {
      this.netPower = (this.actuatorPower / 100.0) * 1200.0 * this.coolingEfficiency - lossWatts;
    } else {
      this.netPower = -lossWatts;
    }

    // Estado operacional
    let operationalState = 'STABLE';
    if (this.isFailed) operationalState = 'FAILED';
    else if (!this.systemOn) operationalState = 'STANDBY';
    else if (Math.abs(this.tempSensor - this.tempTarget) > 10) operationalState = 'TRANSITION';

    this._updateHistory(operationalState);
  }

  _updateHistory(stateLabel) {
    this.history.push({
      time: Date.now(),
      temperature: this.tempSensor,
      target: this.tempTarget,
      power: this.actuatorPower,
      netPower: this.netPower,
      pressure: this.pressure,
      vibration: this.vibration,
      health: this.healthIndex,
      state: stateLabel
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
   * Persiste o estado atual no localStorage para restaurar ao trocar de página ou atualizar.
   * Salva os últimos 400 pontos do histórico (~80s de dados a 5 pts/s).
   */
  saveState() {
    try {
      const state = {
        tempCurrent:   this.tempCurrent,
        tempLiquid:    this.tempLiquid,
        tempSensor:    this.tempSensor,
        tempTarget:    this.tempTarget,
        actuatorPower: this.actuatorPower,
        netPower:      this.netPower,
        pressure:      this.pressure,
        vibration:     this.vibration,
        masterPower:   this.masterPower,
        systemOn:      this.systemOn,
        isFailed:      this.isFailed,
        healthIndex:   this.healthIndex,
        integralSum:   this.integralSum,
        lastError:     this.lastError,
        ambientTemp:   this.ambientTemp,
        Kp:            this.Kp,
        Ki:            this.Ki,
        Kd:            this.Kd,
        // Salva os últimos 400 pontos para a página de analytics ter contexto
        history:       this.history.slice(-400)
      };
      localStorage.setItem('gemDigitalState', JSON.stringify(state));
    } catch (e) {
      // Ignora erros de quota do storage
    }
  }

  /**
   * Restaura o estado salvo do localStorage.
   * @returns {boolean} true se restaurou com sucesso
   */
  loadState() {
    try {
      const raw = localStorage.getItem('gemDigitalState');
      if (!raw) return false;

      const state = JSON.parse(raw);
      this.tempCurrent   = state.tempCurrent   ?? 25.0;
      this.tempLiquid    = state.tempLiquid    ?? 25.0;
      this.tempSensor    = state.tempSensor    ?? 25.0;
      this.tempTarget    = state.tempTarget    ?? 70.0;
      this.actuatorPower = state.actuatorPower ?? 0.0;
      this.netPower      = state.netPower      ?? 0.0;
      this.pressure      = state.pressure      ?? 1.0;
      this.vibration     = state.vibration     ?? 0.5;
      this.masterPower   = state.masterPower   ?? true;
      this.systemOn      = state.systemOn      ?? true;
      this.isFailed      = state.isFailed      ?? false;
      this.healthIndex   = state.healthIndex   ?? 100;
      this.integralSum   = state.integralSum   ?? 0;
      this.lastError     = state.lastError     ?? 0;
      this.ambientTemp   = state.ambientTemp   ?? 25.0;
      
      this.Kp            = state.Kp            ?? 4.5;
      this.Ki            = state.Ki            ?? 0.04;
      this.Kd            = state.Kd            ?? 1.5;

      if (Array.isArray(state.history) && state.history.length > 0) {
        this.history = state.history;
      }

      console.log(`[Model] Estado restaurado via localStorage: Liq ${this.tempSensor.toFixed(1)}°C → alvo ${this.tempTarget}°C, ${this.history.length} pts de histórico`);
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
    if (!this.masterPower) {
      return {
        status: 'standby',
        description: 'PAINEL GERAL DESLIGADO',
        risk: 'NENHUM: O reator está totalmente desenergizado.',
        action: 'Clique em LIGAR REATOR para iniciar a alimentação elétrica.'
      };
    }

    if (this.isFailed) {
      return {
        status: 'critical',
        description: 'SCRAM AUTOMÁTICO / FALHA DE SUPERAQUECIMENTO',
        risk: 'ALTO: Risco de ebulição rápida, sobrepressão ou fadiga mecânica.',
        action: 'DESLIGUE O REATOR IMEDIATAMENTE PARA REDUZIR A POTÊNCIA!'
      };
    }

    if (!this.systemOn) {
      return {
        status: 'standby',
        description: 'SISTEMA EM MODO ECO / STANDBY',
        risk: 'NENHUM: O controle automático está suspenso e o líquido resfria passivamente.',
        action: 'Selecione MODO PID ATIVO para regular a temperatura do líquido.'
      };
    }

    const error = Math.abs(this.tempSensor - this.tempTarget);
    if (this.tempSensor > 115.0) {
      return {
        status: 'critical',
        description: 'TEMPERATURA DO LÍQUIDO CRÍTICA',
        risk: 'ALTO: Gradiente térmico perigoso e aumento rápido da pressão.',
        action: 'Reduza a temperatura alvo ou ative o modo standby.'
      };
    } else if (error > 10.0) {
      return {
        status: 'transition',
        description: 'TRANSIÇÃO / AQUECIMENTO ATIVO',
        risk: 'MÉDIO: Estabilizando o fluido de trabalho na temperatura alvo.',
        action: 'Aguarde o circuito de aquecimento/resfriamento atingir o setpoint.'
      };
    } else {
      return {
        status: 'stable',
        description: 'CONTROLE AUTOMÁTICO ESTÁVEL',
        risk: 'NENHUM: Temperatura e pressão estabilizadas na faixa de operação segura.',
        action: 'Operação normal. Nenhuma ação manual é necessária.'
      };
    }
  }
}

// Expõe no escopo global para evitar imports do ES6 (CORS local)
window.ThermalModel = ThermalModel;
