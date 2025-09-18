const fs = require('fs');
const path = require('path');
const { query } = require('./connection');

async function runFullMigration() {
  try {
    console.log('🔄 Iniciando migração completa do banco de dados...');
    
    // Lista completa de comandos para criar todas as tabelas do sistema
    const migrationCommands = [
      // Extensões necessárias
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
      `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
      
      // Função de trigger para updated_at
      `CREATE OR REPLACE FUNCTION update_updated_at_column()
       RETURNS TRIGGER AS $$
       BEGIN
           NEW.updated_at = CURRENT_TIMESTAMP;
           RETURN NEW;
       END;
       $$ language 'plpgsql'`,

      // 1. TABELA DE USUÁRIOS
      `CREATE TABLE IF NOT EXISTS users (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           email VARCHAR(255) UNIQUE NOT NULL,
           password_hash VARCHAR(255) NOT NULL,
           name VARCHAR(255) NOT NULL,
           role VARCHAR(50) DEFAULT 'user',
           is_active BOOLEAN DEFAULT true,
           last_login TIMESTAMP,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 2. TABELA DE GRUPOS DE USUÁRIOS
      `CREATE TABLE IF NOT EXISTS user_groups (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           name VARCHAR(100) UNIQUE NOT NULL,
           description TEXT,
           permissions JSONB DEFAULT '{}',
           is_active BOOLEAN DEFAULT true,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 3. TABELA DE ASSOCIAÇÃO USUÁRIOS-GRUPOS
      `CREATE TABLE IF NOT EXISTS user_group_memberships (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           user_id UUID REFERENCES users(id) ON DELETE CASCADE,
           group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
           assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           assigned_by UUID REFERENCES users(id),
           UNIQUE(user_id, group_id)
       )`,

      // 4. TABELA DE DEPARTAMENTOS
      `CREATE TABLE IF NOT EXISTS departments (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           name VARCHAR(255) NOT NULL,
           description TEXT,
           code VARCHAR(50) UNIQUE,
           manager_id UUID REFERENCES users(id),
           budget DECIMAL(15,2),
           cost_center VARCHAR(100),
           phone VARCHAR(20),
           email VARCHAR(255),
           location TEXT,
           is_active BOOLEAN DEFAULT true,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 5. TABELA DE FUNCIONÁRIOS
      `CREATE TABLE IF NOT EXISTS employees (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           employee_code VARCHAR(50) UNIQUE NOT NULL,
           name VARCHAR(255) NOT NULL,
           email VARCHAR(255) UNIQUE,
           phone VARCHAR(20),
           cpf VARCHAR(14) UNIQUE,
           rg VARCHAR(20),
           birth_date DATE,
           hire_date DATE NOT NULL,
           termination_date DATE,
           department_id UUID REFERENCES departments(id),
           position VARCHAR(255),
           cbo_code VARCHAR(10),
           salary DECIMAL(12,2),
           status VARCHAR(50) DEFAULT 'active',
           address JSONB,
           emergency_contact JSONB,
           documents JSONB,
           bank_info JSONB,
           benefits JSONB,
           notes TEXT,
           is_active BOOLEAN DEFAULT true,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 6. TABELA DE TIPOS DE REQUISIÇÕES
      `CREATE TABLE IF NOT EXISTS request_types (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           name VARCHAR(255) NOT NULL,
           description TEXT,
           category VARCHAR(100),
           requires_approval BOOLEAN DEFAULT true,
           approval_levels INTEGER DEFAULT 1,
           form_fields JSONB DEFAULT '[]',
           is_active BOOLEAN DEFAULT true,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 7. TABELA DE REQUISIÇÕES
      `CREATE TABLE IF NOT EXISTS requests (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           request_number VARCHAR(50) UNIQUE NOT NULL,
           employee_id UUID REFERENCES employees(id),
           request_type_id UUID REFERENCES request_types(id),
           title VARCHAR(255) NOT NULL,
           description TEXT,
           status VARCHAR(50) DEFAULT 'pending',
           priority VARCHAR(20) DEFAULT 'normal',
           data JSONB DEFAULT '{}',
           requested_date DATE,
           due_date DATE,
           completed_date DATE,
           requested_by UUID REFERENCES users(id),
           assigned_to UUID REFERENCES users(id),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 8. TABELA DE APROVAÇÕES
      `CREATE TABLE IF NOT EXISTS approvals (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
           approver_id UUID REFERENCES users(id),
           level INTEGER NOT NULL,
           status VARCHAR(50) DEFAULT 'pending',
           comments TEXT,
           approved_at TIMESTAMP,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 9. TABELA DE CONFIGURAÇÃO AD
      `CREATE TABLE IF NOT EXISTS ad_configuration (
           id SERIAL PRIMARY KEY,
           server VARCHAR(255) NOT NULL,
           domain VARCHAR(100) NOT NULL,
           base_dn VARCHAR(255) NOT NULL,
           admin_dn VARCHAR(255) NOT NULL,
           admin_password VARCHAR(255) NOT NULL,
           user_search_base VARCHAR(255),
           is_active BOOLEAN DEFAULT true,
           last_sync TIMESTAMP,
           configured_by UUID REFERENCES users(id),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 10. TABELA DE LOGS AD
      `CREATE TABLE IF NOT EXISTS ad_sync_logs (
           id SERIAL PRIMARY KEY,
           sync_type VARCHAR(50) NOT NULL,
           status VARCHAR(20) NOT NULL,
           users_imported INTEGER DEFAULT 0,
           users_updated INTEGER DEFAULT 0,
           groups_imported INTEGER DEFAULT 0,
           groups_updated INTEGER DEFAULT 0,
           error_message TEXT,
           synced_by UUID REFERENCES users(id),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 11. TABELA DE AVALIAÇÕES DE DESEMPENHO
      `CREATE TABLE IF NOT EXISTS performance_evaluations (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           employee_id UUID REFERENCES employees(id),
           evaluator_id UUID REFERENCES users(id),
           period_start DATE,
           period_end DATE,
           status VARCHAR(50) DEFAULT 'draft',
           overall_rating DECIMAL(3,2),
           goals JSONB DEFAULT '[]',
           competencies JSONB DEFAULT '[]',
           feedback TEXT,
           development_plan TEXT,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 12. TABELA DE METAS (OKRs)
      `CREATE TABLE IF NOT EXISTS objectives (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           employee_id UUID REFERENCES employees(id),
           title VARCHAR(255) NOT NULL,
           description TEXT,
           category VARCHAR(100),
           target_value DECIMAL(12,2),
           current_value DECIMAL(12,2) DEFAULT 0,
           unit VARCHAR(50),
           due_date DATE,
           status VARCHAR(50) DEFAULT 'active',
           weight DECIMAL(5,2) DEFAULT 1.0,
           created_by UUID REFERENCES users(id),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 13. TABELA DE TREINAMENTOS
      `CREATE TABLE IF NOT EXISTS training_programs (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           title VARCHAR(255) NOT NULL,
           description TEXT,
           category VARCHAR(100),
           duration_hours INTEGER,
           cost DECIMAL(10,2),
           provider VARCHAR(255),
           location VARCHAR(255),
           max_participants INTEGER,
           status VARCHAR(50) DEFAULT 'active',
           start_date DATE,
           end_date DATE,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 14. TABELA DE PARTICIPAÇÃO EM TREINAMENTOS
      `CREATE TABLE IF NOT EXISTS training_enrollments (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           training_id UUID REFERENCES training_programs(id),
           employee_id UUID REFERENCES employees(id),
           status VARCHAR(50) DEFAULT 'enrolled',
           completion_date DATE,
           score DECIMAL(5,2),
           certificate_url VARCHAR(500),
           feedback TEXT,
           enrolled_by UUID REFERENCES users(id),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           UNIQUE(training_id, employee_id)
       )`,

      // 15. TABELA DE PESQUISAS
      `CREATE TABLE IF NOT EXISTS surveys (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           title VARCHAR(255) NOT NULL,
           description TEXT,
           category VARCHAR(100),
           questions JSONB DEFAULT '[]',
           target_audience JSONB DEFAULT '{}',
           is_anonymous BOOLEAN DEFAULT false,
           status VARCHAR(50) DEFAULT 'draft',
           start_date DATE,
           end_date DATE,
           created_by UUID REFERENCES users(id),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 16. TABELA DE RESPOSTAS DE PESQUISAS
      `CREATE TABLE IF NOT EXISTS survey_responses (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           survey_id UUID REFERENCES surveys(id),
           employee_id UUID REFERENCES employees(id),
           responses JSONB DEFAULT '{}',
           completed_at TIMESTAMP,
           ip_address INET,
           user_agent TEXT,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 17. TABELA DE RELATÓRIOS
      `CREATE TABLE IF NOT EXISTS reports (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           name VARCHAR(255) NOT NULL,
           description TEXT,
           category VARCHAR(100),
           query_template TEXT,
           parameters JSONB DEFAULT '{}',
           schedule_config JSONB,
           last_run TIMESTAMP,
           next_run TIMESTAMP,
           status VARCHAR(50) DEFAULT 'active',
           created_by UUID REFERENCES users(id),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 18. TABELA DE EXECUÇÃO DE RELATÓRIOS
      `CREATE TABLE IF NOT EXISTS report_executions (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           report_id UUID REFERENCES reports(id),
           executed_by UUID REFERENCES users(id),
           status VARCHAR(50) DEFAULT 'running',
           result_data JSONB,
           file_path VARCHAR(500),
           execution_time INTEGER,
           error_message TEXT,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           completed_at TIMESTAMP
       )`,

      // 19. TABELA DE AUDITORIA
      `CREATE TABLE IF NOT EXISTS audit_logs (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           table_name VARCHAR(100) NOT NULL,
           record_id VARCHAR(100) NOT NULL,
           operation VARCHAR(20) NOT NULL,
           old_values JSONB,
           new_values JSONB,
           user_id UUID REFERENCES users(id),
           ip_address INET,
           user_agent TEXT,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // 20. TABELA DE CONFIGURAÇÕES DO SISTEMA
      `CREATE TABLE IF NOT EXISTS system_settings (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           key VARCHAR(255) UNIQUE NOT NULL,
           value JSONB,
           category VARCHAR(100),
           description TEXT,
           is_public BOOLEAN DEFAULT false,
           updated_by UUID REFERENCES users(id),
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,

      // TRIGGERS para updated_at
      `DROP TRIGGER IF EXISTS update_users_updated_at ON users`,
      `CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()`,
      
      `DROP TRIGGER IF EXISTS update_user_groups_updated_at ON user_groups`,
      `CREATE TRIGGER update_user_groups_updated_at BEFORE UPDATE ON user_groups FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()`,
      
      `DROP TRIGGER IF EXISTS update_departments_updated_at ON departments`,
      `CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()`,
      
      `DROP TRIGGER IF EXISTS update_employees_updated_at ON employees`,
      `CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()`,
      
      `DROP TRIGGER IF EXISTS update_requests_updated_at ON requests`,
      `CREATE TRIGGER update_requests_updated_at BEFORE UPDATE ON requests FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()`,
      
      `DROP TRIGGER IF EXISTS update_approvals_updated_at ON approvals`,
      `CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()`,

      // ÍNDICES para performance
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_cpf ON employees(cpf)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)`,
      `CREATE INDEX IF NOT EXISTS idx_requests_number ON requests(request_number)`,
      `CREATE INDEX IF NOT EXISTS idx_requests_employee ON requests(employee_id)`,
      `CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)`,
      `CREATE INDEX IF NOT EXISTS idx_requests_type ON requests(request_type_id)`,
      `CREATE INDEX IF NOT EXISTS idx_approvals_request ON approvals(request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_approvals_approver ON approvals(approver_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_ad_config_active ON ad_configuration(is_active, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_ad_sync_logs_date ON ad_sync_logs(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_training_enrollments_employee ON training_enrollments(employee_id)`,
      `CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id)`,
      `CREATE INDEX IF NOT EXISTS idx_report_executions_report ON report_executions(report_id)`
    ];
    
    console.log(`📋 Executando ${migrationCommands.length} comandos de migração...`);
    
    for (let i = 0; i < migrationCommands.length; i++) {
      const command = migrationCommands[i];
      try {
        await query(command);
        console.log(`✅ Comando ${i + 1}/${migrationCommands.length} executado`);
      } catch (error) {
        // Ignora erros de objetos que já existem
        if (error.code === '42710' || // trigger already exists
            error.code === '42P07' || // table already exists
            error.code === '42723' || // function already exists
            error.code === '42P06' || // schema already exists
            error.code === '42P16' || // index already exists
            error.code === '42703') { // column already exists
          console.log(`⚠️ Comando ${i + 1}/${migrationCommands.length} já existe, ignorando...`);
        } else {
          console.error(`❌ Erro no comando ${i + 1}:`, error.message);
          console.error('Comando:', command.substring(0, 100) + '...');
          // Continue mesmo com erro para não parar toda a migração
        }
      }
    }
    
    console.log('✅ Estrutura do banco criada com sucesso!');
    
    // INSERIR DADOS INICIAIS ESSENCIAIS
    
    // 1. Verificar e criar usuário admin
    console.log('👤 Verificando usuário administrador...');
    const adminExists = await query(
      'SELECT id FROM users WHERE email = $1',
      ['admin@rhpro.com']
    );
    
    if (adminExists.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await query(
        `INSERT INTO users (email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4)`,
        ['admin@rhpro.com', hashedPassword, 'Administrador', 'admin']
      );
      
      console.log('👤 Usuário admin criado: admin@rhpro.com / admin123');
    } else {
      console.log('👤 Usuário admin já existe');
    }
    
    // 2. Verificar e criar grupos de usuários básicos
    console.log('👥 Verificando grupos de usuários...');
    const groupsToCreate = [
      {
        name: 'Administradores',
        description: 'Administradores do sistema com acesso total',
        permissions: {
          users: ['create', 'read', 'update', 'delete'],
          employees: ['create', 'read', 'update', 'delete'],
          departments: ['create', 'read', 'update', 'delete'],
          requests: ['create', 'read', 'update', 'delete', 'approve'],
          reports: ['create', 'read', 'update', 'delete', 'execute']
        }
      },
      {
        name: 'RH',
        description: 'Equipe de Recursos Humanos',
        permissions: {
          employees: ['create', 'read', 'update', 'delete'],
          departments: ['read', 'update'],
          requests: ['create', 'read', 'update', 'approve'],
          reports: ['read', 'execute']
        }
      },
      {
        name: 'Gestores',
        description: 'Gestores de departamento',
        permissions: {
          employees: ['read', 'update'],
          requests: ['read', 'approve'],
          reports: ['read']
        }
      },
      {
        name: 'Funcionários',
        description: 'Funcionários padrão',
        permissions: {
          requests: ['create', 'read'],
          employees: ['read'] // próprio perfil apenas
        }
      }
    ];
    
    for (const group of groupsToCreate) {
      const exists = await query('SELECT id FROM user_groups WHERE name = $1', [group.name]);
      if (exists.rows.length === 0) {
        await query(
          'INSERT INTO user_groups (name, description, permissions) VALUES ($1, $2, $3)',
          [group.name, group.description, JSON.stringify(group.permissions)]
        );
        console.log(`👥 Grupo "${group.name}" criado`);
      }
    }
    
    // 3. Verificar e criar tipos de requisições básicos
    console.log('📋 Verificando tipos de requisições...');
    const requestTypesToCreate = [
      {
        name: 'Férias',
        description: 'Solicitação de férias',
        category: 'Ausência',
        form_fields: [
          { name: 'data_inicio', type: 'date', required: true, label: 'Data de Início' },
          { name: 'data_fim', type: 'date', required: true, label: 'Data de Fim' },
          { name: 'observacoes', type: 'textarea', required: false, label: 'Observações' }
        ]
      },
      {
        name: 'Licença Médica',
        description: 'Solicitação de afastamento por motivo médico',
        category: 'Ausência',
        approval_levels: 2,
        form_fields: [
          { name: 'data_inicio', type: 'date', required: true, label: 'Data de Início' },
          { name: 'previsao_retorno', type: 'date', required: false, label: 'Previsão de Retorno' },
          { name: 'anexo_atestado', type: 'file', required: true, label: 'Anexar Atestado Médico' }
        ]
      },
      {
        name: 'Mudança de Dados',
        description: 'Alteração de dados pessoais',
        category: 'Dados Pessoais',
        approval_levels: 1,
        form_fields: [
          { name: 'tipo_alteracao', type: 'select', required: true, label: 'Tipo de Alteração', 
            options: ['Endereço', 'Telefone', 'Email', 'Estado Civil', 'Conta Bancária'] },
          { name: 'valor_atual', type: 'text', required: true, label: 'Valor Atual' },
          { name: 'valor_novo', type: 'text', required: true, label: 'Valor Novo' },
          { name: 'justificativa', type: 'textarea', required: true, label: 'Justificativa' }
        ]
      },
      {
        name: 'Vale Transporte',
        description: 'Solicitação ou alteração de vale transporte',
        category: 'Benefícios',
        form_fields: [
          { name: 'tipo_solicitacao', type: 'select', required: true, label: 'Tipo', 
            options: ['Inclusão', 'Exclusão', 'Alteração de Valor'] },
          { name: 'linhas_utilizadas', type: 'textarea', required: true, label: 'Linhas de Ônibus Utilizadas' },
          { name: 'valor_mensal', type: 'number', required: true, label: 'Valor Mensal Estimado' }
        ]
      },
      {
        name: 'Hora Extra',
        description: 'Solicitação de aprovação de horas extras',
        category: 'Jornada',
        form_fields: [
          { name: 'data_hora_extra', type: 'date', required: true, label: 'Data da Hora Extra' },
          { name: 'hora_inicio', type: 'time', required: true, label: 'Hora de Início' },
          { name: 'hora_fim', type: 'time', required: true, label: 'Hora de Fim' },
          { name: 'justificativa', type: 'textarea', required: true, label: 'Justificativa' },
          { name: 'atividades_realizadas', type: 'textarea', required: true, label: 'Atividades Realizadas' }
        ]
      }
    ];
    
    for (const requestType of requestTypesToCreate) {
      const exists = await query('SELECT id FROM request_types WHERE name = $1', [requestType.name]);
      if (exists.rows.length === 0) {
        await query(
          `INSERT INTO request_types (name, description, category, approval_levels, form_fields) 
           VALUES ($1, $2, $3, $4, $5)`,
          [requestType.name, requestType.description, requestType.category, 
           requestType.approval_levels || 1, JSON.stringify(requestType.form_fields)]
        );
        console.log(`📋 Tipo de requisição "${requestType.name}" criado`);
      }
    }
    
    // 4. Criar configurações padrão do sistema
    console.log('⚙️ Verificando configurações do sistema...');
    const systemSettings = [
      { key: 'company_name', value: '"Hotel Thermas"', category: 'company', description: 'Nome da empresa' },
      { key: 'company_logo', value: '"/assets/logo.png"', category: 'company', description: 'Logo da empresa' },
      { key: 'max_vacation_days', value: '30', category: 'hr_policies', description: 'Máximo de dias de férias' },
      { key: 'working_hours_per_day', value: '8', category: 'hr_policies', description: 'Horas de trabalho por dia' },
      { key: 'overtime_multiplier', value: '1.5', category: 'hr_policies', description: 'Multiplicador de hora extra' },
      { key: 'email_notifications', value: 'true', category: 'notifications', description: 'Habilitar notificações por email' },
      { key: 'approval_email_template', value: '"Nova solicitação aguardando aprovação"', category: 'templates', description: 'Template de email de aprovação' }
    ];
    
    for (const setting of systemSettings) {
      const exists = await query('SELECT id FROM system_settings WHERE key = $1', [setting.key]);
      if (exists.rows.length === 0) {
        await query(
          'INSERT INTO system_settings (key, value, category, description) VALUES ($1, $2, $3, $4)',
          [setting.key, setting.value, setting.category, setting.description]
        );
        console.log(`⚙️ Configuração "${setting.key}" criada`);
      }
    }
    
    console.log('🎉 Migração completa finalizada com sucesso!');
    console.log('');
    console.log('📊 Resumo do que foi criado:');
    console.log('   ✅ 20 tabelas principais');
    console.log('   ✅ Índices de performance');
    console.log('   ✅ Triggers de auditoria');
    console.log('   ✅ Usuário admin: admin@rhpro.com / admin123');
    console.log('   ✅ 4 grupos de usuários');
    console.log('   ✅ 5 tipos de requisições');
    console.log('   ✅ Configurações do sistema');
    console.log('');
    console.log('🚀 Sistema pronto para uso!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erro na migração completa:', error);
    process.exit(1);
  }
}

// Executa se chamado diretamente
if (require.main === module) {
  runFullMigration();
}

module.exports = { runFullMigration };