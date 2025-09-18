function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-600 text-white p-8 text-center">
        <h1 className="text-3xl font-bold">🏢 Sistema RH Pro</h1>
        <p className="mt-2">Sistema funcionando com Tailwind CSS</p>
      </div>
      
      <div className="max-w-4xl mx-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900">Funcionários</h3>
            <p className="text-3xl font-bold text-blue-600">6</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900">Departamentos</h3>
            <p className="text-3xl font-bold text-green-600">5</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900">Requisições</h3>
            <p className="text-3xl font-bold text-yellow-600">12</p>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Menu de Navegação</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                Dashboard
              </button>
              <button className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                Funcionários
              </button>
              <button className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600">
                Departamentos
              </button>
              <button className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">
                Relatórios
              </button>
            </div>
          </div>
        </div>
        
        <div className="mt-8 text-center text-gray-600">
          <p>✅ React funcionando</p>
          <p>✅ Tailwind CSS aplicado</p>
          <p>✅ Sistema RH Pro ativo</p>
        </div>
      </div>
    </div>
  )
}

export default App