import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAr4IYnykpwovqOJWzfBd7abVdAma_Ig3Q",
  authDomain: "diet-planner-3bdf3.firebaseapp.com",
  databaseURL: "https://diet-planner-3bdf3-default-rtdb.firebaseio.com",
  projectId: "diet-planner-3bdf3",
  storageBucket: "diet-planner-3bdf3.firebasestorage.app",
  messagingSenderId: "927878354911",
  appId: "1:927878354911:web:2e616b171a267b9910566a",
  measurementId: "G-MSYWCM58MT",
};

export const printDatabase = getDatabase(initializeApp(firebaseConfig, "print-page"));
