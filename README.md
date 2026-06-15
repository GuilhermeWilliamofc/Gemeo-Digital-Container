# TermoGuard

> **Aplicativo de monitoramento do gêmeo digital do reator térmico** com controle PID em tempo real, visualização 3D, análise preditiva e sistema de alertas integrado.

---

## 📋 Visão Geral

O **TermoGuard** é uma aplicação web interativa que simula em tempo real o comportamento físico-termodinâmico de um reator de aquecimento/resfriamento, reproduzindo fielmente:

- **Dinâmica térmica** do fluido contido no reator (sensores imersos e externos)
- **Controle automático PID** para manutenção da temperatura alvo
- **Sistema de segurança SCRAM** para desligamento emergencial automático
- **Análise preditiva e de saúde** do sistema por engines dedicados
- **Visualização 3D interativa** em WebGL/p5.js
- **Histórico de dados** em gráficos Chart.js com persistência via `localStorage`

### 📍 Localização Fictícia do Reator

| Campo              | Valor                              |
|--------------------|------------------------------------|
| Usina              | Usina Nuclear Angra II             |
| Setor              | Setor de Geração Térmica           |
| Identificação      | Reator #AN2-R4                     |
| País               | Brasil                             |
| Coordenadas        | 23°0'24"S, 44°27'29"W (Angra dos Reis, RJ) |

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        Camada de Interface (HTML/CSS/JS)         │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐  │
│  │  index.html  │  │            analytics.html               │  │
│  │  (Dashboard) │  │  (Analytics & Previsão & Anomalias)     │  │
│  └──────┬───────┘  └──────────────┬──────────────────────────┘  │
│         │                         │                              │
│  ┌──────▼───────────────────────────────────────────────────┐   │
│  │              DashboardController (controller.js)          │   │
│  │  - Navegação por sub-abas                                 │   │
│  │  - Botão Master Power (Liga/Desliga)                      │   │
│  │  - Controle de Modo (PID / ECO)                          │   │
│  │  - Sistema de Alarmes Sonoros                             │   │
│  │  - Segurança Ativa (SCRAM em 140°C)                      │   │
│  └──────┬─────────────────────────────────────────────────┬─┘   │
│         │                                                 │      │
│  ┌──────▼────────────┐                   ┌───────────────▼──┐   │
│  │   ThermalModel    │                   │   AnalyticsApp   │   │
│  │   (model.js)      │◄──── shared ─────►│ (analyticsApp.js)│   │
│  │                   │    localStorage   │                  │   │
│  │ • Física PID      │                   │ • PredictionEngine│   │
│  │ • Sensores        │                   │ • HealthEngine   │   │
│  │ • Persistência    │                   │ • AnomalyEngine  │   │
│  └──────┬────────────┘                   └──────────────────┘   │
│         │                                                        │
│  ┌──────┴──────────────────────────┐                            │
│  │       Camada de Renderização     │                            │
│  │  ┌────────────┐  ┌────────────┐ │                            │
│  │  │  View 3D   │  │  View 2D   │ │                            │
│  │  │ (view3d.js)│  │(view2d.js) │ │                            │
│  │  └────────────┘  └────────────┘ │                            │
│  └─────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Componentes e Sensores

### Sensores do Sistema

| Sensor                              | Localização              | Unidade | Limites Seguros |
|-------------------------------------|--------------------------|---------|-----------------|
| Temperatura do Líquido              | Imerso no fluido         | °C      | < 115°C (crítico: 140°C SCRAM) |
| Temperatura Ambiente                | Fora do recipiente       | °C      | — (referência)  |
| Pressão Interna                     | Fora do recipiente       | bar     | < 8.0 bar       |
| Vibração Estrutural                 | Fora do recipiente       | mm/s    | < 2.5 mm/s      |
| Potência Líquida                    | Circuito compartilhado   | W       | Monitoramento   |
| Potência Aplicada                   | Atuador de aquecimento   | %       | 0 – 100%        |

### Sub-sensores Imersos

| ID     | Função                        | Estado Possível          |
|--------|-------------------------------|--------------------------|
| T1     | Sensor Térmico Imerso Principal | OK / SUSPEITO / ANÔMALO |
| T2     | Sensor Térmico Imerso Reserva   | OK / ANÔMALO / INATIVO  |
| LEVEL  | Sensor de Nível                 | OK / INATIVO            |

### Sub-sensores Externos

