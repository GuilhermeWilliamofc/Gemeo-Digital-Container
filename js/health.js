/**
 * Health.js – Health Engine do Gêmeo Digital (v2 – Lógica Corrigida)
 *
 * Princípio fundamental: o sistema é SAUDÁVEL quando o controlador está
 * FAZENDO SEU TRABALHO CORRETAMENTE — mesmo que ainda não tenha chegado
 * ao setpoint. Penalizar o sistema por estar aquecendo (atuador em 100%)
 * ou por ter erro grande durante uma transição legítima é INCORRETO.
 *
 * Quatro fatores revisados:
 *   1. Progresso do Controlador (35%) – está se aproximando do setpoint?
 *   2. Estabilidade Térmica       (30%) – oscilações de temperatura
 *   3. Saturação Contextual       (20%) – saturação só pesa quando PERTO do setpoint
 *   4. Ruído de Oscilação         (15%) – mudanças erráticas de direção quando estável
 */

class HealthEngine {
  /**
   * @param {ThermalModel} model - Referência ao modelo térmico
   */
  constructor(model) {
    this.model = model;

    this.result = {
      index:      100,
      label:      'Excelente',
      levelClass: 'health-excellent',
      factors: {
        stability:   100,
        setpoint:    100,
        saturation:  100,
        oscillation: 100
      }
    };
  }

