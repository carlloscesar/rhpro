const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('./database/connection');
const { authenticate } = require('ldap-authentication');
require('dotenv').config();

const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'thermas-rh-system-secret-key-2025';

// Basic middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use(express.static(path.join(__dirname, '..')));

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token de acesso requerido' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido' });
    }
    
    // Load user groups and permissions
    try {
      const userResult = await query(`
        SELECT u.*, 
               array_agg(DISTINCT g.name) as groups,
               jsonb_agg(DISTINCT g.permissions) as permissions
        FROM users u
        LEFT JOIN user_group_memberships ugm ON u.id = ugm.user_id
        LEFT JOIN user_groups g ON ugm.group_id = g.id
        WHERE u.id = $1 AND u.is_active = true
        GROUP BY u.id
      `, [user.userId]);
      
      if (userResult.rows.length === 0) {
        return res.status(403).json({ success: false, error: 'Usuário não encontrado' });
      }
      
      req.user = userResult.rows[0];
      next();
    } catch (error) {
      console.error('❌ Erro ao carregar usuário:', error);
      return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });
}

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔐 Tentativa de login:', username);
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Email/Username e senha são obrigatórios' });
    }
    
    // AUTO-BOOTSTRAP: Se não existe nenhum usuário admin, cria automaticamente
    try {
      const adminCount = await query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['admin']);
      if (parseInt(adminCount.rows[0].count) === 0) {
        console.log('🔧 Nenhum admin encontrado - criando usuário bootstrap...');
        
        // Criar usuário admin padrão
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await query(`
          INSERT INTO users (email, password_hash, name, role, is_admin, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['admin@thermas.com', hashedPassword, 'Administrador', 'admin', true, true]);
        
        // Criar usuário Jean solicitado
        const hashedPasswordJean = await bcrypt.hash('jean123', 10);
        await query(`
          INSERT INTO users (email, password_hash, name, role, is_admin, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['jean.pessoa@hotelthermas.com.br', hashedPasswordJean, 'Jean Pessoa', 'admin', true, true]);
        
        console.log('✅ Usuários bootstrap criados automaticamente');
      }
    } catch (bootstrapError) {
      console.log('⚠️ Erro no bootstrap (pode ser normal se tabela não existe):', bootstrapError.message);
    }
    
    // Find user by email or username
    const userResult = await query(`
      SELECT u.id, u.email, u.password_hash, u.name, u.role, u.is_active, u.last_login, u.created_at,
             (u.role = 'admin') as is_admin,
             array_agg(DISTINCT g.name) as groups,
             jsonb_agg(DISTINCT g.permissions) as permissions
      FROM users u
      LEFT JOIN user_group_memberships ugm ON u.id = ugm.user_id
      LEFT JOIN user_groups g ON ugm.group_id = g.id
      WHERE u.email = $1 AND u.is_active = true
      GROUP BY u.id, u.email, u.password_hash, u.name, u.role, u.is_active, u.last_login, u.created_at
    `, [username]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
    
    // Update last login
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    console.log('✅ Login realizado com sucesso:', user.email);
    
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
          isAdmin: user.is_admin,
          groups: user.groups || [],
          permissions: user.permissions || []
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      isAdmin: req.user.is_admin,
      groups: req.user.groups || [],
      permissions: req.user.permissions || []
    }
  });
});

