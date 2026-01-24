import { useAuth } from '@/lib/auth';
import { ERPProvider } from '@/lib/erp-context';
import Layout from '@/components/Layout';
import StudentPortal from '@/components/student/StudentPortal';
import TAPortal from '@/components/ta/TAPortal';

export default function Dashboard() {
  const { isTA } = useAuth();

  return (
    <Layout>
      <ERPProvider>
        {isTA ? <TAPortal /> : <StudentPortal />}
      </ERPProvider>
    </Layout>
  );
}
