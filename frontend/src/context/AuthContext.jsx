import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  registerEmployee,
  resetPassword,
} from '../services/api'

const AuthContext = createContext(null)
const STORAGE_KEY = 'text2image_employee_user'

function readStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function persistUser(user) {
  if (!user) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser())
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let mounted = true
    getCurrentUser()
      .then((response) => {
        if (!mounted) return
        if (response.authenticated) {
          setUser(response.user)
          persistUser(response.user)
        } else {
          setUser(null)
          persistUser(null)
        }
      })
      .catch(() => {
        if (!mounted) return
        setUser(null)
        persistUser(null)
      })
      .finally(() => {
        if (mounted) setCheckingAuth(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const login = async (name, password) => {
    const response = await loginRequest(name, password)
    if (response.success) {
      setUser(response.user)
      persistUser(response.user)
      return response.user
    }
    throw new Error(response.message || '登录失败')
  }

  const register = async (values) => {
    const response = await registerEmployee(values)
    if (response.success) {
      setUser(response.user)
      persistUser(response.user)
      return response.user
    }
    throw new Error(response.message || '注册失败')
  }

  const forgotPassword = async (values) => {
    const response = await resetPassword(values)
    if (response.success) return response
    throw new Error(response.message || '密码重置失败')
  }

  const logout = async () => {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
      persistUser(null)
    }
  }

  const value = useMemo(
    () => ({
      user,
      authenticated: Boolean(user),
      checkingAuth,
      login,
      register,
      forgotPassword,
      logout,
    }),
    [user, checkingAuth]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
