const fs = require('fs');
const path = require('path');
const { query } = require('./connection');

async function runMigrations() {
  try {
    console.log('🔄 Iniciando migrations...');
    
    // Comandos essenciais para executar em ordem
    const essentialCommands = [
      // Extensões
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
      
      // Tabela de usuários
      `CREATE TABLE IF NOT EXISTS users (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           email VARCHAR(255) UNIQUE NOT NULL,
           password_hash VARCHAR(255) NOT NULL,
           name VARCHAR(255) NOT NULL,
           role VARCHAR(50) DEFAULT 'admin',
           is_active BOOLEAN DEFAULT true,
           last_login TIMESTAMP,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      
      // Tabela de grupos de usuários
      `CREATE TABLE IF NOT EXISTS user_groups (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           name VARCHAR(100) UNIQUE NOT NULL,
           description TEXT,
           permissions JSONB DEFAULT '{}',
           is_active BOOLEAN DEFAULT true,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      
      // Tabela de associação usuários-grupos
      `CREATE TABLE IF NOT EXISTS user_group_memberships (
           id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
           user_id UUID REFERENCES users(id) ON DELETE CASCADE,
           group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
           assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           assigned_by UUID REFERENCES users(id),
           UNIQUE(user_id, group_id)
       )`,
      
      // Tabela de configuração AD
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
      
      // Tabela de logs AD
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
      
      // Outros índices essenciais
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)`,
      `CREATE INDEX IF NOT EXISTS idx_ad_config_active ON ad_configuration(is_active, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_ad_sync_logs_date ON ad_sync_logs(created_at DESC)`
    ];
    
    console.log(`📋 Executando ${essentialCommands.length} comandos essenciais...`);
    
    for (let i = 0; i < essentialCommands.length; i++) {
      const command = essentialCommands[i];
      try {
        await query(command);
        console.log(`✅ Comando ${i + 1}/${essentialCommands.length} executado`);
      } catch (error) {
        // Ignora erros de objetos que já existem
        if (error.code === '42710' || // trigger already exists
            error.code === '42P07' || // table already exists
            error.code === '42723' || // function already exists
            error.code === '42P06' || // schema already exists
            error.code === '42P16') { // index already exists
          console.log(`⚠️ Comando ${i + 1}/${essentialCommands.length} já existe, ignorando...`);
        } else {
          console.error(`❌ Erro no comando ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    console.log('✅ Schema criado com sucesso!');
    
    // Verifica se já existe usuário admin padrão
    const adminExists = await query(
      'SELECT id FROM users WHERE email = $1',
      ['admin@rhpro.com']
    );
    
    if (adminExists.rows.length === 0) {
      // Cria usuário admin padrão
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await query(
        `INSERT INTO users (email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4)`,
        ['admin@rhpro.com', hashedPassword, 'Administrador', 'admin']
      );
      
      console.log('👤 Usuário admin criado: admin@rhpro.com / admin123');
    }
    
    console.log('🎉 Migrations concluídas com sucesso!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erro nas migrations:', error);
    process.exit(1);
  }
}

// Executa se chamado diretamente
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };