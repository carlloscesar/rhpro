export default function Departments() {
  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Departamentos</h1>
          <p className="mt-2 text-sm text-gray-700">
            Gerenciar departamentos da empresa.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-thermas-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-thermas-700 focus:outline-none focus:ring-2 focus:ring-thermas-500 focus:ring-offset-2 sm:w-auto"
          >
            Criar departamento
          </button>
        </div>
      </div>
      
      <div className="mt-8 bg-white shadow rounded-lg">
        <div className="px-6 py-4">
          <p className="text-sm text-gray-500">
            Funcionalidade em desenvolvimento. O backend está pronto e pode ser testado via API.
          </p>
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-900">Endpoints disponíveis:</h4>
            <ul className="mt-2 text-xs text-gray-600 space-y-1">
              <li>• GET /api/departments - Listar departamentos</li>
              <li>• POST /api/departments - Criar departamento</li>
              <li>• PUT /api/departments/:id - Atualizar departamento</li>
              <li>• DELETE /api/departments/:id - Desativar departamento</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}