  update() {
    const model = this.model;

    // Falha crítica → saúde zero
    if (model.isFailed) {
      this.result = this._buildResult(0, 0, 0, 0, 0);
      return this.result;
    }

    // Standby → saúde neutra (sistema não está tentando controlar nada)
    if (!model.systemOn) {
      this.result = this._buildResult(75, 80, 80, 80, 80);
      return this.result;
    }

    const currentError = Math.abs(model.tempSensor - model.tempTarget);
    const inTransition = currentError > 5.0; // sistema ainda convergindo

    // ─────────────────────────────────────────────────────────────
    // FATOR 1 – Progresso do Controlador (peso 35%)
    // Pergunta: o sistema está se movendo NA DIREÇÃO CERTA?
    // ─────────────────────────────────────────────────────────────
    let progressScore = 100;

    const buf15 = model.getRecentBuffer(15);
    const buf5  = model.getRecentBuffer(5);

    if (buf15.length >= 5 && buf5.length >= 3) {
      const errorOld = Math.abs(
        buf15[0].temperature - buf15[0].target
      );
      const errorNew = Math.abs(
        buf5[buf5.length - 1].temperature - buf5[buf5.length - 1].target
      );

      if (currentError <= 3.0) {
        // Excelente: dentro da banda de ±3°C do setpoint
        progressScore = 100;

      } else if (currentError <= 8.0) {
        // Próximo do alvo: pequena penalidade proporcional
        progressScore = Math.max(80, 100 - (currentError / 8.0) * 20);

      } else {
        // Longe do alvo — o que importa é: o erro está DIMINUINDO?
        const improvement = errorOld - errorNew; // positivo = melhorando

        if (improvement > 1.0) {
          // Convergindo rapidamente → sem penalidade
          progressScore = Math.max(85, 100 - (currentError / 80) * 15);
        } else if (improvement > 0) {
          // Convergindo lentamente → penalidade leve
          progressScore = Math.max(70, 95 - (currentError / 60) * 25);
        } else {
          // Erro CRESCENDO quando deveria diminuir → problema real
          const divergence = Math.abs(improvement);
          progressScore = Math.max(20, 70 - divergence * 10 - (currentError / 50) * 20);
        }
      }
    } else if (buf5.length >= 1) {
      // Dados insuficientes para comparar: usa erro absoluto com threshold alto
      progressScore = currentError <= 5
        ? 100
        : Math.max(60, 100 - (currentError / 80) * 40);
    }

    // ─────────────────────────────────────────────────────────────
    // FATOR 2 – Estabilidade Térmica (peso 30%)
    // Desvio padrão dos últimos 20s.
    // Durante transições, tolera STD maior (temperatura está subindo/descendo).
    // ─────────────────────────────────────────────────────────────
    const stabBuffer = model.getRecentBuffer(20);
    let stabilityScore = 100;

    if (stabBuffer.length >= 4) {
      const temps  = stabBuffer.map(p => p.temperature);
      const mean   = temps.reduce((a, b) => a + b, 0) / temps.length;
      const std    = Math.sqrt(temps.reduce((s, t) => s + (t - mean) ** 2, 0) / temps.length);

      if (inTransition) {
        // Durante transição: STD até 5°C é esperado (temperatura está mudando de forma monotônica)
        // Penaliza apenas se STD for muito alto (oscilações erráticas em cima da tendência)
        stabilityScore = Math.max(0, Math.min(100, 100 - (std / 6.0) * 100));
      } else {
        // Próximo do setpoint: qualquer oscilação é problemática
        // STD > 1.5°C → começa a penalizar
        stabilityScore = Math.max(0, Math.min(100, 100 - (std / 2.0) * 100));
      }
    }

    // ─────────────────────────────────────────────────────────────
    // FATOR 3 – Saturação Contextual do Atuador (peso 20%)
    // REGRA CHAVE: saturação apenas é problema quando PERTO do setpoint.
    // Quando longe do alvo, 100% de potência é a resposta CORRETA do PID.
    // ─────────────────────────────────────────────────────────────
    const satBuffer = model.getRecentBuffer(30);
    let saturationScore = 100;

    if (satBuffer.length >= 5) {
      if (currentError > 10.0) {
        // Longe do setpoint → saturação é comportamento esperado → sem penalidade
        saturationScore = 100;
      } else {
        // Próximo do setpoint → saturação indica que o atuador não consegue controlar
        const saturated = satBuffer.filter(p => Math.abs(p.power) >= 95).length;
        const ratio     = saturated / satBuffer.length;
        // Penalidade proporcional: 100% saturado próximo do alvo = problema
        saturationScore = Math.max(0, Math.min(100, 100 - ratio * 80));
      }
    }

    // ─────────────────────────────────────────────────────────────
    // FATOR 4 – Oscilações do Sinal de Controle (peso 15%)
    // Conta inversões de sinal do ATUADOR apenas quando o sistema
    // já deveria estar estável (próximo do setpoint).
    // ─────────────────────────────────────────────────────────────
    const oscBuffer = model.getRecentBuffer(20);
    let oscillationScore = 100;

    if (oscBuffer.length >= 4 && !inTransition) {
      // Só avalia oscilações quando próximo do alvo (onde elas são anormais)
      let signChanges = 0;
      for (let i = 1; i < oscBuffer.length; i++) {
        const prev = oscBuffer[i - 1].power;
        const curr = oscBuffer[i].power;
        if (Math.sign(prev) !== Math.sign(curr) && Math.abs(curr - prev) > 15) {
          signChanges++;
        }
      }
      // Mais de 8 inversões em 20s quando estável = problema
      oscillationScore = Math.max(0, Math.min(100, 100 - (signChanges / 8) * 100));

    } else if (inTransition) {
      // Durante transição: oscilações do atuador são normais → sem penalidade
      oscillationScore = 95;
    }

    this.result = this._buildResult(
      null,
      stabilityScore,
      progressScore,
      saturationScore,
      oscillationScore
    );

    return this.result;
  }

  /**
   * Monta o resultado com os scores ponderados.
   * Pesos: Progresso 35% | Estabilidade 30% | Saturação 20% | Oscilação 15%
   */
  _buildResult(override, stability, setpoint, saturation, oscillation) {
    const index = override !== null
      ? override
      : Math.round(
          stability   * 0.30 +
          setpoint    * 0.35 +
          saturation  * 0.20 +
          oscillation * 0.15
        );

    let label, levelClass;
    if (index >= 90) {
      label = 'Excelente'; levelClass = 'health-excellent';
    } else if (index >= 70) {
      label = 'Boa';       levelClass = 'health-good';
    } else if (index >= 50) {
      label = 'Atenção';   levelClass = 'health-warning';
    } else {
      label = 'Crítica';   levelClass = 'health-critical';
    }

    return {
      index,
      label,
      levelClass,
      factors: {
        stability:   Math.round(override !== null ? override : stability),
        setpoint:    Math.round(override !== null ? override : setpoint),
        saturation:  Math.round(override !== null ? override : saturation),
        oscillation: Math.round(override !== null ? override : oscillation)
      }
    };
  }
}

// Expõe no escopo global
window.HealthEngine = HealthEngine;
