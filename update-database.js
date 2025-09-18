#!/usr/bin/env node

/**
 * Script para atualizar completamente o banco de dados
 * Execute: node server/update-database.js
 */

const { runFullMigration } = require('./database/full-migration');

console.log('🔄 Iniciando atualização completa do banco de dados...');
console.log('');

runFullMigration();