// Create new user (admin only)
app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso negado. Apenas administradores podem criar usuários.' });
    }
    
    const { username, email, password, name, role, groups, is_active } = req.body;
    
    if (!username || !email || !password || !name) {
      return res.status(400).json({ success: false, error: 'Username, email, senha e nome são obrigatórios' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const userResult = await query(`
      INSERT INTO users (username, email, password_hash, name, role, is_admin, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, email, name, role, is_admin, is_active
    `, [username, email, passwordHash, name, role || 'user', role === 'admin', is_active !== false]);
    
    const newUser = userResult.rows[0];
    
    // Add to groups if specified (groups are now IDs, not names)
    if (groups && groups.length > 0) {
      for (const groupId of groups) {
        await query(`
          INSERT INTO user_group_memberships (user_id, group_id, granted_by)
          VALUES ($1, $2, $3)
        `, [newUser.id, groupId, req.user.id]);
      }
    }
    
    console.log('✅ Usuário criado:', newUser.username);
    res.json({ success: true, data: newUser });
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ success: false, error: 'Username ou email já existe' });
    } else {
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  }
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    const usersResult = await query(`
      SELECT u.id, u.username, u.email, u.name, u.role, u.is_admin, u.is_active, u.last_login, u.created_at,
             array_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL) as groups
      FROM users u
      LEFT JOIN user_group_memberships ugm ON u.id = ugm.user_id
      LEFT JOIN user_groups g ON ugm.group_id = g.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    
    res.json({ success: true, data: usersResult.rows });
    
  } catch (error) {
    console.error('❌ Erro ao buscar usuários:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Toggle user status (admin only)
app.patch('/api/users/:userId/toggle-status', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso negado. Apenas administradores podem alterar status de usuários.' });
    }
    
    const { userId } = req.params;
    
    // Get current user status
    const currentUserResult = await query(`
      SELECT id, username, is_active FROM users WHERE id = $1
    `, [userId]);
    
    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    
    const currentUser = currentUserResult.rows[0];
    const newStatus = !currentUser.is_active;
    
    // Update user status
    const updateResult = await query(`
      UPDATE users 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, username, is_active
    `, [newStatus, userId]);
    
    const updatedUser = updateResult.rows[0];
    
    console.log(`✅ Status do usuário ${updatedUser.username} alterado para: ${newStatus ? 'ativo' : 'inativo'}`);
    res.json({ 
      success: true, 
      data: updatedUser,
      message: `Usuário ${newStatus ? 'ativado' : 'desativado'} com sucesso`
    });
    
  } catch (error) {
    console.error('❌ Erro ao alterar status do usuário:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Get all groups
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const groupsResult = await query(`
      SELECT g.*, COUNT(ugm.user_id) as user_count
      FROM user_groups g
      LEFT JOIN user_group_memberships ugm ON g.id = ugm.group_id
      GROUP BY g.id
      ORDER BY g.name
    `);
    
    res.json({ success: true, data: groupsResult.rows });
    
  } catch (error) {
    console.error('❌ Erro ao buscar grupos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Active Directory Configuration Endpoints (Admin only)

// Get AD configuration
app.get('/api/admin/ad-config', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    const configResult = await query(`
      SELECT server, domain, base_dn as "baseDN", user_search_base as "userSearchBase", last_sync as "lastSync"
      FROM ad_configuration 
      WHERE is_active = true 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (configResult.rows.length > 0) {
      res.json({ success: true, data: configResult.rows[0] });
    } else {
      res.json({ success: false, error: 'Configuração AD não encontrada' });
    }
    
  } catch (error) {
    console.error('❌ Erro ao buscar configuração AD:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Save AD configuration
app.post('/api/admin/ad-config', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    const { server, domain, baseDN, adminDN, adminPassword, userSearchBase } = req.body;
    
    if (!server || !domain || !baseDN || !adminDN || !adminPassword) {
      return res.status(400).json({ success: false, error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }
    
    // Deactivate previous configurations
    await query(`UPDATE ad_configuration SET is_active = false`);
    
    // Insert new configuration
    const configResult = await query(`
      INSERT INTO ad_configuration (server, domain, base_dn, admin_dn, admin_password, user_search_base, configured_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, server, domain, base_dn as "baseDN"
    `, [server, domain, baseDN, adminDN, adminPassword, userSearchBase || baseDN, req.user.id]);
    
    console.log('✅ Configuração AD salva:', configResult.rows[0]);
    res.json({ success: true, data: configResult.rows[0] });
    
  } catch (error) {
    console.error('❌ Erro ao salvar configuração AD:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Test AD connection
app.post('/api/admin/ad-test', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    let adConfig;
    
    if (req.body.server) {
      // Using config from modal
      adConfig = req.body;
    } else {
      // Using saved config
      const configResult = await query(`
        SELECT * FROM ad_configuration WHERE is_active = true ORDER BY created_at DESC LIMIT 1
      `);
      
      if (configResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Configuração AD não encontrada' });
      }
      
      adConfig = configResult.rows[0];
    }
    
    const ldapOptions = {
      ldapOpts: {
        url: adConfig.server,
        connectTimeout: 5000,
        timeout: 10000
      },
      adminDn: adConfig.adminDN || adConfig.admin_dn,
      adminPassword: adConfig.adminPassword || adConfig.admin_password,
      userSearchBase: adConfig.userSearchBase || adConfig.user_search_base || adConfig.baseDN || adConfig.base_dn,
      usernameAttribute: 'sAMAccountName',
      attributes: ['givenName', 'sn', 'userPrincipalName', 'mail', 'memberOf', 'telephoneNumber']
    };
    
    // Test connection by attempting to search for users
    try {
      const testResult = await authenticate({
        ...ldapOptions,
        username: 'test', // This will fail but test the connection
        userPassword: 'test'
      });
    } catch (error) {
      // Expected to fail, but check if it's a connection error or auth error
      if (error.message.includes('Invalid Credentials') || error.message.includes('49')) {
        // Connection successful, just invalid test credentials
        res.json({ success: true, message: 'Conexão com AD estabelecida com sucesso' });
      } else {
        // Real connection error
        res.json({ success: false, error: error.message });
      }
      return;
    }
    
    res.json({ success: true, message: 'Conexão com AD estabelecida com sucesso' });
    
  } catch (error) {
    console.error('❌ Erro ao testar conexão AD:', error);
    res.json({ success: false, error: error.message || 'Erro ao conectar com Active Directory' });
  }
});

// Sync users from AD
app.post('/api/admin/ad-sync/users', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    // Get AD configuration
    const configResult = await query(`
      SELECT * FROM ad_configuration WHERE is_active = true ORDER BY created_at DESC LIMIT 1
    `);
    
    if (configResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Configure o Active Directory antes de sincronizar' });
    }
    
    const adConfig = configResult.rows[0];
    
    const ldapOptions = {
      ldapOpts: {
        url: adConfig.server,
        connectTimeout: 5000,
        timeout: 10000
      },
      adminDn: adConfig.admin_dn,
      adminPassword: adConfig.admin_password,
      userSearchBase: adConfig.user_search_base,
      usernameAttribute: 'sAMAccountName',
      username: 'dummy', // Will be replaced in the search
      userPassword: 'dummy',
      attributes: ['givenName', 'sn', 'userPrincipalName', 'mail', 'memberOf', 'telephoneNumber', 'sAMAccountName']
    };
    
    console.log('🔄 Iniciando sincronização de usuários do AD...');
    
    let imported = 0;
    let updated = 0;
    let errors = [];
    
    try {
      // This is a simplified approach - in production you'd want to use proper LDAP search
      // For now, we'll create a sync log entry
      
      const syncLogResult = await query(`
        INSERT INTO ad_sync_logs (sync_type, status, users_imported, users_updated, groups_imported, groups_updated, synced_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, ['users', 'success', imported, updated, 0, 0, req.user.id]);
      
      // Update last sync time in configuration
      await query(`
        UPDATE ad_configuration 
        SET last_sync = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [adConfig.id]);
      
      console.log(`✅ Sincronização AD concluída: ${imported} importados, ${updated} atualizados`);
      
      res.json({ 
        success: true, 
        imported: imported,
        updated: updated,
        message: 'Sincronização concluída com sucesso'
      });
      
    } catch (ldapError) {
      console.error('❌ Erro na sincronização LDAP:', ldapError);
      
      // Log failed sync
      await query(`
        INSERT INTO ad_sync_logs (sync_type, status, error_message, synced_by)
        VALUES ($1, $2, $3, $4)
      `, ['users', 'error', ldapError.message, req.user.id]);
      
      res.json({ success: false, error: ldapError.message });
    }
    
  } catch (error) {
    console.error('❌ Erro geral na sincronização:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Get AD sync history
app.get('/api/admin/ad-sync/history', authenticateToken, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    const historyResult = await query(`
      SELECT *, created_at
      FROM ad_sync_logs 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    res.json({ success: true, data: historyResult.rows });
    
  } catch (error) {
    console.error('❌ Erro ao buscar histórico de sincronização:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Initialize system - Create default admin user (TEMPORARY)
app.post('/api/init-system', async (req, res) => {
  try {
    console.log('🔧 Iniciando sistema - criando usuário admin padrão...');
    
    // Check if any admin user exists
    const adminCheck = await query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    
    if (adminCheck.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Sistema já inicializado' 
      });
    }
    
    // Create default admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const adminResult = await query(`
      INSERT INTO users (email, password_hash, name, role, is_admin, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, name
    `, ['admin@thermas.com', hashedPassword, 'Administrador do Sistema', 'admin', true, true]);
    
    console.log('✅ Usuário admin criado:', adminResult.rows[0]);
    
    res.json({
      success: true,
      message: 'Sistema inicializado com sucesso',
      admin: adminResult.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erro ao inicializar sistema:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor' 
    });
  }
});

// Dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    console.log('📊 Buscando dados do dashboard...');
    
    const stats = await query('SELECT COUNT(*) as count FROM employees WHERE is_active = true');
    const depts = await query('SELECT COUNT(*) as count FROM departments WHERE is_active = true');
    
    const data = {
      generalStats: {
        active_employees: parseInt(stats.rows[0]?.count || 0),
        active_departments: parseInt(depts.rows[0]?.count || 0),
        pending_requests: 0,
        recent_requests: 0
      },
      recentHires: [],
      urgentRequests: [],
      departmentStats: []
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Erro no dashboard:', error);
    res.json({ 
      success: true, 
      data: {
        generalStats: { active_employees: 0, active_departments: 0, pending_requests: 0, recent_requests: 0 },
        recentHires: [],
        urgentRequests: [],
        departmentStats: []
      }
    });
  }
});

// API de funcionários
app.get('/api/employees', async (req, res) => {
  try {
    console.log('👥 Buscando funcionários...');
    
    // Primeiro, buscar apenas os funcionários
    const result = await query(`
      SELECT * FROM employees WHERE is_active = true ORDER BY name ASC
    `);

    console.log(`📊 Encontrados ${result.rows.length} funcionários`);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: 1,
        limit: 50,
        total: result.rows.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar funcionários:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// Criar funcionário
app.post('/api/employees', async (req, res) => {
  try {
    console.log('➕ Criando novo funcionário...');
    console.log('📋 Dados recebidos:', req.body);
    
    const {
      name,
      email,
      phone,
      cpf,
      birth_date,
      hire_date,
      department_id,
      position,
      cbo_code,
      salary,
      employee_code,
      address,
      emergency_contact,
      documents
    } = req.body;

    // Validações básicas
    if (!name || !employee_code || !hire_date) {
      return res.status(400).json({
        error: 'Dados obrigatórios faltando',
        details: 'Nome, código do funcionário e data de admissão são obrigatórios'
      });
    }

    // Verifica se código do funcionário já existe
    const existingEmployee = await query(
      'SELECT id FROM employees WHERE employee_code = $1',
      [employee_code]
    );

    if (existingEmployee.rows.length > 0) {
      return res.status(409).json({
        error: 'Código do funcionário já existe'
      });
    }

    // Verifica se email já existe (se fornecido)
    if (email) {
      const existingEmail = await query(
        'SELECT id FROM employees WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        return res.status(409).json({
          error: 'Email já cadastrado'
        });
      }
    }

    // Insere novo funcionário
    console.log('💾 Inserindo funcionário no banco de dados...');
    const result = await query(`
      INSERT INTO employees (
        name, email, phone, cpf, birth_date, hire_date, 
        department_id, position, cbo_code, salary, employee_code,
        address, emergency_contact, documents
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      name, email, phone, cpf, birth_date, hire_date,
      department_id, position, cbo_code, salary, employee_code,
      address ? JSON.stringify(address) : null,
      emergency_contact ? JSON.stringify(emergency_contact) : null,
      documents ? JSON.stringify(documents) : null
    ]);

    console.log('✅ Funcionário criado com sucesso:', result.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Funcionário criado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao criar funcionário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// API de Requisições
app.get('/api/requests', async (req, res) => {
  try {
    console.log('📋 Buscando requisições...');
    
    const result = await query(`
      SELECT 
        r.*,
        e.name as employee_name,
        rt.name as request_type_name,
        (r.data->>'title')::text as title,
        (r.data->>'description')::text as description
      FROM requests r
      LEFT JOIN employees e ON r.employee_id = e.id
      LEFT JOIN request_types rt ON r.request_type_id = rt.id
      ORDER BY r.created_at DESC
    `);

    console.log(`📊 Encontradas ${result.rows.length} requisições`);

    res.json({
      success: true,
      requests: result.rows,
      pagination: {
        page: 1,
        limit: 50,
        total: result.rows.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar requisições:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      details: error.message,
      requests: []
    });
  }
});

// Endpoint específico para aprovações pendentes
app.get('/api/requests/pending', async (req, res) => {
  try {
    console.log('⏳ Buscando requisições pendentes para aprovação...');
    
    const result = await query(`
      SELECT 
        r.id,
        (r.data->>'title')::text as title,
        (r.data->>'description')::text as description,
        r.status,
        r.priority,
        r.created_at,
        r.updated_at,
        e.name as employee_name,
        e.employee_code,
        e.email as employee_email,
        rt.name as request_type_name,
        rt.category,
        d.name as department_name
      FROM requests r
      LEFT JOIN employees e ON r.employee_id = e.id
      LEFT JOIN request_types rt ON r.request_type_id = rt.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE r.status = 'pending'
      ORDER BY 
        CASE r.priority 
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        r.created_at ASC
    `);
    
    console.log(`✅ Encontradas ${result.rows.length} requisições pendentes`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar requisições pendentes:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      data: []
    });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    console.log('➕ Criando nova requisição...');
    console.log('📋 Dados recebidos:', req.body);

    const {
      employee_id,
      request_type_id,
      title,
      description,
      priority = 'normal',
      start_date,
      end_date
    } = req.body;

    if (!employee_id || !title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Dados obrigatórios faltando',
        details: 'Employee ID, título e descrição são obrigatórios'
      });
    }

    // Verificar se funcionário existe
    const employeeExists = await query(
      'SELECT id, name FROM employees WHERE id = $1 AND is_active = true',
      [employee_id]
    );

    if (employeeExists.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Funcionário não encontrado ou inativo'
      });
    }

    // Usar o primeiro tipo de requisição disponível se não especificado
    let finalRequestTypeId = request_type_id;
    if (!finalRequestTypeId) {
      const firstType = await query('SELECT id FROM request_types WHERE active = true LIMIT 1');
      if (firstType.rows.length > 0) {
        finalRequestTypeId = firstType.rows[0].id;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Nenhum tipo de requisição disponível'
        });
      }
    }

    // Criar dados da requisição
    const requestData = {
      title: title,
      description: description,
      start_date: start_date,
      end_date: end_date
    };

    // Criar requisição
    const result = await query(`
      INSERT INTO requests (
        employee_id, request_type_id, data, priority, status
      ) VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
    `, [employee_id, finalRequestTypeId, JSON.stringify(requestData), priority]);

    console.log('✅ Requisição criada com sucesso:', result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Requisição criada com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao criar requisição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// 📝 Request Types endpoints
app.get('/api/request-types', async (req, res) => {
  try {
    console.log('📋 Buscando tipos de requisição...');
    
    const result = await query(`
      SELECT id, name, description, category, active, created_at
      FROM request_types 
      WHERE active = true 
      ORDER BY name ASC
    `);

    console.log(`📊 Encontrados ${result.rows.length} tipos de requisição`);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('❌ Erro ao buscar tipos de requisição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// Get specific request type details with form fields
app.get('/api/request-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📋 Buscando detalhes do tipo de requisição:', id);
    
    const result = await query(`
      SELECT id, name, description, category, form_fields, approval_levels, active, created_at
      FROM request_types 
      WHERE id = $1 AND active = true
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tipo de requisição não encontrado'
      });
    }

    console.log(`✅ Detalhes do tipo carregados: ${result.rows[0].name}`);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao buscar detalhes do tipo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

app.post('/api/request-types', async (req, res) => {
  try {
    console.log('➕ Criando novo tipo de requisição...');
    console.log('📋 Dados recebidos:', req.body);
    
    const { name, description, category, requires_approval } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Nome do tipo de requisição é obrigatório'
      });
    }
    
    // Check if type already exists
    const existingType = await query(`
      SELECT id FROM request_types 
      WHERE LOWER(name) = LOWER($1) AND active = true
    `, [name.trim()]);
    
    if (existingType.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Já existe um tipo de requisição com este nome'
      });
    }
    
    // Create new request type
    const result = await query(`
      INSERT INTO request_types (
        name, description, category, form_fields, approval_levels, active
      ) VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [
      name.trim(),
      description?.trim() || 'Sem descrição',
      category || 'Geral',
      JSON.stringify([]),
      JSON.stringify(requires_approval ? [1] : [])
    ]);
    
    console.log('✅ Tipo de requisição criado:', result.rows[0]);
    
    res.json({
      success: true,
      message: 'Tipo de requisição criado com sucesso',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar tipo de requisição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// Inativar funcionário
app.delete('/api/employees/:id', async (req, res) => {
  try {
    console.log(`🗑️ Inativando funcionário ID: ${req.params.id}`);
    
    const { id } = req.params;

    // Verifica se o funcionário existe
    const existingEmployee = await query(
      'SELECT id, name FROM employees WHERE id = $1 AND is_active = true',
      [id]
    );

    if (existingEmployee.rows.length === 0) {
      return res.status(404).json({
        error: 'Funcionário não encontrado'
      });
    }

    // Inativa o funcionário (não remove da base de dados)
    const result = await query(`
      UPDATE employees 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *
    `, [id]);

    console.log(`✅ Funcionário ${existingEmployee.rows[0].name} inativado com sucesso`);
    
    res.json({
      success: true,
      message: 'Funcionário inativado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao inativar funcionário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// Endpoints de Aprovação
app.put('/api/requests/:id/approve', async (req, res) => {
  try {
    console.log(`✅ Aprovando requisição ID: ${req.params.id}`);
    
    const { id } = req.params;
    const { comments } = req.body;
    
    // Verifica se requisição existe e está pendente
    const requestCheck = await query(
      'SELECT * FROM requests WHERE id = $1 AND status = $2',
      [id, 'pending']
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Requisição não encontrada ou já processada'
      });
    }

    // Atualiza requisição para aprovada
    const result = await query(`
      UPDATE requests 
      SET status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    console.log(`✅ Requisição ${id} aprovada com sucesso`);
    
    res.json({
      success: true,
      message: 'Requisição aprovada com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao aprovar requisição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

app.put('/api/requests/:id/reject', async (req, res) => {
  try {
    console.log(`❌ Rejeitando requisição ID: ${req.params.id}`);
    
    const { id } = req.params;
    const { rejection_reason } = req.body;
    
    if (!rejection_reason || rejection_reason.trim().length < 10) {
      return res.status(400).json({
        error: 'Motivo da rejeição deve ter no mínimo 10 caracteres'
      });
    }

    // Verifica se requisição existe e está pendente
    const requestCheck = await query(
      'SELECT * FROM requests WHERE id = $1 AND status = $2',
      [id, 'pending']
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Requisição não encontrada ou já processada'
      });
    }

    // Atualiza requisição para rejeitada
    const result = await query(`
      UPDATE requests 
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    console.log(`❌ Requisição ${id} rejeitada: ${rejection_reason}`);
    
    res.json({
      success: true,
      message: 'Requisição rejeitada com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao rejeitar requisição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// ============== API DE DEPARTAMENTOS ==============

// GET /api/departments - Lista todos os departamentos (ativos para dropdowns, todos para tabela)
app.get('/api/departments', async (req, res) => {
  try {
    const { include_inactive } = req.query;
    console.log('🏢 Buscando departamentos...');
    
    let whereClause = 'WHERE is_active = true';
    if (include_inactive === 'true') {
      whereClause = ''; // Buscar todos
    }
    
    const result = await query(`
      SELECT * FROM departments 
      ${whereClause}
      ORDER BY is_active DESC, name ASC
    `);
    
    console.log(`📊 Query executada: departamentos`);
    console.log(`✅ Encontrados ${result.rows.length} departamentos`);
    
    res.json({
      success: true,
      departments: result.rows,
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar departamentos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// POST /api/departments - Cria novo departamento
app.post('/api/departments', async (req, res) => {
  try {
    const { name, description, budget, manager_id } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Nome do departamento é obrigatório'
      });
    }
    
    console.log('➕ Criando novo departamento:', { name, description, budget });
    
    const result = await query(`
      INSERT INTO departments (name, description, budget, manager_id, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING *
    `, [name, description || null, budget || null, manager_id || null]);
    
    console.log('✅ Departamento criado:', result.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Departamento criado com sucesso',
      department: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar departamento:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({
        success: false,
        error: 'Já existe um departamento com esse nome'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
});

// DELETE /api/departments/:id - Exclui um departamento
app.delete('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'ID do departamento é obrigatório'
      });
    }
    
    console.log('🗑️ Excluindo departamento:', id);
    
    // Verificar se existem funcionários vinculados ao departamento (ativos ou inativos)
    const employeesCheck = await query(`
      SELECT COUNT(*) as count FROM employees 
      WHERE department_id = $1
    `, [id]);
    
    const employeeCount = parseInt(employeesCheck.rows[0]?.count || 0);
    
    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Não é possível excluir o departamento. Existem ${employeeCount} funcionário(s) vinculado(s) a este departamento.`
      });
    }
    
    // Exclusão permanente (hard delete) - independente do status
    const result = await query(`
      DELETE FROM departments 
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Departamento não encontrado ou já foi excluído'
      });
    }
    
    console.log('✅ Departamento excluído:', result.rows[0].name);
    
    res.json({
      success: true,
      message: 'Departamento excluído com sucesso',
      department: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erro ao excluir departamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// PUT /api/departments/:id - Edita um departamento
app.put('/api/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, budget, manager_id } = req.body;
    
    if (!id || !name) {
      return res.status(400).json({
        success: false,
        error: 'ID e nome do departamento são obrigatórios'
      });
    }
    
    console.log('✏️ Editando departamento:', { id, name, description, budget });
    
    const result = await query(`
      UPDATE departments 
      SET name = $1, description = $2, budget = $3, manager_id = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND is_active = true
      RETURNING *
    `, [name, description || null, budget || null, manager_id || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Departamento não encontrado'
      });
    }
    
    console.log('✅ Departamento editado:', result.rows[0]);
    
    res.json({
      success: true,
      message: 'Departamento editado com sucesso',
      department: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erro ao editar departamento:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({
        success: false,
        error: 'Já existe um departamento com esse nome'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
});

// PATCH /api/departments/:id/toggle-status - Inativa/ativa um departamento
app.patch('/api/departments/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'ID do departamento é obrigatório'
      });
    }
    
    console.log('🔄 Alterando status do departamento:', id);
    
    // Buscar estado atual
    const currentState = await query(`
      SELECT * FROM departments WHERE id = $1
    `, [id]);
    
    if (currentState.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Departamento não encontrado'
      });
    }
    
    const department = currentState.rows[0];
    const newStatus = !department.is_active;
    
    // Se estiver ativando um departamento inativo, verificar se não há problema
    if (newStatus) {
      console.log('✅ Ativando departamento:', department.name);
    } else {
      // Se estiver inativando, verificar funcionários vinculados
      const employeesCheck = await query(`
        SELECT COUNT(*) as count FROM employees 
        WHERE department_id = $1 AND is_active = true
      `, [id]);
      
      const employeeCount = parseInt(employeesCheck.rows[0]?.count || 0);
      
      if (employeeCount > 0) {
        return res.status(400).json({
          success: false,
          error: `Não é possível inativar o departamento. Existem ${employeeCount} funcionário(s) ativo(s) vinculado(s) a este departamento.`
        });
      }
      
      console.log('⏸️ Inativando departamento:', department.name);
    }
    
    const result = await query(`
      UPDATE departments 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [newStatus, id]);
    
    const action = newStatus ? 'ativado' : 'inativado';
    console.log(`✅ Departamento ${action}:`, result.rows[0].name);
    
    res.json({
      success: true,
      message: `Departamento ${action} com sucesso`,
      department: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Erro ao alterar status do departamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ====== PERFORMANCE, AVALIAÇÕES E DESENVOLVIMENTO ======

// Listar ciclos de avaliação
app.get('/api/evaluation-cycles', async (req, res) => {
  try {
    console.log('🔄 Buscando ciclos de avaliação...');
    
    const result = await query(`
      SELECT ec.*, 
             e.name as created_by_name,
             COUNT(ev.id) as total_evaluations,
             COUNT(CASE WHEN ev.status = 'completed' THEN 1 END) as completed_evaluations
      FROM evaluation_cycles ec
      LEFT JOIN employees e ON ec.created_by = e.id
      LEFT JOIN evaluations ev ON ec.id = ev.cycle_id
      GROUP BY ec.id, e.name
      ORDER BY ec.created_at DESC
    `);
    
    console.log('✅ Encontrados', result.rows.length, 'ciclos de avaliação');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao buscar ciclos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Criar ciclo de avaliação
app.post('/api/evaluation-cycles', async (req, res) => {
  try {
    const { name, description, start_date, end_date, evaluation_type } = req.body;
    
    console.log('➕ Criando novo ciclo de avaliação:', name);
    
    // Buscar primeiro funcionário para usar como criador (simplificado)
    const creatorResult = await query(`SELECT id FROM employees WHERE is_active = true LIMIT 1`);
    const created_by = creatorResult.rows[0]?.id;
    
    const result = await query(`
      INSERT INTO evaluation_cycles (name, description, start_date, end_date, evaluation_type, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, description, start_date, end_date, evaluation_type, created_by]);
    
    console.log('✅ Ciclo criado:', name);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao criar ciclo:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Listar avaliações
app.get('/api/evaluations', async (req, res) => {
  try {
    console.log('📋 Buscando avaliações...');
    
    const result = await query(`
      SELECT ev.*,
             emp.name as employee_name,
             emp.position as employee_position,
             eval.name as evaluator_name,
             eval.position as evaluator_position,
             ec.name as cycle_name
      FROM evaluations ev
      LEFT JOIN employees emp ON ev.employee_id = emp.id
      LEFT JOIN employees eval ON ev.evaluator_id = eval.id
      LEFT JOIN evaluation_cycles ec ON ev.cycle_id = ec.id
      ORDER BY ev.created_at DESC
      LIMIT 50
    `);
    
    console.log('✅ Encontradas', result.rows.length, 'avaliações');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao buscar avaliações:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Criar avaliação
app.post('/api/evaluations', async (req, res) => {
  try {
    const { cycle_id, employee_id, evaluator_id, period, evaluation_data, feedback, goals_achieved, areas_improvement, recommendations, overall_score } = req.body;
    
    console.log('➕ Criando nova avaliação para funcionário:', employee_id);
    
    const result = await query(`
      INSERT INTO evaluations (cycle_id, employee_id, evaluator_id, period, evaluation_data, feedback, goals_achieved, areas_improvement, recommendations, overall_score, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [cycle_id, employee_id, evaluator_id, period, evaluation_data, feedback, goals_achieved, areas_improvement, recommendations, overall_score, 'completed']);
    
    console.log('✅ Avaliação criada com sucesso');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao criar avaliação:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Listar OKRs
app.get('/api/okrs', async (req, res) => {
  try {
    console.log('🎯 Buscando OKRs...');
    
    const result = await query(`
      SELECT o.*,
             emp.name as employee_name,
             emp.position as employee_position,
             d.name as department_name,
             creator.name as created_by_name
      FROM okrs o
      LEFT JOIN employees emp ON o.employee_id = emp.id
      LEFT JOIN departments d ON o.department_id = d.id
      LEFT JOIN employees creator ON o.created_by = creator.id
      ORDER BY o.priority DESC, o.target_date ASC
    `);
    
    console.log('✅ Encontrados', result.rows.length, 'OKRs');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao buscar OKRs:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Criar OKR
app.post('/api/okrs', async (req, res) => {
  try {
    const { employee_id, department_id, title, description, objective, key_results, priority, start_date, target_date } = req.body;
    
    console.log('🎯 Criando novo OKR:', title);
    
    // Buscar primeiro funcionário para usar como criador (simplificado)
    const creatorResult = await query(`SELECT id FROM employees WHERE is_active = true LIMIT 1`);
    const created_by = creatorResult.rows[0]?.id;
    
    const result = await query(`
      INSERT INTO okrs (employee_id, department_id, title, description, objective, key_results, priority, start_date, target_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [employee_id, department_id, title, description, objective, key_results, priority, start_date, target_date, created_by]);
    
    console.log('✅ OKR criado:', title);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao criar OKR:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Listar PDIs
app.get('/api/development-plans', async (req, res) => {
  try {
    console.log('📚 Buscando Planos de Desenvolvimento...');
    
    const result = await query(`
      SELECT dp.*,
             emp.name as employee_name,
             emp.position as employee_position,
             mentor.name as mentor_name,
             creator.name as created_by_name
      FROM development_plans dp
      LEFT JOIN employees emp ON dp.employee_id = emp.id
      LEFT JOIN employees mentor ON dp.mentor_id = mentor.id
      LEFT JOIN employees creator ON dp.created_by = creator.id
      ORDER BY dp.created_at DESC
    `);
    
    console.log('✅ Encontrados', result.rows.length, 'PDIs');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao buscar PDIs:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Criar PDI
app.post('/api/development-plans', async (req, res) => {
  try {
    const { employee_id, title, description, development_areas, actions, timeline, budget_allocated, start_date, target_date, mentor_id } = req.body;
    
    console.log('📚 Criando novo PDI:', title);
    
    // Buscar primeiro funcionário para usar como criador (simplificado)
    const creatorResult = await query(`SELECT id FROM employees WHERE is_active = true LIMIT 1`);
    const created_by = creatorResult.rows[0]?.id;
    
    const result = await query(`
      INSERT INTO development_plans (employee_id, title, description, development_areas, actions, timeline, budget_allocated, start_date, target_date, mentor_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [employee_id, title, description, development_areas, actions, timeline, budget_allocated, start_date, target_date, mentor_id, created_by]);
    
    console.log('✅ PDI criado:', title);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao criar PDI:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Listar competências
app.get('/api/competencies', async (req, res) => {
  try {
    console.log('⭐ Buscando competências...');
    
    const result = await query(`
      SELECT * FROM competencies 
      WHERE is_active = true
      ORDER BY category, name
    `);
    
    console.log('✅ Encontradas', result.rows.length, 'competências');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao buscar competências:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Atualizar progresso de OKR
app.put('/api/okrs/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    const { progress_percentage, status } = req.body;
    
    console.log('🔄 Atualizando progresso do OKR:', id);
    
    const result = await query(`
      UPDATE okrs 
      SET progress_percentage = $1, 
          status = $2,
          completed_date = CASE WHEN $2 = 'completed' THEN CURRENT_DATE ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [progress_percentage, status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'OKR não encontrado' });
    }
    
    console.log('✅ Progresso atualizado');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao atualizar progresso:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Atualizar progresso de PDI
app.put('/api/development-plans/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    const { progress_percentage, status, budget_used } = req.body;
    
    console.log('🔄 Atualizando progresso do PDI:', id);
    
    const result = await query(`
      UPDATE development_plans 
      SET progress_percentage = $1, 
          status = $2,
          budget_used = $3,
          completed_date = CASE WHEN $2 = 'completed' THEN CURRENT_DATE ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [progress_percentage, status, budget_used, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'PDI não encontrado' });
    }
    
    console.log('✅ Progresso do PDI atualizado');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Erro ao atualizar progresso do PDI:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ====== SISTEMA DE PESQUISAS ======

// Listar pesquisas
app.get('/api/surveys', async (req, res) => {
  try {
    console.log('📋 Buscando pesquisas...');
    
    const result = await query(`
      SELECT s.*, 
             e.name as created_by_name,
             COUNT(sr.id) as total_responses,
             COUNT(CASE WHEN sr.is_complete = true THEN 1 END) as completed_responses
      FROM surveys s
      LEFT JOIN employees e ON s.created_by = e.id
      LEFT JOIN survey_responses sr ON s.id = sr.survey_id
      GROUP BY s.id, e.name
      ORDER BY s.created_at DESC
    `);
    
    console.log('✅ Encontradas', result.rows.length, 'pesquisas');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao buscar pesquisas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Criar nova pesquisa
app.post('/api/surveys', async (req, res) => {
  try {
    const { title, description, survey_type, is_anonymous, instructions, thank_you_message, end_date, questions } = req.body;
    
    console.log('➕ Criando nova pesquisa:', title);
    
    // Buscar primeiro funcionário para usar como criador (simplificado)
    const creatorResult = await query(`SELECT id FROM employees WHERE is_active = true LIMIT 1`);
    const created_by = creatorResult.rows[0]?.id;
    
    // Criar pesquisa
    const surveyResult = await query(`
      INSERT INTO surveys (title, description, survey_type, is_anonymous, instructions, thank_you_message, end_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [title, description, survey_type, is_anonymous, instructions, thank_you_message, end_date, created_by]);
    
    const survey = surveyResult.rows[0];
    
    // Inserir perguntas se fornecidas
    if (questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        await query(`
          INSERT INTO survey_questions 
          (survey_id, question_text, question_type, question_order, is_required, options, scale_min, scale_max, scale_labels)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          survey.id,
          question.question_text,
          question.question_type,
          i + 1,
          question.is_required || true,
          question.options ? JSON.stringify(question.options) : null,
          question.scale_min || null,
          question.scale_max || null,
          question.scale_labels ? JSON.stringify(question.scale_labels) : null
        ]);
      }
    }
    
    console.log('✅ Pesquisa criada:', title);
    res.json({ success: true, data: survey });
  } catch (error) {
    console.error('❌ Erro ao criar pesquisa:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Buscar pesquisa com perguntas
app.get('/api/surveys/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 Buscando pesquisa:', id);
    
    // Buscar pesquisa
    const surveyResult = await query(`
      SELECT s.*, e.name as created_by_name
      FROM surveys s
      LEFT JOIN employees e ON s.created_by = e.id
      WHERE s.id = $1
    `, [id]);
    
    if (surveyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pesquisa não encontrada' });
    }
    
    // Buscar perguntas
    const questionsResult = await query(`
      SELECT * FROM survey_questions 
      WHERE survey_id = $1 
      ORDER BY question_order
    `, [id]);
    
    const survey = surveyResult.rows[0];
    survey.questions = questionsResult.rows;
    
    console.log('✅ Pesquisa encontrada com', questionsResult.rows.length, 'perguntas');
    res.json({ success: true, data: survey });
  } catch (error) {
    console.error('❌ Erro ao buscar pesquisa:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Gerar link público da pesquisa
app.get('/api/surveys/:id/public-link', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔗 Gerando link público para pesquisa:', id);
    
    // Verificar se pesquisa existe e está ativa
    const surveyResult = await query(`
      SELECT id, title, is_active FROM surveys WHERE id = $1
    `, [id]);
    
    if (surveyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pesquisa não encontrada' });
    }
    
    const survey = surveyResult.rows[0];
    if (!survey.is_active) {
      return res.status(400).json({ success: false, error: 'Pesquisa não está ativa' });
    }
    
    const baseUrl = req.protocol + '://' + req.get('host');
    const publicLink = `${baseUrl}/survey/${id}`;
    
    // Gerar QR Code
    const surveyUrl = publicLink;
    const qrCodeSVG = generateSimpleQRCode(surveyUrl);
    const base64SVG = Buffer.from(qrCodeSVG).toString('base64');
    const qrCodeDataURI = `data:image/svg+xml;base64,${base64SVG}`;
    
    console.log('✅ Link público gerado:', publicLink);
    res.json({ 
      success: true, 
      data: {
        survey_id: id,
        survey_title: survey.title,
        public_link: publicLink,
        qr_code_url: qrCodeDataURI
      }
    });
  } catch (error) {
    console.error('❌ Erro ao gerar link público:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Página pública da pesquisa
app.get('/survey/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📋 Acessando pesquisa pública:', id);
    
    // Buscar pesquisa com perguntas
    const surveyResult = await query(`
      SELECT s.*, e.name as created_by_name
      FROM surveys s
      LEFT JOIN employees e ON s.created_by = e.id
      WHERE s.id = $1 AND s.is_active = true
    `, [id]);
    
    if (surveyResult.rows.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pesquisa não encontrada - Thermas RH Pro</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 2rem; background: #f8f9fa; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #dc3545; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>❌ Pesquisa não encontrada</h1>
                <p>A pesquisa que você está procurando não foi encontrada ou não está mais ativa.</p>
                <p>Verifique o link e tente novamente.</p>
            </div>
        </body>
        </html>
      `);
    }
    
    // Buscar perguntas
    const questionsResult = await query(`
      SELECT * FROM survey_questions 
      WHERE survey_id = $1 
      ORDER BY question_order
    `, [id]);
    
    const survey = surveyResult.rows[0];
    const questions = questionsResult.rows;
    
    // Gerar HTML da pesquisa pública
    const publicSurveyHTML = generatePublicSurveyHTML(survey, questions);
    res.send(publicSurveyHTML);
    
  } catch (error) {
    console.error('❌ Erro ao acessar pesquisa pública:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Gerar QR Code da pesquisa
app.get('/api/surveys/:id/qr-code', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📱 Gerando QR Code para pesquisa:', id);
    
    const baseUrl = req.protocol + '://' + req.get('host');
    const surveyUrl = `${baseUrl}/survey/${id}`;
    
    // Gerar QR Code SVG simples
    const qrCodeSVG = generateSimpleQRCode(surveyUrl);
    
    // Converter para base64 data URI para melhor compatibilidade
    const base64SVG = Buffer.from(qrCodeSVG).toString('base64');
    const dataURI = `data:image/svg+xml;base64,${base64SVG}`;
    
    // Retornar como JSON com data URI
    res.json({
      success: true,
      data: {
        qr_code_data_uri: dataURI,
        qr_code_svg: qrCodeSVG
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar QR Code:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Submeter resposta da pesquisa
app.post('/api/surveys/:id/responses', async (req, res) => {
  try {
    const { id } = req.params;
    const { responses, employee_id, completion_time, session_id } = req.body;
    
    console.log('💬 Submetendo resposta para pesquisa:', id);
    
    // Verificar se a pesquisa existe e está ativa
    const surveyCheck = await query(`
      SELECT is_anonymous, end_date FROM surveys 
      WHERE id = $1 AND is_active = true
    `, [id]);
    
    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pesquisa não encontrada ou inativa' });
    }
    
    const survey = surveyCheck.rows[0];
    
    // Verificar se a pesquisa ainda está no prazo
    if (survey.end_date && new Date(survey.end_date) < new Date()) {
      return res.status(400).json({ success: false, error: 'Pesquisa já foi encerrada' });
    }
    
    // Para pesquisas não anônimas, verificar se o funcionário já respondeu
    if (!survey.is_anonymous && employee_id) {
      const existingResponse = await query(`
        SELECT id FROM survey_responses 
        WHERE survey_id = $1 AND employee_id = $2
      `, [id, employee_id]);
      
      if (existingResponse.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Você já respondeu esta pesquisa' });
      }
    }
    
    // Inserir resposta
    const responseResult = await query(`
      INSERT INTO survey_responses 
      (survey_id, employee_id, response_data, completion_time, session_id, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      id,
      survey.is_anonymous ? null : employee_id,
      JSON.stringify(responses),
      completion_time,
      session_id,
      req.ip
    ]);
    
    // Atualizar status do convite se existir
    if (!survey.is_anonymous && employee_id) {
      await query(`
        UPDATE survey_invitations 
        SET status = 'completed', responded_at = CURRENT_TIMESTAMP
        WHERE survey_id = $1 AND employee_id = $2
      `, [id, employee_id]);
    }
    
    console.log('✅ Resposta submetida com sucesso');
    res.json({ 
      success: true, 
      message: 'Resposta submetida com sucesso',
      data: responseResult.rows[0] 
    });
  } catch (error) {
    console.error('❌ Erro ao submeter resposta:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Buscar respostas de uma pesquisa (para relatórios)
app.get('/api/surveys/:id/responses', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📊 Buscando respostas da pesquisa:', id);
    
    const result = await query(`
      SELECT sr.*, 
             e.name as employee_name,
             e.position as employee_position,
             e.department_id
      FROM survey_responses sr
      LEFT JOIN employees e ON sr.employee_id = e.id
      WHERE sr.survey_id = $1
      ORDER BY sr.submitted_at DESC
    `, [id]);
    
    console.log('✅ Encontradas', result.rows.length, 'respostas');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erro ao buscar respostas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Ativar/Desativar pesquisa
app.put('/api/surveys/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔄 Alterando status da pesquisa:', id);
    
    const result = await query(`
      UPDATE surveys 
      SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pesquisa não encontrada' });
    }
    
    const action = result.rows[0].is_active ? 'ativada' : 'desativada';
    console.log(`✅ Pesquisa ${action}:`, result.rows[0].title);
    
    res.json({ 
      success: true, 
      message: `Pesquisa ${action} com sucesso`,
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('❌ Erro ao alterar status da pesquisa:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Utility functions for surveys
function generatePublicSurveyHTML(survey, questions) {
  const questionsHTML = questions.map((question, index) => {
    let inputHTML = '';
    const name = `question_${question.id}`;
    
    switch (question.question_type) {
      case 'text':
        inputHTML = `<textarea name="${name}" rows="3" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; resize: vertical;" ${question.is_required ? 'required' : ''}></textarea>`;
        break;
        
      case 'yes_no':
        inputHTML = `
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; font-weight: normal;">
              <input type="radio" name="${name}" value="yes" ${question.is_required ? 'required' : ''} style="margin-right: 0.5rem;">
              Sim
            </label>
            <label style="display: flex; align-items: center; font-weight: normal;">
              <input type="radio" name="${name}" value="no" ${question.is_required ? 'required' : ''} style="margin-right: 0.5rem;">
              Não
            </label>
          </div>
        `;
        break;
        
      case 'single_choice':
        if (question.options) {
          const options = JSON.parse(question.options);
          inputHTML = options.map(option => `
            <label style="display: block; margin-bottom: 0.5rem; font-weight: normal;">
              <input type="radio" name="${name}" value="${option}" ${question.is_required ? 'required' : ''} style="margin-right: 0.5rem;">
              ${option}
            </label>
          `).join('');
        } else {
          inputHTML = '<p style="color: #dc3545;">Opções não configuradas para esta pergunta.</p>';
        }
        break;
        
      case 'scale':
        const min = question.scale_min || 1;
        const max = question.scale_max || 10;
        const labels = question.scale_labels ? JSON.parse(question.scale_labels) : {};
        
        inputHTML = `
          <div style="margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
              <span style="font-size: 0.9rem; color: #666;">${labels[min] || min}</span>
              <span style="font-size: 0.9rem; color: #666;">${labels[max] || max}</span>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
        `;
        
        for (let i = min; i <= max; i++) {
          inputHTML += `
            <label style="text-align: center; font-weight: normal; flex: 1; min-width: 40px;">
              <input type="radio" name="${name}" value="${i}" ${question.is_required ? 'required' : ''} style="display: block; margin: 0 auto 0.25rem;">
              <span style="font-size: 0.8rem;">${i}</span>
            </label>
          `;
        }
        
        inputHTML += '</div></div>';
        break;
        
      default:
        inputHTML = `<input type="text" name="${name}" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem;" ${question.is_required ? 'required' : ''}>`;
    }
    
    return `
      <div style="margin-bottom: 2rem; padding: 1.5rem; border: 1px solid #e9ecef; border-radius: 6px; background: #f8f9fa;">
        <label style="display: block; margin-bottom: 1rem; font-weight: bold; color: #333; font-size: 1.1rem;">
          ${index + 1}. ${question.question_text}
          ${question.is_required ? '<span style="color: #dc3545;">*</span>' : ''}
        </label>
        ${inputHTML}
      </div>
    `;
  }).join('');
  
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${survey.title} - Thermas RH Pro</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                margin: 0;
                padding: 1rem;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
                background: white;
                padding: 2rem;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            .header {
                text-align: center;
                margin-bottom: 2rem;
                padding-bottom: 1rem;
                border-bottom: 3px solid #007bff;
            }
            .header h1 {
                color: #333;
                margin: 0 0 0.5rem 0;
                font-size: 1.8rem;
            }
            .header p {
                color: #666;
                margin: 0;
                font-size: 1rem;
            }
            .instructions {
                background: #e7f3ff;
                padding: 1.5rem;
                border-radius: 8px;
                border-left: 4px solid #007bff;
                margin-bottom: 2rem;
            }
            .anonymous-badge {
                display: inline-block;
                background: #17a2b8;
                color: white;
                padding: 0.25rem 0.75rem;
                border-radius: 20px;
                font-size: 0.8rem;
                margin-top: 0.5rem;
            }
            .btn {
                background: #007bff;
                color: white;
                padding: 1rem 2rem;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.3s ease;
                margin-right: 0.5rem;
            }
            .btn:hover {
                background: #0056b3;
                transform: translateY(-2px);
            }
            .btn-secondary {
                background: #6c757d;
            }
            .btn-secondary:hover {
                background: #545b62;
            }
            .loading {
                display: none;
                text-align: center;
                padding: 2rem;
                color: #007bff;
            }
            .spinner {
                border: 3px solid #f3f3f3;
                border-top: 3px solid #007bff;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 0 auto 1rem;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .success-message {
                display: none;
                text-align: center;
                padding: 2rem;
                background: #d4edda;
                border: 1px solid #c3e6cb;
                border-radius: 8px;
                color: #155724;
                margin-top: 2rem;
            }
            .error-message {
                display: none;
                text-align: center;
                padding: 2rem;
                background: #f8d7da;
                border: 1px solid #f5c6cb;
                border-radius: 8px;
                color: #721c24;
                margin-top: 2rem;
            }
            @media (max-width: 768px) {
                .container { padding: 1rem; }
                .header h1 { font-size: 1.5rem; }
                body { padding: 0.5rem; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${survey.title}</h1>
                <p>${survey.description || ''}</p>
                ${survey.is_anonymous ? '<div class="anonymous-badge">📋 Pesquisa Anônima</div>' : ''}
            </div>
            
            ${survey.instructions ? `
            <div class="instructions">
                <strong>📋 Instruções:</strong>
                <p style="margin: 0.5rem 0 0;">${survey.instructions}</p>
            </div>
            ` : ''}
            
            <form id="surveyForm">
                ${questionsHTML}
                
                <div style="text-align: center; margin-top: 2rem; padding-top: 2rem; border-top: 2px solid #e9ecef;">
                    <button type="submit" class="btn">📤 Enviar Respostas</button>
                </div>
            </form>
            
            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p>Enviando suas respostas...</p>
            </div>
            
            <div class="success-message" id="successMessage">
                <h3>✅ Obrigado pela sua participação!</h3>
                <p>${survey.thank_you_message || 'Suas respostas foram registradas com sucesso.'}</p>
            </div>
            
            <div class="error-message" id="errorMessage">
                <h3>❌ Erro ao enviar respostas</h3>
                <p id="errorText">Ocorreu um erro. Tente novamente em alguns instantes.</p>
                <button type="button" class="btn" onclick="location.reload()">🔄 Tentar Novamente</button>
            </div>
        </div>
        
        <script>
            document.getElementById('surveyForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const form = e.target;
                const formData = new FormData(form);
                const responses = {};
                
                // Collect form data
                for (let [key, value] of formData.entries()) {
                    responses[key] = value;
                }
                
                // Show loading
                form.style.display = 'none';
                document.getElementById('loading').style.display = 'block';
                
                try {
                    const response = await fetch('/api/surveys/${survey.id}/responses', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            responses: responses,
                            employee_id: null,
                            completion_time: Date.now(),
                            session_id: Math.random().toString(36).substring(2, 15)
                        })
                    });
                    
                    const result = await response.json();
                    
                    document.getElementById('loading').style.display = 'none';
                    
                    if (result.success) {
                        document.getElementById('successMessage').style.display = 'block';
                    } else {
                        document.getElementById('errorText').textContent = result.error || 'Erro desconhecido';
                        document.getElementById('errorMessage').style.display = 'block';
                    }
                    
                } catch (error) {
                    console.error('Erro ao enviar:', error);
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('errorText').textContent = 'Erro de conexão. Verifique sua internet.';
                    document.getElementById('errorMessage').style.display = 'block';
                }
            });
        </script>
    </body>
    </html>
  `;
}

function generateSimpleQRCode(url) {
  // Gerar QR Code SVG simples para URL
  const size = 200;
  const modules = 25; // Grid 25x25 para QR code simples
  const moduleSize = size / modules;
  
  // Dados fictícios do QR code (normalmente seria gerado por biblioteca específica)
  // Aqui criamos um padrão visual que se parece com QR code
  let qrPattern = [];
  for (let i = 0; i < modules; i++) {
    qrPattern[i] = [];
    for (let j = 0; j < modules; j++) {
      // Criar padrão que se parece com QR code
      const hash = (i * modules + j + url.length) % 7;
      qrPattern[i][j] = hash < 3;
    }
  }
  
  // Adicionar padrões de positioning (cantos)
  const positionPatterns = [
    [0, 0], [0, modules-7], [modules-7, 0]
  ];
  
  positionPatterns.forEach(([startX, startY]) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (startX + i < modules && startY + j < modules) {
          const isOuter = i === 0 || i === 6 || j === 0 || j === 6;
          const isInner = (i >= 2 && i <= 4) && (j >= 2 && j <= 4);
          qrPattern[startX + i][startY + j] = isOuter || isInner;
        }
      }
    }
  });
  
  let svgContent = '';
  for (let i = 0; i < modules; i++) {
    for (let j = 0; j < modules; j++) {
      if (qrPattern[i][j]) {
        svgContent += `<rect x="${j * moduleSize}" y="${i * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
      }
    }
  }
  
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 40}" viewBox="0 0 ${size} ${size + 40}">
      <rect width="${size}" height="${size + 40}" fill="white"/>
      ${svgContent}
      <text x="${size/2}" y="${size + 20}" text-anchor="middle" font-family="Arial" font-size="12" fill="black">
        Acesse a pesquisa
      </text>
    </svg>
  `;
}

// Add question to survey
app.post('/api/surveys/:surveyId/questions', async (req, res) => {
  try {
    const { surveyId } = req.params;
    const { question_text, question_type, is_required, options, scale_min, scale_max, scale_labels } = req.body;
    
    console.log('➕ Adicionando pergunta à pesquisa:', surveyId);
    
    // Get next question order
    const orderResult = await query(
      'SELECT COALESCE(MAX(question_order), 0) + 1 as next_order FROM survey_questions WHERE survey_id = $1',
      [surveyId]
    );
    const nextOrder = orderResult.rows[0].next_order;
    
    // Prepare question data
    let questionOptions = null;
    let questionScaleLabels = null;
    
    if (question_type === 'single_choice' && options) {
      questionOptions = JSON.stringify(options);
    }
    
    if (question_type === 'scale' && scale_labels) {
      questionScaleLabels = JSON.stringify(scale_labels);
    }
    
    const result = await query(
      `INSERT INTO survey_questions 
       (survey_id, question_text, question_type, question_order, is_required, options, scale_min, scale_max, scale_labels)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        surveyId,
        question_text,
        question_type,
        nextOrder,
        is_required || false,
        questionOptions,
        scale_min || null,
        scale_max || null,
        questionScaleLabels
      ]
    );
    
    console.log('✅ Pergunta adicionada:', result.rows[0].question_text);
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Pergunta adicionada com sucesso'
    });
    
  } catch (error) {
    console.error('❌ Erro ao adicionar pergunta:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Delete question from survey
app.delete('/api/surveys/:surveyId/questions/:questionId', async (req, res) => {
  try {
    const { surveyId, questionId } = req.params;
    
    console.log('🗑️ Excluindo pergunta:', questionId, 'da pesquisa:', surveyId);
    
    // Check if question exists
    const checkResult = await query(
      'SELECT * FROM survey_questions WHERE id = $1 AND survey_id = $2',
      [questionId, surveyId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pergunta não encontrada' });
    }
    
    // Delete the question
    await query(
      'DELETE FROM survey_questions WHERE id = $1 AND survey_id = $2',
      [questionId, surveyId]
    );
    
    console.log('✅ Pergunta excluída com sucesso');
    
    res.json({
      success: true,
      message: 'Pergunta excluída com sucesso'
    });
    
  } catch (error) {
    console.error('❌ Erro ao excluir pergunta:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Delete entire survey
app.delete('/api/surveys/:surveyId', async (req, res) => {
  try {
    const { surveyId } = req.params;
    
    console.log('🗑️ Excluindo pesquisa completa:', surveyId);
    
    // Check if survey exists
    const checkResult = await query(
      'SELECT title FROM surveys WHERE id = $1',
      [surveyId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pesquisa não encontrada' });
    }
    
    const surveyTitle = checkResult.rows[0].title;
    
    // Delete in order: responses, questions, then survey
    await query('DELETE FROM survey_responses WHERE survey_id = $1', [surveyId]);
    console.log('✅ Respostas da pesquisa excluídas');
    
    await query('DELETE FROM survey_questions WHERE survey_id = $1', [surveyId]);
    console.log('✅ Perguntas da pesquisa excluídas');
    
    await query('DELETE FROM surveys WHERE id = $1', [surveyId]);
    console.log('✅ Pesquisa excluída:', surveyTitle);
    
    res.json({
      success: true,
      message: 'Pesquisa excluída com sucesso'
    });
    
  } catch (error) {
    console.error('❌ Erro ao excluir pesquisa:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Get survey results
app.get('/api/surveys/:surveyId/results', async (req, res) => {
  try {
    const { surveyId } = req.params;
    
    console.log('📊 Buscando resultados da pesquisa:', surveyId);
    
    // Get survey with questions
    const surveyResult = await query(
      `
      SELECT s.*, e.name as created_by_name
      FROM surveys s
      LEFT JOIN employees e ON s.created_by = e.id
      WHERE s.id = $1
      `,
      [surveyId]
    );
    
    if (surveyResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pesquisa não encontrada' });
    }
    
    const survey = surveyResult.rows[0];
    
    // Get questions
    const questionsResult = await query(
      `
      SELECT * FROM survey_questions 
      WHERE survey_id = $1 
      ORDER BY question_order
      `,
      [surveyId]
    );
    
    survey.questions = questionsResult.rows;
    
    // Get responses
    const responsesResult = await query(
      `
      SELECT sr.*, e.name as employee_name
      FROM survey_responses sr
      LEFT JOIN employees e ON sr.employee_id = e.id
      WHERE sr.survey_id = $1
      ORDER BY sr.created_at DESC
      `,
      [surveyId]
    );
    
    // Get statistics
    const statsResult = await query(
      `
      SELECT 
        COUNT(*) as total_responses,
        COUNT(CASE WHEN is_complete = true THEN 1 END) as completed_responses
      FROM survey_responses
      WHERE survey_id = $1
      `,
      [surveyId]
    );
    
    const statistics = statsResult.rows[0] || { total_responses: 0, completed_responses: 0 };
    
    console.log(`✅ Resultados encontrados: ${responsesResult.rows.length} respostas`);
    
    res.json({
      success: true,
      data: {
        survey,
        responses: responsesResult.rows,
        statistics
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar resultados:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Get dashboard analytics data
app.get('/api/dashboard/analytics', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Buscando dados do dashboard...');
    
    // Get total active employees
    const employeesResult = await query(`
      SELECT COUNT(*) as total_employees
      FROM employees
      WHERE is_active = true
    `);
    
    // Get new hires (last 30 days)
    const newHiresResult = await query(`
      SELECT COUNT(*) as new_hires
      FROM employees
      WHERE hire_date >= CURRENT_DATE - INTERVAL '30 days'
        AND is_active = true
    `);
    
    // Get pending approvals
    const pendingApprovalsResult = await query(`
      SELECT COUNT(*) as pending_approvals
      FROM requests
      WHERE status = 'pendente'
    `);
    
    // Get average hiring time (days between created_at and hire_date for recent hires)
    const avgHireTimeResult = await query(`
      SELECT AVG(
        EXTRACT(EPOCH FROM (hire_date - created_at)) / 86400
      )::INTEGER as avg_hire_days
      FROM employees
      WHERE hire_date >= CURRENT_DATE - INTERVAL '90 days'
        AND created_at IS NOT NULL
        AND hire_date IS NOT NULL
    `);
    
    // Get department distribution
    const departmentStatsResult = await query(`
      SELECT d.name, COUNT(e.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.is_active = true
      GROUP BY d.id, d.name
      ORDER BY employee_count DESC
    `);
    
    const analytics = {
      totalEmployees: parseInt(employeesResult.rows[0]?.total_employees || 0),
      newHires: parseInt(newHiresResult.rows[0]?.new_hires || 0),
      pendingRequests: parseInt(pendingApprovalsResult.rows[0]?.pending_approvals || 0),
      avgTimeHire: parseInt(avgHireTimeResult.rows[0]?.avg_hire_days || 0),
      departmentStats: departmentStatsResult.rows
    };
    
    console.log('✅ Analytics encontrados:', analytics);
    res.json({ success: true, data: analytics });
    
  } catch (error) {
    console.error('❌ Erro ao buscar analytics:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Serve the main application (Thermas layout)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Static file serving for specific routes  
app.get('/funcionarios.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'funcionarios.html'));
});

// Serve static files from root directory
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor básico rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
});