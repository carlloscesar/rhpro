# Guia de Instalação - Sistema RH Pro
## Rocky Linux 9 - Configuração Completa

### 📋 Pré-requisitos do Sistema

#### Especificações Mínimas
- **RAM**: 4GB (recomendado 8GB+)
- **Armazenamento**: 20GB livres
- **CPU**: 2 cores (recomendado 4+)
- **Rede**: Conexão com internet ativa

#### Usuário e Permissões
- Acesso root ou usuário com sudo
- Firewall configurado para permitir portas 5000 e 5432

---

## 🚀 Instalação Passo a Passo

### 1. Atualização do Sistema

```bash
# Atualizar todos os pacotes
sudo dnf update -y

# Instalar ferramentas essenciais
sudo dnf groupinstall "Development Tools" -y
sudo dnf install curl wget git vim nano htop -y
```

### 2. Instalação do Node.js 20 LTS

```bash
# Adicionar repositório NodeSource
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -

# Instalar Node.js e npm
sudo dnf install nodejs -y

# Verificar instalação
node --version  # deve mostrar v20.x.x
npm --version   # deve mostrar 10.x.x
```

### 3. Instalação do PostgreSQL 15

```bash
# Instalar PostgreSQL
sudo dnf install postgresql postgresql-server postgresql-contrib -y

# Inicializar banco de dados
sudo postgresql-setup --initdb

# Habilitar e iniciar serviço
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Verificar status
sudo systemctl status postgresql
```

### 4. Configuração do PostgreSQL

```bash
# Acessar como usuário postgres
sudo -u postgres psql

# Dentro do PostgreSQL, execute:
```

```sql
-- Criar usuário para a aplicação
CREATE USER rhpro_user WITH PASSWORD 'senha_segura_aqui';

-- Criar banco de dados
CREATE DATABASE rhpro_db OWNER rhpro_user;

-- Conceder privilégios
GRANT ALL PRIVILEGES ON DATABASE rhpro_db TO rhpro_user;

-- Sair do PostgreSQL
\q
```

```bash
# Configurar autenticação
sudo nano /var/lib/pgsql/data/pg_hba.conf
```

Adicione estas linhas no arquivo:
```
# Configuração para aplicação RH Pro
local   rhpro_db    rhpro_user                     md5
host    rhpro_db    rhpro_user    127.0.0.1/32     md5
```

```bash
# Reiniciar PostgreSQL
sudo systemctl restart postgresql
```

### 5. Configuração do Firewall

```bash
# Permitir porta da aplicação
sudo firewall-cmd --permanent --add-port=5000/tcp

# Permitir PostgreSQL (apenas localhost)
sudo firewall-cmd --permanent --add-port=5432/tcp --source=127.0.0.1

# Recarregar firewall
sudo firewall-cmd --reload

# Verificar regras
sudo firewall-cmd --list-all
```

### 6. Criação do Usuário da Aplicação

```bash
# Criar usuário dedicado para a aplicação
sudo useradd -m -s /bin/bash rhpro
sudo passwd rhpro

# Adicionar ao grupo de desenvolvimento (opcional)
sudo usermod -aG wheel rhpro
```

### 7. Instalação da Aplicação

```bash
# Mudar para usuário da aplicação
sudo su - rhpro

# Criar diretório da aplicação
mkdir -p /home/rhpro/sistema-rh-pro
cd /home/rhpro/sistema-rh-pro

# Clonar ou transferir arquivos do projeto
# (Substitua pela forma como você vai transferir os arquivos)
```

#### Opção A: Se usando Git
```bash
git clone <seu-repositorio> .
```

#### Opção B: Se transferindo arquivos manualmente
```bash
# Criar estrutura de diretórios
mkdir -p server/{database,routes,middleware,utils}
mkdir -p client/{src,public}

# Copie todos os arquivos do projeto para este diretório
```

### 8. Configuração das Variáveis de Ambiente

```bash
# Criar arquivo .env na raiz do projeto
nano .env
```

