#!/bin/bash

# Sistema RH Pro - Script de Instalação Automatizada
# Rocky Linux 9 - Versão 1.0
# Desenvolvido para Thermas

set -e  # Parar em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[AVISO] $1${NC}"
}

error() {
    echo -e "${RED}[ERRO] $1${NC}"
    exit 1
}

# Verificar se é Rocky Linux 9
check_os() {
    log "Verificando sistema operacional..."
    
    if [[ ! -f /etc/rocky-release ]]; then
        error "Este script é específico para Rocky Linux. Sistema não suportado."
    fi
    
    VERSION=$(cat /etc/rocky-release | grep -oE '[0-9]+\.[0-9]+' | head -1)
    if [[ ! "$VERSION" =~ ^9\. ]]; then
        error "Este script requer Rocky Linux 9.x. Versão detectada: $VERSION"
    fi
    
    log "✅ Rocky Linux 9 detectado"
}

# Verificar privilégios
check_privileges() {
    if [[ $EUID -ne 0 ]]; then
        error "Este script deve ser executado como root. Use: sudo $0"
    fi
    log "✅ Privilégios de root confirmados"
}

# Configurações do usuário
get_user_config() {
    log "Configuração do Sistema RH Pro"
    echo
    
    # Configurações básicas
    read -p "Nome do usuário da aplicação [rhpro]: " APP_USER
    APP_USER=${APP_USER:-rhpro}
    
    read -p "Diretório da aplicação [/home/$APP_USER/sistema-rh-pro]: " APP_DIR
    APP_DIR=${APP_DIR:-/home/$APP_USER/sistema-rh-pro}
    
    read -p "Porta da aplicação [5000]: " APP_PORT
    APP_PORT=${APP_PORT:-5000}
    
    # Configurações do banco
    read -p "Nome do banco de dados [rhpro_db]: " DB_NAME
    DB_NAME=${DB_NAME:-rhpro_db}
    
    read -p "Usuário do banco [rhpro_user]: " DB_USER
    DB_USER=${DB_USER:-rhpro_user}
    
    read -s -p "Senha do banco: " DB_PASS
    echo
    
    if [[ -z "$DB_PASS" ]]; then
        error "Senha do banco é obrigatória"
    fi
    
    # JWT Secret
    JWT_SECRET=$(openssl rand -base64 32)
    SESSION_SECRET=$(openssl rand -base64 32)
    
    # Confirmar configurações
    echo
    log "Configurações:"
    echo "  Usuário da aplicação: $APP_USER"
    echo "  Diretório: $APP_DIR"
    echo "  Porta: $APP_PORT"
    echo "  Banco de dados: $DB_NAME"
    echo "  Usuário do banco: $DB_USER"
    echo
    
    read -p "Continuar com essas configurações? [y/N]: " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        error "Instalação cancelada pelo usuário"
    fi
}

# Atualizar sistema
update_system() {
    log "Atualizando sistema..."
    dnf update -y
    dnf groupinstall "Development Tools" -y
    dnf install curl wget git vim nano htop firewalld -y
    log "✅ Sistema atualizado"
}

# Instalar Node.js
install_nodejs() {
    log "Instalando Node.js 20 LTS..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install nodejs -y
    
    NODE_VERSION=$(node --version)
    log "✅ Node.js instalado: $NODE_VERSION"
}

# Instalar PostgreSQL
install_postgresql() {
    log "Instalando PostgreSQL 15..."
    dnf install postgresql postgresql-server postgresql-contrib -y
    
    # Inicializar banco apenas se não foi inicializado
    if [[ ! -f /var/lib/pgsql/data/postgresql.conf ]]; then
        postgresql-setup --initdb
        log "✅ PostgreSQL inicializado"
    else
        log "✅ PostgreSQL já estava inicializado"
    fi
    
    systemctl enable postgresql
    systemctl start postgresql
    log "✅ PostgreSQL instalado e iniciado"
}

