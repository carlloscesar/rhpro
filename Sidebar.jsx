import { NavLink, useLocation } from 'react-router-dom'
import { 
  HomeIcon, 
  UsersIcon, 
  BuildingOfficeIcon,
  DocumentTextIcon,
  ChartBarIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Funcionários', href: '/employees', icon: UsersIcon },
  { name: 'Departamentos', href: '/departments', icon: BuildingOfficeIcon },
  { name: 'Requisições', href: '/requests', icon: DocumentTextIcon },
  { name: 'Relatórios', href: '/reports', icon: ChartBarIcon },
  { name: 'Configurações', href: '/settings', icon: Cog6ToothIcon },
]

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function Sidebar() {
  const location = useLocation()

  return (
    <div className="flex flex-col w-64 bg-white shadow-sm border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center px-6 py-4 border-b border-gray-200">
        <img 
          className="h-8 w-auto" 
          src="/logo-thermas.png" 
          alt="Thermas" 
        />
        <div className="ml-3">
          <h1 className="text-lg font-semibold text-gray-900">RH Pro</h1>
          <p className="text-sm text-gray-500">Sistema de Gestão</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={classNames(
                isActive
                  ? 'bg-thermas-50 border-r-2 border-thermas-600 text-thermas-700'
                  : 'text-gray-700 hover:bg-gray-50',
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors'
              )}
            >
              <item.icon
                className={classNames(
                  isActive ? 'text-thermas-500' : 'text-gray-400 group-hover:text-gray-500',
                  'mr-3 h-5 w-5'
                )}
                aria-hidden="true"
              />
              {item.name}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          Sistema RH Pro v1.0
        </p>
      </div>
    </div>
  )
}