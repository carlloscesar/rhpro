import { useState, useEffect } from 'react'
import axios from 'axios'
import { 
  UserGroupIcon, 
  BuildingOfficeIcon, 
  DocumentTextIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline'

function StatCard({ title, value, icon: Icon, color = 'bg-blue-600', textColor = 'text-blue-600' }) {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Icon className={`h-6 w-6 ${textColor}`} aria-hidden="true" />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-medium text-gray-900">{value || 0}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get('/api/dashboard')
      setStats(response.data.data)
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-thermas-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Visão geral do sistema RH</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Funcionários Ativos"
          value={stats?.generalStats?.active_employees}
          icon={UserGroupIcon}
          color="bg-green-600"
          textColor="text-green-600"
        />
        <StatCard
          title="Departamentos"
          value={stats?.generalStats?.active_departments}
          icon={BuildingOfficeIcon}
          color="bg-blue-600"
          textColor="text-blue-600"
        />
        <StatCard
          title="Requisições Pendentes"
          value={stats?.generalStats?.pending_requests}
          icon={DocumentTextIcon}
          color="bg-yellow-600"
          textColor="text-yellow-600"
        />
        <StatCard
          title="Requisições Este Mês"
          value={stats?.generalStats?.recent_requests}
          icon={ExclamationTriangleIcon}
          color="bg-purple-600"
          textColor="text-purple-600"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Hires */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Contratações Recentes</h3>
          </div>
          <div className="px-6 py-4">
            {stats?.recentHires?.length > 0 ? (
              <div className="space-y-3">
                {stats.recentHires.map((hire, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{hire.name}</p>
                      <p className="text-xs text-gray-500">{hire.department_name}</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(hire.hire_date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Nenhuma contratação recente</p>
            )}
          </div>
        </div>

        {/* Urgent Requests */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Requisições Urgentes</h3>
          </div>
          <div className="px-6 py-4">
            {stats?.urgentRequests?.length > 0 ? (
              <div className="space-y-3">
                {stats.urgentRequests.map((request, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{request.title}</p>
                      <p className="text-xs text-gray-500">{request.employee_name}</p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      request.priority === 'urgent' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {request.priority === 'urgent' ? 'Urgente' : 'Alta'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Nenhuma requisição urgente</p>
            )}
          </div>
        </div>
      </div>

      {/* Department Stats */}
      {stats?.departmentStats?.length > 0 && (
        <div className="mt-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Departamentos por Tamanho</h3>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-4">
                {stats.departmentStats.map((dept, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{dept.name}</p>
                        <p className="text-sm text-gray-500">{dept.employee_count} funcionários</p>
                      </div>
                      {dept.budget > 0 && (
                        <div className="mt-1">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>Uso do orçamento</span>
                            <span>{dept.budget_usage}%</span>
                          </div>
                          <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-thermas-600 h-1.5 rounded-full" 
                              style={{ width: `${Math.min(dept.budget_usage, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}