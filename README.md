# Sistema RH Pro - Thermas

Sistema completo de gestão de recursos humanos desenvolvido com arquitetura full-stack moderna.

## 📋 Funcionalidades

### ✅ Implementado (Backend)
- **Autenticação JWT** - Login/logout seguro
- **Gestão de Funcionários** - CRUD completo com validações
- **Gestão de Departamentos** - Organização empresarial
- **Sistema de Requisições** - Workflow de aprovações
- **Relatórios Avançados** - Analytics e insights
- **Dashboard Executivo** - KPIs e métricas
- **Auditoria** - Log completo de ações
- **API RESTful** - Endpoints documentados

### 🚧 Frontend React (Em desenvolvimento)
- Interface moderna com Tailwind CSS
- Componentes reutilizáveis
- Dashboard interativo
- Formulários dinâmicos

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+
- PostgreSQL
- npm ou yarn

### 1. Configuração do Banco
```bash
# O banco PostgreSQL já está configurado no ambiente
# As tabelas serão criadas automaticamente
```

### 2. Configuração do Backend
```bash
# Instalar dependências (já instaladas)
npm install

# Executar migrações
cd server && node database/migrate.js

# Executar seed (dados iniciais)
cd server && node database/seed.js

# Iniciar servidor (porta 5000)
node server/index.js
```

### 3. Configuração do Frontend (opcional)
```bash
# Em desenvolvimento - usar cliente atual funcionando
# Para desenvolvimento futuro:
cd client
npm install
npm run dev  # porta 3000
```

## 🔑 Credenciais de Acesso

```
👑 Admin:    admin@rhpro.com / admin123
🧑‍💼 RH:       hr@rhpro.com / hr123  
👨‍💼 Gerente:  manager@rhpro.com / manager123
```

## 📡 API Endpoints

### Autenticação
```
POST /api/auth/login      - Login
POST /api/auth/register   - Registro
POST /api/auth/refresh    - Renovar token
GET  /api/auth/me         - Dados do usuário
```

### Funcionários
```
GET    /api/employees           - Listar
POST   /api/employees           - Criar
GET    /api/employees/:id       - Buscar por ID
PUT    /api/employees/:id       - Atualizar
DELETE /api/employees/:id       - Desativar
GET    /api/employees/stats/summary - Estatísticas
```

### Departamentos
```
GET    /api/departments         - Listar
POST   /api/departments         - Criar
GET    /api/departments/:id     - Buscar por ID
PUT    /api/departments/:id     - Atualizar
DELETE /api/departments/:id     - Desativar
```

### Requisições
```
GET /api/requests              - Listar
POST /api/requests             - Criar
GET /api/requests/:id          - Buscar por ID
PUT /api/requests/:id/approve  - Aprovar
PUT /api/requests/:id/reject   - Rejeitar
```

### Dashboard
```
GET /api/dashboard          - Dados gerais
GET /api/dashboard/analytics - Analytics
GET /api/dashboard/kpis     - KPIs principais
```

### Relatórios
```
GET /api/reports/employees    - Relatório de funcionários
GET /api/reports/requests     - Relatório de requisições
GET /api/reports/departments  - Relatório de departamentos
GET /api/reports/payroll      - Relatório de folha
GET /api/reports/audit        - Relatório de auditoria
```

## 🏗️ Arquitetura

```
├── server/                 # Backend Node.js/Express
│   ├── index.js           # Servidor principal
│   ├── database/          # Configuração DB
│   ├── routes/            # Rotas da API
│   ├── middleware/        # Middlewares
│   └── utils/             # Utilitários
├── client/                # Frontend React (desenvolvimento)
│   ├── src/
│   ├── public/
│   └── package.json
├── index.html            # Sistema atual (funcionando)
└── package.json          # Dependências principais
```

## 💾 Banco de Dados

### Tabelas Principais
- `users` - Usuários administrativos
- `employees` - Funcionários
- `departments` - Departamentos
- `requests` - Requisições
- `request_types` - Tipos de requisições
- `approvals` - Histórico de aprovações
- `audit_logs` - Log de auditoria
- `system_settings` - Configurações

### Recursos Avançados
- UUIDs como chaves primárias
- Triggers automáticos para updated_at
- Índices otimizados
- Relacionamentos com integridade referencial
- Campos JSONB para flexibilidade

## 🔒 Segurança

- Autenticação JWT com refresh tokens
- Bcrypt para hash de senhas
- Rate limiting
- Helmet para headers de segurança
- Validação de entrada com express-validator
- Auditoria completa de ações

## 📊 Monitoramento

- Logs estruturados
- Métricas de performance
- Health checks
- Auditoria de ações

## 🚀 Deploy

### Replit (Atual)
O sistema está rodando na porta 5000 e pode ser acessado diretamente.

### Deploy Local
```bash
# Clonar o projeto
git clone <repository>

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Configurar banco PostgreSQL
# Executar migrações
npm run db:migrate

# Iniciar em produção
npm start
```

### Deploy Produção
- Configurar PostgreSQL
- Configurar variáveis de ambiente
- Executar migrações
- Configurar proxy reverso (nginx)
- Configurar SSL
- Configurar monitoramento

## 📈 Próximos Passos

1. **Frontend React Completo**
   - Finalizar todas as páginas
   - Implementar formulários
   - Dashboard interativo

2. **Funcionalidades Avançadas**
   - Notificações em tempo real
   - Upload de arquivos
   - Integração com sistemas externos

3. **Performance**
   - Cache Redis
   - Otimização de queries
   - CDN para assets

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob licença MIT. Veja o arquivo LICENSE para detalhes.

---

**Sistema RH Pro** - Desenvolvido para Thermas 🏢