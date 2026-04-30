import DataManagement from '@/app/components/DataManagement';

export default function DataManagementPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Data Management</h1>
        <DataManagement />
      </div>
    </div>
  );
}