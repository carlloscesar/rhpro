const bcrypt = require('bcryptjs');
const { query } = require('./connection');

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando seed do banco de dados...');

    // Usuários padrão
    const users = [
      {
        email: 'admin@rhpro.com',
        password: 'admin123',
        name: 'Administrador',
        role: 'admin'
      },
      {
        email: 'hr@rhpro.com',
        password: 'hr123',
        name: 'RH Manager',
        role: 'hr'
      },
      {
        email: 'manager@rhpro.com',
        password: 'manager123',
        name: 'Gerente',
        role: 'manager'
      }
    ];

    for (const user of users) {
      const existingUser = await query('SELECT id FROM users WHERE email = $1', [user.email]);
      
      if (existingUser.rows.length === 0) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        await query(
          'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)',
          [user.email, hashedPassword, user.name, user.role]
        );
        console.log(`✅ Usuário criado: ${user.email}`);
      }
    }

    // Departamentos
    const departments = [
      { name: 'Recursos Humanos', description: 'Gestão de pessoas e talentos', budget: 50000 },
      { name: 'Tecnologia da Informação', description: 'Desenvolvimento e infraestrutura', budget: 80000 },
      { name: 'Financeiro', description: 'Controladoria e finanças corporativas', budget: 60000 },
      { name: 'Marketing', description: 'Marketing digital e comunicação', budget: 40000 },
      { name: 'Vendas', description: 'Equipe comercial e relacionamento', budget: 70000 },
      { name: 'Operações', description: 'Processos operacionais e logística', budget: 90000 }
    ];

    const departmentIds = {};
    for (const dept of departments) {
      const existing = await query('SELECT id FROM departments WHERE name = $1', [dept.name]);
      
      if (existing.rows.length === 0) {
        const result = await query(
          'INSERT INTO departments (name, description, budget) VALUES ($1, $2, $3) RETURNING id',
          [dept.name, dept.description, dept.budget]
        );
        departmentIds[dept.name] = result.rows[0].id;
        console.log(`✅ Departamento criado: ${dept.name}`);
      } else {
        departmentIds[dept.name] = existing.rows[0].id;
      }
    }

    // Funcionários exemplo
    const employees = [
      {
        employee_code: 'EMP001',
        name: 'Maria Silva Santos',
        email: 'maria.santos@thermas.com',
        phone: '(11) 99999-1001',
        cpf: '123.456.789-01',
        birth_date: '1985-03-15',
        hire_date: '2020-01-10',
        department: 'Recursos Humanos',
        position: 'Analista de RH',
        cbo_code: '2524-05',
        salary: 5500.00
      },
      {
        employee_code: 'EMP002',
        name: 'João Pedro Oliveira',
        email: 'joao.oliveira@thermas.com',
        phone: '(11) 99999-1002',
        cpf: '234.567.890-12',
        birth_date: '1990-07-22',
        hire_date: '2021-03-01',
        department: 'Tecnologia da Informação',
        position: 'Desenvolvedor Full Stack',
        cbo_code: '2124-05',
        salary: 8500.00
      },
      {
        employee_code: 'EMP003',
        name: 'Ana Carolina Ferreira',
        email: 'ana.ferreira@thermas.com',
        phone: '(11) 99999-1003',
        cpf: '345.678.901-23',
        birth_date: '1988-11-05',
        hire_date: '2019-08-15',
        department: 'Financeiro',
        position: 'Analista Financeiro',
        cbo_code: '2522-10',
        salary: 6200.00
      },
      {
        employee_code: 'EMP004',
        name: 'Carlos Eduardo Lima',
        email: 'carlos.lima@thermas.com',
        phone: '(11) 99999-1004',
        cpf: '456.789.012-34',
        birth_date: '1987-04-30',
        hire_date: '2018-05-20',
        department: 'Marketing',
        position: 'Coordenador de Marketing',
        cbo_code: '1414-25',
        salary: 7800.00
      },
      {
        employee_code: 'EMP005',
        name: 'Fernanda Costa Almeida',
        email: 'fernanda.almeida@thermas.com',
        phone: '(11) 99999-1005',
        cpf: '567.890.123-45',
        birth_date: '1992-09-12',
        hire_date: '2022-01-10',
        department: 'Vendas',
        position: 'Consultor de Vendas',
        cbo_code: '3541-10',
        salary: 4800.00
      }
    ];

    for (const emp of employees) {
      const existing = await query('SELECT id FROM employees WHERE employee_code = $1', [emp.employee_code]);
      
      if (existing.rows.length === 0) {
        await query(`
          INSERT INTO employees (
            employee_code, name, email, phone, cpf, birth_date, hire_date,
            department_id, position, cbo_code, salary
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          emp.employee_code, emp.name, emp.email, emp.phone, emp.cpf,
          emp.birth_date, emp.hire_date, departmentIds[emp.department],
          emp.position, emp.cbo_code, emp.salary
        ]);
        console.log(`✅ Funcionário criado: ${emp.name}`);
      }
    }

    // Tipos de requisições
    const requestTypes = [
      {
        name: 'Férias',
        description: 'Solicitação de férias anuais',
        category: 'ferias',
        requires_approval: true,
        approver_role: 'manager',
        fields_config: {
          required_fields: ['start_date', 'end_date', 'emergency_contact'],
          optional_fields: ['destination', 'observations']
        }
      },
      {
        name: 'Reembolso',
        description: 'Solicitação de reembolso de despesas',
        category: 'reembolso',
        requires_approval: true,
        approver_role: 'manager',
        fields_config: {
          required_fields: ['amount', 'description', 'category', 'receipt'],
          optional_fields: ['project', 'client']
        }
      },
      {
        name: 'Material de Escritório',
        description: 'Solicitação de materiais e suprimentos',
        category: 'material',
        requires_approval: false,
        approver_role: 'hr',
        fields_config: {
          required_fields: ['items', 'justification'],
          optional_fields: ['urgency_level']
        }
      },
      {
        name: 'Treinamento',
        description: 'Solicitação de cursos e treinamentos',
        category: 'treinamento',
        requires_approval: true,
        approver_role: 'manager',
        fields_config: {
          required_fields: ['course_name', 'institution', 'cost', 'duration'],
          optional_fields: ['certification', 'business_justification']
        }
      },
      {
        name: 'Atestado Médico',
        description: 'Envio de atestado médico',
        category: 'saude',
        requires_approval: false,
        approver_role: 'hr',
        fields_config: {
          required_fields: ['medical_certificate', 'period'],
          optional_fields: ['doctor_info']
        }
      }
    ];

    for (const reqType of requestTypes) {
      const existing = await query('SELECT id FROM request_types WHERE name = $1', [reqType.name]);
      
      if (existing.rows.length === 0) {
        await query(`
          INSERT INTO request_types (
            name, description, category, requires_approval, 
            approver_role, fields_config
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          reqType.name, reqType.description, reqType.category,
          reqType.requires_approval, reqType.approver_role,
          JSON.stringify(reqType.fields_config)
        ]);
        console.log(`✅ Tipo de requisição criado: ${reqType.name}`);
      }
    }

    // Configurações do sistema
    const systemSettings = [
      {
        key: 'company_name',
        value: 'Thermas RH Pro',
        description: 'Nome da empresa',
        category: 'general'
      },
      {
        key: 'max_vacation_days',
        value: '30',
        description: 'Máximo de dias de férias por ano',
        category: 'hr_policies'
      },
      {
        key: 'approval_timeout_hours',
        value: '72',
        description: 'Tempo limite para aprovação (em horas)',
        category: 'workflow'
      },
      {
        key: 'notification_email',
        value: 'noreply@thermas.com',
        description: 'Email para envio de notificações',
        category: 'notifications'
      },
      {
        key: 'working_hours_start',
        value: '08:00',
        description: 'Horário de início do expediente',
        category: 'general'
      },
      {
        key: 'working_hours_end',
        value: '18:00',
        description: 'Horário de fim do expediente',
        category: 'general'
      }
    ];

    for (const setting of systemSettings) {
      const existing = await query('SELECT id FROM system_settings WHERE key = $1', [setting.key]);
      
      if (existing.rows.length === 0) {
        await query(`
          INSERT INTO system_settings (key, value, description, category)
          VALUES ($1, $2, $3, $4)
        `, [setting.key, setting.value, setting.description, setting.category]);
        console.log(`✅ Configuração criada: ${setting.key}`);
      }
    }

    console.log('🎉 Seed do banco de dados concluído com sucesso!');
    console.log('\n📋 Credenciais de acesso:');
    console.log('👑 Admin: admin@rhpro.com / admin123');
    console.log('🧑‍💼 RH: hr@rhpro.com / hr123');
    console.log('👨‍💼 Gerente: manager@rhpro.com / manager123');

  } catch (error) {
    console.error('❌ Erro no seed:', error);
    throw error;
  }
}

// Executa se chamado diretamente
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };