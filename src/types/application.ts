export type Application = {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string | Date | null;
  approvedAt?: string | Date | null;
};
