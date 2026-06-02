/**
 * Controlador de Lógica do Painel Administrativo
 */

let activeSection = 'dashboard';
let availableTemplates = [];
let selectedTemplateId = '';
let parsedSpreadsheetHeaders = [];
let parsedSpreadsheetRows = [];
let activeTemplateForEmission = null;

// Modais ativos e ID selecionado
let currentActiveTplId = null;
let currentActiveCertId = null;

// Inicialização Geral
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Proteger página e carregar dados do usuário
  if (!Auth.protectPage()) return;
  
  const user = Auth.getUser();
  document.getElementById('user-display-name').textContent = user.name;
  document.getElementById('user-display-role').textContent = user.role;
  document.getElementById('user-avatar-char').textContent = user.name.charAt(0).toUpperCase();

  // Esconder botões restritos no front se não for admin nem coordenador
  if (user.role !== 'admin' && user.role !== 'coordenador') {
    document.getElementById('tpl-drag-zone').style.pointerEvents = 'none';
    document.getElementById('template-upload-form').querySelector('button[type="submit"]').disabled = true;
  }

  // 2. Inicializar renderizador de PDF
  try {
    await CertificateRenderer.init();
    console.log('Motor de PDF e QR Code inicializado com sucesso.');
  } catch (err) {
    console.error('Falha ao carregar bibliotecas de PDF:', err);
  }

  // 3. Carregar dados iniciais do Dashboard
  await loadDashboardStats();
  await loadTemplatesList();
  
  // Registrar Listeners Globais
  setupThemeToggle();
  setupUploadZones();
  setupFormSubmits();
});

// Alternar Tema (Claro / Escuro)
function setupThemeToggle() {
  const themeBtn = document.getElementById('theme-toggle');
  
  themeBtn.addEventListener('click', () => {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  });

  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
  themeBtn.innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

// Alternar entre Seções do Painel Administrativo
async function switchSection(sectionId) {
  // Atualizar Sidebar
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });
  const activeMenu = document.getElementById(`menu-${sectionId}`);
  if (activeMenu) activeMenu.classList.add('active');

  // Alternar Visibilidade
  document.querySelectorAll('.admin-section').forEach(sec => {
    sec.classList.remove('active');
  });
  const targetSec = document.getElementById(`section-${sectionId}`);
  if (targetSec) targetSec.classList.add('active');

  activeSection = sectionId;

  // Atualizar Títulos da Página
  const titles = {
    dashboard: { title: 'Painel de Indicadores', subtitle: 'Visão geral do sistema de emissões' },
    templates: { title: 'Gestão de Modelos (Imagens)', subtitle: 'Cadastro de templates oficiais em imagem (.PNG, .JPG)' },
    emission: { title: 'Central de Emissão em Lote', subtitle: 'Processamento em lote via planilhas XLSX e CSV' },
    repo: { title: 'Biblioteca de Certificados Digitais', subtitle: 'Consulta de registro permanente e rastreabilidade' },
    audit: { title: 'Rastreabilidade de Auditoria', subtitle: 'Histórico completo de acessos e modificações' }
  };

  document.getElementById('page-title').textContent = titles[sectionId].title;
  document.getElementById('page-subtitle').textContent = titles[sectionId].subtitle;

  // Atualizar dados de acordo com a aba
  if (sectionId === 'dashboard') {
    await loadDashboardStats();
  } else if (sectionId === 'templates') {
    await loadTemplatesList();
  } else if (sectionId === 'emission') {
    await loadEmissionTemplatesDropdown();
    resetEmissionWizard();
  } else if (sectionId === 'repo') {
    await loadRepositoryList();
  } else if (sectionId === 'audit') {
    await loadAuditLogsList();
  }
}

// ==========================================
// ABA 1: DASHBOARD
// ==========================================