Conteúdo do arquivo `.env`:
```bash
# Configuração do Banco de Dados
DATABASE_URL=postgresql://rhpro_user:senha_segura_aqui@localhost:5432/rhpro_db
PGHOST=localhost
PGPORT=5432
PGDATABASE=rhpro_db
PGUSER=rhpro_user
PGPASSWORD=senha_segura_aqui

# Configuração da Aplicação
NODE_ENV=production
PORT=5000
CLIENT_URL=http://localhost:5000

# Segurança
JWT_SECRET=sua_chave_jwt_super_secreta_aqui_com_pelo_menos_32_caracteres
SESSION_SECRET=sua_chave_sessao_super_secreta_aqui

# Log Level
LOG_LEVEL=info
```

```bash
# Proteger arquivo de configuração
chmod 600 .env
```

### 9. Instalação das Dependências

```bash
# Instalar dependências do projeto
npm install

# Verificar se todas foram instaladas
npm list --depth=0
```

### 10. Configuração do Banco de Dados

```bash
# Testar conexão com banco
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Erro:', err);
  else console.log('✅ Conexão OK:', res.rows[0]);
  pool.end();
});
"

# Executar migrações/setup do banco
node server/database/init-db.js

# Executar seed com dados iniciais
node server/database/seed.js
```

### 11. Configuração do Systemd (Serviço)

```bash
# Voltar para usuário root
exit

# Criar arquivo de serviço
sudo nano /etc/systemd/system/rhpro.service
```

Conteúdo do arquivo de serviço:
```ini
[Unit]
Description=Sistema RH Pro - Thermas
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=rhpro
Group=rhpro
WorkingDirectory=/home/rhpro/sistema-rh-pro
ExecStart=/usr/bin/node server/basic-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/home/rhpro/sistema-rh-pro/.env

# Logs
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rhpro

# Segurança
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/rhpro/sistema-rh-pro

[Install]
WantedBy=multi-user.target
```

```bash
# Recarregar systemd
sudo systemctl daemon-reload

# Habilitar serviço para iniciar com o sistema
sudo systemctl enable rhpro

# Iniciar serviço
sudo systemctl start rhpro

# Verificar status
sudo systemctl status rhpro
```

### 12. Configuração do Nginx (Proxy Reverso)

```bash
# Instalar Nginx
sudo dnf install nginx -y

# Criar configuração do site
sudo nano /etc/nginx/conf.d/rhpro.conf
```

Conteúdo da configuração:
```nginx
server {
    listen 80;
    server_name localhost seu-dominio.com;
    
    # Logs
    access_log /var/log/nginx/rhpro_access.log;
    error_log /var/log/nginx/rhpro_error.log;
    
    # Proxy para aplicação Node.js
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Arquivos estáticos (se necessário)
    location /static/ {
        alias /home/rhpro/sistema-rh-pro/client/dist/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

```bash
# Testar configuração
sudo nginx -t

# Habilitar e iniciar Nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Configurar firewall para HTTP
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

### 13. Backup e Monitoramento

#### Script de Backup
```bash
# Criar script de backup
sudo nano /home/rhpro/backup.sh
```

```bash
#!/bin/bash
# Backup Sistema RH Pro
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/rhpro/backups"
DB_NAME="rhpro_db"

# Criar diretório de backup
mkdir -p $BACKUP_DIR

# Backup do banco de dados
sudo -u postgres pg_dump $DB_NAME > $BACKUP_DIR/db_backup_$DATE.sql

# Backup dos arquivos da aplicação
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C /home/rhpro sistema-rh-pro

# Manter apenas backups dos últimos 7 dias
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup concluído: $DATE"
```

```bash
# Tornar executável
chmod +x /home/rhpro/backup.sh

# Agendar backup diário (crontab)
sudo crontab -e
```

Adicionar linha no crontab:
```
# Backup diário às 2:00 AM
0 2 * * * /home/rhpro/backup.sh >> /var/log/rhpro_backup.log 2>&1
```

#### Monitoramento de Logs
```bash
# Verificar logs da aplicação
sudo journalctl -u rhpro -f

# Verificar logs do Nginx
sudo tail -f /var/log/nginx/rhpro_access.log
sudo tail -f /var/log/nginx/rhpro_error.log

# Verificar logs do PostgreSQL
sudo tail -f /var/lib/pgsql/data/log/postgresql-*.log
```

