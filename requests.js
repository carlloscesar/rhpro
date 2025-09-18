const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../database/connection');
const { auditLog } = require('../middleware/auth');
const router = express.Router();

// GET /api/request-types - Lista todos os tipos de requisição disponíveis
router.get('/types', async (req, res) => {
  try {
    console.log('📋 Buscando tipos de requisição...');
    const db = require('../database/connection');
    
    const result = await db.query(`
      SELECT 
        id,
        name,
        description,
        category,
        form_fields,
        approval_levels,
        active,
        created_at,
        updated_at
      FROM request_types 
      WHERE active = true
      ORDER BY name ASC
    `);
    
    console.log(`✅ Encontrados ${result.rows.length} tipos de requisição`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      message: `${result.rows.length} tipos de requisição disponíveis`
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar tipos de requisição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// GET /api/requests/pending - Lista apenas requisições pendentes de aprovação
router.get('/pending', async (req, res) => {
  try {
    console.log('⏳ Buscando requisições pendentes para aprovação...');
    const db = require('../database/connection');
    
    const pendingRequestsQuery = {
      text: `
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
    `
    };

    const result = await db.query(pendingRequestsQuery);
    console.log(`📊 Query executada: ${JSON.stringify(pendingRequestsQuery, null, 2)}`);
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
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/requests - Lista todas as requisições
router.get('/', async (req, res) => {
  try {
    console.log('⏳ Buscando todas as requisições...');
    const db = require('../database/connection');
    
    const { 
      status = '', 
      employee_id = '', 
      priority = ''
    } = req.query;

    let whereConditions = [];
    let params = [];
    let paramCount = 0;

    // Filtros
    if (status) {
      paramCount++;
      whereConditions.push(`r.status = $${paramCount}`);
      params.push(status);
    }

    if (employee_id) {
      paramCount++;
      whereConditions.push(`r.employee_id = $${paramCount}`);
      params.push(employee_id);
    }

    if (priority) {
      paramCount++;
      whereConditions.push(`r.priority = $${paramCount}`);
      params.push(priority);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query principal
    const requestsQuery = {
      text: `
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
        ${whereClause}
        ORDER BY r.created_at DESC
      `,
      values: params
    };

    const result = await db.query(requestsQuery);
    console.log(`📊 Query executada: ${JSON.stringify(requestsQuery, null, 2)}`);
    console.log(`✅ Encontradas ${result.rows.length} requisições`);

    res.json({
      success: true,
      requests: result.rows,
      count: result.rows.length,
      message: result.rows.length === 0 ? 'Nenhuma requisição encontrada' : `${result.rows.length} requisições encontradas`
    });

  } catch (error) {
    console.error('❌ Erro ao buscar requisições:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// GET /api/requests/:id - Busca requisição por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT 
        r.*,
        e.name as employee_name,
        e.email as employee_email,
        e.employee_code,
        rt.name as request_type_name,
        rt.category,
        rt.fields_config,
        u.name as approver_name
      FROM requests r
      LEFT JOIN employees e ON r.employee_id = e.id
      LEFT JOIN request_types rt ON r.request_type_id = rt.id
      LEFT JOIN users u ON r.approver_id = u.id
      WHERE r.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Requisição não encontrada'
      });
    }

    // Busca histórico de aprovações
    const approvalsResult = await query(`
      SELECT 
        a.*,
        u.name as approver_name
      FROM approvals a
      LEFT JOIN users u ON a.approver_id = u.id
      WHERE a.request_id = $1
      ORDER BY a.approved_at DESC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        approvals_history: approvalsResult.rows
      }
    });

  } catch (error) {
    console.error('Erro ao buscar requisição:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// POST /api/requests - Cria nova requisição
router.post('/', [
  body('employee_id').isUUID().withMessage('ID do funcionário inválido'),
  body('request_type_id').isUUID().withMessage('ID do tipo de requisição inválido'),
  body('title').isLength({ min: 5 }).withMessage('Título deve ter no mínimo 5 caracteres'),
  body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage('Prioridade inválida')
], auditLog('CREATE_REQUEST'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const {
      employee_id,
      request_type_id,
      title,
      description,
      priority = 'normal',
      requested_date,
      start_date,
      end_date,
      amount,
      form_data,
      attachments
    } = req.body;

    // Verifica se funcionário existe
    const employeeExists = await query(
      'SELECT id FROM employees WHERE id = $1 AND is_active = true',
      [employee_id]
    );

    if (employeeExists.rows.length === 0) {
      return res.status(400).json({
        error: 'Funcionário não encontrado ou inativo'
      });
    }

    // Verifica se tipo de requisição existe
    const requestTypeExists = await query(
      'SELECT id, requires_approval FROM request_types WHERE id = $1 AND is_active = true',
      [request_type_id]
    );

    if (requestTypeExists.rows.length === 0) {
      return res.status(400).json({
        error: 'Tipo de requisição não encontrado ou inativo'
      });
    }

    const result = await query(`
      INSERT INTO requests (
        employee_id, request_type_id, title, description, priority,
        requested_date, start_date, end_date, amount, form_data, attachments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      employee_id, request_type_id, title, description, priority,
      requested_date, start_date, end_date, amount,
      form_data ? JSON.stringify(form_data) : null,
      attachments ? JSON.stringify(attachments) : null
    ]);

    res.status(201).json({
      success: true,
      message: 'Requisição criada com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao criar requisição:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// PUT /api/requests/:id/approve - Aprova requisição
router.put('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { comments = '' } = req.body;
    
    console.log(`✅ Aprovando requisição ID: ${id}`);
    const db = require('../database/connection');

    // Verifica se requisição existe e está pendente
    const requestResult = await db.query({
      text: 'SELECT * FROM requests WHERE id = $1 AND status = $2',
      values: [id, 'pending']
    });

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Requisição não encontrada ou já processada'
      });
    }

    // Atualiza requisição
    const updateResult = await db.query({
      text: `
      UPDATE requests 
      SET status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `,
      values: [id]
    });

    console.log(`✅ Requisição ${id} aprovada com sucesso`);

    res.json({
      success: true,
      message: 'Requisição aprovada com sucesso',
      data: updateResult.rows[0]
    });

  } catch (error) {
    console.error('❌ Erro ao aprovar requisição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// PUT /api/requests/:id/reject - Rejeita requisição
router.put('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason = 'Não especificado' } = req.body;
    
    console.log(`❌ Rejeitando requisição ID: ${id}`);
    const db = require('../database/connection');

    // Verifica se requisição existe e está pendente
    const requestResult = await db.query({
      text: 'SELECT * FROM requests WHERE id = $1 AND status = $2',
      values: [id, 'pending']
    });

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Requisição não encontrada ou já processada'
      });
    }

    // Atualiza requisição
    const updateResult = await db.query({
      text: `
      UPDATE requests 
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `,
      values: [id]
    });

    console.log(`❌ Requisição ${id} rejeitada: ${rejection_reason}`);

    res.json({
      success: true,
      message: 'Requisição rejeitada com sucesso',
      data: updateResult.rows[0],
      rejection_reason
    });

  } catch (error) {
    console.error('❌ Erro ao rejeitar requisição:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// GET /api/requests/stats/summary - Estatísticas das requisições
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as recent
      FROM requests
    `);

    const byType = await query(`
      SELECT 
        rt.name,
        rt.category,
        COUNT(r.id) as request_count
      FROM request_types rt
      LEFT JOIN requests r ON rt.id = r.request_type_id
      GROUP BY rt.id, rt.name, rt.category
      ORDER BY request_count DESC
    `);

    const byPriority = await query(`
      SELECT 
        priority,
        COUNT(*) as count
      FROM requests
      WHERE status = 'pending'
      GROUP BY priority
      ORDER BY 
        CASE priority 
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
        END
    `);

    res.json({
      success: true,
      data: {
        general: stats.rows[0],
        byType: byType.rows,
        byPriority: byPriority.rows
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