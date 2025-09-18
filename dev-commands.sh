#!/bin/bash

# Sistema RH Pro - Comandos de Desenvolvimento
# Rocky Linux 9

echo "🔧 Sistema RH Pro - Comandos de Desenvolvimento"
echo "================================================"

case "$1" in
    "setup")
        echo "📦 Configurando ambiente de desenvolvimento..."
        npm install
        npm install -g pm2 nodemon 2>/dev/null || echo "⚠️ Instale PM2 globalmente: sudo npm install -g pm2 nodemon"
        mkdir -p logs
        echo "✅ Ambiente configurado!"
        ;;
    
    "db-init")
        echo "🗄️ Inicializando banco de dados..."
        node server/database/init-db.js
        node server/database/seed.js
        echo "✅ Banco inicializado com dados de exemplo!"
        ;;
    
    "db-reset")
        echo "🗑️ Resetando banco de dados..."
        node server/database/init-db.js
        node server/database/seed.js
        echo "✅ Banco resetado!"
        ;;
    
    "dev")
        echo "🚀 Iniciando em modo desenvolvimento (nodemon)..."
        npx nodemon server/basic-server.js
        ;;
    
    "pm2-start")
        echo "🚀 Iniciando com PM2..."
        pm2 start ecosystem.config.js
        pm2 status
        ;;
    
    "pm2-dev")
        echo "🚀 Iniciando com PM2 em modo watch (desenvolvimento)..."
        pm2 start ecosystem.config.js --watch
        pm2 logs sistema-rh-pro
        ;;
    
    "pm2-stop")
        echo "⏹️ Parando PM2..."
        pm2 stop sistema-rh-pro
        ;;
    
    "pm2-restart")
        echo "🔄 Reiniciando PM2..."
        pm2 restart sistema-rh-pro
        ;;
    
    "pm2-logs")
        echo "📋 Exibindo logs do PM2..."
        pm2 logs sistema-rh-pro
        ;;
    
    "pm2-monitor")
        echo "📊 Abrindo monitor do PM2..."
        pm2 monit
        ;;
    
    "status")
        echo "📊 Status dos serviços..."
        echo
        echo "=== PM2 Status ==="
        pm2 status 2>/dev/null || echo "PM2 não está rodando"
        echo
        echo "=== PostgreSQL Status ==="
        systemctl is-active postgresql 2>/dev/null || echo "PostgreSQL não está rodando"
        echo
        echo "=== Aplicação Health Check ==="
        curl -s http://localhost:5000/health || echo "Aplicação não está respondendo"
        ;;
    
    "logs")
        echo "📋 Exibindo todos os logs..."
        echo "=== Logs da Aplicação (PM2) ==="
        if pm2 list | grep -q sistema-rh-pro; then
            pm2 logs sistema-rh-pro --lines 20
        else
            echo "Aplicação não está rodando no PM2"
        fi
        echo
        echo "=== Logs do PostgreSQL ==="
        sudo journalctl -u postgresql --lines 10 2>/dev/null || echo "Sem acesso aos logs do PostgreSQL"
        ;;
    
    "test")
        echo "🧪 Testando aplicação..."
        echo "Testando health check..."
        curl -s http://localhost:5000/health && echo " ✅" || echo " ❌"
        echo "Testando dashboard..."
        curl -s http://localhost:5000/dashboard >/dev/null && echo "Dashboard OK ✅" || echo "Dashboard falhou ❌"
        ;;
    
    "backup")
        echo "💾 Criando backup de desenvolvimento..."
        DATE=$(date +%Y%m%d_%H%M%S)
        mkdir -p backups
        pg_dump -h localhost -U rhpro_user rhpro_db > backups/dev_backup_$DATE.sql 2>/dev/null && echo "✅ Backup criado: backups/dev_backup_$DATE.sql" || echo "❌ Erro no backup"
        ;;
    
    "clean")
        echo "🧹 Limpando ambiente..."
        pm2 stop all 2>/dev/null
        pm2 delete all 2>/dev/null
        rm -rf logs/*
        echo "✅ Ambiente limpo!"
        ;;
    
    *)
        echo "Uso: $0 {comando}"
        echo
        echo "Comandos disponíveis:"
        echo "  setup         - Configurar ambiente inicial"
        echo "  db-init       - Inicializar banco de dados"
        echo "  db-reset      - Resetar banco de dados"
        echo "  dev           - Iniciar com nodemon (desenvolvimento ativo)"
        echo "  pm2-start     - Iniciar com PM2 (produção local)"
        echo "  pm2-dev       - Iniciar PM2 com watch (desenvolvimento estável)"
        echo "  pm2-stop      - Parar PM2"
        echo "  pm2-restart   - Reiniciar PM2"
        echo "  pm2-logs      - Ver logs do PM2"
        echo "  pm2-monitor   - Monitor visual do PM2"
        echo "  status        - Status de todos os serviços"
        echo "  logs          - Ver todos os logs"
        echo "  test          - Testar aplicação"
        echo "  backup        - Backup de desenvolvimento"
        echo "  clean         - Limpar ambiente PM2"
        echo
        echo "Exemplos:"
        echo "  $0 setup      # Primeira configuração"
        echo "  $0 dev        # Desenvolvimento com auto-reload"
        echo "  $0 pm2-dev    # Desenvolvimento estável com PM2"
        echo "  $0 status     # Verificar se tudo está funcionando"
        ;;
esac