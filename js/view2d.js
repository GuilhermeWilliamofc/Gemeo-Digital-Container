/**
 * View2D.js - Visualização Bidimensional com p5.js (Instance Mode)
 * Renderiza o gráfico histórico de telemetria (Temperatura e Potência do Atuador).
 * Inclui a linha de projeção futura tracejada gerada pelo PredictionEngine.
 */

class TelemetryChartView2D {
  /**
   * @param {string} containerId - ID do elemento HTML pai onde o canvas do p5 será inserido
   * @param {ThermalModel} model - Instância do modelo térmico para consulta de dados
   * @param {PredictionEngine} [predEngine] - Instância opcional do motor de previsão
   */
  constructor(containerId, model, predEngine) {
    this.container = document.getElementById(containerId);
    this.model = model;
    this.predEngine = predEngine || null;
    this.p5Instance = null;

    this.init();
  }

  init() {
    // Define a função geradora do p5 em Instance Mode
    const sketch = (p) => {
      let canvas;

      p.setup = () => {
        // Cria o canvas adaptado ao tamanho do container
        const w = this.container.clientWidth;
        const h = this.container.clientHeight || 200; // Valor padrão se altura for zero
        canvas = p.createCanvas(w, h);
        canvas.parent(this.container);
        p.frameRate(30); // 30 FPS é suficiente para atualizar o gráfico temporal suavemente
      };

      p.draw = () => {
        p.background(12, 15, 25); // Cor correspondente à superfície do CSS (#0C0F19)

        const history = this.model.history;
        if (!history || history.length === 0) {
          // Exibe aviso caso não haja dados
          p.textAlign(p.CENTER, p.CENTER);
          p.fill(160);
          p.textSize(12);
          p.text("Aguardando fluxo de telemetria...", p.width / 2, p.height / 2);
          return;
        }

        // Parâmetros de layout e padding do gráfico
        const padLeft   = 60;
        const padRight  = 60;
        const padTop    = 35;
        const padBottom = 25;

        const chartW = p.width  - padLeft - padRight;
        const chartH = p.height - padTop  - padBottom;

        // 1. Desenha o fundo e a grade auxiliar
        p.stroke(27, 34, 53); // #1B2235
        p.strokeWeight(1);
        p.noFill();
        p.rect(padLeft, padTop, chartW, chartH);

        // Níveis de Temperatura auxiliares na grade
        const tempGridLines = [0, 50, 100, 150, 180];
        const maxTemp = 180.0;

        p.textAlign(p.RIGHT, p.CENTER);
        p.textSize(13);
        p.textFont("JetBrains Mono");

        for (let tVal of tempGridLines) {
          const y = p.map(tVal, 0, maxTemp, padTop + chartH, padTop);

          // Linha da grade
          p.stroke(27, 34, 53);
          p.strokeWeight(1);
          p.line(padLeft, y, padLeft + chartW, y);

          // Rótulo da esquerda (Temperatura °C)
          p.noStroke();
          p.fill(148, 163, 184);
          p.text(tVal + "°", padLeft - 6, y);
        }

        // Rótulos da direita (Potência do Atuador -100% a +100%)
        const powerGridLines = [-100, -50, 0, 50, 100];
        p.textAlign(p.LEFT, p.CENTER);
        for (let pVal of powerGridLines) {
          const y = p.map(pVal, -100, 100, padTop + chartH, padTop);

          p.noStroke();
          if (pVal === 0) {
            p.fill(16, 185, 129);
          } else if (pVal > 0) {
            p.fill(239, 68, 68);
          } else {
            p.fill(59, 130, 246);
          }
          p.text((pVal > 0 ? "+" : "") + pVal + "%", padLeft + chartW + 6, y);
        }

        // 2. Zona de Futuro (área hachurada à direita do último ponto histórico)
        const maxPoints   = this.model.maxHistoryLength;
        const totalPoints = history.length;
        const lastHistX   = p.map(totalPoints - 1, 0, maxPoints - 1, padLeft, padLeft + chartW);

        // Área sombreada indicando zona de projeção futura
        p.noStroke();
        p.fill(100, 120, 200, 10); // Azul-violeta muito suave
        p.rect(lastHistX, padTop, (padLeft + chartW) - lastHistX, chartH);

        // Linha vertical separando histórico de projeção
        p.stroke(80, 100, 160, 60);
        p.strokeWeight(1);
        p.drawingContext.setLineDash([4, 4]);
        p.line(lastHistX, padTop, lastHistX, padTop + chartH);
        p.drawingContext.setLineDash([]);

        // 3. Curva de Potência do Atuador (Área semitransparente)
        p.noStroke();
        p.fill(245, 158, 11, 15);

        p.beginShape();
        p.vertex(padLeft, padTop + chartH);
        for (let i = 0; i < totalPoints; i++) {
          const data = history[i];
          const x = p.map(i, 0, maxPoints - 1, padLeft, padLeft + chartW);
          const y = p.map(data.power, -100, 100, padTop + chartH, padTop);
          p.vertex(x, y);
        }
        const lastX = p.map(totalPoints - 1, 0, maxPoints - 1, padLeft, padLeft + chartW);
        p.vertex(lastX, padTop + chartH);
        p.endShape(p.CLOSE);

        // Linha da Potência do Atuador
        p.noFill();
        p.stroke(245, 158, 11, 140);
        p.strokeWeight(1.5);
        p.beginShape();
        for (let i = 0; i < totalPoints; i++) {
          const x = p.map(i, 0, maxPoints - 1, padLeft, padLeft + chartW);
          const y = p.map(history[i].power, -100, 100, padTop + chartH, padTop);
          p.vertex(x, y);
        }
        p.endShape();

        // 4. Linha da Temperatura Alvo (Target) – Verde Tracejada
        p.noFill();
        p.stroke(16, 185, 129, 180);
        p.strokeWeight(1.5);

        p.beginShape();
        let drawingDashed = true;
        let segmentLen = 0;
        for (let i = 0; i < totalPoints; i++) {
          const x = p.map(i, 0, maxPoints - 1, padLeft, padLeft + chartW);
          const y = p.map(history[i].target, 0, maxTemp, padTop + chartH, padTop);

          if (drawingDashed) {
            p.vertex(x, y);
          } else {
            p.endShape();
            p.beginShape();
          }

          segmentLen++;
          if (segmentLen > 6) {
            drawingDashed = !drawingDashed;
            segmentLen = 0;
          }
        }
        p.endShape();

        // 5. Linha da Temperatura Atual (Medida com Ruído)
        p.noFill();

        const currentTemp = history[totalPoints - 1].temperature;
        let lineCol = p.color(16, 185, 129);
        if (this.model.isFailed || currentTemp > 115) {
          lineCol = p.color(239, 68, 68);
        } else if (Math.abs(currentTemp - history[totalPoints - 1].target) > 10.0) {
          lineCol = p.color(245, 158, 11);
        } else if (currentTemp < 20) {
          lineCol = p.color(59, 130, 246);
        }

        p.stroke(lineCol);
        p.strokeWeight(2);
        p.beginShape();
        for (let i = 0; i < totalPoints; i++) {
          const x = p.map(i, 0, maxPoints - 1, padLeft, padLeft + chartW);
          const y = p.map(history[i].temperature, 0, maxTemp, padTop + chartH, padTop);
          p.vertex(x, y);
        }
        p.endShape();

        // 6. Linha de Projeção Futura (tracejada, ciano-violeta)
        if (this.predEngine && this.predEngine.result && totalPoints > 0) {
          const pred = this.predEngine.result;
          // Pontos da projeção: atual (índice = totalPoints-1), +10s, +30s, +60s
          // dtPerPoint: buffer de 1500 pontos / 300 segundos = 5 pontos por segundo
          const ptsPerSec = maxPoints / 300.0;

          const projPoints = [
            { idx: totalPoints - 1,                        temp: currentTemp },
            { idx: totalPoints - 1 + 10 * ptsPerSec,      temp: pred.t10s   },
            { idx: totalPoints - 1 + 30 * ptsPerSec,      temp: pred.t30s   },
            { idx: totalPoints - 1 + 60 * ptsPerSec,      temp: pred.t60s   },
          ].filter(pt => pt.idx <= maxPoints - 1 && pt.temp !== null);

          if (projPoints.length >= 2) {
            // Sombra de área sob a projeção
            p.noStroke();
            p.fill(139, 92, 246, 12); // Violeta
            p.beginShape();
            p.vertex(p.map(projPoints[0].idx, 0, maxPoints - 1, padLeft, padLeft + chartW),
                     padTop + chartH);
            for (const pt of projPoints) {
              const x = p.map(pt.idx, 0, maxPoints - 1, padLeft, padLeft + chartW);
              const y = p.map(pt.temp, 0, maxTemp, padTop + chartH, padTop);
              p.vertex(x, y);
            }
            p.vertex(p.map(projPoints[projPoints.length - 1].idx, 0, maxPoints - 1, padLeft, padLeft + chartW),
                     padTop + chartH);
            p.endShape(p.CLOSE);

            // Linha tracejada da projeção
            p.noFill();
            p.stroke(167, 139, 250); // Violeta claro (#A78BFA)
            p.strokeWeight(2);
            p.drawingContext.setLineDash([6, 4]);
            p.beginShape();
            for (const pt of projPoints) {
              const x = p.map(pt.idx, 0, maxPoints - 1, padLeft, padLeft + chartW);
              const y = p.map(pt.temp, 0, maxTemp, padTop + chartH, padTop);
              p.vertex(x, y);
            }
            p.endShape();
            p.drawingContext.setLineDash([]);

            // Pontos de marcação na projeção com rótulo de tempo
            const labels = ['', '+10s', '+30s', '+60s'];
            p.textSize(10);
            p.textFont("JetBrains Mono");
            for (let i = 0; i < projPoints.length; i++) {
              const pt = projPoints[i];
              const x  = p.map(pt.idx, 0, maxPoints - 1, padLeft, padLeft + chartW);
              const y  = p.map(pt.temp, 0, maxTemp, padTop + chartH, padTop);

              // Círculo de marcação
              p.fill(167, 139, 250);
              p.noStroke();
              p.ellipse(x, y, i === 0 ? 5 : 7, i === 0 ? 5 : 7);

              // Rótulo de tempo
              if (i > 0 && labels[i]) {
                p.fill(200, 185, 255);
                p.textAlign(p.CENTER, p.BOTTOM);
                p.text(labels[i] + "\n" + pt.temp.toFixed(1) + "°", x, y - 4);
              }
            }
          }
        }

        // 7. Legendas na parte superior
        p.textFont("Plus Jakarta Sans");
        p.textSize(13);
        p.textAlign(p.LEFT, p.TOP);
        p.noStroke();

        const isMobile = p.width < 400;
        const row1_Y = 0;
        const row2_Y = 17;

        // Legenda 1: Temperatura Atual
        p.fill(lineCol);
        p.rect(padLeft, row1_Y + 2, 8, 8, 2);
        p.fill(248, 250, 252);
        p.text("Temp. Atual (" + currentTemp.toFixed(1) + "°C)", padLeft + 12, row1_Y);

        if (isMobile) {
          const halfChart = chartW / 2;

          p.fill(16, 185, 129);
          p.rect(padLeft, row2_Y + 2, 8, 8, 2);
          p.fill(248, 250, 252);
          p.text("Alvo (" + history[totalPoints - 1].target.toFixed(0) + "°C)", padLeft + 12, row2_Y);

          p.fill(245, 158, 11);
          p.rect(padLeft + halfChart, row2_Y + 2, 8, 8, 2);
          p.fill(248, 250, 252);
          p.text("Atuador (" + history[totalPoints - 1].power.toFixed(0) + "%)", padLeft + halfChart + 12, row2_Y);
        } else {
          // Legenda 2: Temperatura Alvo
          p.fill(16, 185, 129);
          p.rect(padLeft + 160, row1_Y + 2, 8, 8, 2);
          p.fill(248, 250, 252);
          p.text("Alvo (" + history[totalPoints - 1].target.toFixed(0) + "°C)", padLeft + 172, row1_Y);

          // Legenda 3: Potência do Atuador
          p.fill(245, 158, 11);
          p.rect(padLeft + 270, row1_Y + 2, 8, 8, 2);
          p.fill(248, 250, 252);
          p.text("Atuador (" + history[totalPoints - 1].power.toFixed(0) + "%)", padLeft + 282, row1_Y);

          // Legenda 4: Projeção (se disponível)
          if (this.predEngine) {
            p.fill(167, 139, 250);
            p.rect(padLeft + 390, row1_Y + 2, 8, 8, 2);
            p.fill(248, 250, 252);
            p.text("Projeção", padLeft + 402, row1_Y);
          }
        }
      };

      // Gerencia o redimensionamento do canvas do p5.js
      p.windowResized = () => {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight || 200;
        p.resizeCanvas(w, h);
      };
    };

    // Inicializa a instância
    this.p5Instance = new p5(sketch);
  }

  destroy() {
    if (this.p5Instance) {
      this.p5Instance.remove();
    }
  }
}

// Expõe no escopo global para evitar imports do ES6 (CORS local)
window.TelemetryChartView2D = TelemetryChartView2D;
