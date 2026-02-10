 'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export const HomeGate = () => {
  const { userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (userProfile && !userProfile.isAdmin) {
      router.replace('/dashboard');
    }
  }, [loading, userProfile, router]);

  return null;
};
