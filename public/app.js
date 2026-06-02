// ==========================================
// ESTADO GLOBAL DO FRONTEND (SPA STATE)
// ==========================================
const state = {
  user: null,
  token: localStorage.getItem('zap_token') || null,
  activeTab: 'tab-dashboard',
  whatsappStatus: 'DISCONNECTED',
  connectedPhone: null,
  contacts: [],
  campaigns: [],
  templates: [],
  history: [],
  // Importação de Planilha
  tempFilePath: null,
  spreadsheetHeaders: []
};

// Configurações Globais de Polling
let whatsappInterval = null;
let statsInterval = null;
let historyInterval = null;

// ==========================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
  startGlobalPolling();
});

// Checa login inicial
async function initApp() {
  if (state.token) {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res && res.user) {
        state.user = res.user;
        showDashboard();
      } else {
        showLogin();
      }
    } catch (err) {
      showLogin();
    }
  } else {
    showLogin();
  }
}

// Configura poller constante para o status do WhatsApp (essencial para tempo real)
function startGlobalPolling() {
  // Poll WhatsApp Status a cada 3 segundos
  if (whatsappInterval) clearInterval(whatsappInterval);
  whatsappInterval = setInterval(checkWhatsAppStatus, 3000);

  // Poll Estatísticas a cada 10 segundos
  if (statsInterval) clearInterval(statsInterval);
  statsInterval = setInterval(() => {
    if (state.token && state.activeTab === 'tab-dashboard') {
      loadDashboardStats();
    }
  }, 10000);

  // Poll Fila a cada 5 segundos se na aba de Histórico
  if (historyInterval) clearInterval(historyInterval);
  historyInterval = setInterval(() => {
    if (state.token && state.activeTab === 'tab-history') {
      loadHistory(true); // silent refresh
    }
  }, 5000);
}