# Configurar PostgreSQL
configure_postgresql() {
    log "Configurando PostgreSQL..."
    
    # Criar usuário e banco
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
    sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;"
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    
    # Configurar autenticação
    PG_HBA="/var/lib/pgsql/data/pg_hba.conf"
    
    # Backup do arquivo original
    cp "$PG_HBA" "$PG_HBA.backup"
    
    # Adicionar configuração para aplicação
    echo "" >> "$PG_HBA"
    echo "# Sistema RH Pro" >> "$PG_HBA"
    echo "local   $DB_NAME    $DB_USER                     md5" >> "$PG_HBA"
    echo "host    $DB_NAME    $DB_USER    127.0.0.1/32     md5" >> "$PG_HBA"
    
    systemctl restart postgresql
    log "✅ PostgreSQL configurado"
}

# Configurar firewall
configure_firewall() {
    log "Configurando firewall..."
    
    systemctl enable firewalld
    systemctl start firewalld
    
    firewall-cmd --permanent --add-port=$APP_PORT/tcp
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    
    log "✅ Firewall configurado"
}

# Criar usuário da aplicação
create_app_user() {
    log "Criando usuário da aplicação..."
    
    if id "$APP_USER" &>/dev/null; then
        warn "Usuário $APP_USER já existe"
    else
        useradd -m -s /bin/bash "$APP_USER"
        log "✅ Usuário $APP_USER criado"
    fi
}

# Instalar aplicação
install_application() {
    log "Configurando aplicação..."
    
    # Criar diretório
    mkdir -p "$APP_DIR"
    chown "$APP_USER:$APP_USER" "$APP_DIR"
    
    # Criar estrutura básica se não existir
    if [[ ! -f "$APP_DIR/package.json" ]]; then
        warn "Arquivos da aplicação não encontrados. Criando estrutura básica..."
        
        sudo -u "$APP_USER" mkdir -p "$APP_DIR"/{server/{database,routes,middleware},client/{src,public}}
        
        # Criar package.json básico
        cat > "$APP_DIR/package.json" << EOF
{
  "name": "sistema-rh-pro",
  "version": "1.0.0",
  "description": "Sistema de Gestão de RH para Thermas",
  "main": "server/basic-server.js",
  "scripts": {
    "start": "node server/basic-server.js",
    "dev": "nodemon server/basic-server.js",
    "db:init": "node server/database/init-db.js",
    "db:seed": "node server/database/seed.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "dotenv": "^16.3.1"
  }
}
EOF
        chown "$APP_USER:$APP_USER" "$APP_DIR/package.json"
    fi
    
    # Instalar dependências
    cd "$APP_DIR"
    sudo -u "$APP_USER" npm install
    
    log "✅ Dependências instaladas"
}

# Criar arquivo de configuração
create_env_file() {
    log "Criando arquivo de configuração..."
    
    cat > "$APP_DIR/.env" << EOF
# Configuração do Banco de Dados
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
PGHOST=localhost
PGPORT=5432
PGDATABASE=$DB_NAME
PGUSER=$DB_USER
PGPASSWORD=$DB_PASS

# Configuração da Aplicação
NODE_ENV=production
PORT=$APP_PORT
CLIENT_URL=http://localhost:$APP_PORT

# Segurança
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET

# Log Level
LOG_LEVEL=info
EOF
    
    chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    
    log "✅ Arquivo de configuração criado"
}

# Configurar systemd
configure_systemd() {
    log "Configurando serviço systemd..."
    
    cat > "/etc/systemd/system/rhpro.service" << EOF
[Unit]
Description=Sistema RH Pro - Thermas
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/basic-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=$APP_DIR/.env

# Logs
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rhpro

# Segurança
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable rhpro
    
    log "✅ Serviço systemd configurado"
}

