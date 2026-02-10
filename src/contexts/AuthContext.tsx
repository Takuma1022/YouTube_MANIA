 'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebaseClient';
import type { UserProfile } from '@/types/user';

type AuthContextType = {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isGmail = (email: string | null | undefined) => {
  if (!email) return false;
  return email.toLowerCase().endsWith('@gmail.com');
};

const ensureUserDoc = async (user: FirebaseUser) => {
  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      isApproved: false,
      isAdmin: false,
      createdAt: serverTimestamp(),
    });
  }
};

const logLogin = async (idToken: string) => {
  await fetch('/api/log-login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
};

const approveLoginIfAllowed = async (idToken: string) => {
  const res = await fetch('/api/approve-login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || '承認チェックに失敗しました');
  }
  return res.json().catch(() => ({}));
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const handleSignedInUser = async (user: FirebaseUser) => {
    if (!isGmail(user.email)) {
      await firebaseSignOut(auth);
      throw new Error('Gmailアドレスのみ利用可能です');
    }
    await ensureUserDoc(user);
    const idToken = await user.getIdToken(true);
    try {
      await approveLoginIfAllowed(idToken);
      await logLogin(idToken);
    } catch (error) {
      await firebaseSignOut(auth);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await handleSignedInUser(result.user);
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw error;
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          return handleSignedInUser(result.user);
        }
        return undefined;
      })
      .catch((error: any) => {
        if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/popup-blocked') {
          return;
        }
        console.error('Error handling redirect result:', error);
      });

    let userUnsub: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await ensureUserDoc(user);
        const userRef = doc(db, 'users', user.uid);
        userUnsub?.();
        userUnsub = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data() as any;
            setUserProfile({
              ...data,
              createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
              approvedAt: data.approvedAt?.toDate?.() ?? data.approvedAt,
            });
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        });
      } else {
        userUnsub?.();
        userUnsub = null;
        setUserProfile(null);
        setLoading(false);
      }
    });
    return () => {
      unsubscribe();
      userUnsub?.();
    };
  }, []);

  const value = useMemo(
    () => ({ currentUser, userProfile, loading, signInWithGoogle, signOut }),
    [currentUser, userProfile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
