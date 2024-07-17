
import { auth } from '../firebase-config';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, set, ref } from "firebase/database";
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

  const handleSignup = () => {

    if (!validateEmail(email) || !validatePassword(password)) {
      alert('Invalid email/password');
      return;
    }

    createUserWithEmailAndPassword(auth, email, password)
      .then(()=> {
        let current_user = auth.currentUser;
        let user_data = {
          email: email,
          last_login: Date.now(),
        }
        const db = getDatabase();
        // add user
        set(ref(db, 'users/' + current_user.uid), user_data);
        alert('User successfully created.');
        window.location.href = '/home';
      }).catch((e) => {
        console.log(e.message)
      })
  }

   return (
    <div>
      <form className="p-10 mt-16 bg-gray-100 max-w-sm mx-auto shadow-lg rounded">
        <h1 className="mb-8 text-5xl">Sign up!</h1>
        <div className="mb-5">
          <label className="block mb-2 text-sm font-medium text-dark">Email</label>
          <input type="email" onChange={setEmailValue} name="email" id="email" value={email} className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded block w-full p-2.5 dark:border-gray-600 dark:placeholder-gray-400 dark:text-dark dark:focus:ring-blue-500 dark:focus:border-blue-500" />
        </div>
        <div className="mb-5">
          <label className="block mb-2 text-sm font-medium text-dark">Password</label>
          <input type="password" id="password" onChange={setPasswordValue} className="bg-gray-50 border border-gray-300text-sm rounded block w-full p-2.5 dark:border-gray-600 dark:placeholder-gray-400 dark:text-dark dark:focus:ring-blue-500 dark:focus:border-blue-500" />
        </div>
        <button type="button" onClick={handleSignup} className="text-white bg-blue-400 hover:bg-blue-300 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded text-sm w-full sm:w-auto px-5 py-2.5 text-center dark:gray-400">Register</button>
        <span className='hidden md:inline-block ml-6'>|</span>
        <a href="/" type="button" className="block md:inline text-dark focus:ring-4 hover:text-sky-800 focus:outline-none focus:ring-blue-300 font-medium rounded text-sm w-full sm:w-auto px-5 py-2.5 text-center">Back to login</a>
      </form>
    </div>

  );
}

export default LoginForm;