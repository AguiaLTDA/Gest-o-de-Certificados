/**
 * Módulo de Autenticação do Cliente (Auth Helper)
 */
const Auth = {
  // Efetuar Login
  login: async (username, password) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro na autenticação.');
      }

      const data = await response.json();
      if (data.success && data.user) {
        localStorage.setItem('univc_user', JSON.stringify(data.user));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Falha no login:', error.message);
      return false;
    }
  },

  // Efetuar Logout
  logout: () => {
    localStorage.removeItem('univc_user');
    window.location.href = 'index.html';
  },

  // Verificar se o usuário está logado
  isLoggedIn: () => {
    return localStorage.getItem('univc_user') !== null;
  },

  // Obter dados do usuário logado
  getUser: () => {
    const userStr = localStorage.getItem('univc_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  },

  // Obter Cabeçalhos de Autorização para requisições fetch seguras
  getAuthHeaders: () => {
    const user = Auth.getUser();
    if (!user) return {};
    return {
      'Authorization': `Bearer ${user.id}`
    };
  },

  // Proteção de rota do lado do cliente
  protectPage: (requiredRoles = []) => {
    if (!Auth.isLoggedIn()) {
      window.location.href = 'index.html';
      return false;
    }
    
    if (requiredRoles.length > 0) {
      const user = Auth.getUser();
      if (!user || !requiredRoles.includes(user.role)) {
        alert('Acesso negado: você não possui permissão para visualizar esta página.');
        window.location.href = 'index.html';
        return false;
      }
    }
    return true;
  }
};