| ID       | Função                  | Estado Possível          |
|----------|-------------------------|--------------------------|
| T-SHELL  | Temperatura do Casco    | OK / INATIVO            |
| VIBR     | Sensor de Vibração      | OK / SUSPEITO / INATIVO |
| PRESS    | Sensor de Pressão       | OK / SUSPEITO / INATIVO |

---

## 🔄 Fluxo de Funcionamento do Sistema

```
                         ┌────────────────────────────────┐
                         │     MASTER POWER = OFF          │
                         │  Sistema Completamente Inativo   │
                         └────────────┬───────────────────┘
                                      │ Liga (Master Power ON)
                                      ▼
                         ┌────────────────────────────────┐
                         │     MODO ECO (Standby)          │
                         │  Sem controle PID ativo          │
                         │  Resfriamento passivo           │
                         └────────────┬───────────────────┘
                                      │ Ativa Modo PID
                                      ▼
                         ┌────────────────────────────────┐
               ┌─────────│  MODO PID ATIVO (Operação)      │─────────┐
               │         │  Controlador PID ajusta potência │         │
               │         │  para manter a temperatura alvo  │         │
               │         └──────────────┬──────────────────┘         │
               │                        │                             │
               │              T < Setpoint                 T > Setpoint
               │                        │                             │
               ▼                        ▼                             ▼
      ┌──────────────────┐    ┌──────────────────┐        ┌──────────────────┐
      │  AQUECIMENTO      │    │  TEMPERATURA      │        │  RESFRIAMENTO    │
      │  Circuito liga    │    │  ESTÁVEL           │        │  Circuito liga   │
      │  Potência: > 0%   │    │  Desvio < 1°C      │        │  Potência: < 0%  │
      └──────────────────┘    └──────────────────┘        └──────────────────┘
                                        │
                              T ≥ 115°C (ALERTA)
                                        │
                                        ▼
                         ┌────────────────────────────────┐
                         │     ALERTA CRÍTICO              │
                         │  Banner vermelho + alarme sonoro │
                         │  Engines de Anomalia ativos     │
                         └────────────┬───────────────────┘
                                      │
                              T ≥ 140°C (SCRAM)
                                      │
                                      ▼
                         ┌────────────────────────────────┐
                         │     SCRAM – DESLIGAMENTO        │
                         │     DE EMERGÊNCIA               │
                         │  Master Power = OFF automático  │
                         │  Histórico preservado           │
                         └────────────────────────────────┘
```

### Lógica do Controlador PID

O controlador PID calcula o sinal de atuação com a fórmula:

```
u(t) = Kp·e(t) + Ki·∫e(t)dt + Kd·(de/dt)
```

| Parâmetro | Valor Padrão | Função                          |
|-----------|--------------|---------------------------------|
| Kp        | 4.5          | Proporcional – resposta imediata |
| Ki        | 0.04         | Integral – elimina offset        |
| Kd        | 1.5          | Derivativo – amortece oscilações |

---

## 🔬 Engines de Análise (Página Analytics)

### PredictionEngine (`js/prediction.js`)
- Analisa o histórico de temperatura dos últimos **N** pontos
- Usa regressão linear para calcular **slope** (taxa de variação em °C/s) e **R²** (confiança)
- Extrapola previsões para **+10s**, **+30s** e **+60s**
- Detecta tendência: **Aquecendo / Resfriando / Estável**

### HealthEngine (`js/health.js`)
- Calcula um índice de saúde de 0–100% baseado em 4 fatores:
  - **Estabilidade** – variância da temperatura recente
  - **Setpoint** – precisão em relação ao alvo
  - **Saturação** – frequência de atuador em limite
  - **Oscilação** – número de inversões de tendência
- Classifica o sistema: **Excelente / Bom / Regular / Crítico**

### AnomalyEngine (`js/anomaly.js`)
- Detecta anomalias em tempo real:
  - Temperatura acima do limiar crítico (115°C)
  - Pressão acima de 7.0 bar
  - Vibração acima de 2.0 mm/s
  - PID em saturação prolongada
- Gera alertas com severidade **WARNING** ou **CRITICAL**

---

## 📁 Estrutura de Arquivos

