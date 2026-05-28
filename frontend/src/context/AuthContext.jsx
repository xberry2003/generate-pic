import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let mounted = true
    getCurrentUser()
      .then((response) => {
        if (mounted && response.authenticated) setUser(response.user)
      })
      .catch(() => {
        if (mounted) setUser(null)
      })
      .finally(() => {
        if (mounted) setCheckingAuth(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const login = async (username, password) => {
    const response = await loginRequest(username, password)
    if (response.success) {
      setUser(response.user)
      return response.user
    }
    throw new Error(response.message || '用户名或密码错误')
  }

  const logout = async () => {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
    }
  }

  const value = useMemo(
    () => ({
      user,
      authenticated: Boolean(user),
      checkingAuth,
      login,
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
