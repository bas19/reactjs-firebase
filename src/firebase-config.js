import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyAsJhuC0SaqhVYJTiOZjmj6PuVreyp2IZU",
  authDomain: "payment-test-app-bc192.firebaseapp.com",
  projectId: "payment-test-app-bc192",
  storageBucket: "payment-test-app-bc192.appspot.com",
  messagingSenderId: "388380621031",
  appId: "1:388380621031:web:4e3833d599bc8063d34a42"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const database = getDatabase(app);

export {auth, provider, database};
