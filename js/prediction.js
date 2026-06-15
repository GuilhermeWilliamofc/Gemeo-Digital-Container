/**
 * Prediction.js – Prediction Engine do Gêmeo Digital
 * Calcula previsões de temperatura futura usando regressão linear simples,
 * média móvel exponencial e extrapolação de tendência.
 * Sem dependências externas de Machine Learning.
 */

class PredictionEngine {
  /**
   * @param {ThermalModel} model - Referência ao modelo térmico
   */
  constructor(model) {
    this.model = model;

    // Resultado mais recente do motor de previsão
    this.result = {
      t10s:  null,
      t30s:  null,
      t60s:  null,
      slope: 0,       // Tendência em °C/s (positivo = aquecendo, negativo = resfriando)
      r2:    0,       // Coeficiente de determinação (qualidade do ajuste 0–1)
      trend: 'stable' // 'heating' | 'cooling' | 'stable'
    };
  }

  /**
   * Executa o pipeline de previsão com os dados recentes.
   * Deve ser chamado a cada ciclo do controller.
   */
  update() {
    // Usa uma janela de 30 segundos de histórico recente para a regressão
    const buffer = this.model.getRecentBuffer(30);

    if (buffer.length < 5) {
      // Dados insuficientes: retorna a temperatura atual sem projeção
      const current = this.model.tempSensor;
      this.result = { t10s: current, t30s: current, t60s: current, slope: 0, r2: 0, trend: 'stable' };
      return this.result;
    }

    // --- 1. Regressão Linear Simples (Mínimos Quadrados) ---
    // Eixo X = segundos desde o primeiro ponto; Eixo Y = temperatura
    const t0 = buffer[0].time;
    const n  = buffer.length;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const pt of buffer) {
      const x = (pt.time - t0) / 1000; // em segundos
      const y = pt.temperature;
      sumX  += x;
      sumY  += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = (n * sumX2 - sumX * sumX);
    let slope     = 0;
    let intercept = 0;

    if (Math.abs(denominator) > 1e-9) {
      slope     = (n * sumXY - sumX * sumY) / denominator;  // °C/s
      intercept = (sumY - slope * sumX) / n;
    }

    // --- 2. R² (Coeficiente de Determinação) ---
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (const pt of buffer) {
      const x    = (pt.time - t0) / 1000;
      const yHat = slope * x + intercept;
      ssTot += (pt.temperature - meanY) ** 2;
      ssRes += (pt.temperature - yHat)  ** 2;
    }
    const r2 = ssTot > 1e-9 ? Math.max(0, 1 - ssRes / ssTot) : 1;

    // --- 3. Média Móvel Exponencial (EMA) dos últimos 10 pontos para suavizar a base ---
    const emaWindow = buffer.slice(-10);
    const alpha = 0.3; // fator de suavização
    let ema = emaWindow[0].temperature;
    for (let i = 1; i < emaWindow.length; i++) {
      ema = alpha * emaWindow[i].temperature + (1 - alpha) * ema;
    }

    // --- 4. Extrapolação com blend entre regressão linear e EMA ---
    // Usa R² como peso: quanto melhor o ajuste, mais confiamos na regressão linear
    const blendWeight = r2; // 0 = só EMA, 1 = só regressão
    const tNow = (buffer[buffer.length - 1].time - t0) / 1000;

    const predict = (deltaT) => {
      const linPred = slope * (tNow + deltaT) + intercept;
      const emaPred = ema + slope * deltaT; // EMA + tendência
      const raw = blendWeight * linPred + (1 - blendWeight) * emaPred;
      // Limita fisicamente entre 0°C e 185°C (limites do modelo)
      return Math.max(0, Math.min(185, raw));
    };

    // --- 5. Determina a tendência qualitativa ---
    let trend = 'stable';
    if (slope > 0.05)       trend = 'heating';
    else if (slope < -0.05) trend = 'cooling';

    this.result = {
      t10s:  predict(10),
      t30s:  predict(30),
      t60s:  predict(60),
      slope: slope,
      r2:    r2,
      trend: trend
    };

    return this.result;
  }

  /**
   * Retorna pontos XY normalizados [0–1] para plotagem da linha de projeção no gráfico.
   * @param {number} maxPoints - Número máximo de pontos do buffer histórico (escala X)
   * @param {number} historyLength - Número atual de pontos no histórico
   * @returns {Array<{xOffset, temperature}>} pontos da projeção
   */
  getProjectionPoints(maxPoints, historyLength) {
    if (!this.result || this.result.r2 < 0.01) return [];

    const currentTemp = this.model.tempSensor;
    const slope       = this.result.slope;

    // Converte o delta de tempo em "índice de ponto" no eixo X do gráfico
    // Assumindo ~5 updates/s e buffer de 1500 pontos (300s / 1500 = 0.2s por ponto)
    const dtPerPoint = 0.2; // segundos por ponto

    return [
      { xOffset: 0,                           temp: currentTemp },
      { xOffset: Math.round(10 / dtPerPoint), temp: this.result.t10s },
      { xOffset: Math.round(30 / dtPerPoint), temp: this.result.t30s },
      { xOffset: Math.round(60 / dtPerPoint), temp: this.result.t60s },
    ];
  }
}

// Expõe no escopo global
window.PredictionEngine = PredictionEngine;
