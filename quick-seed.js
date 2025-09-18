const bcrypt = require('bcryptjs');
const { query } = require('./connection');

async function quickSeed() {
  try {
    console.log('🌱 Executando seed rápido...');

    // Insere dados básicos na tabela request_types existente
    const requestTypes = [
      {
        name: 'Férias',
        description: 'Solicitação de férias',
        category: 'ferias',
        form_fields: { start_date: 'required', end_date: 'required' }
      },
      {
        name: 'Reembolso',
        description: 'Solicitação de reembolso',
        category: 'reembolso',
        form_fields: { amount: 'required', receipt: 'required' }
      }
    ];

    for (const reqType of requestTypes) {
      const existing = await query('SELECT id FROM request_types WHERE name = $1', [reqType.name]);
      
      if (existing.rows.length === 0) {
        await query(`
          INSERT INTO request_types (name, description, category, form_fields, approval_levels)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          reqType.name, 
          reqType.description, 
          reqType.category, 
          JSON.stringify(reqType.form_fields),
          JSON.stringify([{ level: 1, role: 'manager' }])
        ]);
        console.log(`✅ Tipo de requisição criado: ${reqType.name}`);
      }
    }

    console.log('🎉 Seed rápido concluído!');
    
  } catch (error) {
    console.error('❌ Erro no seed:', error);
  }
}

if (require.main === module) {
  quickSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { quickSeed };