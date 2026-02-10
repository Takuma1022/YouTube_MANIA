export type UserProfile = {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  isApproved: boolean;
  isAdmin: boolean;
  createdAt?: Date | string | null;
  approvedAt?: Date | string | null;
};
