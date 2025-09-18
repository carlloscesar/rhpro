const express = require('express');
const { query } = require('../database/connection');
const router = express.Router();

// GET /api/dashboard - Dashboard principal
router.get('/', async (req, res) => {
  try {
    // Estatísticas gerais
    const generalStats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM employees WHERE is_active = true) as active_employees,
        (SELECT COUNT(*) FROM departments WHERE is_active = true) as active_departments,
        (SELECT COUNT(*) FROM requests WHERE status = 'pending') as pending_requests,
        (SELECT COUNT(*) FROM requests WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as recent_requests
    `);

    // Requisições por status
    const requestsByStatus = await query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM requests
      GROUP BY status
      ORDER BY count DESC
    `);

    // Funcionários admitidos recentemente
    const recentHires = await query(`
      SELECT 
        e.name,
        e.employee_code,
        e.hire_date,
        d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.hire_date >= CURRENT_DATE - INTERVAL '30 days'
      AND e.is_active = true
      ORDER BY e.hire_date DESC
      LIMIT 5
    `);

    // Requisições urgentes
    const urgentRequests = await query(`
      SELECT 
        r.title,
        r.created_at,
        r.priority,
        e.name as employee_name,
        rt.name as request_type
      FROM requests r
      LEFT JOIN employees e ON r.employee_id = e.id
      LEFT JOIN request_types rt ON r.request_type_id = rt.id
      WHERE r.status = 'pending' 
      AND r.priority IN ('urgent', 'high')
      ORDER BY 
        CASE r.priority 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
        END,
        r.created_at ASC
      LIMIT 10
    `);

    // Departamentos com mais funcionários
    const departmentStats = await query(`
      SELECT 
        d.name,
        COUNT(e.id) as employee_count,
        d.budget,
        CASE 
          WHEN d.budget > 0 THEN ROUND((SUM(e.salary) / d.budget * 100)::numeric, 2)
          ELSE 0
        END as budget_usage
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.is_active = true
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.budget
      ORDER BY employee_count DESC
      LIMIT 5
    `);

    // Atividade recente (últimos 10 dias)
    const activityData = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as requests_created
      FROM requests
      WHERE created_at >= CURRENT_DATE - INTERVAL '10 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.json({
      success: true,
      data: {
        generalStats: generalStats.rows[0],
        requestsByStatus: requestsByStatus.rows,
        recentHires: recentHires.rows,
        urgentRequests: urgentRequests.rows,
        departmentStats: departmentStats.rows,
        activityData: activityData.rows
      }
    });

  } catch (error) {
    console.error('Erro ao buscar dados do dashboard:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/dashboard/analytics - Analytics avançados
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30' } = req.query; // dias

    // Tendências de requisições
    const requestTrends = await query(`
      SELECT 
        DATE_TRUNC('week', created_at) as week,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM requests
      WHERE created_at >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week DESC
    `, [parseInt(period)]);

    // Tempo médio de aprovação
    const approvalTimes = await query(`
      SELECT 
        rt.name as request_type,
        AVG(EXTRACT(EPOCH FROM (r.updated_at - r.created_at))/3600) as avg_hours_to_approval
      FROM requests r
      LEFT JOIN request_types rt ON r.request_type_id = rt.id
      WHERE r.status IN ('approved', 'rejected')
      AND r.created_at >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      GROUP BY rt.name
      ORDER BY avg_hours_to_approval DESC
    `, [parseInt(period)]);

    // Funcionários mais ativos (que fazem mais requisições)
    const activeEmployees = await query(`
      SELECT 
        e.name,
        e.employee_code,
        d.name as department,
        COUNT(r.id) as request_count
      FROM employees e
      LEFT JOIN requests r ON e.id = r.employee_id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE r.created_at >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      GROUP BY e.id, e.name, e.employee_code, d.name
      HAVING COUNT(r.id) > 0
      ORDER BY request_count DESC
      LIMIT 10
    `, [parseInt(period)]);

    // Padrões por tipo de requisição
    const requestPatterns = await query(`
      SELECT 
        rt.name,
        rt.category,
        COUNT(r.id) as total_requests,
        ROUND(AVG(CASE WHEN r.status = 'approved' THEN 100.0 ELSE 0.0 END), 2) as approval_rate
      FROM request_types rt
      LEFT JOIN requests r ON rt.id = r.request_type_id
      WHERE r.created_at >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      GROUP BY rt.id, rt.name, rt.category
      HAVING COUNT(r.id) > 0
      ORDER BY total_requests DESC
    `, [parseInt(period)]);

    res.json({
      success: true,
      data: {
        requestTrends: requestTrends.rows,
        approvalTimes: approvalTimes.rows,
        activeEmployees: activeEmployees.rows,
        requestPatterns: requestPatterns.rows
      }
    });

  } catch (error) {
    console.error('Erro ao buscar analytics:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/dashboard/kpis - KPIs principais
router.get('/kpis', async (req, res) => {
  try {
    const kpis = await query(`
      SELECT 
        -- Employee KPIs
        (SELECT COUNT(*) FROM employees WHERE is_active = true) as total_employees,
        (SELECT COUNT(*) FROM employees WHERE hire_date >= CURRENT_DATE - INTERVAL '90 days') as new_hires_3m,
        (SELECT COUNT(*) FROM employees WHERE termination_date >= CURRENT_DATE - INTERVAL '90 days') as terminations_3m,
        
        -- Request KPIs
        (SELECT COUNT(*) FROM requests WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as requests_this_month,
        (SELECT COUNT(*) FROM requests WHERE status = 'pending') as pending_requests,
        (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (approved_at - created_at))/3600), 2) 
         FROM requests WHERE status = 'approved' AND created_at >= CURRENT_DATE - INTERVAL '30 days') as avg_approval_hours,
        
        -- Financial KPIs
        (SELECT AVG(salary) FROM employees WHERE is_active = true AND salary > 0) as avg_salary,
        (SELECT SUM(budget) FROM departments WHERE is_active = true) as total_budget,
        (SELECT SUM(amount) FROM requests WHERE status = 'approved' AND created_at >= CURRENT_DATE - INTERVAL '30 days') as approved_expenses_month
    `);

    // Cálculo de turnover
    const turnoverData = await query(`
      SELECT 
        (SELECT COUNT(*) FROM employees WHERE termination_date >= CURRENT_DATE - INTERVAL '12 months') as terminations_12m,
        (SELECT AVG(employee_count) FROM (
          SELECT COUNT(*) as employee_count 
          FROM employees 
          WHERE is_active = true OR termination_date >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', COALESCE(termination_date, CURRENT_DATE))
        ) avg_counts) as avg_employees_12m
    `);

    const baseKpis = kpis.rows[0];
    const turnover = turnoverData.rows[0];
    
    // Calcula taxa de turnover anual
    const turnoverRate = turnover.avg_employees_12m > 0 
      ? Math.round((turnover.terminations_12m / turnover.avg_employees_12m) * 100 * 100) / 100 
      : 0;

    res.json({
      success: true,
      data: {
        ...baseKpis,
        turnover_rate_12m: turnoverRate,
        retention_rate_12m: Math.round((100 - turnoverRate) * 100) / 100
      }
    });

  } catch (error) {
    console.error('Erro ao buscar KPIs:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

module.exports = router;