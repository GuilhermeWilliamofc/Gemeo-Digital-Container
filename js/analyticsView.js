/**
 * AnalyticsView.js – UI Layer da Página de Analytics do Gêmeo Digital
 * Renderiza previsões, saúde do sistema, alertas de anomalias e histórico compacto.
 */

class AnalyticsView {
  /**
   * @param {ThermalModel}    model
   * @param {PredictionEngine} predEngine
   * @param {HealthEngine}     healthEngine
   * @param {AnomalyEngine}    anomalyEngine
   */
  constructor(model, predEngine, healthEngine, anomalyEngine) {
    this.model         = model;
    this.predEngine    = predEngine;
    this.healthEngine  = healthEngine;
    this.anomalyEngine = anomalyEngine;

    // Cache de elementos DOM
    this.dom = {
      // Previsão
      tempNow:    document.getElementById('anl-temp-now'),
      temp10:     document.getElementById('anl-temp-10'),
      temp30:     document.getElementById('anl-temp-30'),
      temp60:     document.getElementById('anl-temp-60'),
      trendIcon:  document.getElementById('anl-trend-icon'),
      trendLabel: document.getElementById('anl-trend-label'),
      slopeVal:   document.getElementById('anl-slope-val'),
      r2Val:      document.getElementById('anl-r2-val'),

      // Saúde
      healthArc:         document.getElementById('health-arc'),
      healthVal:         document.getElementById('health-val'),
      healthLabel:       document.getElementById('health-label'),
      healthStability:   document.getElementById('hf-stability'),
      healthSetpoint:    document.getElementById('hf-setpoint'),
      healthSaturation:  document.getElementById('hf-saturation'),
      healthOscillation: document.getElementById('hf-oscillation'),
      hbarStability:     document.getElementById('hbar-stability'),
      hbarSetpoint:      document.getElementById('hbar-setpoint'),
      hbarSaturation:    document.getElementById('hbar-saturation'),
      hbarOscillation:   document.getElementById('hbar-oscillation'),

      // Anomalias
      alertsList:    document.getElementById('alerts-list'),
      alertsCount:   document.getElementById('alerts-count'),
      alertsBadge:   document.getElementById('alerts-badge'),
      noAlertsMsg:   document.getElementById('no-alerts-msg'),

      // Metadados do cabeçalho (espelhados da index)
      signal:    document.getElementById('signal'),
      timestamp: document.getElementById('timestamp'),
    };
  }

  /**
   * Atualiza toda a UI de Analytics.
   * Chamado a cada ciclo do controller.
   */
  update() {
    this._updatePrediction();
    this._updateHealth();
    this._updateAnomalies();
    this._updateMeta();
  }

  // ─────────────────────────────────────────
  //  Previsão Térmica
  // ─────────────────────────────────────────
  _updatePrediction() {
    const pred    = this.predEngine.result;
    const current = this.model.tempSensor;

    // KPI: Temperatura Atual
    if (this.dom.tempNow) {
      this.dom.tempNow.textContent = current.toFixed(1) + ' °C';
      this.dom.tempNow.className   = 'forecast-kpi-value ' + this._tempClass(current);
    }

    // KPIs de Previsão
    const forecasts = [
      { el: this.dom.temp10, val: pred.t10s, delta: pred.t10s - current },
      { el: this.dom.temp30, val: pred.t30s, delta: pred.t30s - current },
      { el: this.dom.temp60, val: pred.t60s, delta: pred.t60s - current },
    ];

    for (const fc of forecasts) {
      if (!fc.el || fc.val === null) continue;

      // Valor
      const valueEl = fc.el.querySelector('.forecast-kpi-value');
      if (valueEl) {
        valueEl.textContent = fc.val.toFixed(1) + ' °C';
        valueEl.className   = 'forecast-kpi-value ' + this._tempClass(fc.val);
      }

      // Delta (tendência)
      const deltaEl = fc.el.querySelector('.forecast-delta');
      if (deltaEl) {
        const sign  = fc.delta > 0 ? '+' : '';
        deltaEl.textContent  = sign + fc.delta.toFixed(1) + '°';
        deltaEl.className    = 'forecast-delta ' + (fc.delta > 0.5 ? 'delta-up' : fc.delta < -0.5 ? 'delta-down' : 'delta-flat');
      }
    }

    // Ícone e label de tendência
    const trendMap = {
      heating: { icon: 'trending_up',   label: 'Aquecendo',  cls: 'trend-heating' },
      cooling: { icon: 'trending_down', label: 'Resfriando', cls: 'trend-cooling' },
      stable:  { icon: 'trending_flat', label: 'Estável',    cls: 'trend-stable'  },
    };
    const t = trendMap[pred.trend] || trendMap.stable;

    if (this.dom.trendIcon)  { this.dom.trendIcon.textContent = t.icon; this.dom.trendIcon.className = 'material-icons-round trend-icon ' + t.cls; }
    if (this.dom.trendLabel) { this.dom.trendLabel.textContent = t.label; this.dom.trendLabel.className = 'trend-label ' + t.cls; }
    if (this.dom.slopeVal)   this.dom.slopeVal.textContent  = (pred.slope >= 0 ? '+' : '') + pred.slope.toFixed(3) + ' °C/s';
    if (this.dom.r2Val)      this.dom.r2Val.textContent     = (pred.r2 * 100).toFixed(1) + '%';
  }

