const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const requestRoutes = require('./routes/requests');
const departmentRoutes = require('./routes/departments');
const reportRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for production environment  
app.set('trust proxy', 1);

// Security middleware - Disable CSP for production compatibility
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP entirely for login to work
}));
app.use(cors({
  origin: process.env.CLIENT_URL || true, // Allow all origins in production
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Muitas tentativas, tente novamente mais tarde.'
});
app.use(limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Serve static files (for production)
app.use(express.static('client/dist'));
app.use(express.static('public')); // Serve logo and other static assets

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', authenticateToken, employeeRoutes);
app.use('/api/requests', authenticateToken, requestRoutes);
app.use('/api/departments', authenticateToken, departmentRoutes);
app.use('/api/reports', authenticateToken, reportRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Basic error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize database with complete data
async function ensureBootstrapData() {
  try {
    const { query } = require('./database/connection');
    
    // Check if we have any admin users (indicator of empty database)
    const adminCount = await query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['admin']);
    
    if (parseInt(adminCount.rows[0].count) === 0) {
      console.log('🔧 Database appears empty - running complete seed...');
      
      // Import and run the complete seed function
      const { seedDatabase } = require('./database/seed');
      await seedDatabase();
      
      // Additionally create the specific user requested
      const bcrypt = require('bcryptjs');
      const hashedPasswordJean = await bcrypt.hash('jean123', 10);
      
      try {
        await query(`
          INSERT INTO users (email, password_hash, name, role, is_admin, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['jean.pessoa@hotelthermas.com.br', hashedPasswordJean, 'Jean Pessoa', 'admin', true, true]);
        console.log('✅ Additional user created: jean.pessoa@hotelthermas.com.br');
      } catch (userError) {
        // User might already exist from seed
        console.log('ℹ️ jean.pessoa@hotelthermas.com.br user already exists or created in seed');
      }
      
      console.log('✅ Complete database initialization completed!');
      console.log('📧 Login: jean.pessoa@hotelthermas.com.br / jean123');
    } else {
      console.log('ℹ️ Database already initialized with users');
    }
  } catch (error) {
    console.log('⚠️ Bootstrap warning:', error.message);
  }
}

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`💾 Database: ${process.env.DATABASE_URL ? 'Conectado' : 'Não configurado'}`);
  
  // Initialize complete database after server starts
  setTimeout(ensureBootstrapData, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Desligando servidor...');
  process.exit(0);
});