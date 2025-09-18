import { Fragment } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { 
  HomeIcon,
  UsersIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon,
  UserPlusIcon,
  BellIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon, badge: null },
  { name: 'Funcionários', href: '/employees', icon: UsersIcon, badge: null },
  { name: 'Departamentos', href: '/departments', icon: BuildingOfficeIcon, badge: null },
  { name: 'Solicitações', href: '/requests', icon: DocumentTextIcon, badge: 3 },
  { name: 'Relatórios', href: '/reports', icon: ChartBarIcon, badge: null },
  { name: 'Aprovações', href: '/approvals', icon: ClipboardDocumentListIcon, badge: 2 },
]

const secondaryNavigation = [
  { name: 'Calendário', href: '/calendar', icon: CalendarDaysIcon },
  { name: 'Notificações', href: '/notifications', icon: BellIcon },
  { name: 'Configurações', href: '/settings', icon: Cog6ToothIcon },
]

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function SidebarAdvanced() {
  const location = useLocation()

  return (
    <div className="flex flex-col w-64 bg-white shadow-lg border-r border-gray-200">
      {/* Logo */}
      <div className="flex items-center px-6 py-6 border-b border-gray-200">
        <div className="flex items-center">
          <div className="h-10 w-10 bg-thermas-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <div className="ml-3">
            <h1 className="text-xl font-bold text-gray-900">RH Pro</h1>
            <p className="text-sm text-thermas-600 font-medium">Thermas</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={classNames(
                isActive
                  ? 'bg-thermas-50 border-r-4 border-thermas-600 text-thermas-700 shadow-sm'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                'group flex items-center justify-between px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 ease-in-out'
              )}
            >
              <div className="flex items-center">
                <item.icon
                  className={classNames(
                    isActive ? 'text-thermas-500' : 'text-gray-400 group-hover:text-gray-500',
                    'mr-3 h-5 w-5'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </div>
              {item.badge && (
                <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
                  {item.badge}
                </span>
              )}
            </NavLink>
          )
        })}

        {/* Divider */}
        <div className="border-t border-gray-200 my-6"></div>

        {/* Secondary Navigation */}
        <div className="space-y-2">
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Ferramentas
          </p>
          {secondaryNavigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={classNames(
                  isActive
                    ? 'bg-thermas-50 border-r-4 border-thermas-600 text-thermas-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors'
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
        </div>
      </nav>

      {/* Quick Stats */}
      <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Funcionários ativos</span>
            <span className="font-semibold text-gray-900">127</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Solicitações pendentes</span>
            <span className="font-semibold text-orange-600">3</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Sistema</span>
            <span className="font-semibold text-green-600">Online</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white">
        <p className="text-xs text-gray-500 text-center">
          Sistema RH Pro v2.0
        </p>
        <p className="text-xs text-gray-400 text-center mt-1">
          © 2025 Thermas
        </p>
      </div>
    </div>
  )
}