import { useState, useEffect } from 'react'
import axios from 'axios'
import { 
  UserGroupIcon, 
  BuildingOfficeIcon, 
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  ClockIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CurrencyDollarIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline'

function StatCard({ title, value, icon: Icon, change, changeType, color = 'bg-blue-600', textColor = 'text-blue-600' }) {
  return (
    <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
              <Icon className={`h-6 w-6 ${textColor}`} aria-hidden="true" />
            </div>
          </div>
          <div className="ml-4 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-2xl font-bold text-gray-900">{value || 0}</dd>
              {change && (
                <dd className={`text-sm flex items-center ${
                  changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {changeType === 'increase' ? (
                    <ArrowUpIcon className="h-4 w-4 mr-1" />
                  ) : (
                    <ArrowDownIcon className="h-4 w-4 mr-1" />
                  )}
                  {change}% vs mês anterior
                </dd>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickAction({ title, description, icon: Icon, color, onClick }) {
  return (
    <div 
      onClick={onClick}
      className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-all cursor-pointer hover:border-thermas-300"
    >
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${color} bg-opacity-10 mr-4`}>
          <Icon className={`h-6 w-6 text-${color.replace('bg-', '').replace('-600', '-600')}`} />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  )
}

function RecentActivity({ activities }) {
  return (
    <div className="bg-white shadow-sm rounded-lg border border-gray-200">
      <div className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Atividades Recentes</h3>
        <div className="space-y-4">
          {activities.length > 0 ? activities.map((activity, index) => (
            <div key={index} className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 bg-thermas-100 rounded-full flex items-center justify-center">
                  <UserGroupIcon className="h-4 w-4 text-thermas-600" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">{activity.description}</p>
                <p className="text-xs text-gray-500">{activity.time}</p>
              </div>
            </div>
          )) : (
            <p className="text-sm text-gray-500 text-center py-4">
              Nenhuma atividade recente encontrada
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardAdvanced() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setError(null)
      const response = await axios.get('dashboard')
      setStats(response.data.data)
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error)
      setError('Erro ao carregar dados do dashboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-thermas-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Erro no Dashboard</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={fetchDashboardData}
                className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const quickActions = [
    {
      title: 'Novo Funcionário',
      description: 'Cadastrar novo colaborador',
      icon: UserGroupIcon,
      color: 'bg-green-600',
      onClick: () => window.location.href = '/employees'
    },
    {
      title: 'Relatório Mensal',
      description: 'Gerar relatório do mês',
      icon: ChartBarIcon,
      color: 'bg-blue-600',
      onClick: () => window.location.href = '/reports'
    },
    {
      title: 'Aprovar Solicitações',
      description: '3 pendentes de aprovação',
      icon: DocumentTextIcon,
      color: 'bg-orange-600',
      onClick: () => window.location.href = '/requests'
    },
    {
      title: 'Departamentos',
      description: 'Gerenciar estrutura organizacional',
      icon: BuildingOfficeIcon,
      color: 'bg-purple-600',
      onClick: () => window.location.href = '/departments'
    }
  ]

  const recentActivities = [
    {
      description: 'João Silva foi cadastrado no sistema',
      time: 'Há 2 horas'
    },
    {
      description: 'Relatório mensal de RH foi gerado',
      time: 'Há 4 horas'
    },
    {
      description: 'Maria Santos solicitou férias',
      time: 'Ontem às 16:30'
    }
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Visão geral do Sistema RH Pro - Thermas</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Funcionários Ativos"
          value={stats?.generalStats?.active_employees}
          icon={UserGroupIcon}
          change={8}
          changeType="increase"
          color="bg-green-600"
          textColor="text-green-600"
        />
        <StatCard
          title="Departamentos"
          value={stats?.generalStats?.active_departments}
          icon={BuildingOfficeIcon}
          change={2}
          changeType="increase"
          color="bg-blue-600"
          textColor="text-blue-600"
        />
        <StatCard
          title="Solicitações Pendentes"
          value={stats?.generalStats?.pending_requests || 3}
          icon={DocumentTextIcon}
          change={12}
          changeType="decrease"
          color="bg-orange-600"
          textColor="text-orange-600"
        />
        <StatCard
          title="Folha de Pagamento"
          value="R$ 125.450"
          icon={CurrencyDollarIcon}
          change={5}
          changeType="increase"
          color="bg-thermas-600"
          textColor="text-thermas-600"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Ações Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {quickActions.map((action, index) => (
            <QuickAction key={index} {...action} />
          ))}
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <RecentActivity activities={recentActivities} />
        </div>

        {/* Calendar/Upcoming Events */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <CalendarDaysIcon className="h-5 w-5 mr-2 text-thermas-600" />
              Próximos Eventos
            </h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0 text-center">
                  <div className="text-sm font-medium text-thermas-600">15</div>
                  <div className="text-xs text-gray-500">DEZ</div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Pagamento do 13º</p>
                  <p className="text-xs text-gray-500">Prazo final</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-shrink-0 text-center">
                  <div className="text-sm font-medium text-thermas-600">20</div>
                  <div className="text-xs text-gray-500">DEZ</div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Fechamento da folha</p>
                  <p className="text-xs text-gray-500">Processo mensal</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}