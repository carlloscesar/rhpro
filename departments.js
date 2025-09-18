const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../database/connection');
const { auditLog } = require('../middleware/auth');
const router = express.Router();

// GET /api/departments - Lista todos os departamentos
router.get('/', async (req, res) => {
  try {
    const { active = 'true' } = req.query;

    let whereClause = '';
    let params = [];

    if (active !== 'all') {
      whereClause = 'WHERE d.is_active = $1';
      params.push(active === 'true');
    }

    const result = await query(`
      SELECT 
        d.*,
        e.name as manager_name,
        COUNT(emp.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.manager_id = e.id
      LEFT JOIN employees emp ON d.id = emp.department_id AND emp.is_active = true
      ${whereClause}
      GROUP BY d.id, e.name
      ORDER BY d.name ASC
    `, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar departamentos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/departments/:id - Busca departamento por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        d.*,
        e.name as manager_name,
        e.email as manager_email
      FROM departments d
      LEFT JOIN employees e ON d.manager_id = e.id
      WHERE d.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Departamento não encontrado'
      });
    }

    // Busca funcionários do departamento
    const employeesResult = await query(`
      SELECT id, name, email, position, hire_date
      FROM employees 
      WHERE department_id = $1 AND is_active = true
      ORDER BY name ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        employees: employeesResult.rows
      }
    });

  } catch (error) {
    console.error('Erro ao buscar departamento:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// POST /api/departments - Cria novo departamento
router.post('/', [
  body('name').isLength({ min: 2 }).withMessage('Nome deve ter no mínimo 2 caracteres'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Orçamento deve ser um valor positivo'),
  body('manager_id').optional().isUUID().withMessage('ID do gerente inválido')
], auditLog('CREATE_DEPARTMENT'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { name, description, budget, manager_id } = req.body;

    // Verifica se nome já existe
    const existingDept = await query(
      'SELECT id FROM departments WHERE name = $1',
      [name]
    );

    if (existingDept.rows.length > 0) {
      return res.status(409).json({
        error: 'Nome do departamento já existe'
      });
    }

    // Verifica se gerente existe (se fornecido)
    if (manager_id) {
      const managerExists = await query(
        'SELECT id FROM employees WHERE id = $1 AND is_active = true',
        [manager_id]
      );

      if (managerExists.rows.length === 0) {
        return res.status(400).json({
          error: 'Gerente não encontrado ou inativo'
        });
      }
    }

    const result = await query(`
      INSERT INTO departments (name, description, budget, manager_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, description, budget, manager_id]);

    res.status(201).json({
      success: true,
      message: 'Departamento criado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao criar departamento:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// PUT /api/departments/:id - Atualiza departamento
router.put('/:id', [
  body('name').optional().isLength({ min: 2 }).withMessage('Nome deve ter no mínimo 2 caracteres'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Orçamento deve ser um valor positivo'),
  body('manager_id').optional().isUUID().withMessage('ID do gerente inválido')
], auditLog('UPDATE_DEPARTMENT'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { id } = req.params;

    // Verifica se departamento existe
    const existingDept = await query('SELECT * FROM departments WHERE id = $1', [id]);
    if (existingDept.rows.length === 0) {
      return res.status(404).json({
        error: 'Departamento não encontrado'
      });
    }

    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;

    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined && key !== 'id') {
        paramCount++;
        updateFields.push(`${key} = $${paramCount}`);
        updateValues.push(req.body[key]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'Nenhum campo para atualizar'
      });
    }

    // Verifica se gerente existe (se sendo atualizado)
    if (req.body.manager_id) {
      const managerExists = await query(
        'SELECT id FROM employees WHERE id = $1 AND is_active = true',
        [req.body.manager_id]
      );

      if (managerExists.rows.length === 0) {
        return res.status(400).json({
          error: 'Gerente não encontrado ou inativo'
        });
      }
    }

    paramCount++;
    updateValues.push(id);

    const updateQuery = `
      UPDATE departments 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query(updateQuery, updateValues);

    res.json({
      success: true,
      message: 'Departamento atualizado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao atualizar departamento:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// DELETE /api/departments/:id - Remove departamento (soft delete)
router.delete('/:id', auditLog('DELETE_DEPARTMENT'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verifica se há funcionários no departamento
    const employeesCount = await query(
      'SELECT COUNT(*) FROM employees WHERE department_id = $1 AND is_active = true',
      [id]
    );

    if (parseInt(employeesCount.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Não é possível excluir departamento com funcionários ativos'
      });
    }

    const result = await query(
      'UPDATE departments SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Departamento não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Departamento desativado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao desativar departamento:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/departments/:id/employees - Lista funcionários de um departamento
router.get('/:id/employees', async (req, res) => {
  try {
    const { id } = req.params;
    const { active = 'true' } = req.query;

    let whereClause = 'WHERE department_id = $1';
    let params = [id];

    if (active !== 'all') {
      whereClause += ' AND is_active = $2';
      params.push(active === 'true');
    }

    const result = await query(`
      SELECT 
        id, employee_code, name, email, phone, position, 
        hire_date, termination_date, salary, is_active
      FROM employees 
      ${whereClause}
      ORDER BY name ASC
    `, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar funcionários do departamento:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/departments/stats/budget - Estatísticas de orçamento
router.get('/stats/budget', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        d.name,
        d.budget,
        COUNT(e.id) as employee_count,
        AVG(e.salary) as avg_salary,
        SUM(e.salary) as total_salaries,
        CASE 
          WHEN d.budget > 0 THEN (SUM(e.salary) / d.budget * 100)
          ELSE 0
        END as budget_usage_percent
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.is_active = true
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.budget
      ORDER BY budget_usage_percent DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas de orçamento:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

module.exports = router;