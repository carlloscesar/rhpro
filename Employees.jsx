import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  MagnifyingGlassIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'

function EmployeeCard({ employee, onEdit, onDelete }) {
  return (
    <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <UserIcon className="h-10 w-10 text-gray-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-medium text-gray-900 truncate">
              {employee.name}
            </h3>
            <p className="text-sm text-gray-500">
              Código: {employee.employee_code}
            </p>
            {employee.position && (
              <p className="text-sm text-thermas-600 font-medium">
                {employee.position}
              </p>
            )}
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(employee)}
            className="text-thermas-600 hover:text-thermas-800 transition-colors"
          >
            <PencilIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(employee)}
            className="text-red-600 hover:text-red-800 transition-colors"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
        {employee.email && (
          <div className="flex items-center space-x-2">
            <EnvelopeIcon className="h-4 w-4 text-gray-400" />
            <span className="truncate">{employee.email}</span>
          </div>
        )}
        {employee.phone && (
          <div className="flex items-center space-x-2">
            <PhoneIcon className="h-4 w-4 text-gray-400" />
            <span>{employee.phone}</span>
          </div>
        )}
        {employee.department_name && (
          <div className="flex items-center space-x-2">
            <BuildingOfficeIcon className="h-4 w-4 text-gray-400" />
            <span>{employee.department_name}</span>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <CalendarIcon className="h-4 w-4 text-gray-400" />
          <span>
            Admitido em {new Date(employee.hire_date).toLocaleDateString('pt-BR')}
          </span>
        </div>
      </div>
      
      {employee.salary && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-sm text-gray-900 font-medium">
            Salário: R$ {parseFloat(employee.salary).toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </p>
        </div>
      )}
    </div>
  )
}

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredEmployees, setFilteredEmployees] = useState([])

  useEffect(() => {
    fetchEmployees()
  }, [])

  useEffect(() => {
    // Filtrar funcionários baseado no termo de busca
    const filtered = employees.filter(employee =>
      employee.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.department_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredEmployees(filtered)
  }, [employees, searchTerm])

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/employees')
      setEmployees(response.data.data || [])
    } catch (error) {
      console.error('Erro ao buscar funcionários:', error)
      toast.error('Erro ao carregar funcionários')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (employee) => {
    // Implementar modal de edição ou navegação para página de edição
    toast.info(`Editar funcionário: ${employee.name}`)
  }

  const handleDelete = async (employee) => {
    if (window.confirm(`Tem certeza que deseja inativar o funcionário ${employee.name}?`)) {
      try {
        await axios.delete(`/api/employees/${employee.id}`)
        toast.success('Funcionário inativado com sucesso')
        fetchEmployees() // Recarregar lista
      } catch (error) {
        console.error('Erro ao inativar funcionário:', error)
        toast.error('Erro ao inativar funcionário')
      }
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
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Funcionários</h1>
          <p className="mt-2 text-sm text-gray-700">
            Lista de todos os funcionários da empresa ({employees.length} funcionários).
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-thermas-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-thermas-700 focus:outline-none focus:ring-2 focus:ring-thermas-500 focus:ring-offset-2 sm:w-auto"
            onClick={() => toast.info('Funcionalidade de adicionar funcionário em desenvolvimento')}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Adicionar funcionário
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-thermas-500 focus:border-thermas-500 sm:text-sm"
            placeholder="Buscar por nome, email, código ou departamento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      {/* Employee Grid */}
      <div className="mt-6">
        {filteredEmployees.length === 0 ? (
          <div className="text-center py-12">
            <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {searchTerm ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm 
                ? 'Tente ajustar sua busca ou limpar o filtro.'
                : 'Comece adicionando um novo funcionário.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEmployees.map((employee) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {searchTerm && filteredEmployees.length > 0 && (
        <div className="mt-4 text-sm text-gray-500 text-center">
          Mostrando {filteredEmployees.length} de {employees.length} funcionários
        </div>
      )}
    </div>
  )
}