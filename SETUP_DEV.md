# Setup de Desenvolvimento - Sistema RH Pro
## Rocky Linux 9 - Configuração para npm run dev e PM2

### 📋 Pré-requisitos

```bash
# 1. Instalar Node.js 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install nodejs -y

# 2. Instalar PostgreSQL
sudo dnf install postgresql postgresql-server postgresql-contrib -y
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 3. Instalar PM2 globalmente
npm install -g pm2 nodemon

# 4. Criar usuário e banco PostgreSQL
sudo -u postgres psql << EOF
CREATE USER rhpro_user WITH PASSWORD 'sua_senha_aqui';
CREATE DATABASE rhpro_db OWNER rhpro_user;
GRANT ALL PRIVILEGES ON DATABASE rhpro_db TO rhpro_user;
\q
EOF
```

### 🚀 Configuração da Aplicação

```bash
# 1. Navegar para diretório do projeto
cd /caminho/para/sistema-rh-pro

# 2. Instalar dependências
npm install

# 3. Instalar dependências de desenvolvimento
npm install --save-dev nodemon

# 4. Configurar variáveis de ambiente
cp .env.example .env
```

Edite o arquivo `.env`:
```bash
# Banco de dados
DATABASE_URL=postgresql://rhpro_user:sua_senha_aqui@localhost:5432/rhpro_db
PGHOST=localhost
PGPORT=5432
PGDATABASE=rhpro_db
PGUSER=rhpro_user
PGPASSWORD=sua_senha_aqui

# Aplicação
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5000

# Segurança (gere suas próprias chaves)
JWT_SECRET=sua_chave_jwt_super_secreta_aqui
SESSION_SECRET=sua_chave_sessao_super_secreta_aqui
```

```bash
# 5. Inicializar banco de dados
node server/database/init-db.js

# 6. Executar seed com dados iniciais
node server/database/seed.js

# 7. Criar diretório de logs para PM2
mkdir -p logs
```

### 💻 Comandos de Desenvolvimento

#### Usando npm run dev (Nodemon)
```bash
# Iniciar em modo desenvolvimento com auto-reload
npm run dev

# Ou diretamente com nodemon
npx nodemon server/basic-server.js

# Com variáveis de ambiente específicas
NODE_ENV=development PORT=5000 npm run dev
```

#### Usando PM2
```bash
# Iniciar com PM2
pm2 start ecosystem.config.js

# Iniciar em modo desenvolvimento (com watch)
pm2 start ecosystem.config.js --watch

# Ver status de todos os processos
pm2 status

# Ver logs em tempo real
pm2 logs sistema-rh-pro

# Monitoramento em tempo real
pm2 monit

# Parar aplicação
pm2 stop sistema-rh-pro

# Reiniciar aplicação
pm2 restart sistema-rh-pro

# Recarregar aplicação (zero downtime)
pm2 reload sistema-rh-pro

# Deletar processo do PM2
pm2 delete sistema-rh-pro

# Salvar configuração atual do PM2
pm2 save

# Configurar PM2 para iniciar com o sistema
pm2 startup
```

### 📊 Monitoramento e Logs

#### Logs da Aplicação
```bash
# Logs do npm run dev
# Os logs aparecem diretamente no terminal

# Logs do PM2
pm2 logs sistema-rh-pro
pm2 logs sistema-rh-pro --lines 100

# Arquivos de log (PM2)
tail -f logs/out.log      # Logs de saída
tail -f logs/err.log      # Logs de erro
tail -f logs/combined.log # Todos os logs
```

#### Monitoramento de Performance
```bash
# Monitor web do PM2
pm2 monit

# Informações detalhadas do processo
pm2 show sistema-rh-pro

# Estatísticas de memória e CPU
pm2 list
```

### 🔧 Scripts Úteis para Desenvolvimento

#### Script para reset completo do banco
```bash
# Criar script reset-db.sh
cat > reset-db.sh << 'EOF'
#!/bin/bash
echo "🗑️ Resetando banco de dados..."
node server/database/init-db.js
node server/database/seed.js
echo "✅ Banco resetado com dados iniciais"
EOF

chmod +x reset-db.sh
```

#### Script para backup de desenvolvimento
```bash
# Criar script backup-dev.sh
cat > backup-dev.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p backups
pg_dump -h localhost -U rhpro_user rhpro_db > backups/dev_backup_$DATE.sql
echo "✅ Backup criado: backups/dev_backup_$DATE.sql"
EOF

chmod +x backup-dev.sh
```

### 🐛 Debug e Troubleshooting

#### Verificar conexão com banco
```bash
# Testar conexão PostgreSQL
psql -h localhost -U rhpro_user -d rhpro_db -c "SELECT version();"

# Verificar se aplicação está rodando
curl http://localhost:5000/health

# Verificar portas em uso
ss -tulpn | grep :5000
```

#### Debug com Node.js
```bash
# Executar em modo debug
node --inspect server/basic-server.js

# Com nodemon e debug
nodemon --inspect server/basic-server.js

# Debug com PM2
pm2 start ecosystem.config.js --node-args="--inspect"
```

### 🔄 Workflow de Desenvolvimento Recomendado

#### Desenvolvimento Ativo (recomendado para mudanças frequentes)
```bash
# Terminal 1: Logs do banco (opcional)
sudo journalctl -u postgresql -f

# Terminal 2: Aplicação em modo desenvolvimento
npm run dev

# A aplicação reinicia automaticamente quando arquivos mudam
```

#### Desenvolvimento Estável (recomendado para testes)
```bash
# Usar PM2 com watch habilitado
pm2 start ecosystem.config.js --watch

# Em outro terminal, monitorar
pm2 monit
```

### 🌐 Acesso à Aplicação

- **URL Principal**: http://localhost:5000
- **Health Check**: http://localhost:5000/health
- **Dashboard API**: http://localhost:5000/dashboard

### 🔑 Credenciais Padrão

- **Admin**: admin@rhpro.com / admin123
- **RH**: hr@rhpro.com / hr123
- **Gerente**: manager@rhpro.com / manager123

### ⚠️ Dicas Importantes

1. **Sempre use o `.env`** para configurações locais
2. **Não commite o `.env`** no Git
3. **Use `npm run dev`** para desenvolvimento ativo
4. **Use PM2** para simulação de produção local
5. **Monitore os logs** regularmente durante desenvolvimento
6. **Faça backup** antes de mudanças importantes no banco

### 🚀 Comandos Rápidos

```bash
# Setup inicial completo
npm install && node server/database/init-db.js && node server/database/seed.js

# Iniciar desenvolvimento
npm run dev

# Iniciar com PM2
pm2 start ecosystem.config.js --watch

# Reset completo
pm2 stop all && ./reset-db.sh && npm run dev
```