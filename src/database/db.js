const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Caminhos dos arquivos de banco de dados
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STORAGE_DIR = path.join(DATA_DIR, 'storage');
const DB_PATHS = {
  users: path.join(DATA_DIR, 'users.json'),
  contacts: path.join(DATA_DIR, 'contacts.json'),
  campaigns: path.join(DATA_DIR, 'campaigns.json'),
  templates: path.join(DATA_DIR, 'templates.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  logs: path.join(DATA_DIR, 'logs.json'),
  certificates: path.join(DATA_DIR, 'certificates.json'),
  validations: path.join(DATA_DIR, 'validations.json')
};

// Garantir que os diretórios existam
function initDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// Criptografia básica para senhas
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Inicializar banco de dados padrão se não existirem
function initDatabase() {
  initDirectories();

  // 1. Coleção de Usuários (Seeding)
  if (!fs.existsSync(DB_PATHS.users)) {
    const defaultUsers = [
      {
        id: 'usr_felipe_admin',
        username: 'felipe.souza@ivc.br',
        password: hashPassword('Qu11m1c4'),
        name: 'Felipe Souza (Admin)',
        role: 'admin',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr_coordenador',
        username: 'coordenador@ivc.br',
        password: hashPassword('coordenador123'),
        name: 'Coordenador de Cursos',
        role: 'coordenador',
        createdAt: new Date().toISOString()
      }
    ];
    writeCollection('users', defaultUsers);
    console.log('Banco de dados de usuários inicializado com usuários padrão (Admin & Coordenador).');
  }

  // 2. Coleção de Campanhas Padrão (Seeding)
  if (!fs.existsSync(DB_PATHS.campaigns)) {
    const defaultCampaigns = [
      {
        id: 'cmp_geral',
        name: 'Geral',
        description: 'Disparos individuais e comunicados avulsos',
        status: 'ativa',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cmp_matricula_2026',
        name: 'Matrícula 2026.2',
        description: 'Campanha institucional para captação e lembretes de matrículas abertas',
        status: 'ativa',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cmp_semana_academica',
        name: 'Semana Acadêmica',
        description: 'Avisos de eventos, palestras e cronograma acadêmico',
        status: 'ativa',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cmp_cobranca',
        name: 'Cobrança Financeira',
        description: 'Lembretes amigáveis de vencimento de parcelas e mensalidades',
        status: 'ativa',
        createdAt: new Date().toISOString()
      }
    ];
    writeCollection('campaigns', defaultCampaigns);
    console.log('Campanhas padrão inicializadas.');
  }

  // 3. Coleção de Templates Padrão (Seeding)
  if (!fs.existsSync(DB_PATHS.templates)) {
    const defaultTemplates = [
      {
        id: 'tpl_boas_vindas',
        name: 'Boas-vindas ao Aluno',
        content: 'Olá {{nome}}! Seja muito bem-vindo(a) à nossa instituição. Estamos muito felizes em ter você no curso de {{curso}} (Turma {{turma}}). Bons estudos e uma excelente jornada acadêmica!',
        variables: ['nome', 'curso', 'turma'],
        createdAt: new Date().toISOString()
      },
      {
        id: 'tpl_lembrete_matricula',
        name: 'Lembrete de Matrícula',
        content: 'Olá {{nome}}, lembramos que sua matrícula do curso de {{curso}} está aberta até a próxima sexta-feira. Garanta sua vaga acessando o portal acadêmico! Turma: {{turma}}.',
        variables: ['nome', 'curso', 'turma'],
        createdAt: new Date().toISOString()
      },
      {
        id: 'tpl_confirmacao_evento',
        name: 'Confirmação de Inscrição em Evento',
        content: 'Olá {{nome}}, confirmamos sua inscrição para a Semana Acadêmica no evento do curso de {{curso}}. Local: Auditório Principal. Não perca!',
        variables: ['nome', 'curso'],
        createdAt: new Date().toISOString()
      },
      {
        id: 'tpl_cobranca_amigavel',
        name: 'Mensalidade - Lembrete Amigável',
        content: 'Olá {{nome}}, identificamos que a mensalidade do seu curso de {{curso}} está disponível no portal do aluno. Para facilitar, você pode efetuar o pagamento via Pix ou boleto. Qualquer dúvida, fale conosco!',
        variables: ['nome', 'curso'],
        createdAt: new Date().toISOString()
      }
    ];
    writeCollection('templates', defaultTemplates);
    console.log('Templates padrão inicializados.');
  }

  // 4. Coleção de Configurações (Seeding)
  if (!fs.existsSync(DB_PATHS.settings)) {
    const defaultSettings = [
      {
        id: 'global_settings',
        nightAntiBanActive: true,
        dailyLimit: 300,
        createdAt: new Date().toISOString()
      }
    ];
    writeCollection('settings', defaultSettings);
    console.log('Configurações de segurança padrão inicializadas.');
  }

  // 5. Outras Coleções vazias se não existirem
  for (const [key, filePath] of Object.entries(DB_PATHS)) {
    if (!['users', 'campaigns', 'templates', 'settings'].includes(key) && !fs.existsSync(filePath)) {
      writeCollection(key, []);
      console.log(`Banco de dados de [${key}] inicializado.`);
    }
  }
}

// Escrita Atômica (grava em arquivo temporário e renomeia)
function writeCollection(collection, data) {
  const filePath = DB_PATHS[collection];
  if (!filePath) throw new Error(`Coleção ${collection} inválida.`);

  const tempPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) {}
    }
    throw error;
  }
}

