import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}

// Configure axios defaults
axios.defaults.baseURL = '/api'
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Por enquanto, vamos pular a autenticação para testar
    // Simular usuário logado
    const mockUser = {
      id: 1,
      name: 'Usuário Teste',
      email: 'teste@empresa.com'
    }
    setUser(mockUser)
    setLoading(false)
  }, [])

  const checkTokenValidity = async () => {
    try {
      const response = await axios.get('/auth/me')
      setUser(response.data.user)
    } catch (error) {
      console.error('Token inválido:', error)
      logout()
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password) => {
    try {
      const response = await axios.post('/auth/login', { email, password })
      
      const { token, user: userData } = response.data
      
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
      setUser(userData)
      
      toast.success(`Bem-vindo, ${userData.name}!`)
      return { success: true }
      
    } catch (error) {
      const message = error.response?.data?.error || 'Erro no login'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    toast.success('Logout realizado com sucesso')
  }

  const register = async (userData) => {
    try {
      const response = await axios.post('/auth/register', userData)
      toast.success('Usuário criado com sucesso!')
      return { success: true, data: response.data }
    } catch (error) {
      const message = error.response?.data?.error || 'Erro no registro'
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const refreshToken = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return false

      const response = await axios.post('/auth/refresh', { token })
      const { token: newToken, user: userData } = response.data
      
      localStorage.setItem('token', newToken)
      localStorage.setItem('user', JSON.stringify(userData))
      setUser(userData)
      
      return true
    } catch (error) {
      console.error('Erro ao renovar token:', error)
      logout()
      return false
    }
  }

  const value = {
    user,
    login,
    logout,
    register,
    refreshToken,
    loading,
    isAuthenticated: !!user
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}