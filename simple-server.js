const express = require('express');
const cors = require('cors');
const { query } = require('./database/connection');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.get('/api/dashboard', async (req, res) => {
  try {
    // General stats
    const activeEmployees = await query('SELECT COUNT(*) as count FROM employees WHERE is_active = true');
    const activeDepartments = await query('SELECT COUNT(*) as count FROM departments WHERE is_active = true');
    const pendingRequests = await query("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'");
    const recentRequests = await query("SELECT COUNT(*) as count FROM requests WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'");

    // Recent hires
    const recentHires = await query(`
      SELECT e.name, d.name as department_name, e.hire_date 
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id 
      WHERE e.hire_date >= CURRENT_DATE - INTERVAL '30 days' 
      ORDER BY e.hire_date DESC 
      LIMIT 5
    `);

    // Urgent requests
    const urgentRequests = await query(`
      SELECT r.title, e.name as employee_name, r.priority 
      FROM requests r 
      JOIN employees e ON r.employee_id = e.id 
      WHERE r.status = 'pending' AND r.priority IN ('urgent', 'high') 
      ORDER BY r.created_at DESC 
      LIMIT 5
    `);

    // Department stats
    const departmentStats = await query(`
      SELECT 
        d.name, 
        COUNT(e.id) as employee_count,
        d.budget,
        CASE 
          WHEN d.budget > 0 THEN (COUNT(e.id) * 5000.0 / d.budget * 100)::int
          ELSE 0 
        END as budget_usage
      FROM departments d 
      LEFT JOIN employees e ON d.id = e.department_id AND e.is_active = true 
      WHERE d.is_active = true 
      GROUP BY d.id, d.name, d.budget 
      ORDER BY employee_count DESC
    `);

    const data = {
      generalStats: {
        active_employees: parseInt(activeEmployees.rows[0].count),
        active_departments: parseInt(activeDepartments.rows[0].count),
        pending_requests: parseInt(pendingRequests.rows[0].count),
        recent_requests: parseInt(recentRequests.rows[0].count)
      },
      recentHires: recentHires.rows,
      urgentRequests: urgentRequests.rows,
      departmentStats: departmentStats.rows
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Login endpoint (simplified)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Simple auth check (in production, use proper bcrypt)
    const user = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    
    if (user.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }

    // In production: bcrypt.compare(password, user.rows[0].password_hash)
    if ((email === 'admin@rhpro.com' && password === 'admin123') ||
        (email === 'hr@rhpro.com' && password === 'hr123') ||
        (email === 'manager@rhpro.com' && password === 'manager123')) {
      
      res.json({ 
        success: true, 
        user: {
          id: user.rows[0].id,
          email: user.rows[0].email,
          name: user.rows[0].name,
          role: user.rows[0].role
        },
        token: 'fake-jwt-token-for-demo'
      });
    } else {
      res.status(401).json({ success: false, error: 'Senha incorreta' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Employees endpoint
app.get('/api/employees', async (req, res) => {
  try {
    const employees = await query(`
      SELECT 
        e.*, 
        d.name as department_name 
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id 
      WHERE e.is_active = true 
      ORDER BY e.name
    `);
    
    res.json({ success: true, data: employees.rows });
  } catch (error) {
    console.error('Employees error:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Departments endpoint
app.get('/api/departments', async (req, res) => {
  try {
    const departments = await query(`
      SELECT 
        d.*,
        COUNT(e.id) as employee_count
      FROM departments d 
      LEFT JOIN employees e ON d.id = e.department_id AND e.is_active = true 
      WHERE d.is_active = true 
      GROUP BY d.id 
      ORDER BY d.name
    `);
    
    res.json({ success: true, data: departments.rows });
  } catch (error) {
    console.error('Departments error:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Requests endpoint
app.get('/api/requests', async (req, res) => {
  try {
    const requests = await query(`
      SELECT 
        r.*,
        e.name as employee_name,
        rt.name as request_type_name,
        u.name as approver_name
      FROM requests r
      JOIN employees e ON r.employee_id = e.id
      JOIN request_types rt ON r.request_type_id = rt.id
      LEFT JOIN users u ON r.approver_id = u.id
      ORDER BY r.created_at DESC
    `);
    
    res.json({ success: true, data: requests.rows });
  } catch (error) {
    console.error('Requests error:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Catch all (serve main page)
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: '../' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor API rodando na porta ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Desligando servidor...');
  process.exit(0);
});