async function loadDashboardStats() {
  try {
    const response = await fetch('/api/dashboard/stats', {
      headers: Auth.getAuthHeaders()
    });
    if (!response.ok) throw new Error();

    const data = await response.json();
    
    // Injetar Indicadores
    document.getElementById('stat-total').textContent = data.metrics.total;
    document.getElementById('stat-active').textContent = data.metrics.active;
    document.getElementById('stat-validations').textContent = data.metrics.validations;
    document.getElementById('stat-cancelled').textContent = data.metrics.cancelled;

    // Renderizar gráfico de cursos (Top 5)
    const chartContainer = document.getElementById('courses-chart-container');
    chartContainer.innerHTML = '';

    if (data.courseStats && data.courseStats.length > 0) {
      const maxVal = Math.max(...data.courseStats.map(s => s.count));
      
      data.courseStats.forEach(course => {
        const percent = maxVal > 0 ? (course.count / maxVal) * 100 : 0;
        
        const row = document.createElement('div');
        row.className = 'bar-chart-row';
        row.innerHTML = `
          <div class="bar-chart-label">
            <span>${course.name}</span>
            <strong>${course.count}</strong>
          </div>
          <div class="bar-chart-track">
            <div class="bar-chart-fill" style="width: ${percent}%"></div>
          </div>
        `;
        chartContainer.appendChild(row);
      });
    } else {
      chartContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhuma emissão registrada para gerar gráficos.</p>';
    }

    // Renderizar logs recentes
    const logsContainer = document.getElementById('dashboard-logs-container');
    logsContainer.innerHTML = '';

    if (data.recentLogs && data.recentLogs.length > 0) {
      data.recentLogs.forEach(log => {
        const d = new Date(log.timestamp);
        const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
          <div class="log-meta">
            <span>👤 ${log.user.name || 'Público'} (${log.user.username})</span>
            <span>🕒 ${dateStr}</span>
          </div>
          <div>
            <span class="log-action">[${log.action.toUpperCase()}]</span> ${log.details}
          </div>
        `;
        logsContainer.appendChild(item);
      });
    } else {
      logsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.8rem;">Nenhum log registrado.</p>';
    }

  } catch (err) {
    console.error('Erro ao carregar estatísticas do dashboard:', err);
  }
}

// ==========================================
// ABA 2: GESTÃO DE TEMPLATES (MODELOS)
// ==========================================

async function loadTemplatesList() {
  try {
    const response = await fetch('/api/templates', {
      headers: Auth.getAuthHeaders()
    });
    if (!response.ok) throw new Error();

    const templates = await response.json();
    availableTemplates = templates;

    const container = document.getElementById('templates-list-container');
    container.innerHTML = '';

    if (templates.length === 0) {
      container.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhum modelo cadastrado. Envie um arquivo de imagem (.PNG ou .JPG) para começar.</td></tr>';
      return;
    }

    templates.forEach(tpl => {
      const tr = document.createElement('tr');
      
      const themeLabel = {
        classic: 'Classic Gold',
        royal: 'Royal Navy',
        modern: 'Modern Minimalist',
        emerald: 'Emerald Academic'
      }[tpl.theme] || tpl.theme;

      const user = Auth.getUser();
      const isAdmin = user && user.role === 'admin';

      tr.innerHTML = `
        <td style="font-weight: 600;">
          ${tpl.name}
          <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top: 4px;">
            ${tpl.description || 'Sem descrição'}
          </div>
        </td>
        <td>
          <span class="status-pill" style="background: rgba(59,130,246,0.1); color: var(--primary-light);">${themeLabel}</span>
        </td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <code>${tpl.placeholders.map(p => `{{${p}}}`).join(', ') || 'Nenhum placeholder mapeado'}</code>
        </td>
        <td>
          <div class="action-buttons">
            <button class="action-btn" onclick="openTemplateThemeModal('${tpl.id}', '${tpl.theme}')" title="Configurar Tema"><i class="fa-solid fa-palette"></i></button>
            <button class="action-btn" onclick="openTemplateTextModal('${tpl.id}')" title="Visualizar / Editar Texto"><i class="fa-solid fa-file-lines"></i></button>
            <button class="action-btn" onclick="openTemplatePreviewModal('${tpl.id}')" title="Visualizar Modelo Visual"><i class="fa-solid fa-eye"></i></button>
            ${isAdmin ? `<button class="action-btn btn-cancel" onclick="deleteTemplate('${tpl.id}')" title="Apagar Modelo"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
        </td>
      `;
      container.appendChild(tr);
    });

  } catch (err) {
    console.error('Erro ao listar templates:', err);
  }
}

// Configurar upload e drag-and-drop de arquivos
function setupUploadZones() {
  // Drag zone do Template DOCX
  const tplZone = document.getElementById('tpl-drag-zone');
  const tplInput = document.getElementById('tpl-file-input');
  const tplPreview = document.getElementById('tpl-file-name-preview');

  tplZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    tplZone.classList.add('dragover');
  });

  tplZone.addEventListener('dragleave', () => {
    tplZone.classList.remove('dragover');
  });

  tplZone.addEventListener('drop', (e) => {
    e.preventDefault();
    tplZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      tplInput.files = e.dataTransfer.files;
      tplPreview.textContent = `Arquivo selecionado: ${tplInput.files[0].name}`;
    }
  });

  tplInput.addEventListener('change', () => {
    if (tplInput.files.length > 0) {
      tplPreview.textContent = `Arquivo selecionado: ${tplInput.files[0].name}`;
    }
  });

  // Drag zone da Planilha de Alunos
  const listZone = document.getElementById('list-drag-zone');
  const listInput = document.getElementById('list-file-input');
  const listPreview = document.getElementById('list-file-name-preview');
  const btnNext = document.getElementById('btn-next-to-mapping');

  listZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    listZone.classList.add('dragover');
  });

  listZone.addEventListener('dragleave', () => {
    listZone.classList.remove('dragover');
  });

  listZone.addEventListener('drop', (e) => {
    e.preventDefault();
    listZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      listInput.files = e.dataTransfer.files;
      listPreview.textContent = `Planilha selecionada: ${listInput.files[0].name}`;
      processSpreadsheetUpload(listInput.files[0]);
    }
  });

  listInput.addEventListener('change', () => {
    if (listInput.files.length > 0) {
      listPreview.textContent = `Planilha selecionada: ${listInput.files[0].name}`;
      processSpreadsheetUpload(listInput.files[0]);
    }
  });
}