```
Gemeo Digital Container/
├── index.html               # Dashboard principal (multi-abas)
├── analytics.html           # Página de Analytics e Previsão
├── style.css                # Folha de estilos global
├── README.md                # Esta documentação
├── documentacao.puml        # Diagrama PlantUML da arquitetura
│
├── js/
│   ├── model.js             # Modelo físico-matemático (ThermalModel)
│   ├── controller.js        # Controlador do Dashboard (DashboardController)
│   ├── view3d.js            # Visualização 3D em WebGL/p5.js
│   ├── view2d.js            # Gráfico 2D de telemetria (Chart.js)
│   ├── analyticsApp.js      # Ponto de entrada da página Analytics
│   ├── analyticsView.js     # Camada de UI da página Analytics
│   ├── prediction.js        # Engine de Previsão Térmica (PredictionEngine)
│   ├── health.js            # Engine de Saúde do Sistema (HealthEngine)
│   └── anomaly.js           # Engine de Detecção de Anomalias (AnomalyEngine)
│
└── images/
    ├── logotipo.png          # Logotipo do projeto
    └── favicon.png           # Ícone da aplicação
```

---

## 🚀 Como Executar

Este projeto é uma aplicação web estática — **não requer instalação de dependências** ou servidor de build.

### Pré-requisitos
- Um navegador moderno com suporte a WebGL (Chrome, Firefox, Edge)
- Conexão com internet (para carregar fontes e p5.js via CDN)

### Execução Local

**Opção 1 – Abrir diretamente:**
```bash
# Navegue até a pasta do projeto e abra o arquivo
start index.html      # Windows
open index.html       # macOS
xdg-open index.html   # Linux
```

**Opção 2 – Servidor local (recomendado):**
```bash
# Com Python
python -m http.server 8080

# Com Node.js
npx serve .

# Com VS Code – Use a extensão "Live Server"
```

Em seguida, acesse: `http://localhost:8080`

---

## 🎮 Guia de Uso

### Painel Principal (`index.html`)

| Ação                        | Descrição                                       |
|-----------------------------|-------------------------------------------------|
| **Botão Liga/Desliga**      | Liga ou desliga completamente o sistema (Master Power) |
| **Botão PID / ECO**         | Alterna entre controle automático e modo standby |
| **Slider Temperatura Alvo** | Define o setpoint do controlador PID           |
| **Aba Visão Geral**         | KPIs principais e canvas 3D                    |
| **Aba Histórico**           | Gráfico histórico em tempo real               |
| **Aba Sensores**            | Status detalhado de todos os sensores          |
| **Aba Alertas**             | Log de eventos e anomalias ativas              |
| **Aba Configurações**       | Ajuste dos parâmetros PID                      |

### Página Analytics (`analytics.html`)
- **Seção 1 – Previsão Térmica**: KPIs de temperatura e previsão futura por regressão linear
- **Seção 2 – Dados técnicos**: Temperatura ambiente, pressão, vibração e potência para análise detalhada
- **Seção 3 – Saúde do Sistema**: Índice de saúde com 4 fatores ponderados
- **Seção 4 – Anomalias Ativas**: Lista de alertas em tempo real com severidade

---

## 🔒 Sistema de Segurança

| Evento              | Gatilho        | Ação Automática                            |
|---------------------|----------------|--------------------------------------------|
| **Alerta Térmico**  | T ≥ 115°C      | Banner de alerta + alarme sonoro           |
| **Alerta de Pressão** | P ≥ 7.0 bar  | Anomalia crítica registrada                |
| **Alerta de Vibração** | V ≥ 2.0 mm/s | Anomalia de atenção registrada             |
| **SCRAM**           | T ≥ 140°C      | Desligamento automático total (Master OFF) |

---

## 💾 Persistência de Dados

O estado do sistema é salvo automaticamente via `localStorage` a cada segundo. Isso garante:

- **Continuidade entre páginas**: O estado é compartilhado entre `index.html` e `analytics.html`
- **Continuidade entre sessões**: Ao reabrir o navegador, o estado é restaurado
- **Histórico preservado**: Buffer circular de até 1.500 pontos (~5 minutos de dados)

---

## 📐 Tecnologias Utilizadas

| Tecnologia        | Uso                                     |
|-------------------|-----------------------------------------|
| **HTML5**         | Estrutura das páginas                   |
| **CSS3**          | Estilização e animações (Vanilla CSS)   |
| **JavaScript ES6**| Lógica de simulação e controle          |
| **p5.js 1.9.0**   | Visualização 3D e Canvas               |
| **Chart.js**      | Gráficos de histórico 2D               |
| **Material Icons**| Ícones da interface                     |
| **Google Fonts**  | Tipografia (Roboto Mono, Inter)         |

---

## 📝 Licença

Este projeto foi desenvolvido como um demonstrador técnico de Gêmeo Digital. Todos os dados de localização, nomes de usinas e identificadores são **fictícios** e utilizados apenas para fins de simulação educacional.

---

*Desenvolvido com ❤️ como parte de um projeto de Gêmeo Digital de Reator Térmico.*