// ==========================================
// SISTEMA DE COMUNICAÇÃO COM API (REST WRAPPER)
// ==========================================
async function apiFetch(endpoint, options = {}) {
  const url = `${window.location.origin}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(url, config);
    
    // Tratamento de erro 401 (Token expirado/Inválido)
    if (response.status === 401 && endpoint !== '/api/auth/login') {
      logout();
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro na requisição.');
    }
    return data;
  } catch (error) {
    console.error(`Erro na API (${endpoint}):`, error.message);
    throw error;
  }
}

// ==========================================
// GERENCIADOR DE LOGIN E LOGOUT
// ==========================================
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  state.token = null;
  state.user = null;
  localStorage.removeItem('zap_token');
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('profile-name').textContent = state.user.name;
  
  // Seleciona a aba padrão
  switchTab('tab-dashboard');
}

function logout() {
  showLogin();
  showToast('Deslogado com sucesso!', 'success');
}

// ==========================================
// ROTEAMENTO DE ABAS INTERNAS (SPA ROUTING)
// ==========================================
function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Atualizar botões da sidebar
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Alternar telas
  document.querySelectorAll('.app-screen').forEach(screen => {
    if (screen.id === tabId) {
      screen.classList.remove('hidden');
    } else {
      screen.classList.add('hidden');
    }
  });

  // Atualizar título do Header conforme aba
  const headerTitle = document.getElementById('tab-title');
  const headerSubtitle = document.getElementById('tab-subtitle');

  switch (tabId) {
    case 'tab-dashboard':
      headerTitle.textContent = 'Dashboard de Métricas';
      headerSubtitle.textContent = 'Indicadores operacionais de disparos e status das campanhas acadêmicas.';
      loadDashboardStats();
      break;
    case 'tab-whatsapp':
      headerTitle.textContent = 'Conectar Dispositivo WhatsApp';
      headerSubtitle.textContent = 'Escaneie o QR Code para conectar a sessão de disparos.';
      checkWhatsAppStatus();
      loadSettings();
      break;
    case 'tab-scheduler':
      headerTitle.textContent = 'Programar Disparos e Mensagens';
      headerSubtitle.textContent = 'Agende avisos individuais ou disparos em lote mapeando planilhas.';
      loadSchedulerData();
      break;
    case 'tab-contacts':
      headerTitle.textContent = 'Base de Contatos CRM';
      headerSubtitle.textContent = 'Gerencie o CRM interno de alunos, contatos acadêmicos e tags de controle.';
      loadContactsCRM();
      break;
    case 'tab-campaigns':
      headerTitle.textContent = 'Controle de Campanhas';
      headerSubtitle.textContent = 'Estruture categorias de disparos, gerencie e pause disparos agendados.';
      loadCampaigns();
      break;
    case 'tab-templates':
      headerTitle.textContent = 'Biblioteca de Templates';
      headerSubtitle.textContent = 'Modelos prontos reutilizáveis para agilizar sua comunicação diária.';
      loadTemplates();
      break;
    case 'tab-history':
      headerTitle.textContent = 'Fila Ativa & Histórico Completo';
      headerSubtitle.textContent = 'Acompanhe a fila de disparos em tempo real e reenvie falhas.';
      loadHistory();
      break;
  }
}

// ==========================================
// CONTROLADOR 1: DASHBOARD
// ==========================================
async function loadDashboardStats() {
  try {
    const stats = await apiFetch('/api/dashboard/stats');
    
    // Preencher métricas nos cards superiores
    document.getElementById('stat-sent-today').textContent = stats.metrics.sentToday;
    document.getElementById('stat-pending').textContent = stats.metrics.pending;
    document.getElementById('stat-delivered').textContent = stats.metrics.sent;
    document.getElementById('stat-failed').textContent = stats.metrics.failed;

    // Atualizar badge de taxa de sucesso
    const successBadge = document.getElementById('success-rate-badge');
    successBadge.textContent = `${stats.metrics.successRate}% Sucesso`;
    if (stats.metrics.successRate < 80) {
      successBadge.className = 'badge badge-warning';
    } else {
      successBadge.className = 'badge badge-success';
    }

    // Renderizar gráfico de campanhas
    const chartContainer = document.getElementById('dashboard-campaign-chart');
    chartContainer.innerHTML = '';
    
    if (stats.campaignStats && stats.campaignStats.length > 0) {
      // Obter o volume máximo para fins de escala de preenchimento (%)
      const maxVol = Math.max(...stats.campaignStats.map(c => c.volume));
      
      stats.campaignStats.forEach(camp => {
        const percentage = maxVol > 0 ? (camp.volume / maxVol) * 100 : 0;
        
        const row = document.createElement('div');
        row.className = 'chart-bar-row';
        row.innerHTML = `
          <div class="chart-bar-info">
            <span class="chart-bar-name">${camp.name}</span>
            <span class="chart-bar-value">${camp.volume} disparos</span>
          </div>
          <div class="chart-bar-bg">
            <div class="chart-bar-fill" style="width: ${percentage}%"></div>
          </div>
        `;
        chartContainer.appendChild(row);
      });
    } else {
      chartContainer.innerHTML = '<p class="empty-state">Nenhum disparo registrado ainda.</p>';
    }

    // Renderizar Logs do Sistema Recentes
    const logsList = document.getElementById('system-logs-list');
    logsList.innerHTML = '';
    
    if (stats.logs && stats.logs.length > 0) {
      stats.logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        
        const formattedTime = new Date(log.timestamp).toLocaleTimeString('pt-BR');
        const userText = log.user ? log.user.username : 'sistema';
        
        item.innerHTML = `
          <span class="log-time">[${formattedTime}]</span>
          <span class="log-text"><strong>${userText}</strong> realizou <strong>${log.action}</strong>: ${log.details}</span>
        `;
        logsList.appendChild(item);
      });
    } else {
      logsList.innerHTML = '<p class="empty-state">Sem eventos recentes registrados.</p>';
    }

  } catch (err) {
    console.error('Falha ao carregar métricas:', err.message);
  }
}

// ==========================================
// CONTROLADOR 2: WHATSAPP WEB STATUS & QR CODE
// ==========================================
async function checkWhatsAppStatus() {
  if (!state.token) return;

  try {
    const data = await apiFetch('/api/whatsapp/status');
    state.whatsappStatus = data.status;
    state.connectedPhone = data.phone;

    // 1. Atualizar indicador de status da Sidebar lateral
    const sideDot = document.getElementById('sidebar-status-dot');
    const sideTitle = document.getElementById('sidebar-status-title');
    const sidePhone = document.getElementById('sidebar-status-phone');

    sideDot.className = 'status-dot';
    
    if (data.status === 'CONNECTED') {
      sideDot.classList.add('connected');
      sideTitle.textContent = 'Conectado';
      sidePhone.textContent = `+${data.phone}`;
    } else if (data.status === 'QR_CODE') {
      sideDot.classList.add('connecting');
      sideTitle.textContent = 'Aguardando QR';
      sidePhone.textContent = 'Pendente escaneamento';
    } else if (data.status === 'CONNECTING') {
      sideDot.classList.add('connecting');
      sideTitle.textContent = 'Conectando...';
      sidePhone.textContent = 'Iniciando navegador';
    } else {
      sideDot.classList.add('disconnected');
      sideTitle.textContent = 'Desconectado';
      sidePhone.textContent = 'Sem pareamento';
    }

    // 2. Se na aba "WhatsApp", atualizar a visualização da tela central
    if (state.activeTab === 'tab-whatsapp') {
      const views = {
        connecting: document.getElementById('wpp-state-connecting'),
        qrcode: document.getElementById('wpp-state-qrcode'),
        connected: document.getElementById('wpp-state-connected'),
        disconnected: document.getElementById('wpp-state-disconnected')
      };

      // Ocultar todas as visões estáticas
      Object.values(views).forEach(el => el.classList.add('hidden'));

      if (data.status === 'CONNECTED') {
        views.connected.classList.remove('hidden');
        document.getElementById('wpp-connected-phone-display').textContent = `Conectado como: +${data.phone}`;
      } else if (data.status === 'QR_CODE') {
        views.qrcode.classList.remove('hidden');
        if (data.qrCode) {
          document.getElementById('wpp-qr-image').src = data.qrCode;
        }
      } else if (data.status === 'CONNECTING') {
        views.connecting.classList.remove('hidden');
      } else {
        views.disconnected.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Erro de conexão do WhatsApp status:', err.message);
  }
}

// Conectar WhatsApp manualmente
async function connectWhatsApp() {
  try {
    showToast('Inicializando Puppeteer...', 'warning');
    const res = await apiFetch('/api/whatsapp/connect', { method: 'POST' });
    if (res.success) {
      checkWhatsAppStatus();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Desconectar WhatsApp e limpar sessão
async function disconnectWhatsApp() {
  if (!confirm('Deseja desconectar esta sessão de WhatsApp e limpar as chaves de pareamento? Um novo QR Code será gerado.')) {
    return;
  }
  
  try {
    showToast('Desconectando dispositivo...', 'warning');
    const res = await apiFetch('/api/whatsapp/disconnect', { method: 'POST' });
    if (res.success) {
      showToast('Desconectado com sucesso!', 'success');
      checkWhatsAppStatus();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Carregar configurações de segurança e anti-ban
async function loadSettings() {
  try {
    const settings = await apiFetch('/api/settings');
    if (settings) {
      document.getElementById('setting-night-antiban').checked = settings.nightAntiBanActive;
      document.getElementById('setting-daily-limit').value = settings.dailyLimit || 300;
    }
  } catch (err) {
    console.error('Falha ao carregar configurações:', err.message);
  }
}

// Salvar configurações de segurança e anti-ban
async function saveSettings(e) {
  e.preventDefault();
  
  const nightAntiBanActive = document.getElementById('setting-night-antiban').checked;
  const dailyLimit = document.getElementById('setting-daily-limit').value;
  
  try {
    showToast('Salvando configurações...', 'warning');
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        nightAntiBanActive,
        dailyLimit: Number(dailyLimit)
      })
    });
    
    if (res.success) {
      showToast('Configurações de segurança atualizadas!', 'success');
      loadSettings();
    }
  } catch (err) {
    showToast('Erro ao salvar configurações: ' + err.message, 'error');
  }
}

// ==========================================
// CONTROLADOR 3: AGENDADOR & PREVIEW NO MOCKUP
// ==========================================
async function loadSchedulerData() {
  try {
    // Carregar campanhas para o select
    const camps = await apiFetch('/api/campaigns');
    state.campaigns = camps;
    
    const select = document.getElementById('sched-campaign');
    select.innerHTML = '<option value="">-- Selecione uma Campanha --</option>';
    
    camps.forEach(c => {
      if (c.status === 'ativa') {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        select.appendChild(option);
      }
    });

    // Reset do form e visualizador
    resetSchedulerForm();
    updateMockPreview();
  } catch (err) {
    showToast('Erro ao carregar dados do agendador: ' + err.message, 'error');
  }
}

function resetSchedulerForm() {
  document.getElementById('scheduler-form').reset();
  document.getElementById('sched-is-mass').value = 'false';
  state.tempFilePath = null;
  state.spreadsheetHeaders = [];
  
  // Reset de visões
  document.getElementById('sched-fields-single').classList.remove('hidden');
  document.getElementById('sched-fields-mass').classList.add('hidden');
  document.getElementById('btn-mode-single').classList.add('active');
  document.getElementById('btn-mode-mass').classList.remove('active');
  document.getElementById('mass-file-dropzone').classList.remove('hidden');
  document.getElementById('mass-file-info').classList.add('hidden');
  document.getElementById('mass-mapping-status').classList.add('hidden');
  document.getElementById('mock-media-file-view').classList.add('hidden');

  // Preview mock phone reset
  document.getElementById('mock-recipient-name').textContent = 'João da Silva';
  document.getElementById('wpp-mock-text').textContent = 'Selecione uma mensagem para ver o preview...';
}

// Atualizar visualizador do WhatsApp Mockup (iPhone Preview) em tempo real
function updateMockPreview() {
  const isMass = document.getElementById('sched-is-mass').value === 'true';
  const nameInput = document.getElementById('sched-contact-name').value;
  const rawText = document.getElementById('sched-message').value;

  // 1. Atualizar nome do destinatário no mockup
  const mockName = document.getElementById('mock-recipient-name');
  if (isMass) {
    mockName.textContent = 'Alunos Lote Massa';
  } else {
    mockName.textContent = nameInput.trim() ? nameInput.trim() : 'João da Silva';
  }

  // 2. Atualizar o texto aplicando variáveis simuladas
  const mockText = document.getElementById('wpp-mock-text');
  
  if (!rawText.trim()) {
    mockText.textContent = 'Olá! Digite sua mensagem ao lado para conferir como ela aparecerá no celular.';
    return;
  }

  // Mapear simulação de variáveis para substituição visual rápida no mock
  const simName = isMass ? '[Nome Aluno]' : (nameInput.trim() ? nameInput.trim() : 'João da Silva');
  
  const replacements = {
    nome: simName,
    telefone: isMass ? '[WhatsApp]' : (document.getElementById('sched-contact-phone').value || '[DDD + Número]'),
    curso: '[Curso Mapeado]',
    turma: '[Turma Mapeada]'
  };

  let processedText = rawText;
  Object.entries(replacements).forEach(([key, val]) => {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    processedText = processedText.replace(regex, val);
  });

  mockText.textContent = processedText;

  // 3. Atualizar hora do mockup para a hora atual
  document.getElementById('mock-message-time-val').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Inserir variáveis helpers ao clicar
function insertVariableIntoMessage(variableName) {
  const textarea = document.getElementById('sched-message');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  
  const insertText = `{{${variableName}}}`;
  textarea.value = text.substring(0, start) + insertText + text.substring(end);
  
  // Recolocar cursor logo após a inserção
  textarea.selectionStart = textarea.selectionEnd = start + insertText.length;
  textarea.focus();
  
  updateMockPreview();
}

// Lidar com agendamento e envio final (Envio do Formulário)
async function submitSchedule(e) {
  e.preventDefault();

  const campaignId = document.getElementById('sched-campaign').value;
  const contentRaw = document.getElementById('sched-message').value;
  const scheduledDate = document.getElementById('sched-date').value;
  const repeat = document.getElementById('sched-repeat').value;
  const isMass = document.getElementById('sched-is-mass').value === 'true';

  if (!campaignId) {
    showToast('Por favor, selecione uma campanha.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('campaignId', campaignId);
  formData.append('contentRaw', contentRaw);
  formData.append('scheduledDate', scheduledDate);
  formData.append('repeat', repeat);
  formData.append('isMass', isMass);

  // Arquivo de Anexo se houver
  const attachmentInput = document.getElementById('sched-attachment');
  if (attachmentInput.files.length > 0) {
    formData.append('messageAttachment', attachmentInput.files[0]);
  }

  try {
    showToast('Programando envio...', 'warning');

    if (isMass) {
      // Modo Massa: Valida se planilha foi mapeada
      if (!state.tempFilePath) {
        showToast('Por favor, carregue e mapeie sua planilha primeiro.', 'error');
        return;
      }

      // Buscar os contatos que mapeamos localmente do preview estruturado da planilha para envio de lote
      const mapping = JSON.parse(localStorage.getItem('last_column_mapping'));
      if (!mapping) {
        showToast('Erro ao resgatar mapeamento de colunas.', 'error');
        return;
      }

      // Envia uma lista estruturada de contatos no corpo do multipart para geração em massa pelo servidor
      // Para fazer isso, vamos carregar os contatos lidos do arquivo da planilha original no backend
      // Portanto, o backend processará o lote. Nós apenas enviamos os metadados de lote confirmados.
      const res = await fetch(`${window.location.origin}/api/contacts/import-preview`, {
        // Obter do input temporário para envio
      });
      // Mas para simplificar a engenharia robusta:
      // O backend já tem os contatos importados no CRM se o usuário importou no modal de CRM, ou no caso do Scheduler,
      // nós enviamos a lista de contatos do lote para o Scheduler.
      // Vamos ler as colunas da planilha e mandar as linhas mapeadas diretamente no JSON.
      // O backend então cria o lote de mensagens na fila.
      // Vamos fazer isso resgatando todas as linhas da planilha de teste que lemos no preview e mapeando-as!
      // Mas como a planilha pode ser gigante (milhares de linhas), o ideal é que o backend processe a planilha.
      // Então, em vez de enviar o arquivo de novo, enviamos o caminho da planilha temporária já salva (`tempFilePath`)
      // e o `columnMapping`. O backend faz a leitura completa de novo e injeta na fila diretamente!
      // Vamos programar uma rota no backend ou adaptar o POST /api/messages.
      // No server.js escrevemos a API de agendamento individual ou massa.
      // Se for massa, vamos ler a lista mapeada de contatos. Vamos converter isso no app para envio.
      // O app enviará o `tempFilePath` e `columnMapping` no multipart.
      // Vamos ler o XLSX completo localmente e enviar o array no 'contactsList'! Isso é extremamente flexível e simples.
      // Vamos ler no próprio backend! Sim, para isso passamos o `tempFilePath` e `columnMapping`!
      // Vamos carregar isso no frontend.
      
      const contactsToSchedule = await readAllContactsFromTempSpreadsheet();
      if (!contactsToSchedule || contactsToSchedule.length === 0) {
        showToast('Nenhum contato encontrado na planilha para disparar.', 'error');
        return;
      }

      formData.append('contactsList', JSON.stringify(contactsToSchedule));
    } else {
      // Modo Individual
      const name = document.getElementById('sched-contact-name').value;
      const phone = document.getElementById('sched-contact-phone').value;

      if (!name || !phone) {
        showToast('Preencha Nome e Telefone para envio individual.', 'error');
        return;
      }

      formData.append('contactName', name);
      formData.append('contactPhone', phone);
    }

    const response = await fetch(`${window.location.origin}/api/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao agendar.');

    showToast('Mensagens agendadas com sucesso!', 'success');
    resetSchedulerForm();
    switchTab('tab-history');

  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Lê todos os contatos do arquivo da planilha temporária mapeando-os conforme seleção do usuário
async function readAllContactsFromTempSpreadsheet() {
  const mapping = JSON.parse(localStorage.getItem('last_column_mapping'));
  if (!state.tempFilePath || !mapping) return null;

  try {
    // Mandamos confirmar e consolidar a importação no CRM primeiro, para que os contatos fiquem salvos
    // e possamos agendar baseado no CRM ou diretamente da planilha.
    // Vamos chamar o /api/contacts/import-confirm para salvar todos os contatos no CRM.
    showToast('Processando e salvando contatos no CRM...', 'warning');
    
    const confirmRes = await apiFetch('/api/contacts/import-confirm', {
      method: 'POST',
      body: JSON.stringify({
        tempFilePath: state.tempFilePath,
        columnMapping: mapping,
        tags: ['Agendamento Massa']
      })
    });

    if (!confirmRes.success) throw new Error(confirmRes.error);

    // Agora, buscamos do CRM todos os contatos cadastrados que correspondam às tags 'Agendamento Massa' 
    // ou simplesmente mandamos a lista filtrada para disparo
    // Para simplificar, como os contatos foram salvos no CRM, o backend no 'contactsList' receberá
    // as linhas mapeadas que lemos na planilha no preview.
    // Vamos fazer uma requisição rápida para buscar os contatos importados, ou retornar a lista mapeada
    // Vamos simular a leitura mapeada:
    // O modal do importador do scheduler já mapeou tudo. A planilha foi processada.
    // Vamos retornar um array fictício de contatos que o backend processe baseado nas tags.
    // Mas no `server.js`, na linha 954, `const parsedContacts = JSON.parse(contactsList || '[]');` espera um array
    // de contatos com `{ name, phone, course, turma }`.
    // Como podemos ler a planilha inteira no frontend sem carregar arquivo de novo?
    // Podemos fazer isso chamando um endpoint rápido que retorne todas as linhas mapeadas.
    // Mas a melhor solução é: chamamos o endpoint `/api/contacts` para pegar os contatos recém-importados!
    // Para ser mais simples, vamos carregar a lista de contatos do CRM criados agora.
    const allCRM = await apiFetch('/api/contacts?q=Agendamento%20Massa');
    
    // Retorna formatado
    return allCRM.map(c => ({
      name: c.name,
      phone: c.phone,
      course: c.course,
      turma: c.turma,
      variables: { course: c.course, turma: c.turma }
    }));

  } catch (e) {
    console.error('Falha ao processar contatos de planilha:', e);
    return null;
  }
}

// ==========================================
// CONTROLADOR 4: CRM (CONTATOS)
// ==========================================
async function loadContactsCRM() {
  const tableBody = document.getElementById('crm-contacts-table-body');
  const tableFooter = document.getElementById('crm-table-footer');
  tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando contatos...</td></tr>';

  try {
    const searchVal = document.getElementById('crm-search-input').value;
    const contacts = await apiFetch(`/api/contacts?q=${encodeURIComponent(searchVal)}`);
    state.contacts = contacts;

    tableBody.innerHTML = '';
    
    if (contacts.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum contato localizado no CRM.</td></tr>';
      tableFooter.textContent = 'Exibindo 0 de 0 contatos';
      return;
    }

    contacts.forEach(c => {
      const tr = document.createElement('tr');
      
      // Formatação do último envio
      const lastSent = c.lastSentAt 
        ? `${new Date(c.lastSentAt).toLocaleDateString('pt-BR')} às ${new Date(c.lastSentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : 'Nenhum envio';

      // Gerar pills de tags
      const tagPills = (c.tags || []).map(t => `<span class="tag-pill">${t}</span>`).join('');

      tr.innerHTML = `
        <td><strong>${c.name}</strong></td>
        <td>+${c.phone}</td>
        <td>${c.course || '-'}</td>
        <td>${c.turma || '-'}</td>
        <td>${tagPills}</td>
        <td><span class="text-muted">${lastSent}</span></td>
        <td>
          <div class="action-row-buttons">
            <button class="btn btn-icon btn-edit-contact" data-id="${c.id}" title="Editar contato">
              ✏️
            </button>
            <button class="btn btn-icon btn-danger btn-delete-contact" data-id="${c.id}" title="Excluir contato">
              🗑️
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    tableFooter.textContent = `Exibindo ${contacts.length} contato(s) cadastrado(s)`;

  } catch (err) {
    showToast('Falha ao carregar CRM: ' + err.message, 'error');
  }
}

// Deletar Contato
async function deleteContact(id) {
  if (!confirm('Deseja realmente remover este contato do CRM? Esta ação não pode ser desfeita.')) return;

  try {
    const res = await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast('Contato excluído com sucesso!', 'success');
      loadContactsCRM();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Salvar/Criar Contato individual
async function saveContactSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('contact-form-id').value;
  const name = document.getElementById('contact-name').value;
  const phone = document.getElementById('contact-phone').value;
  const course = document.getElementById('contact-course').value;
  const turma = document.getElementById('contact-turma').value;
  const tags = document.getElementById('contact-tags').value;
  const observations = document.getElementById('contact-observations').value;

  const payload = {
    name,
    phone,
    course,
    turma,
    tags,
    observations
  };

  try {
    let res;
    if (id) {
      // Update
      res = await apiFetch(`/api/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      // Create
      res = await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    if (res.success) {
      showToast('Contato salvo com sucesso no CRM!', 'success');
      closeContactModal();
      loadContactsCRM();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openContactModal(contact = null) {
  const modal = document.getElementById('modal-contact-form');
  const title = document.getElementById('contact-modal-title');
  const form = document.getElementById('crm-contact-submit-form');
  form.reset();

  if (contact) {
    title.textContent = 'Editar Contato';
    document.getElementById('contact-form-id').value = contact.id;
    document.getElementById('contact-name').value = contact.name;
    document.getElementById('contact-phone').value = contact.phone;
    document.getElementById('contact-course').value = contact.course || '';
    document.getElementById('contact-turma').value = contact.turma || '';
    document.getElementById('contact-tags').value = (contact.tags || []).join(', ');
    document.getElementById('contact-observations').value = contact.observations || '';
  } else {
    title.textContent = 'Novo Contato CRM';
    document.getElementById('contact-form-id').value = '';
  }

  modal.classList.remove('hidden');
}

function closeContactModal() {
  document.getElementById('modal-contact-form').classList.add('hidden');
}

// ==========================================
// ASSISTENTE DE IMPORTAÇÃO DE PLANILHA CRM
// ==========================================
async function handleSpreadsheetUpload(file) {
  const formData = new FormData();
  formData.append('studentListFile', file);

  try {
    showToast('Analisando arquivo de planilha...', 'warning');
    
    const response = await fetch(`${window.location.origin}/api/contacts/import-preview`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao carregar planilha.');

    state.tempFilePath = data.tempFilePath;
    state.spreadsheetHeaders = data.headers;

    // Configurar o Assistente de Mapeamento
    setupImportMappingModal(data.headers);

    // Se estiver no Agendador, atualiza o status de carregamento
    if (state.activeTab === 'tab-scheduler') {
      document.getElementById('mass-file-dropzone').classList.add('hidden');
      const fileInfo = document.getElementById('mass-file-info');
      fileInfo.classList.remove('hidden');
      document.getElementById('mass-file-name').textContent = file.name;
      document.getElementById('mass-file-rows').textContent = `${data.totalRows} registros identificados`;
    }

  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setupImportMappingModal(headers) {
  const modal = document.getElementById('modal-import-assistant');
  document.getElementById('import-temp-file').value = state.tempFilePath;
  
  // Limpar e preencher selects de mapeamento
  const selects = ['map-name', 'map-phone', 'map-course', 'map-turma', 'map-observations'];
  
  selects.forEach(selId => {
    const select = document.getElementById(selId);
    select.innerHTML = '';
    
    // Se for opcional, adiciona a primeira opção nula
    if (selId !== 'map-name' && selId !== 'map-phone') {
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '-- Não importar --';
      select.appendChild(defaultOpt);
    } else {
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '-- Selecione a Coluna --';
      select.appendChild(defaultOpt);
    }

    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      
      // Auto-selecionar heurístico baseado no nome do cabeçalho
      const cleanH = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      if (selId === 'map-name' && (cleanH === 'nome' || cleanH === 'nome completo' || cleanH === 'aluno')) {
        opt.selected = true;
      }
      if (selId === 'map-phone' && (cleanH === 'telefone' || cleanH === 'whatsapp' || cleanH === 'celular' || cleanH === 'fone')) {
        opt.selected = true;
      }
      if (selId === 'map-course' && (cleanH === 'curso' || cleanH === 'materia' || cleanH === 'graduacao')) {
        opt.selected = true;
      }
      if (selId === 'map-turma' && (cleanH === 'turma' || cleanH === 'classe' || cleanH === 'ano')) {
        opt.selected = true;
      }
      if (selId === 'map-observations' && (cleanH === 'observacao' || cleanH === 'obs' || cleanH === 'nota')) {
        opt.selected = true;
      }

      select.appendChild(opt);
    });
  });

  modal.classList.remove('hidden');
}

async function confirmImportMapping(e) {
  e.preventDefault();

  const tempFilePath = document.getElementById('import-temp-file').value;
  const name = document.getElementById('map-name').value;
  const phone = document.getElementById('map-phone').value;
  const course = document.getElementById('map-course').value;
  const turma = document.getElementById('map-turma').value;
  const observations = document.getElementById('map-observations').value;
  const tags = document.getElementById('import-tags').value;

  if (!name || !phone) {
    showToast('As colunas de Nome e Telefone são de mapeamento obrigatório.', 'error');
    return;
  }

  const columnMapping = {
    name,
    phone,
    course,
    turma,
    observations
  };

  // Salvar mapeamento no localStorage para lembrar no Scheduler
  localStorage.setItem('last_column_mapping', JSON.stringify(columnMapping));

  try {
    showToast('Consolidando importação de alunos...', 'warning');

    const res = await apiFetch('/api/contacts/import-confirm', {
      method: 'POST',
      body: JSON.stringify({
        tempFilePath,
        columnMapping,
        tags
      })
    });

    if (res.success) {
      showToast(`Importação finalizada! ${res.importedCount} contatos cadastrados, ${res.ignoredCount} duplicados ignorados.`, 'success');
      document.getElementById('modal-import-assistant').classList.add('hidden');
      
      // Atualizar tela dependendo da aba ativa
      if (state.activeTab === 'tab-contacts') {
        loadContactsCRM();
      } else if (state.activeTab === 'tab-scheduler') {
        document.getElementById('mass-mapping-status').classList.remove('hidden');
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// CONTROLADOR 5: CAMPANHAS
// ==========================================
async function loadCampaigns() {
  const tableBody = document.getElementById('campaigns-table-body');
  tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Carregando campanhas...</td></tr>';

  try {
    const list = await apiFetch('/api/campaigns');
    state.campaigns = list;

    tableBody.innerHTML = '';
    
    if (list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma campanha cadastrada.</td></tr>';
      return;
    }

    list.forEach(c => {
      const tr = document.createElement('tr');
      
      const badgeClass = c.status === 'ativa' ? 'badge-success' : 'badge-danger';
      const statusText = c.status === 'ativa' ? 'Ativa' : 'Pausada';
      const toggleActionText = c.status === 'ativa' ? 'Pausar' : 'Ativar';

      tr.innerHTML = `
        <td><strong>${c.name}</strong></td>
        <td><span class="text-secondary">${c.description || '-'}</span></td>
        <td><strong>${c.stats.total}</strong> disparos</td>
        <td>
          <span class="text-muted">${c.stats.pending} Fila</span> / 
          <span class="text-success">${c.stats.sent} Enviadas</span> / 
          <span class="text-danger">${c.stats.failed} Falhas</span>
        </td>
        <td><span class="badge ${badgeClass}">${statusText}</span></td>
        <td>
          <div class="action-row-buttons">
            <button class="btn btn-secondary btn-small btn-toggle-camp" data-id="${c.id}" data-status="${c.status}">
              ${toggleActionText}
            </button>
            <button class="btn btn-secondary btn-small btn-duplicate-camp" data-id="${c.id}" data-name="${c.name}">
              Duplicar
            </button>
            <button class="btn btn-icon btn-danger btn-delete-camp" data-id="${c.id}">
              🗑️
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

  } catch (err) {
    showToast('Erro ao carregar campanhas: ' + err.message, 'error');
  }
}

// Criar Campanha
async function handleCampaignCreate(e) {
  e.preventDefault();

  const name = document.getElementById('camp-new-name').value;
  const description = document.getElementById('camp-new-desc').value;

  try {
    const res = await apiFetch('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });

    if (res.success) {
      showToast('Campanha cadastrada!', 'success');
      document.getElementById('campaign-create-form').reset();
      loadCampaigns();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Pausar/Ativar Campanha
async function toggleCampaign(id, currentStatus) {
  const newStatus = currentStatus === 'ativa' ? 'pausada' : 'ativa';
  try {
    const res = await apiFetch(`/api/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    if (res.success) {
      showToast(`Campanha ${newStatus === 'ativa' ? 'ativada' : 'pausada'} com sucesso!`, 'success');
      loadCampaigns();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Duplicar Campanha
async function duplicateCampaign(id, name) {
  const newName = prompt('Digite o nome para a campanha duplicada:', `${name} - Cópia`);
  if (!newName) return;

  try {
    showToast('Duplicando campanha e fila...', 'warning');
    const res = await apiFetch(`/api/campaigns/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name: newName })
    });

    if (res.success) {
      showToast('Campanha duplicada com sucesso!', 'success');
      loadCampaigns();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Deletar Campanha
async function deleteCampaign(id) {
  if (!confirm('ATENÇÃO: Excluir esta campanha apagará também todas as mensagens programadas e histórico vinculados a ela! Deseja continuar?')) {
    return;
  }

  try {
    const res = await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast('Campanha e fila de disparos excluídas!', 'success');
      loadCampaigns();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// CONTROLADOR 6: TEMPLATES
// ==========================================
async function loadTemplates() {
  const grid = document.getElementById('templates-library-grid');
  grid.innerHTML = '<p class="empty-state">Carregando biblioteca...</p>';

  try {
    const list = await apiFetch('/api/templates');
    state.templates = list;

    grid.innerHTML = '';
    
    if (list.length === 0) {
      grid.innerHTML = '<p class="empty-state">Nenhum template cadastrado na biblioteca.</p>';
      return;
    }

    list.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'template-card glass';
      
      const varBadges = tpl.variables.map(v => `<span class="var-badge">{{${v}}}</span>`).join('');

      card.innerHTML = `
        <div class="template-card-header">
          <h3>${tpl.name}</h3>
        </div>
        <div class="template-card-body">${tpl.content}</div>
        <div class="template-card-footer">
          <div class="template-vars">${varBadges}</div>
          <div class="action-row-buttons">
            <button class="btn btn-primary btn-small btn-use-tpl" data-id="${tpl.id}" title="Usar este template">Usar</button>
            <button class="btn btn-icon btn-danger btn-delete-tpl" data-id="${tpl.id}" title="Excluir template">🗑️</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

  } catch (err) {
    showToast('Erro ao carregar templates: ' + err.message, 'error');
  }
}

// Criar Template
async function handleTemplateCreate(e) {
  e.preventDefault();

  const name = document.getElementById('tpl-new-name').value;
  const content = document.getElementById('tpl-new-content').value;

  try {
    const res = await apiFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ name, content })
    });

    if (res.success) {
      showToast('Template adicionado com sucesso!', 'success');
      document.getElementById('template-create-form').reset();
      loadTemplates();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Deletar Template
async function deleteTemplate(id) {
  if (!confirm('Deseja deletar este template da biblioteca?')) return;

  try {
    const res = await apiFetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.success) {
      showToast('Template excluído!', 'success');
      loadTemplates();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Usar Template no Scheduler
function useTemplateInScheduler(id) {
  const tpl = state.templates.find(t => t.id === id);
  if (!tpl) return;

  switchTab('tab-scheduler');
  document.getElementById('sched-message').value = tpl.content;
  updateMockPreview();
  showToast(`Template '${tpl.name}' carregado no editor!`, 'success');
}

// ==========================================
// CONTROLADOR 7: FILA E HISTÓRICO DE ENVIOS
// ==========================================
async function loadHistory(silent = false) {
  const tableBody = document.getElementById('history-table-body');
  const tableFooter = document.getElementById('history-table-footer');

  if (!silent) {
    tableBody.innerHTML = '<tr><td colspan="8" class="text-center">Carregando histórico e fila...</td></tr>';
  }

  try {
    // Carrega campanhas no filtro de histórico apenas uma vez na primeira abertura
    if (!silent) {
      const filterCamp = document.getElementById('history-campaign-filter');
      const currentSelected = filterCamp.value;
      filterCamp.innerHTML = '<option value="">Todas as Campanhas</option>';
      const camps = await apiFetch('/api/campaigns');
      camps.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.name;
        if (c.id === currentSelected) option.selected = true;
        filterCamp.appendChild(option);
      });
    }

    const campaignId = document.getElementById('history-campaign-filter').value;
    const status = document.getElementById('history-status-filter').value;
    const q = document.getElementById('history-search-input').value;

    const url = `/api/messages?campaignId=${campaignId}&status=${status}&q=${encodeURIComponent(q)}`;
    const list = await apiFetch(url);
    state.history = list;

    tableBody.innerHTML = '';
    
    if (list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum registro encontrado na fila ou histórico.</td></tr>';
      tableFooter.textContent = 'Exibindo 0 registros';
      return;
    }

    list.forEach(m => {
      const tr = document.createElement('tr');
      
      // Formatação de status badge
      let statusBadge = '';
      if (m.status === 'enviada') statusBadge = '<span class="badge badge-success">Enviada</span>';
      else if (m.status === 'pendente') statusBadge = '<span class="badge badge-warning">Pendente</span>';
      else if (m.status === 'falha') statusBadge = '<span class="badge badge-danger">Falha</span>';

      // Truncar conteúdo da mensagem para exibição limpa
      const textTruncated = m.contentProcessed || m.contentRaw;
      const cleanText = textTruncated.length > 50 ? `${textTruncated.substring(0, 50)}...` : textTruncated;

      // Anexo
      const attachmentLabel = m.attachmentName 
        ? `<span title="${m.attachmentName}">📎 ${m.attachmentName.substring(0, 15)}</span>`
        : '-';

      // Horário Agendado / Disparado
      const targetDate = m.sentDate || m.scheduledDate;
      const formattedDate = targetDate
        ? `${new Date(targetDate).toLocaleDateString('pt-BR')} às ${new Date(targetDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : '-';

      // Botão Ações (Cancelar)
      let actionsBtn = '';
      if (m.status === 'pendente') {
        actionsBtn = `<button class="btn btn-secondary btn-small btn-cancel-msg" data-id="${m.id}">Cancelar</button>`;
      } else {
        actionsBtn = `<span class="text-muted">-</span>`;
      }

      tr.innerHTML = `
        <td>
          <strong>${m.contactName}</strong><br>
          <span class="text-muted">+${m.contactPhone}</span>
        </td>
        <td><span class="text-secondary" title="${textTruncated}">${cleanText}</span></td>
        <td>${formattedDate}</td>
        <td><span class="text-muted">${m.repeat || 'nenhuma'}</span></td>
        <td>${attachmentLabel}</td>
        <td>${statusBadge}</td>
        <td><span class="text-danger" style="font-size: 0.75rem">${m.error || '-'}</span></td>
        <td>${actionsBtn}</td>
      `;
      tableBody.appendChild(tr);
    });

    tableFooter.textContent = `Exibindo ${list.length} mensagem(ns) identificada(s)`;

  } catch (err) {
    if (!silent) {
      showToast('Erro ao carregar histórico: ' + err.message, 'error');
    }
  }
}

// Cancelar/Deletar Mensagem agendada da Fila
async function cancelMessage(id) {
  if (!confirm('Deseja realmente cancelar este disparo e retirá-lo da fila?')) return;

  try {
    const res = await apiFetch(`/api/messages/${id}/cancel`, { method: 'POST' });
    if (res.success) {
      showToast('Envio cancelado e removido da fila.', 'success');
      loadHistory();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Reenviar todas as falhas
async function resendFailedMessages() {
  if (!confirm('Deseja reenviar imediatamente todas as mensagens com status de falha?')) return;

  try {
    showToast('Reenfileirando mensagens falhas...', 'warning');
    const campaignId = document.getElementById('history-campaign-filter').value;
    const res = await apiFetch('/api/messages/resend-failed', {
      method: 'POST',
      body: JSON.stringify({ campaignId })
    });

    if (res.success) {
      showToast(`Sucesso! ${res.count} mensagens falhas retornaram para a fila pendente.`, 'success');
      loadHistory();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// EVENT LISTENERS & WIDGET HELPERS
// ==========================================
function setupEventListeners() {
  // 1. LOGIN FORM
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const alertBox = document.getElementById('login-alert');
    alertBox.classList.add('hidden');

    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p })
      });
      
      if (data.success) {
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('zap_token', data.token);
        showDashboard();
        showToast('Bem-vindo ao painel ZapCampaign!', 'success');
      }
    } catch (err) {
      alertBox.textContent = err.message;
      alertBox.classList.remove('hidden');
    }
  });

  // LOGOUT
  document.getElementById('btn-logout').addEventListener('click', logout);

  // 2. SPA TAB SWITCHING
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const tabId = e.currentTarget.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // 3. WHATSAPP CONNECTION ACTIONS
  document.getElementById('btn-wpp-connect').addEventListener('click', connectWhatsApp);
  document.getElementById('btn-wpp-disconnect').addEventListener('click', disconnectWhatsApp);
  
  // 3b. SAFETY SETTINGS ACTIONS
  const settingsForm = document.getElementById('settings-antiban-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', saveSettings);
  }

  // 4. SCHEDULER ACTIONS & REALTIME PREVIEW MOCK
  document.getElementById('sched-contact-name').addEventListener('input', updateMockPreview);
  document.getElementById('sched-contact-phone').addEventListener('input', updateMockPreview);
  document.getElementById('sched-message').addEventListener('input', updateMockPreview);

  // Inserção automática de variáveis ao clicar nos badges
  document.querySelectorAll('.var-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      const varName = e.currentTarget.getAttribute('data-var');
      insertVariableIntoMessage(varName);
    });
  });

  // Mudança do Seletor de Modo (Individual vs Massa)
  document.getElementById('btn-mode-single').addEventListener('click', () => {
    document.getElementById('sched-is-mass').value = 'false';
    document.getElementById('sched-fields-single').classList.remove('hidden');
    document.getElementById('sched-fields-mass').classList.add('hidden');
    document.getElementById('btn-mode-single').classList.add('active');
    document.getElementById('btn-mode-mass').classList.remove('active');
    updateMockPreview();
  });

  document.getElementById('btn-mode-mass').addEventListener('click', () => {
    document.getElementById('sched-is-mass').value = 'true';
    document.getElementById('sched-fields-single').classList.add('hidden');
    document.getElementById('sched-fields-mass').classList.remove('hidden');
    document.getElementById('btn-mode-single').classList.remove('active');
    document.getElementById('btn-mode-mass').classList.add('active');
    updateMockPreview();
  });

  // Upload anexo opcional de mensagem
  document.getElementById('sched-attachment').addEventListener('change', (e) => {
    const fileView = document.getElementById('mock-media-file-view');
    const fileLabel = document.getElementById('mock-media-filename-txt');
    
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      fileView.classList.remove('hidden');
      fileLabel.textContent = file.name;
    } else {
      fileView.classList.add('hidden');
    }
  });

  // SUBMIT FORM SCHEDULER
  document.getElementById('scheduler-form').addEventListener('submit', submitSchedule);

  // 5. CRM (CONTACTS) SEARCH & FORM ACTIONS
  document.getElementById('crm-search-input').addEventListener('input', loadContactsCRM);
  document.getElementById('btn-add-contact').addEventListener('click', () => openContactModal(null));
  document.getElementById('btn-close-contact-modal').addEventListener('click', closeContactModal);
  document.getElementById('btn-cancel-contact').addEventListener('click', closeContactModal);
  document.getElementById('crm-contact-submit-form').addEventListener('submit', saveContactSubmit);

  // Lidar com clique em Editar/Excluir contatos da Tabela CRM
  document.getElementById('crm-contacts-table-body').addEventListener('click', (e) => {
    const target = e.target;
    
    // Editar
    const editBtn = target.closest('.btn-edit-contact');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      const contact = state.contacts.find(c => c.id === id);
      if (contact) openContactModal(contact);
    }

    // Excluir
    const deleteBtn = target.closest('.btn-delete-contact');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-id');
      deleteContact(id);
    }
  });

  // 6. DRAG AND DROP SPREADSHEETS IMPORT CRM & SCHEDULER
  const dropzones = [
    document.getElementById('mass-file-dropzone')
  ];

  dropzones.forEach(dz => {
    if (!dz) return;
    
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.style.borderColor = 'var(--color-primary)';
      dz.style.background = 'rgba(6, 182, 212, 0.05)';
    });

    dz.addEventListener('dragleave', () => {
      dz.style.borderColor = 'var(--border-color)';
      dz.style.background = 'rgba(0, 0, 0, 0.15)';
    });

    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.style.borderColor = 'var(--border-color)';
      dz.style.background = 'rgba(0, 0, 0, 0.15)';
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleSpreadsheetUpload(files[0]);
      }
    });

    dz.addEventListener('click', () => {
      document.getElementById('mass-spreadsheet-input').click();
    });
  });

  document.getElementById('mass-spreadsheet-input').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSpreadsheetUpload(e.target.files[0]);
    }
  });

  document.getElementById('btn-change-sheet').addEventListener('click', () => {
    document.getElementById('mass-file-dropzone').classList.remove('hidden');
    document.getElementById('mass-file-info').classList.add('hidden');
    document.getElementById('mass-spreadsheet-input').value = '';
    state.tempFilePath = null;
  });

  // Abrir modal importador de contatos do CRM principal
  document.getElementById('btn-open-mass-import').addEventListener('click', () => {
    document.getElementById('mass-spreadsheet-input').click();
  });

  // Fechar Modal Assistente de Mapeamento Planilhas
  document.getElementById('btn-close-import-modal').addEventListener('click', () => {
    document.getElementById('modal-import-assistant').classList.add('hidden');
  });
  document.getElementById('btn-cancel-import').addEventListener('click', () => {
    document.getElementById('modal-import-assistant').classList.add('hidden');
  });
  document.getElementById('import-mapping-form').addEventListener('submit', confirmImportMapping);
  document.getElementById('btn-reopen-mapper').addEventListener('click', () => {
    if (state.spreadsheetHeaders.length > 0) {
      setupImportMappingModal(state.spreadsheetHeaders);
    }
  });

  // 7. CAMPAIGN MANAGER ACTIONS
  document.getElementById('campaign-create-form').addEventListener('submit', handleCampaignCreate);
  document.getElementById('campaigns-table-body').addEventListener('click', (e) => {
    const target = e.target;
    
    // Toggle Status (Pausar/Ativar)
    const toggleBtn = target.closest('.btn-toggle-camp');
    if (toggleBtn) {
      const id = toggleBtn.getAttribute('data-id');
      const status = toggleBtn.getAttribute('data-status');
      toggleCampaign(id, status);
    }

    // Duplicar
    const dupBtn = target.closest('.btn-duplicate-camp');
    if (dupBtn) {
      const id = dupBtn.getAttribute('data-id');
      const name = dupBtn.getAttribute('data-name');
      duplicateCampaign(id, name);
    }

    // Excluir
    const delBtn = target.closest('.btn-delete-camp');
    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      deleteCampaign(id);
    }
  });

  // 8. TEMPLATE LIBRARY ACTIONS
  document.getElementById('template-create-form').addEventListener('submit', handleTemplateCreate);
  document.getElementById('templates-library-grid').addEventListener('click', (e) => {
    const target = e.target;
    
    // Usar template
    const useBtn = target.closest('.btn-use-tpl');
    if (useBtn) {
      const id = useBtn.getAttribute('data-id');
      useTemplateInScheduler(id);
    }

    // Excluir template
    const delBtn = target.closest('.btn-delete-tpl');
    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      deleteTemplate(id);
    }
  });

  // 9. HISTORY FILTERS & ACTIONS
  document.getElementById('history-campaign-filter').addEventListener('change', () => loadHistory());
  document.getElementById('history-status-filter').addEventListener('change', () => loadHistory());
  document.getElementById('history-search-input').addEventListener('input', () => loadHistory());
  
  document.getElementById('btn-history-resend-failed').addEventListener('click', resendFailedMessages);

  // Monitorar clique em Cancelar mensagens da Fila de Histórico
  document.getElementById('history-table-body').addEventListener('click', (e) => {
    const target = e.target;
    
    const cancelBtn = target.closest('.btn-cancel-msg');
    if (cancelBtn) {
      const id = cancelBtn.getAttribute('data-id');
      cancelMessage(id);
    }
  });

  // Botão Refresh no Logs Painel
  document.getElementById('btn-refresh-logs').addEventListener('click', loadDashboardStats);
}

// ==========================================
// GLOWING TOAST NOTIFICATIONS WIDGET
// ==========================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '🔔';
  if (type === 'success') icon = '✓';
  else if (type === 'error') icon = '✗';
  else if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `
    <span>${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Autodestruição após 3.5 segundos
  setTimeout(() => {
    toast.style.animation = 'fadeIn 0.3s reverse';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}
