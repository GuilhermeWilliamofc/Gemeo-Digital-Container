/**
 * AnalyticsApp.js – Ponto de Entrada da Página de Analytics
 * Instancia e orquestra todos os engines e a view de analytics.
 * Restaura o estado salvo pelo Painel Principal via localStorage.
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('Gêmeo Digital – Analytics Engine Iniciado.');

  // ── 1. Instancia o Modelo Térmico e tenta restaurar estado do Painel Principal
  const model = new window.ThermalModel();
  const restored = model.loadState();

  if (!restored) {
    // Nenhum estado salvo: inicia com valores padrão
    console.log('[AnalyticsApp] Nenhum estado anterior encontrado – iniciando simulação do zero.');
    model.tempTarget = 70.0;
  }

  // ── 2. Instancia os Engines
  const predEngine    = new window.PredictionEngine(model);
  const healthEngine  = new window.HealthEngine(model);
  const anomalyEngine = new window.AnomalyEngine(model);

  // ── 3. Instancia a View de Analytics
  const analyticsView = new window.AnalyticsView(model, predEngine, healthEngine, anomalyEngine);

  // ── 4. Instancia o Mini Gráfico 2D passando o PredictionEngine
  const miniChart = new window.TelemetryChartView2D('anl-chart-container', model, predEngine);

  // ── 5. Controle de tempo do loop físico
  let lastTime  = performance.now();
  let isRunning = true;
  let lastSave  = 0;

  // ── 6. Loop principal
  function loop(currentTime) {
    if (!isRunning) return;

    let dt = (currentTime - lastTime) / 1000.0;
    lastTime = currentTime;
    if (dt > 0.1) dt = 0.1;

    // a) Atualiza a física da simulação
    model.update(dt);

    // b) Executa os engines de análise
    predEngine.update();
    healthEngine.update();
    anomalyEngine.update();

    // c) Grava o health no modelo para o histórico
    model.healthIndex = healthEngine.result.index;

    // d) Atualiza a interface
    analyticsView.update();

    // e) Persiste estado de volta (para que voltar ao index.html também restaure)
    if (currentTime - lastSave > 1000) {
      model.saveState();
      lastSave = currentTime;
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // Referência global para debug
  window.analyticsApp = { model, predEngine, healthEngine, anomalyEngine, analyticsView };
});
