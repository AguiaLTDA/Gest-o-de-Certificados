/**
 * Motor de Renderização de Certificados Digitais
 * Gerenciamento de templates HTML/CSS, QR Code e compilação para PDF.
 */

// Carregar dependências dinamicamente no cabeçalho se não existirem
function ensureLibrary(url, globalVarName, isScript = true) {
  if (window[globalVarName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement(isScript ? 'script' : 'link');
    if (isScript) {
      el.src = url;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Falha ao carregar script ${url}`));
    } else {
      el.rel = 'stylesheet';
      el.href = url;
      resolve(); // CSS carrega de forma não bloqueante
    }
    document.head.appendChild(el);
  });
}

const CertificateRenderer = {
  // Garantir que as bibliotecas necessárias (html2pdf e qrcode) estejam carregadas
  init: async () => {
    await ensureLibrary('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', 'html2pdf');
    await ensureLibrary('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', 'QRCode');
    await ensureLibrary('css/certificate-themes.css', 'certThemesCSS', false);
  },

  // Renderizar o certificado como elemento HTML/DOM estruturado
  renderDOM: (cert, theme = 'classic', docxTextContent = null) => {
    // Determinar se o modelo original é um arquivo PDF ou imagem
    const isPdfTemplate = cert.templateFileUrl && cert.templateFileUrl.toLowerCase().endsWith('.pdf');
    const isImageTemplate = cert.templateFileUrl && (
      cert.templateFileUrl.toLowerCase().endsWith('.png') ||
      cert.templateFileUrl.toLowerCase().endsWith('.jpg') ||
      cert.templateFileUrl.toLowerCase().endsWith('.jpeg')
    );
    const finalTheme = (isPdfTemplate || isImageTemplate) ? 'pdf-background' : theme;

    // Container do certificado A4
    const container = document.createElement('div');
    container.className = `certificate-page-container theme-${finalTheme}`;
    container.id = `cert-render-${cert.id}`;

    if (isPdfTemplate) {
      // Carregar e renderizar a primeira página do PDF no canvas e depois aplicar no background
      setTimeout(async () => {
        try {
          // Carregar pdf.js dinamicamente se não existir
          await ensureLibrary('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js', 'pdfjsLib');
          // Configurar o worker
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

          const loadingTask = pdfjsLib.getDocument(cert.templateFileUrl);
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);

          // 2x scale para renderização nítida (HD)
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport: viewport }).promise;
          const dataUrl = canvas.toDataURL('image/png');

          container.style.backgroundImage = `url(${dataUrl})`;
          container.style.backgroundSize = '100% 100%';
          container.style.backgroundRepeat = 'no-repeat';
          container.style.backgroundPosition = 'center';
        } catch (err) {
          console.error('Erro ao renderizar background PDF:', err);
        }
      }, 10);
    } else if (isImageTemplate) {
      // Definir a imagem de fundo diretamente
      container.style.backgroundImage = `url(${cert.templateFileUrl})`;
      container.style.backgroundSize = '100% 100%';
      container.style.backgroundRepeat = 'no-repeat';
      container.style.backgroundPosition = 'center';
    }

    // 1. Cabeçalho
    const header = document.createElement('div');
    header.className = 'cert-header';
    header.innerHTML = `
      <div class="cert-logo">U</div>
      <div class="cert-institution">Universidade Virtual da Cidade</div>
    `;

    // 2. Divisor de Título
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'cert-title-wrapper';
    titleWrapper.innerHTML = `
      <div class="cert-title">Certificado de Conclusão</div>
      <div class="cert-title-divider"></div>
    `;

    // 3. Processar o texto do certificado (DOCX text ou fallback)
    const body = document.createElement('div');
    body.className = 'cert-body';

    let htmlContent = '';
    if (docxTextContent && docxTextContent !== 'PDF Template Background' && docxTextContent !== 'Image Template Background') {
      // Substituir os placeholders no texto do DOCX
      let mergedText = docxTextContent;
      
      // Chaves dinâmicas enviadas na emissão
      Object.entries(cert.data).forEach(([key, val]) => {
        // Substitui {{key}} por val
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        mergedText = mergedText.replace(regex, val);
      });

      // Placeholders sistêmicos fixos se não vierem no lote
      mergedText = mergedText
        .replace(/\{\{\s*codigo_validacao\s*\}\}/g, cert.validationCode)
        .replace(/\{\{\s*numero\s*\}\}/g, cert.certificateNumber)
        .replace(/\{\{\s*data_emissao\s*\}\}/g, cert.issueDate);

      // Converter quebras de linha para parágrafos
      htmlContent = mergedText.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('');
    } else {
      // Fallback: Texto acadêmico padrão ultra elegante
      htmlContent = `
        <p>A Reitoria da <strong>Universidade Virtual da Cidade</strong>, no uso de suas atribuições estatutárias, confere o presente certificado a</p>
        <span class="cert-student-name">${cert.studentName}</span>
        <p>por ter concluído com êxito os requisitos acadêmicos do Curso de Graduação em <strong class="cert-course-highlight">${cert.courseName}</strong>, com carga horária total de <strong>${cert.data.carga_horaria || '3600'} horas</strong>, na data de <strong>${cert.data.data_conclusao || cert.issueDate}</strong>.</p>
        <p>Outorgando-lhe as prerrogativas legais e o respectivo título correspondente.</p>
      `;
    }
    
    body.innerHTML = htmlContent;

    // 4. Área de Assinaturas (Simulada acadêmica elegante)
    const signatures = document.createElement('div');
    signatures.className = 'cert-signatures';
    signatures.innerHTML = `
      <div class="signature-block">
        <div style="font-family:'Playfair Display', serif; font-size:1.15rem; font-style:italic; height:35px; color:#1e3a8a;">Prof. Dr. Ricardo Silva</div>
        <div class="signature-line"></div>
        <div class="signature-name">Dr. Ricardo Silva</div>
        <div class="signature-role">Reitor da Universidade</div>
      </div>
      <div class="signature-block">
        <div style="font-family:'Playfair Display', serif; font-size:1.15rem; font-style:italic; height:35px; color:#1e3a8a;">Dr.ª Mariana Souza</div>
        <div class="signature-line"></div>
        <div class="signature-name">Dr.ª Mariana Souza</div>
        <div class="signature-role">Diretora de Registro Acadêmico</div>
      </div>
    `;

    // 5. Rodapé de Segurança
    const footer = document.createElement('div');
    footer.className = 'cert-security-footer';
    
    // Texto explicativo e código
    const securityInfo = document.createElement('div');
    securityInfo.className = 'security-info';
    
    const host = window.location.origin;
    const validationUrl = `${host}/validar.html?codigo=${cert.validationCode}`;

    securityInfo.innerHTML = `
      Nº Registro Sequencial: <strong>${cert.certificateNumber}</strong><br>
      Código de Autenticidade: <strong>${cert.validationCode}</strong><br>
      Chave de Validação: <code>SHA256:${cert.id.substring(5)}</code><br>
      Documento assinado digitalmente. Para validar o registro acadêmico acesse: <br>
      <span style="color: #1e3a8a; font-weight: 500;">${host}/validar</span>
    `;

    // QR Code Container
    const qrWrapper = document.createElement('div');
    qrWrapper.className = 'security-qr-wrapper';
    
    const qrPlaceholder = document.createElement('div');
    qrPlaceholder.className = 'qr-code-placeholder';
    qrPlaceholder.id = `qr-code-${cert.id}`;
    
    const qrDesc = document.createElement('div');
    qrDesc.className = 'qr-desc';
    qrDesc.innerHTML = `<strong>Aponte a Câmera</strong> para validar a autenticidade documental online.`;

    qrWrapper.appendChild(qrPlaceholder);
    qrWrapper.appendChild(qrDesc);

    footer.appendChild(securityInfo);
    footer.appendChild(qrWrapper);

    // Montar estrutura final
    container.appendChild(header);
    container.appendChild(titleWrapper);
    container.appendChild(body);
    container.appendChild(signatures);
    container.appendChild(footer);

    // Renderizar o QR Code localmente no placeholder após anexado
    setTimeout(() => {
      new QRCode(qrPlaceholder, {
        text: validationUrl,
        width: 72,
        height: 72,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }, 50);

    return container;
  },

  // Gerar arquivo PDF física em memória (Blob) a partir de um elemento HTML
  generatePdfBlob: async (element) => {
    // Configurações do html2pdf para A4 paisagem de alta fidelidade
    const opt = {
      margin: 0,
      filename: 'certificado.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, // 2x garante alta resolução (dpi elevado para impressão perfeito)
        useCORS: true, 
        letterRendering: true,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    // Compilar e retornar como Blob de arquivo
    return html2pdf().set(opt).from(element).outputPdf('blob');
  }
};
