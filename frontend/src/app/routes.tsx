import { Navigate, type RouteObject } from 'react-router';
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
          { index: true, element: <Navigate to="/boards" replace /> },
          {
            path: 'boards',
            lazy: async () => {
              const { BoardsPage } = await import('../features/boards');
              return { Component: BoardsPage };
            },
          },
          {
            path: 'boards/:boardId',
            lazy: async () => {
              const { BoardPage } = await import('../features/board-detail');
              return { Component: BoardPage };
            },
            children: [
              {
                path: 'c/:cardId',
                lazy: async () => {
                  const { CardDetailRoute } = await import('../features/card-detail');
                  return { Component: CardDetailRoute };
                },
              },
            ],
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
