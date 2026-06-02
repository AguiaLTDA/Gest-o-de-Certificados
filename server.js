const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');
const crypto = require('crypto');
const mammoth = require('mammoth');
const db = require('./src/database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS e Parser JSON
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

// Garantir que os diretórios de armazenamento e estáticos existam
const STORAGE_DIR = path.join(__dirname, 'public', 'storage');
const CERTIFICATES_DIR = path.join(STORAGE_DIR, 'certificates');
const TEMPLATES_DIR = path.join(STORAGE_DIR, 'templates');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(CERTIFICATES_DIR)) fs.mkdirSync(CERTIFICATES_DIR, { recursive: true });
if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

// Configurar o multer para upload seguro de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'templateFile') {
      cb(null, TEMPLATES_DIR);
    } else if (file.fieldname === 'certificatePdf') {
      cb(null, CERTIFICATES_DIR);
    } else {
      cb(null, STORAGE_DIR);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'templateFile') {
      const allowedTemplateExtensions = ['.png', '.jpg', '.jpeg'];
      if (allowedTemplateExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Formato de modelo não suportado. Use apenas imagens (.png, .jpg, .jpeg)'));
      }
    } else {
      const allowedExtensions = ['.xlsx', '.xls', '.csv', '.pdf'];
      if (allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Formato de arquivo não suportado.'));
      }
    }
  }
});

// ==========================================
// MIDDLEWARE DE AUTENTICAÇÃO E PERMISSÕES
// ==========================================
function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  return db.findOne('users', u => u.id === token);
}

function requireAuth(roles = []) {
  return (req, res, next) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Acesso não autorizado. Efetue login primeiro.' });
    }
    if (roles.length > 0 && !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Nível de privilégios insuficiente.' });
    }
    req.user = user;
    next();
  };
}

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.findOne('users', u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Dados de login incorretos.' });
  }

  const hashedInput = db.hashPassword(password);
  if (user.password !== hashedInput) {
    return res.status(401).json({ error: 'Dados de login incorretos.' });
  }

  const { password: _, ...safeUser } = user;
  db.log(safeUser, 'login', `Administrador ${safeUser.username} efetuou login no sistema.`);
  
  res.json({ success: true, user: safeUser, token: safeUser.id });
});

app.get('/api/auth/me', requireAuth(), (req, res) => {
  const { password: _, ...safeUser } = req.user;
  res.json({ user: safeUser });
});

// ==========================================
// ROTAS DE MODELOS / TEMPLATES DOCX
// ==========================================
app.get('/api/templates', requireAuth(), (req, res) => {
  const list = db.find('templates').filter(t => t.placeholders);
  res.json(list);
});

app.post('/api/templates/upload', requireAuth(['admin', 'coordenador']), upload.single('templateFile'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Nenhum arquivo de imagem de template foi enviado.' });
  }

  const { name, description, theme } = req.body;
  if (!name) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'O nome do modelo é obrigatório.' });
  }

  try {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Para templates de imagem, usamos os placeholders acadêmicos padrão oficiais
    const placeholders = ['nome', 'cpf', 'curso', 'carga_horaria', 'data_conclusao'];
    const textContent = 'Image Template Background';

    const relativePath = `/storage/templates/${file.filename}`;

    const newTemplate = db.insert('templates', {
      name,
      description: description || 'Sem descrição cadastrada.',
      theme: theme || 'classic',
      placeholders,
      fileUrl: relativePath,
      filePath: file.path,
      rawText: textContent,
      createdBy: req.user.id,
      createdByRole: req.user.role
    });

    db.log(req.user, 'template_upload', `Novo modelo de imagem ${ext.toUpperCase().substring(1)} '${name}' carregado.`);
    res.json({ success: true, template: newTemplate });

  } catch (error) {
    console.error('Erro no upload de template:', error);
    if (file && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Falha ao processar arquivo de imagem: ' + error.message });
  }
});

app.put('/api/templates/:id/theme', requireAuth(), (req, res) => {
  const { id } = req.params;
  const { theme } = req.body;

  const tpl = db.findOne('templates', t => t.id === id);
  if (!tpl) {
    return res.status(404).json({ error: 'Modelo não localizado.' });
  }

  db.update('templates', t => t.id === id, { theme: theme || 'classic' });
  db.log(req.user, 'template_theme_update', `Tema do modelo '${tpl.name}' atualizado para '${theme}'.`);
  res.json({ success: true });
});

