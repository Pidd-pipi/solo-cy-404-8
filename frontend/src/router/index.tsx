import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../App';
import { DeliveryHub } from '../pages/DeliveryHub';
import { ExportPreview } from '../pages/ExportPreview';
import { PrivacyConsole } from '../pages/PrivacyConsole';
import { Profile } from '../pages/Profile';
import { ResumeEditor } from '../pages/ResumeEditor';
import { ResumeList } from '../pages/ResumeList';
import { TemplateGallery } from '../pages/TemplateGallery';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate replace to="/resumes" /> },
      { path: 'resumes', element: <ResumeList /> },
      { path: 'resumes/:id/edit', element: <ResumeEditor /> },
      { path: 'resumes/:id/export', element: <ExportPreview /> },
      { path: 'delivery', element: <DeliveryHub /> },
      { path: 'delivery/:id', element: <PrivacyConsole /> },
      { path: 'templates', element: <TemplateGallery /> },
      { path: 'profile', element: <Profile /> },
      { path: '*', element: <Navigate replace to="/resumes" /> },
    ],
  },
]);