# Instalar Nginx
install_nginx() {
    log "Instalando e configurando Nginx..."
    
    dnf install nginx -y
    
    cat > "/etc/nginx/conf.d/rhpro.conf" << EOF
server {
    listen 80;
    server_name localhost _;
    
    access_log /var/log/nginx/rhpro_access.log;
    error_log /var/log/nginx/rhpro_error.log;
    
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF
    
    nginx -t
    systemctl enable nginx
    systemctl start nginx
    
    log "✅ Nginx instalado e configurado"
}

# Criar script de backup
create_backup_script() {
    log "Criando script de backup..."
    
    cat > "/home/$APP_USER/backup.sh" << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/rhpro/backups"
DB_NAME="rhpro_db"

mkdir -p $BACKUP_DIR
sudo -u postgres pg_dump $DB_NAME > $BACKUP_DIR/db_backup_$DATE.sql
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C /home/rhpro sistema-rh-pro
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
echo "Backup concluído: $DATE"
EOF
    
    chmod +x "/home/$APP_USER/backup.sh"
    chown "$APP_USER:$APP_USER" "/home/$APP_USER/backup.sh"
    
    # Agendar backup diário
    (crontab -l 2>/dev/null; echo "0 2 * * * /home/$APP_USER/backup.sh >> /var/log/rhpro_backup.log 2>&1") | crontab -
    
    log "✅ Script de backup criado e agendado"
}

# Teste final
final_test() {
    log "Executando testes finais..."
    
    # Testar conexão com banco
    sudo -u "$APP_USER" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();" > /dev/null
    log "✅ Conexão com banco de dados OK"
    
    # Testar se Node.js funciona
    cd "$APP_DIR"
    sudo -u "$APP_USER" node -e "console.log('Node.js OK')" > /dev/null
    log "✅ Node.js funcionando"
    
    # Iniciar serviços
    systemctl start rhpro
    sleep 3
    
    # Testar aplicação
    if curl -s "http://localhost:$APP_PORT/health" > /dev/null 2>&1; then
        log "✅ Aplicação respondendo corretamente"
    else
        warn "Aplicação pode não estar respondendo. Verifique os logs: journalctl -u rhpro"
    fi
}

# Mostrar informações finais
show_final_info() {
    echo
    log "🎉 Instalação concluída com sucesso!"
    echo
    echo -e "${BLUE}=== INFORMAÇÕES DO SISTEMA ===${NC}"
    echo "URL da aplicação: http://localhost"
    echo "URL direta: http://localhost:$APP_PORT"
    echo "Health check: http://localhost:$APP_PORT/health"
    echo
    echo -e "${BLUE}=== CREDENCIAIS PADRÃO ===${NC}"
    echo "Admin: admin@rhpro.com / admin123"
    echo "RH: hr@rhpro.com / hr123"
    echo "Gerente: manager@rhpro.com / manager123"
    echo
    echo -e "${BLUE}=== COMANDOS ÚTEIS ===${NC}"
    echo "Status do serviço: systemctl status rhpro"
    echo "Logs da aplicação: journalctl -u rhpro -f"
    echo "Reiniciar aplicação: systemctl restart rhpro"
    echo "Backup manual: /home/$APP_USER/backup.sh"
    echo
    echo -e "${BLUE}=== ARQUIVOS IMPORTANTES ===${NC}"
    echo "Configuração: $APP_DIR/.env"
    echo "Logs: /var/log/nginx/ e journalctl -u rhpro"
    echo "Serviço: /etc/systemd/system/rhpro.service"
    echo
    echo -e "${YELLOW}IMPORTANTE: Altere as senhas padrão após o primeiro login!${NC}"
}

# Função principal
main() {
    echo -e "${BLUE}"
    echo "==============================================="
    echo "       Sistema RH Pro - Instalador"
    echo "       Rocky Linux 9 - Versão 1.0"
    echo "       Desenvolvido para Thermas"
    echo "==============================================="
    echo -e "${NC}"
    
    check_os
    check_privileges
    get_user_config
    
    log "Iniciando instalação..."
    
    update_system
    install_nodejs
    install_postgresql
    configure_postgresql
    configure_firewall
    create_app_user
    install_application
    create_env_file
    configure_systemd
    install_nginx
    create_backup_script
    final_test
    show_final_info
    
    log "Instalação finalizada!"
}

# Executar instalação
main "$@"