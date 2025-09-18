const errorHandler = (err, req, res, next) => {
  console.error('❌ Erro capturado pelo middleware:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Erro de validação do express-validator
  if (err.type === 'validation') {
    return res.status(400).json({
      error: 'Dados inválidos',
      code: 'VALIDATION_ERROR',
      details: err.errors
    });
  }

  // Erro de banco de dados PostgreSQL
  if (err.code && err.code.startsWith('23')) {
    let message = 'Erro no banco de dados';
    let code = 'DATABASE_ERROR';

    // Violação de chave única
    if (err.code === '23505') {
      message = 'Registro já existe';
      code = 'DUPLICATE_ENTRY';
    }
    
    // Violação de chave estrangeira
    if (err.code === '23503') {
      message = 'Referência inválida';
      code = 'FOREIGN_KEY_ERROR';
    }
    
    // Violação de not null
    if (err.code === '23502') {
      message = 'Campo obrigatório não preenchido';
      code = 'NOT_NULL_ERROR';
    }

    return res.status(400).json({
      error: message,
      code,
      field: err.column || err.constraint
    });
  }

  // Erro de sintaxe JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'JSON inválido',
      code: 'INVALID_JSON'
    });
  }

  // Erro de limite de payload
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Arquivo muito grande',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }

  // Rate limit
  if (err.statusCode === 429) {
    return res.status(429).json({
      error: 'Muitas tentativas, tente novamente mais tarde',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token inválido',
      code: 'INVALID_TOKEN'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expirado',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Erro customizado da aplicação
  if (err.statusCode && err.message) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code || 'APPLICATION_ERROR'
    });
  }

  // Erro interno do servidor (fallback)
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message,
    code: 'INTERNAL_SERVER_ERROR',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

// Middleware para capturar 404
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    code: 'NOT_FOUND',
    path: req.path,
    method: req.method
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};