const express = require('express');
const { query } = require('../database/connection');
const router = express.Router();

// GET /api/reports/employees - Relatório de funcionários
router.get('/employees', async (req, res) => {
  try {
    const { 
      department = '', 
      status = 'active',
      hire_date_from = '',
      hire_date_to = '',
      export_format = 'json'
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramCount = 0;

    // Filtros
    if (department) {
      paramCount++;
      whereConditions.push(`e.department_id = $${paramCount}`);
      params.push(department);
    }

    if (status === 'active') {
      paramCount++;
      whereConditions.push(`e.is_active = $${paramCount}`);
      params.push(true);
    } else if (status === 'inactive') {
      paramCount++;
      whereConditions.push(`e.is_active = $${paramCount}`);
      params.push(false);
    }

    if (hire_date_from) {
      paramCount++;
      whereConditions.push(`e.hire_date >= $${paramCount}`);
      params.push(hire_date_from);
    }

    if (hire_date_to) {
      paramCount++;
      whereConditions.push(`e.hire_date <= $${paramCount}`);
      params.push(hire_date_to);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const result = await query(`
      SELECT 
        e.employee_code,
        e.name,
        e.email,
        e.phone,
        e.position,
        e.hire_date,
        e.termination_date,
        e.salary,
        e.is_active,
        d.name as department_name,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.hire_date)) as years_of_service
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
      ORDER BY e.name ASC
    `, params);

    // Estatísticas resumidas
    const summary = await query(`
      SELECT 
        COUNT(*) as total_count,
        AVG(salary) FILTER (WHERE salary > 0) as avg_salary,
        AVG(EXTRACT(YEAR FROM AGE(CURRENT_DATE, hire_date))) as avg_years_service,
        COUNT(*) FILTER (WHERE is_active = true) as active_count,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_count
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        employees: result.rows,
        summary: summary.rows[0],
        filters_applied: {
          department: department || 'todos',
          status,
          hire_date_from: hire_date_from || 'início',
          hire_date_to: hire_date_to || 'hoje'
        }
      }
    });

  } catch (error) {
    console.error('Erro no relatório de funcionários:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/reports/requests - Relatório de requisições
router.get('/requests', async (req, res) => {
  try {
    const {
      start_date = '',
      end_date = '',
      status = '',
      department = '',
      request_type = '',
      employee = ''
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramCount = 0;

    // Filtros de data
    if (start_date) {
      paramCount++;
      whereConditions.push(`r.created_at >= $${paramCount}`);
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`r.created_at <= $${paramCount}`);
      params.push(end_date + ' 23:59:59');
    }

    // Outros filtros
    if (status) {
      paramCount++;
      whereConditions.push(`r.status = $${paramCount}`);
      params.push(status);
    }

    if (department) {
      paramCount++;
      whereConditions.push(`e.department_id = $${paramCount}`);
      params.push(department);
    }

    if (request_type) {
      paramCount++;
      whereConditions.push(`r.request_type_id = $${paramCount}`);
      params.push(request_type);
    }

    if (employee) {
      paramCount++;
      whereConditions.push(`r.employee_id = $${paramCount}`);
      params.push(employee);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Dados principais
    const requestsData = await query(`
      SELECT 
        r.title,
        r.status,
        r.priority,
        r.created_at,
        r.approved_at,
        r.amount,
        e.name as employee_name,
        e.employee_code,
        d.name as department_name,
        rt.name as request_type_name,
        rt.category,
        u.name as approver_name,
        CASE 
          WHEN r.approved_at IS NOT NULL THEN 
            EXTRACT(EPOCH FROM (r.approved_at - r.created_at))/3600
          ELSE NULL
        END as approval_time_hours
      FROM requests r
      LEFT JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN request_types rt ON r.request_type_id = rt.id
      LEFT JOIN users u ON r.approver_id = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
    `, params);

    // Estatísticas
    const statistics = await query(`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE r.status = 'pending') as pending,
        COUNT(*) FILTER (WHERE r.status = 'approved') as approved,
        COUNT(*) FILTER (WHERE r.status = 'rejected') as rejected,
        ROUND(AVG(r.amount) FILTER (WHERE r.amount > 0), 2) as avg_amount,
        SUM(r.amount) FILTER (WHERE r.status = 'approved') as total_approved_amount,
        ROUND(AVG(EXTRACT(EPOCH FROM (r.approved_at - r.created_at))/3600) FILTER (WHERE r.approved_at IS NOT NULL), 2) as avg_approval_hours
      FROM requests r
      LEFT JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN request_types rt ON r.request_type_id = rt.id
      ${whereClause}
    `, params);

    // Por tipo de requisição
    const byType = await query(`
      SELECT 
        rt.name,
        rt.category,
        COUNT(r.id) as count,
        ROUND(AVG(CASE WHEN r.status = 'approved' THEN 100.0 ELSE 0.0 END), 2) as approval_rate
      FROM request_types rt
      LEFT JOIN requests r ON rt.id = r.request_type_id
      LEFT JOIN employees e ON r.employee_id = e.id
      ${whereClause.replace('WHERE', 'WHERE rt.is_active = true AND')}
      GROUP BY rt.id, rt.name, rt.category
      ORDER BY count DESC
    `, params);

    res.json({
      success: true,
      data: {
        requests: requestsData.rows,
        statistics: statistics.rows[0],
        byType: byType.rows,
        period: {
          start_date: start_date || 'início',
          end_date: end_date || 'hoje',
          total_days: start_date && end_date 
            ? Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24))
            : 'indefinido'
        }
      }
    });

  } catch (error) {
    console.error('Erro no relatório de requisições:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/reports/departments - Relatório de departamentos
router.get('/departments', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        d.name as department_name,
        d.description,
        d.budget,
        COUNT(e.id) as employee_count,
        COUNT(e.id) FILTER (WHERE e.is_active = true) as active_employees,
        AVG(e.salary) FILTER (WHERE e.is_active = true AND e.salary > 0) as avg_salary,
        SUM(e.salary) FILTER (WHERE e.is_active = true) as total_salary_cost,
        CASE 
          WHEN d.budget > 0 THEN ROUND((SUM(e.salary) FILTER (WHERE e.is_active = true) / d.budget * 100)::numeric, 2)
          ELSE 0
        END as budget_utilization_percent,
        manager.name as manager_name,
        COUNT(r.id) FILTER (WHERE r.created_at >= CURRENT_DATE - INTERVAL '30 days') as requests_last_30_days
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
      LEFT JOIN employees manager ON d.manager_id = manager.id
      LEFT JOIN requests r ON e.id = r.employee_id
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.description, d.budget, manager.name
      ORDER BY employee_count DESC
    `);

    // Estatísticas gerais
    const summary = await query(`
      SELECT 
        COUNT(*) as total_departments,
        SUM(budget) as total_budget,
        AVG(employee_count) as avg_employees_per_dept,
        SUM(total_salary_cost) as total_salary_costs
      FROM (
        SELECT 
          d.budget,
          COUNT(e.id) as employee_count,
          SUM(e.salary) FILTER (WHERE e.is_active = true) as total_salary_cost
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id
        WHERE d.is_active = true
        GROUP BY d.id, d.budget
      ) dept_stats
    `);

    res.json({
      success: true,
      data: {
        departments: result.rows,
        summary: summary.rows[0]
      }
    });

  } catch (error) {
    console.error('Erro no relatório de departamentos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/reports/payroll - Relatório de folha de pagamento
router.get('/payroll', async (req, res) => {
  try {
    const { department = '', month = '', year = new Date().getFullYear() } = req.query;

    let whereConditions = ['e.is_active = true', 'e.salary > 0'];
    let params = [];
    let paramCount = 0;

    if (department) {
      paramCount++;
      whereConditions.push(`e.department_id = $${paramCount}`);
      params.push(department);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const payrollData = await query(`
      SELECT 
        e.employee_code,
        e.name,
        e.salary,
        e.position,
        d.name as department_name,
        e.hire_date,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.hire_date)) as years_of_service,
        -- Simulação de cálculos básicos de folha
        ROUND(e.salary * 0.08, 2) as inss_employee,
        ROUND(e.salary * 0.11, 2) as inss_employer,
        ROUND(e.salary * 0.08, 2) as fgts,
        ROUND(e.salary * 0.075, 2) as income_tax_estimate,
        ROUND(e.salary - (e.salary * 0.08) - (e.salary * 0.075), 2) as net_salary_estimate
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
      ORDER BY d.name, e.name
    `, params);

    // Totais por departamento
    const departmentTotals = await query(`
      SELECT 
        d.name as department_name,
        COUNT(e.id) as employee_count,
        SUM(e.salary) as total_gross_salary,
        SUM(e.salary * 0.08) as total_inss_employee,
        SUM(e.salary * 0.11) as total_inss_employer,
        SUM(e.salary * 0.08) as total_fgts,
        SUM(e.salary - (e.salary * 0.08) - (e.salary * 0.075)) as total_net_salary,
        AVG(e.salary) as avg_salary
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
      GROUP BY d.id, d.name
      ORDER BY total_gross_salary DESC
    `, params);

    // Totais gerais
    const generalTotals = await query(`
      SELECT 
        COUNT(e.id) as total_employees,
        SUM(e.salary) as total_gross_payroll,
        SUM(e.salary * 0.08) as total_inss_employee,
        SUM(e.salary * 0.11) as total_inss_employer,
        SUM(e.salary * 0.08) as total_fgts,
        SUM(e.salary * 0.075) as total_income_tax,
        SUM(e.salary - (e.salary * 0.08) - (e.salary * 0.075)) as total_net_payroll,
        AVG(e.salary) as avg_salary,
        MIN(e.salary) as min_salary,
        MAX(e.salary) as max_salary
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        employees: payrollData.rows,
        departmentTotals: departmentTotals.rows,
        generalTotals: generalTotals.rows[0],
        parameters: {
          department: department || 'todos',
          year: parseInt(year),
          generated_at: new Date().toISOString()
        },
        disclaimer: 'Este relatório contém estimativas básicas. Consulte um contador para cálculos oficiais.'
      }
    });

  } catch (error) {
    console.error('Erro no relatório de folha:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/reports/audit - Relatório de auditoria
router.get('/audit', async (req, res) => {
  try {
    const { 
      start_date = '', 
      end_date = '', 
      user_id = '', 
      action = '' 
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      whereConditions.push(`a.created_at >= $${paramCount}`);
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`a.created_at <= $${paramCount}`);
      params.push(end_date + ' 23:59:59');
    }

    if (user_id) {
      paramCount++;
      whereConditions.push(`a.user_id = $${paramCount}`);
      params.push(user_id);
    }

    if (action) {
      paramCount++;
      whereConditions.push(`a.action ILIKE $${paramCount}`);
      params.push(`%${action}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const auditLogs = await query(`
      SELECT 
        a.action,
        a.table_name,
        a.record_id,
        a.ip_address,
        a.created_at,
        u.name as user_name,
        u.email as user_email,
        e.name as employee_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN employees e ON a.employee_id = e.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT 1000
    `, params);

    // Estatísticas de auditoria
    const auditStats = await query(`
      SELECT 
        COUNT(*) as total_actions,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) FILTER (WHERE action LIKE 'CREATE%') as creates,
        COUNT(*) FILTER (WHERE action LIKE 'UPDATE%') as updates,
        COUNT(*) FILTER (WHERE action LIKE 'DELETE%') as deletes,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_actions
      FROM audit_logs a
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        logs: auditLogs.rows,
        statistics: auditStats.rows[0],
        period: {
          start_date: start_date || 'início',
          end_date: end_date || 'hoje'
        }
      }
    });

  } catch (error) {
    console.error('Erro no relatório de auditoria:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

module.exports = router;