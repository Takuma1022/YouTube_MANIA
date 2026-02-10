export type LoginEvent = {
  id: string;
  uid: string;
  email: string;
  ip: string;
  userAgent: string;
  createdAt?: string | Date | null;
};
