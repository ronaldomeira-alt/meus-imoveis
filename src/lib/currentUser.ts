export interface AppUser {
  id: 'ronaldo';
  name: string;
  email: string;
  role: string;
  initials: string;
  avatarClassName: string;
}

export const RONALDO_USER: AppUser = {
  id: 'ronaldo',
  name: 'Ronaldo Meira',
  email: 'ronaldomeira@gmail.com',
  role: 'Corretor de Imóveis',
  initials: 'RM',
  avatarClassName: 'bg-accent',
};

export const APP_USER = RONALDO_USER;

export function useCurrentUser(): [AppUser, (id: AppUser['id']) => void] {
  return [RONALDO_USER, () => {}];
}
