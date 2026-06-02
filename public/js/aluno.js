/**
 * Lógica da Página do Portal do Aluno
 */

const inputCpf = document.getElementById('student-cpf');
const btnSearch = document.getElementById('btn-search-student');
const alertNoCerts = document.getElementById('no-certs-alert');
const sectionCerts = document.getElementById('student-certs-section');
const cardsContainer = document.getElementById('certs-cards-container');
const certsCountSpan = document.getElementById('certs-count');

// Máscara automática de CPF (000.000.000-00)
inputCpf.addEventListener('input', (e) => {
  let value = e.target.value.replace(/\D/g, ''); // Remove tudo que não for número
  
  if (value.length > 11) value = value.slice(0, 11);

  // Formata o CPF
  if (value.length > 9) {
    value = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
  } else if (value.length > 6) {
    value = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6)}`;
  } else if (value.length > 3) {
    value = `${value.slice(0, 3)}.${value.slice(3)}`;
  }
  
  e.target.value = value;
});

// Eventos de Busca
btnSearch.addEventListener('click', () => {
  const cpf = inputCpf.value.replace(/\D/g, '');
  if (cpf.length === 11) {
    consultarCertificados(cpf);
  } else {
    alert('Por favor, informe um CPF válido contendo 11 dígitos.');
  }
});

inputCpf.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const cpf = inputCpf.value.replace(/\D/g, '');
    if (cpf.length === 11) {
      consultarCertificados(cpf);
    } else {
      alert('Por favor, informe um CPF válido contendo 11 dígitos.');
    }
  }
});

// ==========================================
// CONSULTA À API DO PORTAL DO ALUNO
// ==========================================

async function consultarCertificados(cpf) {
  alertNoCerts.style.display = 'none';
  sectionCerts.style.display = 'none';
  cardsContainer.innerHTML = '';

  btnSearch.disabled = true;
  btnSearch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pesquisando...';

  try {
    const response = await fetch(`/api/student/${cpf}`);
    if (!response.ok) {
      throw new Error('Falha ao consultar certificados.');
    }

    const data = await response.json();
    if (data.success && data.certificates && data.certificates.length > 0) {
      renderStudentCertificates(data.certificates);
    } else {
      alertNoCerts.style.display = 'block';
    }
  } catch (error) {
    console.error(error);
    alert('Erro ao conectar ao servidor. Tente novamente mais tarde.');
  } finally {
    btnSearch.disabled = false;
    btnSearch.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Consultar Certificados';
  }
}

// Renderizar lista de cartões na tela
function renderStudentCertificates(certs) {
  certsCountSpan.textContent = certs.length;
  
  certs.forEach(cert => {
    const card = document.createElement('div');
    card.className = 'glass-panel cert-item-card';
    
    card.innerHTML = `
      <div class="cert-item-info">
        <h4 style="color: var(--primary-light);"><i class="fa-solid fa-file-invoice"></i> ${cert.courseName}</h4>
        <div class="cert-item-meta">
          <span><i class="fa-solid fa-hashtag"></i> Registro: <strong>${cert.certificateNumber}</strong></span>
          <span><i class="fa-solid fa-calendar-days"></i> Conclusão: ${cert.issueDate}</span>
          <span><i class="fa-solid fa-key"></i> Autenticação: <code>${cert.validationCode}</code></span>
        </div>
      </div>
      <div>
        <a href="${cert.pdfUrl}" class="btn btn-primary" style="padding: 8px 16px; font-size: 0.85rem;" target="_blank">
          <i class="fa-solid fa-eye"></i> Visualizar / Baixar PDF
        </a>
      </div>
    `;
    
    cardsContainer.appendChild(card);
  });

  sectionCerts.style.display = 'block';
}
