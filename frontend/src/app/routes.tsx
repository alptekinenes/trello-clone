import type { RouteObject } from 'react-router';
import { NotFoundPage } from './not-found-page';
import { RootLayout } from './root-layout';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { HomePage } = await import('../features/home');
          return { Component: HomePage };
        },
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