// Leitura da Coleção
function readCollection(collection) {
  const filePath = DB_PATHS[collection];
  if (!filePath) throw new Error(`Coleção ${collection} inválida.`);

  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Erro ao ler coleção ${collection}:`, error);
    return [];
  }
}

// API de Acesso ao Banco
const db = {
  // Inicialização
  init: () => {
    initDatabase();
  },

  // Obter diretórios
  getStorageDir: () => STORAGE_DIR,

  // Funções Utilitárias de Criptografia
  hashPassword,

  // Buscar todos os registros
  find: (collection, queryFn = null) => {
    const data = readCollection(collection);
    if (!queryFn) return data;
    return data.filter(queryFn);
  },

  // Buscar um único registro
  findOne: (collection, queryFn) => {
    const data = readCollection(collection);
    return data.find(queryFn) || null;
  },

  // Inserir um registro
  insert: (collection, item) => {
    const data = readCollection(collection);
    const newItem = {
      id: item.id || (collection.substring(0, 3) + '_' + crypto.randomUUID().substring(0, 8)),
      createdAt: new Date().toISOString(),
      ...item
    };
    data.push(newItem);
    writeCollection(collection, data);
    return newItem;
  },

  // Inserir múltiplos registros de uma vez (otimizado)
  insertMany: (collection, items) => {
    const data = readCollection(collection);
    const newItems = items.map(item => ({
      id: item.id || (collection.substring(0, 3) + '_' + crypto.randomUUID().substring(0, 8)),
      createdAt: new Date().toISOString(),
      ...item
    }));
    data.push(...newItems);
    writeCollection(collection, data);
    return newItems;
  },

  // Atualizar registros
  update: (collection, queryFn, updates) => {
    const data = readCollection(collection);
    let count = 0;
    const updatedData = data.map(item => {
      if (queryFn(item)) {
        count++;
        return { ...item, ...updates, updatedAt: new Date().toISOString() };
      }
      return item;
    });

    if (count > 0) {
      writeCollection(collection, updatedData);
    }
    return count;
  },

  // Deletar registros
  delete: (collection, queryFn) => {
    const data = readCollection(collection);
    const filteredData = data.filter(item => !queryFn(item));
    const count = data.length - filteredData.length;

    if (count > 0) {
      writeCollection(collection, filteredData);
    }
    return count;
  },

  // Registrar auditoria no sistema
  log: (user, action, details) => {
    const logItem = {
      user: user ? { id: user.id, username: user.username, name: user.name, role: user.role } : { username: 'sistema/conexao' },
      action,
      details,
      timestamp: new Date().toISOString()
    };
    try {
      db.insert('logs', logItem);
    } catch (err) {
      console.error('Erro ao escrever log de auditoria:', err);
    }
  }
};

// Inicializar de imediato ao importar
db.init();

module.exports = db;