// Enviar formulário de criação de template
function setupFormSubmits() {
  document.getElementById('template-upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('tpl-file-input');
    if (fileInput.files.length === 0) {
      alert('Selecione um arquivo de imagem (PNG, JPG, JPEG) primeiro.');
      return;
    }

    const tplName = document.getElementById('tpl-name').value.trim();
    const tplDesc = document.getElementById('tpl-desc').value.trim();
    const tplTheme = document.getElementById('tpl-theme').value;

    const formData = new FormData();
    formData.append('templateFile', fileInput.files[0]);
    formData.append('name', tplName);
    formData.append('description', tplDesc);
    formData.append('theme', tplTheme);

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';

    try {
      const response = await fetch('/api/templates/upload', {
        method: 'POST',
        headers: Auth.getAuthHeaders(),
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao subir template.');
      }

      alert('Modelo de Certificado (Imagem) cadastrado e placeholders mapeados!');
      document.getElementById('template-upload-form').reset();
      document.getElementById('tpl-file-name-preview').textContent = '';
      await loadTemplatesList();

    } catch (err) {
      alert('Falha no upload: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Carregar Modelo';
    }
  });
}

// Modal de Tema do Template
function openTemplateThemeModal(id, currentTheme) {
  currentActiveTplId = id;
  document.getElementById('modal-theme-select').value = currentTheme;
  document.getElementById('modal-theme').style.display = 'flex';
}

document.getElementById('btn-save-template-theme').addEventListener('click', async () => {
  if (!currentActiveTplId) return;

  const newTheme = document.getElementById('modal-theme-select').value;
  try {
    const response = await fetch(`/api/templates/${currentActiveTplId}/theme`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...Auth.getAuthHeaders()
      },
      body: JSON.stringify({ theme: newTheme })
    });

    if (!response.ok) throw new Error();

    alert('Tema atualizado com sucesso.');
    closeModal('theme');
    await loadTemplatesList();
  } catch (err) {
    alert('Erro ao atualizar tema.');
  }
});

// Modal de Texto do Template
async function openTemplateTextModal(id) {
  currentActiveTplId = id;
  const tpl = availableTemplates.find(t => t.id === id);
  if (!tpl) return;

  const user = Auth.getUser();
  const isCreatedByCoordinator = tpl.createdByRole === 'coordenador';
  const canEdit = user.role === 'admin' || (user.role === 'coordenador' && isCreatedByCoordinator);

  const titleEl = document.getElementById('modal-text-title');
  const textareaEl = document.getElementById('modal-text-content');
  const saveBtn = document.getElementById('btn-save-template-text');
  const noticeEl = document.getElementById('modal-text-permission-notice');

  titleEl.textContent = `Texto do Modelo: ${tpl.name}`;
  textareaEl.value = tpl.rawText || '';

  if (canEdit) {
    textareaEl.readOnly = false;
    textareaEl.style.opacity = '1';
    saveBtn.style.display = 'inline-block';
    noticeEl.textContent = isCreatedByCoordinator 
      ? 'Adicionado por Coordenador (Editável)' 
      : 'Modelo Administrativo (Editável)';
    noticeEl.style.color = 'var(--success)';
  } else {
    textareaEl.readOnly = true;
    textareaEl.style.opacity = '0.7';
    saveBtn.style.display = 'none';
    noticeEl.textContent = 'Somente leitura (Adicionado por Administrador)';
    noticeEl.style.color = 'var(--error)';
  }

  document.getElementById('modal-text').style.display = 'flex';
}

document.getElementById('btn-save-template-text').addEventListener('click', async () => {
  if (!currentActiveTplId) return;

  const newText = document.getElementById('modal-text-content').value;

  try {
    const response = await fetch(`/api/templates/${currentActiveTplId}/text`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...Auth.getAuthHeaders()
      },
      body: JSON.stringify({ rawText: newText })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro ao atualizar texto.');
    }

    alert('Texto do modelo atualizado com sucesso.');
    closeModal('text');
    await loadTemplatesList();
  } catch (err) {
    alert('Erro ao atualizar texto: ' + err.message);
  }
});

// Modal de Visualização do Certificado Modelo
async function openTemplatePreviewModal(id) {
  const tpl = availableTemplates.find(t => t.id === id);
  if (!tpl) return;

  const titleEl = document.getElementById('modal-preview-title');
  titleEl.textContent = `Visualização do Modelo: ${tpl.name}`;

  // Configurar link do arquivo original
  const downloadBtn = document.getElementById('btn-download-original-file');
  downloadBtn.href = tpl.fileUrl;
  
  const ext = tpl.fileUrl.split('.').pop().toUpperCase();
  downloadBtn.innerHTML = `<i class="fa-solid fa-cloud-download"></i> Baixar Arquivo Anexo (.${ext})`;

  // Renderizar o certificado de demonstração
  const mockCert = {
    id: 'demo_preview',
    templateFileUrl: tpl.fileUrl,
    certificateNumber: 'UNIVC-2026-0000',
    studentName: 'João da Silva (Demonstração)',
    studentCpf: '111.222.333-44',
    courseName: tpl.name,
    validationCode: 'UNIVC-2026-DEMO-TEST',
    issueDate: '01 de Janeiro de 2026',
    status: 'valido',
    pdfUploaded: false,
    pdfUrl: null,
    cancellationReason: null,
    data: {
      nome: 'João da Silva (Demonstração)',
      cpf: '111.222.333-44',
      curso: tpl.name,
      carga_horaria: '40',
      data_conclusao: '01 de Janeiro de 2026',
      email: 'joao.demonstracao@univc.edu.br'
    }
  };

  const container = document.getElementById('modal-preview-certificate-container');
  container.innerHTML = '';

  const theme = tpl.theme || 'classic';
  const renderedElement = CertificateRenderer.renderDOM(mockCert, theme, tpl.rawText);
  container.appendChild(renderedElement);

  document.getElementById('modal-preview').style.display = 'flex';
}