app.put('/api/templates/:id/text', requireAuth(), (req, res) => {
  const { id } = req.params;
  const { rawText } = req.body;

  const tpl = db.findOne('templates', t => t.id === id);
  if (!tpl) {
    return res.status(404).json({ error: 'Modelo não localizado.' });
  }

  // Permissões: Admin edita todos; Coordenador edita apenas modelos criados por coordenadores
  const isCreatedByCoordinator = tpl.createdByRole === 'coordenador';
  const allowed = req.user.role === 'admin' || (req.user.role === 'coordenador' && isCreatedByCoordinator);

  if (!allowed) {
    return res.status(403).json({ error: 'Você não tem permissão para editar o texto deste modelo.' });
  }

  db.update('templates', t => t.id === id, { rawText: rawText || '' });
  db.log(req.user, 'template_text_update', `Texto do modelo '${tpl.name}' atualizado.`);
  res.json({ success: true });
});

app.delete('/api/templates/:id', requireAuth(['admin']), (req, res) => {
  const { id } = req.params;
  const tpl = db.findOne('templates', t => t.id === id);
  if (!tpl) {
    return res.status(404).json({ error: 'Modelo não localizado.' });
  }

  // Deletar o arquivo do disco rígido
  if (tpl.filePath && fs.existsSync(tpl.filePath)) {
    try { fs.unlinkSync(tpl.filePath); } catch (e) {}
  }

  db.delete('templates', t => t.id === id);
  db.log(req.user, 'template_delete', `Modelo de certificado '${tpl.name}' excluído do sistema.`);
  res.json({ success: true });
});

// ==========================================
// ROTAS DE EMISSÃO E PROCESSAMENTO EM LOTE
// ==========================================
app.post('/api/import/preview', requireAuth(), upload.single('studentListFile'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Arquivo de planilha não enviado.' });
  }

  try {
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length === 0) {
      throw new Error('A planilha está vazia.');
    }

    const headers = rows[0].map(h => String(h || '').trim()).filter(Boolean);
    const preview = [];

    // Linhas de preview
    for (let i = 1; i < Math.min(rows.length, 6); i++) {
      const rowData = {};
      headers.forEach((header, idx) => {
        rowData[header] = rows[i][idx] !== undefined ? String(rows[i][idx]).trim() : '';
      });
      preview.push(rowData);
    }

    // Apagar planilha física temporária
    if (fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }

    res.json({
      success: true,
      headers: headers,
      preview: preview,
      totalRows: rows.length - 1,
      tempFilePath: file.filename
    });
  } catch (error) {
    console.error('Erro no preview da planilha:', error);
    if (file && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Erro ao analisar planilha: ' + error.message });
  }
});

