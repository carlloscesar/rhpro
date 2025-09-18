const express = require('express');
const { body, validationResult, query: expressQuery } = require('express-validator');
const { query } = require('../database/connection');
const { auditLog } = require('../middleware/auth');
const router = express.Router();

// GET /api/employees - Lista todos os funcionários
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', department = '', active = 'true' } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let params = [];
    let paramCount = 0;

    // Filtro de busca
    if (search) {
      paramCount++;
      whereConditions.push(`(name ILIKE $${paramCount} OR email ILIKE $${paramCount} OR employee_code ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    // Filtro de departamento
    if (department) {
      paramCount++;
      whereConditions.push(`department_id = $${paramCount}`);
      params.push(department);
    }

    // Filtro de ativo/inativo
    if (active !== 'all') {
      paramCount++;
      whereConditions.push(`is_active = $${paramCount}`);
      params.push(active === 'true');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query principal
    const employeesQuery = `
      SELECT 
        e.*,
        d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
      ORDER BY e.name ASC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);

    // Query de contagem total
    const countQuery = `
      SELECT COUNT(*) 
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id 
      ${whereClause}
    `;

    const [employeesResult, countResult] = await Promise.all([
      query(employeesQuery, params),
      query(countQuery, params.slice(0, -2)) // Remove limit e offset
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: employeesResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Erro ao buscar funcionários:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/employees/:id - Busca funcionário por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        e.*,
        d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Funcionário não encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao buscar funcionário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// POST /api/employees - Cria novo funcionário
router.post('/', [
  body('name').isLength({ min: 2 }).withMessage('Nome deve ter no mínimo 2 caracteres'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Email inválido'),
  body('employee_code').isLength({ min: 1 }).withMessage('Código do funcionário é obrigatório'),
  body('cpf').optional().isLength({ min: 11, max: 14 }).withMessage('CPF inválido'),
  body('hire_date').isISO8601().withMessage('Data de admissão inválida'),
  body('department_id').optional().isUUID().withMessage('ID do departamento inválido'),
  body('salary').optional().isFloat({ min: 0 }).withMessage('Salário deve ser um valor positivo')
], auditLog('CREATE_EMPLOYEE'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

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

    res.status(201).json({
      success: true,
      message: 'Funcionário criado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao criar funcionário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// PUT /api/employees/:id - Atualiza funcionário
router.put('/:id', [
  body('name').optional().isLength({ min: 2 }).withMessage('Nome deve ter no mínimo 2 caracteres'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Email inválido'),
  body('cpf').optional().isLength({ min: 11, max: 14 }).withMessage('CPF inválido'),
  body('salary').optional().isFloat({ min: 0 }).withMessage('Salário deve ser um valor positivo')
], auditLog('UPDATE_EMPLOYEE'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { id } = req.params;

    // Verifica se funcionário existe
    const existingEmployee = await query('SELECT * FROM employees WHERE id = $1', [id]);
    if (existingEmployee.rows.length === 0) {
      return res.status(404).json({
        error: 'Funcionário não encontrado'
      });
    }

    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;

    // Constrói query dinamicamente apenas com campos fornecidos
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined && key !== 'id') {
        paramCount++;
        updateFields.push(`${key} = $${paramCount}`);
        
        // Serializa objetos JSON se necessário
        if (['address', 'emergency_contact', 'documents'].includes(key) && typeof req.body[key] === 'object') {
          updateValues.push(JSON.stringify(req.body[key]));
        } else {
          updateValues.push(req.body[key]);
        }
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'Nenhum campo para atualizar'
      });
    }

    paramCount++;
    updateValues.push(id);

    const updateQuery = `
      UPDATE employees 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query(updateQuery, updateValues);

    res.json({
      success: true,
      message: 'Funcionário atualizado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao atualizar funcionário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// DELETE /api/employees/:id - Remove funcionário (soft delete)
router.delete('/:id', auditLog('DELETE_EMPLOYEE'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE employees SET is_active = false, termination_date = CURRENT_DATE WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Funcionário não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Funcionário desativado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao desativar funcionário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/employees/stats/summary - Estatísticas resumidas
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false) as inactive,
        COUNT(*) FILTER (WHERE hire_date >= CURRENT_DATE - INTERVAL '30 days') as recent_hires,
        AVG(salary) FILTER (WHERE salary > 0 AND is_active = true) as average_salary
      FROM employees
    `);

    const departmentStats = await query(`
      SELECT 
        d.name,
        COUNT(e.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.is_active = true
      GROUP BY d.id, d.name
      ORDER BY employee_count DESC
    `);

    res.json({
      success: true,
      data: {
        general: stats.rows[0],
        byDepartment: departmentStats.rows
      }
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

module.exports = router;