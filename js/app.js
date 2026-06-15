/**
 * App.js - Ponto de Entrada da Aplicação
 * Carrega o controlador e inicia o ecossistema do Gêmeo Digital.
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log("Iniciando Gêmeo Digital - Módulos Carregados Globais.");
  
  const app = new window.DashboardController();
  app.start();
  
  // Salva referência global apenas para fins de debug acadêmico
  window.reactorApp = app;
});
