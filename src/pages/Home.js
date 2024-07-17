import { auth } from '../firebase-config';
import { signOut } from 'firebase/auth';
import payway from '../payway.js';
import { useState, useEffect, StrictMode } from 'react';
import axios from 'axios';

const Home = () => {
  
  const [creditCardFrame, setCreditCardFrame] = useState(null);

  const handleLogout = () => {
    signOut(auth).then(() => {
      console.log('user signed out');
      window.location.href = '/';
    })
  }

  const tokenCallback = function( err, data ) {
    if ( err ) {
      console.error( "Error getting token: " + err.message );
    } else {
      // TODO: send token to server with ajax
      console.log( "data: " + JSON.stringify(data) );
      alert('Todo: Process user payment');
      // let api = 'https://api.payway.com.au/rest/v1';
      // axios.post(api + '/transactions', {
      //     "singleUseTokenId": data.singleUseTokenId,
      //     "transactionType": "payment",
      //     "principalAmount": 99, 
      //     "currency": "aud",
      //   }).then((data) => {
      //     console.log('data', data);
      //   }).catch((e) => {
      //     console.log(e)
      //   });
    }
    // creditCardFrame.destroy();
    // setCreditCardFrame(null);
  };

  const pay = () => {
    // payButton.disabled = true;
    creditCardFrame.getToken( tokenCallback );
  };
  
  const createdCallback = ( err, frame ) => {
    if ( err ) {
      console.error( "Error creating frame: " + err.message );
    } else {
      // Save the created frame for when we get the token
      setCreditCardFrame(frame);
    }
  };

  const createFrame = () => {
    payway.createCreditCardFrame({
      publishableApiKey: "T18776_PUB_jvcihm3ihqpfyc9pyvi3jb43s5zadrk4zj72b565tztdgpicxyc4fa725n3c",
      tokenMode: "callback",
      // onValid: function() { payButton.disabled = false; },
      // onInvalid: function() { payButton.disabled = true; }
    }, createdCallback );
  }

  useEffect(() => {
    return () => {
      createFrame();
    }
  }, []);

  return (
    <div className="p-10">
      <button type="button" onClick={handleLogout} className="float-right text-dark m-2 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm w-full sm:w-auto px-5 py-2.5 text-center hover:text-sky-800">Logout</button>
      <h1 className="my-5">Home</h1>
        <div className="flex content-center justify-center p-16 bg-gray-100 rounded">
          <div>
            <h1>PayWay Payment</h1>
            <div id="payway-credit-card"></div>
            <br/>
            <button type="button" id="pay" onClick={pay} className="text-white bg-blue-400 hover:bg-blue-300 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded text-sm w-full sm:w-auto px-5 py-2.5 text-center dark:gray-400">Pay Invoice</button>
          </div>
        </div>
    </div>
  )
}

export default Home;