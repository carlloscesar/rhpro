const { Pool } = require('pg');
require('dotenv').config();

async function initializeDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('🔧 Inicializando banco de dados...');

    // Testar conexão
    await pool.query('SELECT NOW()');
    console.log('✅ Conexão com PostgreSQL estabelecida');

    // Ler e executar script de inicialização
    const fs = require('fs');
    const path = require('path');
    
    const initScript = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    
    // Executar script em transação
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Dividir script em comandos individuais
      const commands = initScript
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0);
      
      for (const command of commands) {
        if (command.trim()) {
          await client.query(command);
        }
      }
      
      await client.query('COMMIT');
      console.log('✅ Schema do banco criado com sucesso');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Erro na inicialização do banco:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('🎉 Inicialização do banco concluída!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Falha na inicialização:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };