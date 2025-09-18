export default function Reports() {
  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Relatórios</h1>
          <p className="mt-2 text-sm text-gray-700">
            Gerar relatórios detalhados do sistema.
          </p>
        </div>
      </div>
      
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          {
            title: 'Relatório de Funcionários',
            description: 'Lista completa de funcionários com filtros',
            endpoint: 'GET /api/reports/employees'
          },
          {
            title: 'Relatório de Requisições',
            description: 'Análise detalhada das requisições',
            endpoint: 'GET /api/reports/requests'
          },
          {
            title: 'Relatório de Departamentos',
            description: 'Performance e estatísticas dos departamentos',
            endpoint: 'GET /api/reports/departments'
          },
          {
            title: 'Relatório de Folha',
            description: 'Cálculos de folha de pagamento',
            endpoint: 'GET /api/reports/payroll'
          },
          {
            title: 'Relatório de Auditoria',
            description: 'Log de atividades do sistema',
            endpoint: 'GET /api/reports/audit'
          }
        ].map((report, index) => (
          <div key={index} className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">{report.title}</h3>
            <p className="text-sm text-gray-600 mb-4">{report.description}</p>
            <p className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
              {report.endpoint}
            </p>
            <button className="mt-4 w-full bg-thermas-600 text-white py-2 px-4 rounded-md hover:bg-thermas-700 text-sm">
              Gerar Relatório
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}