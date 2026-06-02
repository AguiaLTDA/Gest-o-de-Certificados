/**
 * Lógica da Página de Validação Pública
 */

let html5QrCode = null;

// Botões e Containers
const btnValidate = document.getElementById('btn-validate');
const inputCode = document.getElementById('validation-code');
const btnToggleScan = document.getElementById('btn-toggle-scan');
const btnStopScan = document.getElementById('btn-stop-scan');
const readerDiv = document.getElementById('reader');

const panelError = document.getElementById('val-error');
const panelErrorText = document.getElementById('val-error-text');
const panelSuccess = document.getElementById('val-success');

// Registrar eventos
btnValidate.addEventListener('click', () => {
  const code = inputCode.value.trim();
  if (code) {
    validarCodigo(code);
  } else {
    alert('Por favor, informe o código de autenticação.');
  }
});

inputCode.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const code = inputCode.value.trim();
    if (code) validarCodigo(code);
  }
});

btnToggleScan.addEventListener('click', startScanner);
btnStopScan.addEventListener('click', stopScanner);

// ==========================================
// FUNÇÕES DE SCANNER DE QR CODE (HTML5-QRCODE)
// ==========================================

async function startScanner() {
  panelError.style.display = 'none';
  panelSuccess.style.display = 'none';
  readerDiv.style.display = 'block';
  btnStopScan.style.display = 'inline-flex';
  btnToggleScan.style.display = 'none';

  html5QrCode = new Html5Qrcode("reader");
  
  const qrCodeSuccessCallback = (decodedText, decodedResult) => {
    // QR Code localizado!
    console.log(`Código lido: ${decodedText}`);
    
    // O QR Code pode conter a URL inteira: http://certificados.univc.../validar?codigo=UNIVC-XXXX
    // ou apenas o código UNIVC-2026-XXXX-XXXX
    let code = decodedText;
    if (decodedText.includes('codigo=')) {
      const urlParams = new URLSearchParams(decodedText.split('?')[1]);
      code = urlParams.get('codigo') || decodedText;
    } else if (decodedText.includes('code=')) {
      const urlParams = new URLSearchParams(decodedText.split('?')[1]);
      code = urlParams.get('code') || decodedText;
    }

    inputCode.value = code;
    stopScanner();
    validarCodigo(code);
  };

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  try {
    // Iniciar câmera traseira por preferência (bom para celulares)
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      qrCodeSuccessCallback
    );
  } catch (err) {
    console.error("Erro ao iniciar câmera:", err);
    // Fallback se falhar facingMode environment (ex: webcams de notebook)
    try {
      await html5QrCode.start(
        { facingMode: "user" },
        config,
        qrCodeSuccessCallback
      );
    } catch (fallbackErr) {
      alert("Não foi possível acessar a câmera. Verifique se concedeu as permissões necessárias.");
      stopScanner();
    }
  }
}

async function stopScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop();
    } catch (e) {
      console.error(e);
    }
  }
  readerDiv.style.display = 'none';
  btnStopScan.style.display = 'none';
  btnToggleScan.style.display = 'inline-flex';
}

// ==========================================
// CONSULTA À API DE VALIDAÇÃO
// ==========================================

async function validarCodigo(code) {
  panelError.style.display = 'none';
  panelSuccess.style.display = 'none';

  // Mostrar visual feedback
  btnValidate.disabled = true;
  btnValidate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';

  try {
    const response = await fetch(`/api/validate/${encodeURIComponent(code)}`);
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Código de certificado inválido.');
    }

    const data = await response.json();
    if (data.success && data.certificate) {
      renderValidationSuccess(data.certificate);
    } else {
      throw new Error('Falha ao processar o certificado.');
    }

  } catch (error) {
    console.error(error);
    panelErrorText.textContent = error.message;
    panelError.style.display = 'block';
  } finally {
    btnValidate.disabled = false;
    btnValidate.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Validar Registro';
  }
}

// Renderizar dados do certificado validado na tela
function renderValidationSuccess(cert) {
  // Mascarar CPF (ex: 123.456.789-01)
  const cpfRaw = cert.studentCpf || '';
  const cpfMasked = cpfRaw.length === 11 
    ? cpfRaw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') 
    : cpfRaw;

  // Injetar dados
  document.getElementById('res-student-name').textContent = cert.studentName;
  document.getElementById('res-course-name').textContent = cert.courseName;
  document.getElementById('res-student-cpf').textContent = cpfMasked || 'Não informado';
  document.getElementById('res-cert-number').textContent = cert.certificateNumber;
  document.getElementById('res-issue-date').textContent = cert.issueDate;
  document.getElementById('res-validation-code').textContent = cert.validationCode;

  const badgeContainer = document.getElementById('status-badge-container');
  const statusTitle = document.getElementById('result-status-title');
  const cancelItem = document.getElementById('cancellation-reason-item');
  const pdfViewBlock = document.getElementById('pdf-view-block');
  const pdfFrame = document.getElementById('pdf-frame');
  const btnDownload = document.getElementById('btn-download-pdf');

  // Ajustes com base no status (Válido vs Cancelado)
  if (cert.status === 'cancelado') {
    badgeContainer.innerHTML = '<div class="badge-status badge-invalid"><i class="fa-solid fa-circle-xmark"></i></div>';
    statusTitle.textContent = 'Certificado Invalido / Cancelado';
    statusTitle.style.color = 'var(--error)';
    
    // Mostrar campo de motivo
    document.getElementById('res-cancel-reason').textContent = cert.cancellationReason || 'Cancelado pela administração institucional.';
    cancelItem.style.display = 'flex';
    
    // MEC: Certificado cancelado não deve ser validado para uso, mas mantemos o frame fechado ou com aviso.
    pdfViewBlock.style.display = 'none'; 
  } else {
    badgeContainer.innerHTML = '<div class="badge-status badge-valid"><i class="fa-solid fa-circle-check"></i></div>';
    statusTitle.textContent = 'Certificado Válido';
    statusTitle.style.color = 'var(--success)';
    cancelItem.style.display = 'none';
    
    // Configurar PDF
    if (cert.pdfUploaded && cert.pdfUrl) {
      pdfFrame.src = cert.pdfUrl;
      btnDownload.href = cert.pdfUrl;
      pdfViewBlock.style.display = 'block';
    } else {
      // PDF ainda não carregado no servidor (caso raro de falha no lote)
      pdfFrame.src = '';
      pdfViewBlock.style.display = 'none';
    }
  }

  // Exibir painel final
  panelSuccess.style.display = 'block';
}
