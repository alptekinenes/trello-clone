import type { RouteObject } from 'react-router';
import { GuestRoute, LoginPage, ProtectedRoute, RegisterPage } from '../features/auth';
import { NotFoundPage } from './not-found-page';
import { RootLayout } from './root-layout';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          {
            index: true,
            lazy: async () => {
              const { HomePage } = await import('../features/home');
              return { Component: HomePage };
            },
          },
        ],
      },
      {
        element: <GuestRoute />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
