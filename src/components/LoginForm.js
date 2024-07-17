
import { auth, provider, database } from '../firebase-config';
import { signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth';
import { ref, update } from "firebase/database";
import { useState } from 'react';
import { validatePassword } from '../utilities/password';
import { validateEmail } from '../utilities/email';

export const LoginForm = () => {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const setEmailValue = (e) => {
    setEmail(e.target.value)
  }
  const setPasswordValue = (e) => {
    setPassword(e.target.value)
  }

  const handleLoginWithGoggle = () => {
    signInWithPopup(auth, provider).then((data) => {
      console.log('login data', data);
    })
  }

  const handleLogin = () => {
    if (!validatePassword(password) || !validateEmail(email))  {
      alert("Invalid email/password");
      return;
    }
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        let user = userCredential.user;
        let user_data = {
          last_login: Date.now(),
        }
        // update last user login
        const dbRef = ref(database, 'users/' + user.uid)
        update(dbRef, user_data).then(() => {
          console.log("Data updated");
          window.location.href = '/home';
        }).catch((e) => {
          console.log(e);
        })
      }).catch((e) => {
        console.log(e);
      })
  }

  return (
    <div>
      <form className="p-10 mt-16 bg-gray-100 max-w-sm mx-auto shadow-lg rounded">
        <h1 className="mb-8 text-5xl">Login</h1>
        <div className="mb-5">
          <label className="block mb-2 text-sm font-medium text-dark">Email</label>
          <input type="email" onChange={setEmailValue} name="email" id="email" value={email} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded block w-full p-2.5 dark:border-gray-600 dark:placeholder-gray-400 dark:text-dark dark:focus:ring-blue-500 dark:focus:border-blue-500" />
        </div>
        <div className="mb-5">
          <label className="block mb-2 text-sm font-medium text-dark">Password</label>
          <input type="password" id="password" onChange={setPasswordValue} className="bg-gray-50 border border-gray-300text-sm rounded block w-full p-2.5 dark:border-gray-600 dark:placeholder-gray-400 dark:text-dark dark:focus:ring-blue-500 dark:focus:border-blue-500" />
        </div>
        <button type="button" onClick={handleLogin} className="text-white bg-blue-400 hover:bg-blue-300 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded text-sm w-full sm:w-auto px-5 py-2.5 text-center dark:gray-400">Submit</button>
        <div className='mt-8'>
          <button type="button" onClick={handleLoginWithGoggle} className="text-dark focus:ring-4 hover:text-sky-800 focus:outline-none focus:ring-blue-300 font-medium rounded text-sm w-full sm:w-auto px-5 py-2.5 md:pl-0 text-center">Login with Google</button>
          <span className='hidden md:inline-block'>|</span>
          <a href="/register" type="button" className="block md:inline text-dark focus:ring-4 hover:text-sky-800 focus:outline-none focus:ring-blue-300 font-medium rounded text-sm w-full sm:w-auto px-5 py-2.5 text-center">Sign up</a>
        </div>
      </form>
    </div>

  );
}

export default LoginForm;