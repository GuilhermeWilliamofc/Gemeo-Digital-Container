/**
 * Anomaly.js – Anomaly Detection Engine do Gêmeo Digital
 * Aplica 4 regras determinísticas para detectar condições anômalas
 * em tempo real usando o buffer histórico do modelo.
 * Sem dependências externas.
 */

class AnomalyEngine {
  /**
   * @param {ThermalModel} model - Referência ao modelo térmico
   */
  constructor(model) {
    this.model = model;

    // Parâmetros de limiar configuráveis
    this.SAFE_TEMP_LIMIT    = 115.0;  // °C: limite de sobreaquecimento
    this.SENSOR_JUMP_LIMIT  = 5.0;   // °C: salto impossível num único passo
    this.OSC_WINDOW_S       = 10;    // segundos: janela de oscilação
    this.OSC_COUNT_LIMIT    = 5;     // mínimo de mudanças de sinal para considerar oscilação excessiva
    this.SAT_WINDOW_S       = 15;    // segundos: janela de saturação
    this.SAT_RATIO_LIMIT    = 0.85;  // 85% do tempo saturado → alerta

    // Histórico interno para detecção de sensor suspeito
    this._lastSensorTemp = null;

    // Lista de anomalias ativas no ciclo atual
    this.activeAlerts = [];
  }

  /**
   * Executa todas as regras de detecção.
   * @returns {Array} Lista de alertas ativos
   */
  update() {
    const model = this.model;
    const alerts = [];

    // --- Regra 1: Sobreaquecimento ---
    if (model.tempSensor > this.SAFE_TEMP_LIMIT) {
      alerts.push({
        id:          'overheat',
        severity:    'critical',
        icon:        'local_fire_department',
        title:       'Sobreaquecimento',
        description: `Temperatura ${model.tempSensor.toFixed(1)}°C acima do limite seguro de ${this.SAFE_TEMP_LIMIT}°C.`
      });
    }

    // --- Regra 2: Oscilação Excessiva do Atuador ---
    const oscBuffer = model.getRecentBuffer(this.OSC_WINDOW_S);
    if (oscBuffer.length >= 4) {
      let signChanges = 0;
      for (let i = 1; i < oscBuffer.length; i++) {
        const prev = oscBuffer[i - 1].power;
        const curr = oscBuffer[i].power;
        if (Math.sign(prev) !== Math.sign(curr) && Math.abs(curr - prev) > 10) {
          signChanges++;
        }
      }
      if (signChanges >= this.OSC_COUNT_LIMIT) {
        alerts.push({
          id:          'oscillation',
          severity:    'warning',
          icon:        'ssid_chart',
          title:       'Oscilação Excessiva',
          description: `${signChanges} inversões do atuador em ${this.OSC_WINDOW_S}s — possível instabilidade do controlador.`
        });
      }
    }

    // --- Regra 3: Sensor Suspeito (salto impossível) ---
    const currentTemp = model.tempSensor;
    if (this._lastSensorTemp !== null) {
      const jump = Math.abs(currentTemp - this._lastSensorTemp);
      if (jump > this.SENSOR_JUMP_LIMIT) {
        alerts.push({
          id:          'sensor',
          severity:    'warning',
          icon:        'sensors_off',
          title:       'Sensor Suspeito',
          description: `Salto de ${jump.toFixed(2)}°C em um único ciclo — excede variação física possível.`
        });
      }
    }
    this._lastSensorTemp = currentTemp;

    // --- Regra 4: Atuador Saturado ---
    const satBuffer = model.getRecentBuffer(this.SAT_WINDOW_S);
    if (satBuffer.length >= 5) {
      const saturated = satBuffer.filter(p => Math.abs(p.power) >= 98).length;
      const ratio     = saturated / satBuffer.length;
      if (ratio >= this.SAT_RATIO_LIMIT) {
        const direction = model.actuatorPower >= 0 ? 'máximo (aquecimento)' : 'mínimo (resfriamento)';
        alerts.push({
          id:          'saturation',
          severity:    'warning',
          icon:        'electric_bolt',
          title:       'Atuador Saturado',
          description: `Atuador em ${direction} por ${Math.round(ratio * 100)}% dos últimos ${this.SAT_WINDOW_S}s. Revise o setpoint.`
        });
      }
    }

    this.activeAlerts = alerts;
    return alerts;
  }
}

// Expõe no escopo global
window.AnomalyEngine = AnomalyEngine;