---

## 🔧 Comandos de Manutenção

### Gerenciamento do Serviço
```bash
# Verificar status
sudo systemctl status rhpro

# Parar serviço
sudo systemctl stop rhpro

# Iniciar serviço
sudo systemctl start rhpro

# Reiniciar serviço
sudo systemctl restart rhpro

# Recarregar configuração (sem parar)
sudo systemctl reload rhpro

# Ver logs em tempo real
sudo journalctl -u rhpro -f
```

### Atualização da Aplicação
```bash
# Parar aplicação
sudo systemctl stop rhpro

# Fazer backup
/home/rhpro/backup.sh

# Atualizar código (se usando Git)
sudo su - rhpro
cd /home/rhpro/sistema-rh-pro
git pull origin main

# Instalar novas dependências
npm install

# Executar migrações (se houver)
node server/database/migrate.js

# Reiniciar aplicação
exit
sudo systemctl start rhpro
```

### Verificação de Saúde
```bash
# Testar conectividade da aplicação
curl -s http://localhost:5000/health

# Verificar uso de recursos
htop
df -h
free -h

# Verificar conexões de rede
ss -tulpn | grep :5000
ss -tulpn | grep :5432
```

---

## 🛡️ Configurações de Segurança

### SSL/TLS com Certbot (Opcional)
```bash
# Instalar Certbot
sudo dnf install certbot python3-certbot-nginx -y

# Obter certificado SSL
sudo certbot --nginx -d seu-dominio.com

# Testar renovação automática
sudo certbot renew --dry-run
```

### Hardening Adicional
```bash
# Configurar fail2ban para proteção contra ataques
sudo dnf install fail2ban -y

# Criar configuração para Nginx
sudo nano /etc/fail2ban/jail.local
```

Conteúdo do jail.local:
```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/rhpro_error.log

[nginx-dos]
enabled = true
port = http,https
logpath = /var/log/nginx/rhpro_access.log
maxretry = 300
findtime = 300
bantime = 600
```

```bash
# Iniciar fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## 🔍 Resolução de Problemas

### Problemas Comuns

#### 1. Aplicação não inicia
```bash
# Verificar logs
sudo journalctl -u rhpro --no-pager -l

# Verificar se porta está livre
sudo ss -tulpn | grep :5000

# Testar manualmente
sudo su - rhpro
cd /home/rhpro/sistema-rh-pro
node server/basic-server.js
```

#### 2. Erro de conexão com banco
```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Testar conexão manual
sudo -u postgres psql -c "SELECT version();"

# Verificar configurações de conexão
sudo nano /home/rhpro/sistema-rh-pro/.env
```

#### 3. Nginx retorna 502 (Bad Gateway)
```bash
# Verificar se aplicação está rodando
curl -s http://localhost:5000/health

# Verificar logs do Nginx
sudo tail -f /var/log/nginx/rhpro_error.log

# Testar configuração do Nginx
sudo nginx -t
```

#### 4. Performance baixa
```bash
# Verificar recursos do sistema
htop
iostat -x 1 5

# Verificar logs de erro
sudo journalctl -u rhpro | grep -i error

# Otimizar PostgreSQL (se necessário)
sudo nano /var/lib/pgsql/data/postgresql.conf
```

---

## 📞 Suporte

### Informações de Contato do Sistema
- **Aplicação Web**: http://localhost (ou seu domínio)
- **API Health Check**: http://localhost/health
- **Logs da Aplicação**: `sudo journalctl -u rhpro -f`

### Credenciais Padrão
- **Admin**: admin@rhpro.com / admin123
- **RH**: hr@rhpro.com / hr123
- **Gerente**: manager@rhpro.com / manager123

### Arquivos Importantes
- **Configuração**: `/home/rhpro/sistema-rh-pro/.env`
- **Logs**: `/var/log/nginx/` e `journalctl -u rhpro`
- **Backup**: `/home/rhpro/backups/`
- **Serviço**: `/etc/systemd/system/rhpro.service`

---

**Sistema RH Pro** - Configuração completa para Rocky Linux 9
*Desenvolvido para Thermas - Versão de Produção*