app.post('/api/certificates/emit', requireAuth(), (req, res) => {
  const { templateId, students, columnMapping } = req.body;
  if (!templateId || !students || !columnMapping) {
    return res.status(400).json({ error: 'Dados incompletos para processamento.' });
  }

  const tpl = db.findOne('templates', t => t.id === templateId);
  if (!tpl) {
    return res.status(404).json({ error: 'Modelo de certificado não encontrado.' });
  }

  try {
    const certificatesToEmit = [];
    const currentSeqCount = db.find('certificates').length;

    students.forEach((row, index) => {
      // Mapear dados com base no columnMapping
      const mappedData = {};
      Object.entries(columnMapping).forEach(([placeholder, colName]) => {
        mappedData[placeholder] = row[colName] !== undefined ? String(row[colName]).trim() : '';
      });

      const studentName = mappedData['nome'] || 'Acadêmico Não Nomeado';
      const rawCpf = mappedData['cpf'] || '';
      const studentCpf = rawCpf.replace(/\D/g, ''); // Apenas números

      const courseName = mappedData['curso'] || tpl.name;

      // Sequencial acadêmico único (ex: UNIVC-2026-0001)
      const seq = currentSeqCount + index + 1;
      const certificateNumber = `UNIVC-2026-${String(seq).padStart(4, '0')}`;

      // Código de validação alfanumérico seguro (ex: UNIVC-2026-XF8A-9E32)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sem O/0/I/1 para evitar enganos
      let code1 = '';
      let code2 = '';
      for (let c = 0; c < 4; c++) code1 += chars[Math.floor(Math.random() * chars.length)];
      for (let c = 0; c < 4; c++) code2 += chars[Math.floor(Math.random() * chars.length)];
      const validationCode = `UNIVC-2026-${code1}-${code2}`;

      // Data de Emissão formatada
      const now = new Date();
      const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const issueDate = `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;

      // Detalhes do Forming (Email)
      const studentEmail = row['Email'] || row['email'] || row['E-mail'] || row['e-mail'] || '';

      const certObj = {
        templateId,
        templateFileUrl: tpl.fileUrl,
        studentName,
        studentCpf,
        courseName,
        certificateNumber,
        validationCode,
        issueDate,
        status: 'valido',
        pdfUploaded: false,
        pdfUrl: null,
        cancellationReason: null,
        data: {
          ...mappedData,
          email: studentEmail
        },
        issuer: {
          id: req.user.id,
          name: req.user.name,
          username: req.user.username
        }
      };

      certificatesToEmit.push(certObj);
    });

    const savedCerts = db.insertMany('certificates', certificatesToEmit);

    db.log(req.user, 'certificates_bulk_emit', `Lote acadêmico emitido com sucesso. ${savedCerts.length} certificados registrados.`);
    res.json({ success: true, certificates: savedCerts });

  } catch (error) {
    console.error('Erro na emissão em lote:', error);
    res.status(500).json({ error: 'Erro ao salvar lote de certificados: ' + error.message });
  }
});

app.post('/api/certificates/:id/upload-pdf', requireAuth(), upload.single('certificatePdf'), (req, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Documento PDF não enviado.' });
  }

  const cert = db.findOne('certificates', c => c.id === id);
  if (!cert) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    return res.status(404).json({ error: 'Certificado não localizado.' });
  }

  const relativeUrl = `/storage/certificates/${file.filename}`;

  db.update('certificates', c => c.id === id, {
    pdfUploaded: true,
    pdfUrl: relativeUrl,
    pdfPath: file.path
  });

  res.json({ success: true });
});

// ==========================================
// ROTAS DE BIBLIOTECA & GESTÃO (REPOSITÓRIO)
// ==========================================
app.get('/api/certificates', requireAuth(), (req, res) => {
  const { q, status } = req.query;
  const search = String(q || '').toLowerCase().trim();

  let list = db.find('certificates');

  if (status) {
    list = list.filter(c => c.status === status);
  }

  if (search) {
    list = list.filter(c => 
      c.studentName.toLowerCase().includes(search) ||
      c.studentCpf.includes(search) ||
      c.courseName.toLowerCase().includes(search) ||
      c.validationCode.toLowerCase().includes(search) ||
      c.certificateNumber.toLowerCase().includes(search)
    );
  }

  // Ordenar decrescente por sequencial
  list.sort((a, b) => b.certificateNumber.localeCompare(a.certificateNumber));

  res.json(list);
});

app.post('/api/certificates/:id/email', requireAuth(), (req, res) => {
  const { id } = req.params;
  const { recipientEmail } = req.body;

  const cert = db.findOne('certificates', c => c.id === id);
  if (!cert) {
    return res.status(404).json({ error: 'Certificado acadêmico não localizado.' });
  }

  db.log(req.user, 'email_simulation', `E-mail de notificação do certificado ${cert.certificateNumber} simulado para ${recipientEmail}.`);
  res.json({ success: true });
});

app.post('/api/certificates/:id/cancel', requireAuth(['admin', 'coordenador']), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Justificativa de cancelamento é obrigatória.' });
  }

  const cert = db.findOne('certificates', c => c.id === id);
  if (!cert) {
    return res.status(404).json({ error: 'Certificado acadêmico não localizado.' });
  }

  db.update('certificates', c => c.id === id, {
    status: 'cancelado',
    cancellationReason: reason
  });

  db.log(req.user, 'certificate_cancel', `Certificado ${cert.certificateNumber} de ${cert.studentName} INUTILIZADO. Motivo: ${reason}`);
  res.json({ success: true });
});

app.post('/api/certificates/bulk-cancel', requireAuth(['admin', 'coordenador']), (req, res) => {
  const { ids, reason } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Nenhum ID de certificado enviado.' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'Justificativa de cancelamento é obrigatória.' });
  }

  const certs = db.find('certificates', c => ids.includes(c.id));
  if (certs.length === 0) {
    return res.status(404).json({ error: 'Nenhum certificado localizado.' });
  }

  // Atualizar apenas os válidos
  const count = db.update('certificates', c => ids.includes(c.id) && c.status === 'valido', {
    status: 'cancelado',
    cancellationReason: reason
  });

  db.log(req.user, 'certificates_bulk_cancel', `Cancelamento em lote de ${count} certificados. Motivo: ${reason}`);
  res.json({ success: true, count });
});

app.post('/api/certificates/:id/reactivate', requireAuth(['admin']), (req, res) => {
  const { id } = req.params;

  const cert = db.findOne('certificates', c => c.id === id);
  if (!cert) {
    return res.status(404).json({ error: 'Certificado acadêmico não localizado.' });
  }

  db.update('certificates', c => c.id === id, {
    status: 'valido',
    cancellationReason: null
  });

  db.log(req.user, 'certificate_reactivate', `Certificado ${cert.certificateNumber} de ${cert.studentName} reativado e validado legalmente.`);
  res.json({ success: true });
});

// ==========================================
// ROTAS PÚBLICAS DE PORTAIS E VALIDAÇÃO
// ==========================================
app.get('/api/validate/:code', (req, res) => {
  const { code } = req.params;
  const decoded = decodeURIComponent(code).trim();

  // Buscar por Código de Validação ou Sequencial
  const cert = db.findOne('certificates', c => 
    c.validationCode.toLowerCase() === decoded.toLowerCase() ||
    c.certificateNumber.toLowerCase() === decoded.toLowerCase()
  );

  if (!cert) {
    return res.status(404).json({ error: 'Código de certificado não corresponde a nenhum registro oficial.' });
  }

  // Registrar validação pública
  db.insert('validations', {
    certificateId: cert.id,
    codeConsulted: decoded,
    timestamp: new Date().toISOString()
  });

  db.log(null, 'public_validation', `Verificação pública de autenticidade do documento ${cert.certificateNumber} realizada com sucesso.`);

  res.json({ success: true, certificate: cert });
});

app.get('/api/student/:cpf', (req, res) => {
  const { cpf } = req.params;
  const cleanCpf = cpf.replace(/\D/g, '');

  if (cleanCpf.length !== 11) {
    return res.status(400).json({ error: 'O CPF informado deve conter 11 números.' });
  }

  // Filtra certificados do CPF
  const certs = db.find('certificates', c => c.studentCpf === cleanCpf);
  res.json({ success: true, certificates: certs });
});

// ==========================================
// PAINEL DE INDICADORES E AUDITORIA / RELATÓRIOS
// ==========================================
app.get('/api/dashboard/stats', requireAuth(), (req, res) => {
  const certs = db.find('certificates');
  const validations = db.find('validations');
  const logs = db.find('logs');

  const total = certs.length;
  const active = certs.filter(c => c.status === 'valido').length;
  const valCount = validations.length;
  const cancelled = certs.filter(c => c.status === 'cancelado').length;

  // Estatísticas de Cursos (Top 5)
  const coursesMap = {};
  certs.forEach(c => {
    if (c.status === 'valido') {
      coursesMap[c.courseName] = (coursesMap[c.courseName] || 0) + 1;
    }
  });

  const courseStats = Object.entries(coursesMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Logs Recentes
  const recentLogs = logs
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  res.json({
    metrics: {
      total,
      active,
      validations: valCount,
      cancelled
    },
    courseStats,
    recentLogs
  });
});

app.get('/api/reports/export', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).send('Acesso não autorizado.');
  }

  const user = db.findOne('users', u => u.id === token);
  if (!user) {
    return res.status(401).send('Acesso não autorizado.');
  }

  const certs = db.find('certificates');

  // Gerar CSV
  let csv = 'Numero Registro,Estudante,CPF,Curso,Codigo Validador,Data Emissao,Status,Motivo Cancelamento\n';
  
  certs.forEach(c => {
    const nameEscaped = c.studentName.replace(/"/g, '""');
    const courseEscaped = c.courseName.replace(/"/g, '""');
    const reasonEscaped = (c.cancellationReason || '').replace(/"/g, '""');
    
    csv += `"${c.certificateNumber}","${nameEscaped}","${c.studentCpf}","${courseEscaped}","${c.validationCode}","${c.issueDate}","${c.status}","${reasonEscaped}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=relatorio-certificados-${Date.now()}.csv`);
  res.send(Buffer.from('\uFEFF' + csv, 'utf-8')); // Adicionar UTF-8 BOM
});

// ==========================================
// INICIALIZAR SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`Plataforma UNIVC de Gestão de Certificados rodando na porta ${PORT}`);
  console.log(`Acesse localmente em: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
