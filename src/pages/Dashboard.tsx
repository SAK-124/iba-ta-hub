import { useAuth } from '@/lib/auth';
import { ERPProvider } from '@/lib/erp-context';
import Layout from '@/components/Layout';
import StudentPortal from '@/components/student/StudentPortal';
import TAPortal from '@/components/ta/TAPortal';
import PortalLoadingScreen from '@/components/PortalLoadingScreen';

export default function Dashboard() {
  const { isTA, isLoading } = useAuth();

  if (isLoading) {
    return (
      <PortalLoadingScreen
        title="Loading Dashboard"
        subtitle="Syncing role permissions and workspace modules..."
      />
    );
  }

  if (isTA) {
    return (
      <ERPProvider>
        <TAPortal />
      </ERPProvider>
    );
  }

  return (
    <Layout>
      <ERPProvider>
        <StudentPortal />
      </ERPProvider>
    </Layout>
  );
}