// Deletar Modelo
async function deleteTemplate(id) {
  if (!confirm('Deseja realmente excluir este modelo de certificado?')) return;

  try {
    const response = await fetch(`/api/templates/${id}`, {
      method: 'DELETE',
      headers: Auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error();
    alert('Modelo de certificado excluído.');
    await loadTemplatesList();
  } catch (err) {
    alert('Falha ao excluir modelo.');
  }
}

// ==========================================
// ABA 3: EMISSÃO EM LOTE (WIZARD)
// ==========================================

async function loadEmissionTemplatesDropdown() {
  try {
    const response = await fetch('/api/templates', {
      headers: Auth.getAuthHeaders()
    });
    if (!response.ok) throw new Error();
    const templates = await response.json();

    const select = document.getElementById('emission-tpl-select');
    select.innerHTML = '<option value="" style="color: #000;">Selecione um modelo acadêmico...</option>';
    
    templates.forEach(tpl => {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.style.color = '#000';
      opt.textContent = tpl.name;
      select.appendChild(opt);
    });

  } catch (e) {
    console.error(e);
  }
}

// Configurar mudança de modelo para exibir colunas recomendadas da planilha
document.getElementById('emission-tpl-select').addEventListener('change', (e) => {
  const tplId = e.target.value;
  const infoDiv = document.getElementById('expected-columns-info');
  if (!tplId) {
    infoDiv.style.display = 'none';
    return;
  }

  const tpl = availableTemplates.find(t => t.id === tplId);
  if (tpl) {
    const placeholders = tpl.placeholders || [];
    infoDiv.innerHTML = `
      <div style="display: flex; gap: 8px; align-items: flex-start;">
        <i class="fa-solid fa-circle-info" style="margin-top: 3px; color: var(--primary-light);"></i>
        <div>
          <strong>Colunas recomendadas para a planilha deste modelo:</strong><br>
          <div style="margin: 8px 0; display: flex; flex-wrap: wrap; gap: 6px;">
            <code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; color: #fff;">Nome</code>
            ${placeholders.map(p => {
              if (p === 'nome') return ''; // Já colocamos acima em destaque
              return `<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; font-family: monospace;">${p}</code>`;
            }).filter(Boolean).join(' ')}
            <code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; font-family: monospace; color: var(--text-muted);">Email</code>
          </div>
          <span style="font-size: 0.76rem; opacity: 0.8;">A coluna <strong>Nome</strong> é obrigatória. A coluna <strong>Email</strong> é recomendada para o envio das notificações aos formandos.</span>
        </div>
      </div>
    `;
    infoDiv.style.display = 'block';
  } else {
    infoDiv.style.display = 'none';
  }
});

function resetEmissionWizard() {
  document.getElementById('list-file-input').value = '';
  document.getElementById('list-file-name-preview').textContent = '';
  document.getElementById('btn-next-to-mapping').disabled = true;
  document.getElementById('emission-step-1').className = 'glass-panel wizard-step active';
  document.getElementById('emission-step-2').className = 'glass-panel wizard-step';
  document.getElementById('emission-step-3').className = 'glass-panel wizard-step';
  
  parsedSpreadsheetHeaders = [];
  parsedSpreadsheetRows = [];
  activeTemplateForEmission = null;
}

// Upload temporário para extração de cabeçalhos da planilha
async function processSpreadsheetUpload(file) {
  const selectTpl = document.getElementById('emission-tpl-select');
  selectedTemplateId = selectTpl.value;
  
  if (!selectedTemplateId) {
    alert('Por favor, selecione primeiro o modelo de certificado para esta emissão.');
    document.getElementById('list-file-input').value = '';
    document.getElementById('list-file-name-preview').textContent = '';
    return;
  }

  activeTemplateForEmission = availableTemplates.find(t => t.id === selectedTemplateId);

  const formData = new FormData();
  formData.append('studentListFile', file);

  const nextBtn = document.getElementById('btn-next-to-mapping');
  nextBtn.disabled = true;
  nextBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Lendo arquivo...';

  try {
    const response = await fetch('/api/import/preview', {
      method: 'POST',
      headers: Auth.getAuthHeaders(),
      body: formData
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro ao processar planilha.');
    }

    const data = await response.json();
    parsedSpreadsheetHeaders = data.headers;
    // O backend retorna um preview, mas para processar localmente iremos enviar as linhas na emissão.
    // Como a leitura é rápida, para fins locais iremos carregar a planilha no navegador via xlsx.js ou
    // enviar as linhas diretamente. Para segurança absoluta e robustez total, leremos a planilha 
    // localmente no frontend usando a biblioteca do XLSX e armazenando os dados em parsedSpreadsheetRows!
    // Isso evita trafegar megabytes pelo servidor Express desnecessariamente e garante velocidade em lote!
    
    // Leitura local da planilha
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataBin = e.target.result;
      const workbook = XLSX.read(dataBin, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      // Ler todas as linhas formatadas como JSON
      parsedSpreadsheetRows = XLSX.utils.sheet_to_json(worksheet);
      
      console.log(`Planilha lida localmente. Total de linhas detectadas: ${parsedSpreadsheetRows.length}`);
      
      if (parsedSpreadsheetRows.length === 0) {
        alert('A planilha está vazia.');
        return;
      }

      nextBtn.disabled = false;
      nextBtn.innerHTML = 'Avançar para Mapeamento <i class="fa-solid fa-arrow-right"></i>';
    };

    reader.readAsBinaryString(file);

  } catch (err) {
    alert(err.message);
    nextBtn.innerHTML = 'Avançar para Mapeamento <i class="fa-solid fa-arrow-right"></i>';
  }
}

// Abrir aba de mapeamento (Passo 2)
document.getElementById('btn-next-to-mapping').addEventListener('click', () => {
  if (!activeTemplateForEmission || parsedSpreadsheetHeaders.length === 0) return;

  const container = document.getElementById('mapping-list-container');
  container.innerHTML = '';

  const placeholders = activeTemplateForEmission.placeholders || [];

  // Gerar um seletor de mapeamento para cada placeholder do DOCX
  placeholders.forEach(placeholder => {
    const card = document.createElement('div');
    card.className = 'mapping-card glass-panel';
    
    // Criar opções de selects
    let selectOptions = `<option value="">-- Não Mapear (Deixar Vazio) --</option>`;
    
    parsedSpreadsheetHeaders.forEach(header => {
      // Tentativa de auto-mapeamento por keywords
      const isMatch = autoMatchKeywords(placeholder, header);
      selectOptions += `<option value="${header}" ${isMatch ? 'selected' : ''}>${header}</option>`;
    });

    card.innerHTML = `
      <label>{{${placeholder}}}</label>
      <span class="placeholder-desc">Selecione a coluna equivalente da planilha correspondente</span>
      <select class="input-field mapping-select" data-placeholder="${placeholder}" style="background: rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.85rem; padding: 8px 12px; margin-top: 5px;">
        ${selectOptions}
      </select>
    `;
    container.appendChild(card);
  });

  // Alternar passos
  document.getElementById('emission-step-1').className = 'glass-panel wizard-step';
  document.getElementById('emission-step-2').className = 'glass-panel wizard-step active';
});

// Auto matching inteligente
function autoMatchKeywords(placeholder, header) {
  const p = placeholder.toLowerCase().replace(/\s+/g, '');
  const h = header.toLowerCase().replace(/\s+/g, '').replace(/_/g, '').replace(/-/g, '');
  
  if (p === 'nome' && (h === 'nome' || h === 'aluno' || h === 'nomecompleto' || h === 'nomealuno' || h === 'estudante')) return true;
  if (p === 'cpf' && (h === 'cpf' || h === 'documento' || h === 'cpfaluno')) return true;
  if (p === 'curso' && (h === 'curso' || h === 'graduacao' || h === 'formacao')) return true;
  if (p === 'cargahoraria' && (h === 'cargahoraria' || h === 'carga' || h === 'horas' || h === 'duracao')) return true;
  if (p === 'dataconclusao' && (h === 'dataconclusao' || h === 'conclusao' || h === 'data' || h === 'fim')) return true;
  if (p === 'email' && (h === 'email' || h === 'e-mail' || h === 'contato')) return true;
  
  return p === h;
}

document.getElementById('btn-back-to-upload').addEventListener('click', () => {
  document.getElementById('emission-step-2').className = 'glass-panel wizard-step';
  document.getElementById('emission-step-1').className = 'glass-panel wizard-step active';
});

// DISPARAR EMISSÃO EM LOTE (FASES 1 E 2 COMBINADAS)
document.getElementById('btn-start-batch-emission').addEventListener('click', async () => {
  if (parsedSpreadsheetRows.length === 0) return;

  // 1. Coletar o mapeamento de colunas selecionado pelo usuário
  const mapping = {};
  const selects = document.querySelectorAll('.mapping-select');
  
  let nameMapped = false;
  selects.forEach(sel => {
    const p = sel.getAttribute('data-placeholder');
    const h = sel.value;
    if (h) mapping[p] = h;
    if (p === 'nome' && h) nameMapped = true;
  });

  if (!nameMapped) {
    alert('Erro: O placeholder obrigatório {{nome}} deve estar mapeado para alguma coluna da planilha de alunos.');
    return;
  }

  // 2. Switch para progresso (Passo 3)
  document.getElementById('emission-step-2').className = 'glass-panel wizard-step';
  document.getElementById('emission-step-3').className = 'glass-panel wizard-step active';

  const progressTitle = document.getElementById('batch-progress-title');
  const progressFill = document.getElementById('batch-progress-fill');
  const progressPercent = document.getElementById('batch-progress-percent');
  const progressCurrent = document.getElementById('batch-progress-current');
  const progressTotal = document.getElementById('batch-progress-total');
  const progressStudent = document.getElementById('batch-current-student');

  progressTotal.textContent = parsedSpreadsheetRows.length;
  progressCurrent.textContent = '0';
  progressPercent.textContent = '0';
  progressFill.style.width = '0%';

  try {
    // FASE 1: Registrar o lote no banco de dados e obter metadados / códigos de autenticação gerados
    progressTitle.textContent = 'Registrando lote no banco institucional...';
    
    const emitResponse = await fetch('/api/certificates/emit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...Auth.getAuthHeaders()
      },
      body: JSON.stringify({
        templateId: selectedTemplateId,
        students: parsedSpreadsheetRows,
        columnMapping: mapping
      })
    });

    if (!emitResponse.ok) {
      const err = await emitResponse.json();
      throw new Error(err.error || 'Erro na fase de registro de lote.');
    }

    const emitData = await emitResponse.json();
    const registeredCerts = emitData.certificates;

    // FASE 2: Geração progressiva em lote de PDFs de alta fidelidade e upload para o servidor (Storage)
    progressTitle.textContent = 'Gerando certificados digitais em PDF...';
    
    // Obter texto puro se o template tiver (simulado no frontend, ou fallback automático)
    // Para simplificar localmente, o CertificateRenderer gera o layout elegante
    const theme = activeTemplateForEmission.theme || 'classic';

    const renderingZone = document.getElementById('pdf-offscreen-rendering-zone');

    for (let i = 0; i < registeredCerts.length; i++) {
      const cert = registeredCerts[i];
      
      // Atualizar barra de progresso no UI
      const currentCount = i + 1;
      const percent = Math.round((currentCount / registeredCerts.length) * 100);
      
      progressCurrent.textContent = currentCount;
      progressPercent.textContent = percent;
      progressFill.style.width = `${percent}%`;
      progressStudent.textContent = `Emitindo: ${cert.studentName} (${cert.certificateNumber})`;

      // 1. Renderizar no viewport oculto
      renderingZone.innerHTML = '';
      const renderedElement = CertificateRenderer.renderDOM(cert, theme, activeTemplateForEmission.rawText);
      renderingZone.appendChild(renderedElement);

      // Aguardar pequenos milissegundos para montagem do QR Code
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Compilar elemento HTML para arquivo PDF Blob em alta definição (DPI elevado)
      const pdfBlob = await CertificateRenderer.generatePdfBlob(renderedElement);

      // 3. Enviar PDF compilado ao backend no Storage permanente
      const uploadForm = new FormData();
      uploadForm.append('certificatePdf', pdfBlob, `certificado-${cert.id}.pdf`);

      const uploadResponse = await fetch(`/api/certificates/${cert.id}/upload-pdf`, {
        method: 'POST',
        headers: Auth.getAuthHeaders(),
        body: uploadForm
      });

      if (!uploadResponse.ok) {
        console.error(`Erro ao subir PDF do certificado ${cert.certificateNumber}`);
      }

      // Limpar elemento gerado
      renderingZone.innerHTML = '';
    }

    // Sucesso Completo!
    alert(`Sucesso! ${registeredCerts.length} certificados digitais oficiais foram gerados, assinados e arquivados no repositório digital.`);
    
    // Alternar aba para o Repositório para visualizar as emissões
    await switchSection('repo');

  } catch (err) {
    alert('Erro crítico durante emissão em lote: ' + err.message);
    resetEmissionWizard();
  }
});

// ==========================================
// ABA 4: REPOSITÓRIO DIGITAL & BUSCAS
// ==========================================

const repoSearch = document.getElementById('repo-search-input');
const repoFilterStatus = document.getElementById('repo-status-filter');
const repoFilterCourse = document.getElementById('repo-course-filter');
const repoSortOrder = document.getElementById('repo-sort-order');

repoSearch.addEventListener('input', debounce(() => {
  loadRepositoryList();
}, 400));

repoFilterStatus.addEventListener('change', () => {
  loadRepositoryList();
});

repoFilterCourse.addEventListener('change', () => {
  loadRepositoryList();
});

repoSortOrder.addEventListener('change', () => {
  loadRepositoryList();
});

// Cache global de cursos carregados para evitar piscar o dropdown toda hora
let loadedCoursesCache = [];

function populateCourseFilter(certs) {
  // Extrair cursos únicos de todos os certificados
  const courses = Array.from(new Set(certs.map(c => c.courseName).filter(Boolean)));
  courses.sort();

  // Verificar se a lista de cursos mudou antes de repopular (evita perder foco/seleção)
  if (JSON.stringify(courses) === JSON.stringify(loadedCoursesCache)) {
    return;
  }
  loadedCoursesCache = courses;

  const select = document.getElementById('repo-course-filter');
  const currentSelection = select.value;

  select.innerHTML = '<option value="" style="color: #000;">Todos os Cursos</option>';
  courses.forEach(course => {
    const opt = document.createElement('option');
    opt.value = course;
    opt.style.color = '#000';
    opt.textContent = course;
    select.appendChild(opt);
  });

  if (courses.includes(currentSelection)) {
    select.value = currentSelection;
  }
}

let selectedCertIdsForBulkCancel = [];

function updateBulkCancelButton() {
  const selectedCbs = document.querySelectorAll('.repo-row-select:checked');
  const count = selectedCbs.length;
  const btn = document.getElementById('btn-bulk-cancel');
  
  if (count > 0) {
    btn.style.display = 'inline-block';
    btn.disabled = false;
    document.getElementById('bulk-cancel-count').textContent = count;
  } else {
    btn.style.display = 'none';
    btn.disabled = true;
    document.getElementById('bulk-cancel-count').textContent = '0';
  }
}

// Configurar evento de clique para o Descarte em Massa
document.getElementById('btn-bulk-cancel').addEventListener('click', () => {
  const selectedCbs = document.querySelectorAll('.repo-row-select:checked');
  selectedCertIdsForBulkCancel = Array.from(selectedCbs).map(cb => cb.getAttribute('data-id'));
  
  currentActiveCertId = 'BULK';
  document.getElementById('cancel-reason-input').value = '';
  document.getElementById('modal-cancel').querySelector('h3').innerHTML = `<i class="fa-solid fa-ban"></i> Descarte em Massa de Certificados`;
  document.getElementById('modal-cancel').querySelector('p').textContent = `Atenção: Você está cancelando e invalidando legalmente ${selectedCertIdsForBulkCancel.length} certificados selecionados de uma só vez.`;
  document.getElementById('modal-cancel').style.display = 'flex';
});

async function loadRepositoryList() {
  try {
    // Buscar todos os certificados
    const response = await fetch('/api/certificates', {
      headers: Auth.getAuthHeaders()
    });
    if (!response.ok) throw new Error();

    const certs = await response.json();
    
    // Alimentar o filtro de cursos de forma dinâmica baseada no banco de dados completo
    populateCourseFilter(certs);

    // Filtragem em memória (Frontend) para maior agilidade e consistência dos filtros
    let filteredCerts = [...certs];

    // 1. Filtrar por Status
    const statusVal = repoFilterStatus.value;
    if (statusVal) {
      filteredCerts = filteredCerts.filter(c => c.status === statusVal);
    }

    // 2. Filtrar por Curso
    const courseVal = repoFilterCourse.value;
    if (courseVal) {
      filteredCerts = filteredCerts.filter(c => c.courseName === courseVal);
    }

    // 3. Filtrar por Busca Textual
    const searchVal = repoSearch.value.toLowerCase().trim();
    if (searchVal) {
      filteredCerts = filteredCerts.filter(c => 
        c.studentName.toLowerCase().includes(searchVal) ||
        c.studentCpf.includes(searchVal) ||
        c.courseName.toLowerCase().includes(searchVal) ||
        c.validationCode.toLowerCase().includes(searchVal) ||
        c.certificateNumber.toLowerCase().includes(searchVal)
      );
    }

    // 4. Ordenação
    const sortVal = repoSortOrder.value;
    if (sortVal === 'number_desc') {
      filteredCerts.sort((a, b) => b.certificateNumber.localeCompare(a.certificateNumber));
    } else if (sortVal === 'number_asc') {
      filteredCerts.sort((a, b) => a.certificateNumber.localeCompare(b.certificateNumber));
    } else if (sortVal === 'course_asc') {
      filteredCerts.sort((a, b) => a.courseName.localeCompare(b.courseName));
    } else if (sortVal === 'model_asc') {
      filteredCerts.sort((a, b) => {
        const getTemplateName = (templateId) => {
          const tpl = availableTemplates.find(t => t.id === templateId);
          return tpl ? tpl.name.toLowerCase() : 'modelo removido';
        };
        const nameA = getTemplateName(a.templateId);
        const nameB = getTemplateName(b.templateId);
        return nameA.localeCompare(nameB);
      });
    }

    const tbody = document.getElementById('repo-table-body');
    tbody.innerHTML = '';

    if (filteredCerts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Nenhum certificado localizado no repositório digital com os filtros selecionados.</td></tr>';
      updateBulkCancelButton();
      return;
    }

    const user = Auth.getUser();
    const isAdmin = user && user.role === 'admin';

    filteredCerts.forEach(c => {
      const tr = document.createElement('tr');
      
      const statusClass = c.status === 'valido' ? 'valid' : 'cancelled';
      const statusLabel = c.status === 'valido' ? 'Válido' : 'Cancelado';

      const cpfMasked = c.studentCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

      tr.innerHTML = `
        <td style="text-align: center;">
          <input type="checkbox" class="repo-row-select" data-id="${c.id}" style="cursor: pointer;" ${c.status === 'cancelado' ? 'disabled' : ''}>
        </td>
        <td style="font-family: monospace; font-weight: 600;">${c.certificateNumber}</td>
        <td style="font-weight: 600;">${c.studentName}</td>
        <td>${cpfMasked || 'Não cadastrado'}</td>
        <td style="color: var(--primary-light); font-weight: 500;">${c.courseName}</td>
        <td style="font-family: monospace; font-size: 0.8rem; color: var(--secondary-dark);">${c.validationCode}</td>
        <td>
          <span class="status-pill ${statusClass}">${statusLabel}</span>
        </td>
        <td>
          <div class="action-buttons">
            <a href="${c.pdfUrl}" class="action-btn" target="_blank" title="Visualizar / Baixar PDF"><i class="fa-solid fa-file-pdf"></i></a>
            <button class="action-btn" onclick="openEmailSimModal('${c.id}')" title="Reenviar E-mail"><i class="fa-solid fa-paper-plane"></i></button>
            ${c.status === 'valido' ? `
              <button class="action-btn btn-cancel" onclick="openCancelModal('${c.id}')" title="Cancelar Certificado"><i class="fa-solid fa-ban"></i></button>
            ` : ''}
            ${c.status === 'cancelado' && isAdmin ? `
              <button class="action-btn" style="color: var(--success); border-color: rgba(16,185,129,0.3);" onclick="reactivateCertificate('${c.id}')" title="Reativar Certificado"><i class="fa-solid fa-check"></i></button>
            ` : ''}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Configurar o checkbox do cabeçalho
    const selectAllCheckbox = document.getElementById('repo-select-all');
    selectAllCheckbox.checked = false; // Resetar
    
    // Atualizar botão de descarte em massa
    updateBulkCancelButton();

    selectAllCheckbox.addEventListener('change', () => {
      const checkboxes = document.querySelectorAll('.repo-row-select');
      checkboxes.forEach(cb => {
        if (!cb.disabled) {
          cb.checked = selectAllCheckbox.checked;
        }
      });
      updateBulkCancelButton();
    });

    // Delegar escuta nos checkboxes de linha
    tbody.querySelectorAll('.repo-row-select').forEach(cb => {
      cb.addEventListener('change', () => {
        // Se algum for desmarcado, desmarca o cabeçalho
        if (!cb.checked) {
          selectAllCheckbox.checked = false;
        } else {
          // Se todos os ativos estiverem marcados, marca o cabeçalho
          const activeCbs = Array.from(document.querySelectorAll('.repo-row-select')).filter(c => !c.disabled);
          const checkedCbs = activeCbs.filter(c => c.checked);
          selectAllCheckbox.checked = activeCbs.length === checkedCbs.length;
        }
        updateBulkCancelButton();
      });
    });

  } catch (err) {
    console.error('Erro ao listar repositório:', err);
  }
}

