// src/api/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDxy4M1Rfue4zi_HcR23h7no9nbZUkjB74",
  authDomain: "booking-lab-equipment.firebaseapp.com",
  projectId: "booking-lab-equipment",
  storageBucket: "booking-lab-equipment.firebasestorage.app",
  messagingSenderId: "7360785156",
  appId: "1:7360785156:web:215b80f3d62b592d08fe51",
  measurementId: "G-NQ63WDKB7M"
};

const app = initializeApp(firebaseConfig);

// 导出常用的实例
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = "booking-lab"; 

/**
 * 添加审计日志
 */
export const addAuditLog = async (labName, action, message, userName) => {
  try {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), {
      labName, action, message, userName, timestamp: serverTimestamp()
    });
  } catch (e) { 
    console.error("Log failed", e); 
  }
};