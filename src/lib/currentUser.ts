import { useState } from 'react';

export interface AppUser {
  id: 'ronaldo' | 'thatianna';
  name: string;
  email: string;
  role: string;
  initials: string;
  avatarClassName: string;
}

export const APP_USERS: AppUser[] = [
  {
    id: 'ronaldo',
    name: 'Ronaldo Meira',
    email: 'ronaldomeira@gmail.com',
    role: 'Corretor de Imóveis',
    initials: 'RM',
    avatarClassName: 'bg-accent',
  },
  {
    id: 'thatianna',
    name: 'Thatianna Meira',
    email: 'thatianna@meusimoveis.com.br',
    role: 'Corretora de Imóveis',
    initials: 'TM',
    avatarClassName: 'bg-status-partner',
  },
];

const STORAGE_KEY = 'meus-imoveis:current-user-id';

function getStoredUserId(): AppUser['id'] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (APP_USERS.some((u) => u.id === stored)) return stored as AppUser['id'];
  } catch {
    // localStorage indisponível (SSR, modo privado bloqueado) — usa o padrão
  }
  return APP_USERS[0].id;
}

function setStoredUserId(id: AppUser['id']) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignora — a troca ainda funciona na sessão atual, só não persiste
  }
}

export function getUserById(id: AppUser['id']): AppUser {
  return APP_USERS.find((u) => u.id === id) ?? APP_USERS[0];
}

export function useCurrentUser(): [AppUser, (id: AppUser['id']) => void] {
  const [userId, setUserId] = useState<AppUser['id']>(getStoredUserId);

  const changeUser = (id: AppUser['id']) => {
    setStoredUserId(id);
    setUserId(id);
  };

  return [getUserById(userId), changeUser];
}