// Exportar CSV
document.getElementById('btn-export-csv').addEventListener('click', () => {
  const user = Auth.getUser();
  if (!user) return;
  // Dispara download do arquivo CSV oficial do backend
  window.open(`/api/reports/export?token=${user.id}`, '_blank');
});

// Modal de Email Simulado
async function openEmailSimModal(id) {
  currentActiveCertId = id;
  
  try {
    const response = await fetch(`/api/certificates`, {
      headers: Auth.getAuthHeaders()
    });
    const certs = await response.json();
    const cert = certs.find(c => c.id === id);
    if (!cert) return;

    const autoEmail = cert.data.email || `${cert.studentName.toLowerCase().replace(/\s+/g, '')}@univc.edu.br`;

    document.getElementById('email-to-input').value = autoEmail;
    document.getElementById('email-subject-preview').textContent = `Seu Certificado Oficial de Conclusão de Curso está Disponível!`;
    document.getElementById('email-body-preview').textContent = `Olá, ${cert.studentName}.\n\nParabéns! Sua jornada acadêmica no curso de ${cert.courseName} foi concluída com sucesso.\n\nSeu certificado digital oficial já foi gerado e registrado sob o número ${cert.certificateNumber}.\n\nCódigo de Autenticação Digital: ${cert.validationCode}\n\nVocê pode validá-lo e baixá-lo a qualquer momento em: http://localhost:3000/validar.html?codigo=${cert.validationCode}\n\nAtenciosamente,\nSecretaria de Graduação\nUniversidade Virtual da Cidade (UNIVC)`;

    document.getElementById('modal-email').style.display = 'flex';
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('btn-send-simulated-email').addEventListener('click', async () => {
  if (!currentActiveCertId) return;

  const emailTo = document.getElementById('email-to-input').value.trim();
  if (!emailTo) {
    alert('Informe o e-mail de destino.');
    return;
  }

  try {
    const response = await fetch(`/api/certificates/${currentActiveCertId}/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...Auth.getAuthHeaders()
      },
      body: JSON.stringify({ recipientEmail: emailTo })
    });

    if (!response.ok) throw new Error();

    alert(`E-mail enviado com sucesso (Simulado)! Detalhes de disparo gravados nos logs de auditoria do certificado.`);
    closeModal('email');
  } catch (err) {
    alert('Falha ao simular envio de e-mail.');
  }
});

// Modal de Cancelamento
function openCancelModal(id) {
  currentActiveCertId = id;
  document.getElementById('cancel-reason-input').value = '';
  document.getElementById('modal-cancel').querySelector('h3').innerHTML = `<i class="fa-solid fa-ban"></i> Cancelamento de Certificado`;
  document.getElementById('modal-cancel').querySelector('p').textContent = `Atenção: Ao cancelar este certificado, ele será imediatamente invalidado no portal público e não poderá ser utilizado legalmente pelo formando.`;
  document.getElementById('modal-cancel').style.display = 'flex';
}

document.getElementById('btn-confirm-cancellation').addEventListener('click', async () => {
  if (!currentActiveCertId) return;
  const reason = document.getElementById('cancel-reason-input').value.trim();

  if (!reason) {
    alert('Por favor, informe a justificativa do cancelamento.');
    return;
  }

  try {
    if (currentActiveCertId === 'BULK') {
      const response = await fetch(`/api/certificates/bulk-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...Auth.getAuthHeaders()
        },
        body: JSON.stringify({ ids: selectedCertIdsForBulkCancel, reason })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao efetuar descarte em massa.');
      }

      alert('Certificados selecionados invalidados e descartados com sucesso.');
    } else {
      const response = await fetch(`/api/certificates/${currentActiveCertId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...Auth.getAuthHeaders()
        },
        body: JSON.stringify({ reason })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao cancelar.');
      }

      alert('Certificado acadêmico invalidado e cancelado com sucesso no registro permanente.');
    }

    closeModal('cancel');
    await loadRepositoryList();
  } catch (err) {
    alert('Falha ao cancelar: ' + err.message);
  }
});

// Reativar Certificado
async function reactivateCertificate(id) {
  if (!confirm('Deseja realmente reativar este certificado digital e restabelecer sua validade legal?')) return;

  try {
    const response = await fetch(`/api/certificates/${id}/reactivate`, {
      method: 'POST',
      headers: Auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error();

    alert('Certificado digital reativado e validado com sucesso.');
    await loadRepositoryList();
  } catch (err) {
    alert('Falha ao reativar certificado.');
  }
}

// ==========================================
// ABA 5: LOGS DE AUDITORIA COMPLETOS
// ==========================================

async function loadAuditLogsList() {
  try {
    const response = await fetch('/api/dashboard/stats', {
      headers: Auth.getAuthHeaders()
    });
    if (!response.ok) throw new Error();

    const data = await response.json();
    const tbody = document.getElementById('audit-table-body');
    tbody.innerHTML = '';

    if (!data.recentLogs || data.recentLogs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhum log registrado no sistema.</td></tr>';
      return;
    }

    data.recentLogs.forEach(log => {
      const tr = document.createElement('tr');
      const d = new Date(log.timestamp);
      const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');

      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-muted);">${dateStr}</td>
        <td style="font-weight: 600;">👤 ${log.user.name || 'Público'} (${log.user.username})</td>
        <td style="color: var(--primary-light); font-weight: 700;">[${log.action.toUpperCase()}]</td>
        <td>${log.details}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// FUNÇÕES AUXILIARES E UTILS
// ==========================================

function closeModal(modalName) {
  document.getElementById(`modal-${modalName}`).style.display = 'none';
  if (modalName === 'theme' || modalName === 'text') currentActiveTplId = null;
  if (modalName === 'email' || modalName === 'cancel') currentActiveCertId = null;
  if (modalName === 'preview') {
    document.getElementById('modal-preview-certificate-container').innerHTML = '';
  }
}

// Debounce para digitação rápida de buscas
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