  // ─────────────────────────────────────────
  //  Saúde do Sistema
  // ─────────────────────────────────────────
  _updateHealth() {
    const h = this.healthEngine.result;

    // Arco SVG (stroke-dashoffset para círculo de progresso)
    if (this.dom.healthArc) {
      // Circumference = 2 * π * r = 2 * 3.14159 * 54 ≈ 339.3
      const circ   = 339.3;
      const offset = circ * (1 - h.index / 100);
      this.dom.healthArc.style.strokeDashoffset = offset;
      this.dom.healthArc.style.stroke = this._healthColor(h.index);
    }

    if (this.dom.healthVal) {
      this.dom.healthVal.textContent = h.index + '%';
      this.dom.healthVal.className   = 'health-percent ' + h.levelClass;
    }
    if (this.dom.healthLabel) {
      this.dom.healthLabel.textContent = h.label;
      this.dom.healthLabel.className   = 'health-classification ' + h.levelClass;
    }

    // Barras dos 4 fatores
    const factors = [
      { barEl: this.dom.hbarStability,   valEl: this.dom.healthStability,   val: h.factors.stability,   label: 'Estabilidade' },
      { barEl: this.dom.hbarSetpoint,    valEl: this.dom.healthSetpoint,    val: h.factors.setpoint,    label: 'Setpoint'     },
      { barEl: this.dom.hbarSaturation,  valEl: this.dom.healthSaturation,  val: h.factors.saturation,  label: 'Saturação'    },
      { barEl: this.dom.hbarOscillation, valEl: this.dom.healthOscillation, val: h.factors.oscillation, label: 'Oscilação'    },
    ];

    for (const f of factors) {
      if (f.barEl) {
        f.barEl.style.width      = f.val + '%';
        f.barEl.style.background = this._healthColor(f.val);
      }
      if (f.valEl) f.valEl.textContent = f.val + '%';
    }
  }

  // ─────────────────────────────────────────
  //  Alertas de Anomalias
  // ─────────────────────────────────────────
  _updateAnomalies() {
    const alerts = this.anomalyEngine.activeAlerts;

    if (this.dom.alertsCount) this.dom.alertsCount.textContent = alerts.length;

    if (this.dom.alertsBadge) {
      this.dom.alertsBadge.textContent = alerts.length > 0 ? alerts.length : '';
      this.dom.alertsBadge.style.display = alerts.length > 0 ? 'flex' : 'none';
      // Muda cor do badge se houver crítico
      const hasCritical = alerts.some(a => a.severity === 'critical');
      this.dom.alertsBadge.className = 'alerts-badge ' + (hasCritical ? 'badge-critical' : 'badge-warning');
    }

    if (!this.dom.alertsList) return;

    // Mantém alertas existentes por ID para animação suave (não recria tudo)
    const existingIds = new Set([...this.dom.alertsList.querySelectorAll('[data-alert-id]')]
      .map(el => el.dataset.alertId));
    const newIds      = new Set(alerts.map(a => a.id));

    // Remove alertas que saíram
    for (const el of this.dom.alertsList.querySelectorAll('[data-alert-id]')) {
      if (!newIds.has(el.dataset.alertId)) {
        el.classList.add('alert-exit');
        setTimeout(() => el.remove(), 300);
      }
    }

    // Adiciona novos alertas
    for (const alert of alerts) {
      if (existingIds.has(alert.id)) continue; // Já existe, não recria

      const el = document.createElement('div');
      el.dataset.alertId = alert.id;
      el.className       = `anomaly-alert alert-${alert.severity} alert-enter`;

      el.innerHTML = `
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
      `;

      this.dom.alertsList.prepend(el);
      // Dispara animação de entrada
      requestAnimationFrame(() => el.classList.remove('alert-enter'));
    }

    // Mostra/esconde mensagem "sem alertas"
    if (this.dom.noAlertsMsg) {
      this.dom.noAlertsMsg.style.display = alerts.length === 0 ? 'flex' : 'none';
    }
  }

  // ─────────────────────────────────────────
  //  Metadados do Cabeçalho
  // ─────────────────────────────────────────
  _updateMeta() {
    if (this.dom.signal) {
      const quality = 100 - (Math.random() > 0.95 ? (Math.random() * 0.8) : 0);
      this.dom.signal.textContent = quality.toFixed(1) + '% Estável';
    }
    if (this.dom.timestamp) {
      this.dom.timestamp.textContent = new Date().toLocaleTimeString() + '.' +
        String(Math.floor(performance.now() % 1000)).padStart(3, '0');
    }
  }

  // ─────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────
  _tempClass(temp) {
    if (temp > 115) return 'kpi-critical';
    if (temp > 80)  return 'kpi-transition';
    if (temp < 20)  return 'kpi-cold';
    return 'kpi-stable';
  }

  _healthColor(val) {
    if (val >= 90) return '#10B981';        // Verde
    if (val >= 70) return '#3B82F6';        // Azul
    if (val >= 50) return '#F59E0B';        // Amarelo
    return '#EF4444';                        // Vermelho
  }
}

// Expõe no escopo global
window.AnalyticsView = AnalyticsView;
