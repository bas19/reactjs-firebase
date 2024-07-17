// Copyright 2016 Qvalent Pty. Ltd.

var payway = (function() {
    var payWayRestApiOrigin = "https://api.payway.com.au";
    var correlationIdCounter = 0;
    var frameIdCounter = 0;

    function log( message ) {
        if ( window.console && window.console.log ) {
            window.console.log( 'payway: ' + message );
        }
    }

    function extend( a, b ) {
        for ( var key in b ) {
            if ( b.hasOwnProperty( key ) ) {
                a[key] = b[key];
            }
        }
        return a;
    }

    function onReady( scope, err ) {
        var frame = {};
        frame.getToken = function( callback ) {
            if ( typeof callback !== 'function' ) {
                log( 'You must provide a callback function as the first parameter to \'frame.getToken\'' );
                return;
            }

            sendMessageToFrame( 'getToken', scope, {
                correlationId: correlationIdCounter
            } );
            scope.tokenCallbacks[correlationIdCounter] = callback;
            ++correlationIdCounter;
        };
        frame.destroy = function() {
            if ( scope.formElement &&
                 scope.formElement.payWaySubmitCallback ) {
                removeEvent( scope.formElement, 'submit', scope.formElement.payWaySubmitCallback );
            }
            if ( scope.messageListener ) {
                removeEvent( window, 'message', scope.messageListener );
            }
            if ( scope.formElement ) {
                delete scope.formElement.paywayFrame;
            }

            frame.getToken = function() {
                log( 'You cannot get a token after the frame has been destroyed' );
            };
            frame.destroy = function() {};

            if ( scope.iframeElement && scope.iframeElement.parentNode ) {
                scope.iframeElement.parentNode.removeChild( scope.iframeElement );
                delete scope.iframeElement;
            }
        };

        if ( !err && scope.tokenMode === 'post' ) {
            // Setup an onsubmit trigger for our form which will send a message to the iframe.
            var informIframeOnSubmit = function( event ) {
                frame.getToken( function( err, data ) {
                    if ( err ) {
                        log(
                            'An error occurred sending ' +
                            ( scope.paymentMethod === 'creditCard' ? 'credit card' : 'bank account' ) +
                            ' data to PayWay.' );
                        log( 'HTTP ' + err.status + ': ' + err.message );
                        return;
                    }
                    submitTokenToMerchant( data.singleUseTokenId, scope );
                });
                // Prevent the form from being submitted.
                event.preventDefault();
            };
            addEvent( scope.formElement, 'submit', informIframeOnSubmit, false );
            scope.formElement.payWaySubmitCallback = informIframeOnSubmit;
        }

        scope.createdCallback( err, frame );
    }

    function receiveMessage( event, scope ) {
        "use strict";

        // All messages must be received from our known origin.
        if ( event.origin !== payWayRestApiOrigin ) {
            log( 'Message received from unknown origin' + event.origin + '. Ignoring message' );
            return;
        }

        if ( !event.data ) {
            log( 'event.data is empty or undefined' );
            return;
        }

        var data;
        try {
            data = JSON.parse( event.data );
        }
        catch ( ex ) {
            log( 'event.data was not valid JSON' );
            return;
        }

        if ( !data || !data.app || data.app !== 'payway' || data.frameId !== scope.frameId ) {
            // Message was not intended for us.
            return;
        }

        if ( scope.frameType && scope.frameType !== data.frameType ) {
            return;
        }

        if ( data.type === 'ready' ) {
            onReady( scope, data.err );
        } else if ( data.type === 'valid' ) {
            scope.onValid();
        } else if ( data.type === 'invalid' ) {
            scope.onInvalid();
        } else if ( data.type === 'singleUseToken' ) {
            if ( !data.hasOwnProperty( 'correlationId' ) ||
                 typeof data.correlationId !== 'number' ) {
                var error = 'correlationId was not found on message or was not a number';
                log( error );
                return;
            }

            scope.tokenCallbacks[data.correlationId]( data.err, {
                singleUseTokenId: data.singleUseTokenId,
                paymentMethod: data.paymentMethod,
                creditCard: data.creditCard,
                bankAccount: data.bankAccount
            });
            delete scope.tokenCallbacks[data.correlationId];
        } else if ( data.type === 'challenge-error' ) {
            scope.err = data.err;
        } else if ( data.type === 'challenge-response' ) {
            if ( scope.challengeMode === 'post' ) {
                var hiddenTransStatusField = document.createElement( 'input' );
                hiddenTransStatusField.type = 'hidden';
                hiddenTransStatusField.name = 'transStatus';
                hiddenTransStatusField.value = data.transStatus;
                scope.formElement.appendChild( hiddenTransStatusField );

                document.createElement( 'form' ).submit.call( scope.formElement );
            } else if ( scope.challengeMode === 'callback' ) {
                if ( data.transStatus === 'Y' ) {
                    scope.onSuccess();
                } else if ( data.transStatus === 'N' )
                    scope.onFailure();
            }
        }
    }

    function submitTokenToMerchant( singleUseTokenId, scope ) {
        var hiddenField = document.createElement( 'input' );
        hiddenField.type = 'hidden';
        hiddenField.name = 'singleUseTokenId';
        hiddenField.value = singleUseTokenId;
        scope.formElement.appendChild( hiddenField );

        removeEvent( scope.formElement, 'submit', scope.formElement.payWaySubmitCallback );
        document.createElement( 'form' ).submit.call( scope.formElement );
    }

    function addEvent( elm, evType, fn, useCapture ) {
        //Credit: Function written by Scott Andrews
        //(slightly modified)
        var ret = 0;

        if ( elm.addEventListener ) {
            ret = elm.addEventListener( evType, fn, useCapture );
        } else if ( elm.attachEvent ) {
            ret = elm.attachEvent( 'on' + evType, fn );
        } else {
            elm['on' + evType] = fn;
        }

        return ret;
    }

    function removeEvent( elm, evType, fn ) {
        var ret = 0;

        if ( elm.removeEventListener ) {
            ret = elm.removeEventListener( evType, fn, false );
        } else if ( elm.removeEvent ) {
            ret = elm.removeEvent( 'on' + evType, fn );
        } else {
            elm['on' + evType] = null;
        }

        return ret;
    }

    function sendErrorToContainer( container, message ) {
        var containerElement = document.getElementById( container );
        if ( containerElement ) {
            var errorElement = document.createElement( 'p' );
            errorElement.style.cssText = "color: red; font-weight: bold;";
            errorElement.className = 'payway-frame-error';
            errorElement.innerHTML = message;
            containerElement.appendChild( errorElement );
        }
    }

    function findFormElement( container ) {
        var element = container;
        while ( element ) {
            if ( 'FORM' === element.nodeName.toUpperCase() ) {
                return element;
            }
            element = element.parentNode;
        }
    }

    function createFrame( scope, initFrameCallback ) {
        // Ensure we are ready to receive messages from the iframe.
        scope.messageListener = function( event ){ receiveMessage( event, scope ) };
        addEvent( window, 'message', scope.messageListener, false );

        var iframeClassName;
        var iframeSourceUrl;
        if ( scope.paymentMethod === 'creditCard' ) {
            iframeClassName = 'payway-credit-card-iframe';
            iframeSourceUrl = '/rest/v1/creditCard-iframe.htm';
        } else {
            iframeClassName = 'payway-bank-account-iframe';
            iframeSourceUrl = '/rest/v1/bankAccount-iframe.htm';
        }

        var iframe = document.createElement( 'iframe' );
        addEvent( iframe, 'load', function() { initFrameCallback( iframe ); }, false );
        iframe.id = iframeClassName + scope.frameId;
        iframe.src = payWayRestApiOrigin + iframeSourceUrl;
        iframe.sandbox = 'allow-forms allow-scripts allow-same-origin';
        iframe.width = scope.width;
        iframe.height = scope.height;
        iframe.scrolling = 'no';
        iframe.style.cssText = 'overflow: hidden;';
        iframe.frameBorder = '0';
        iframe.seamless = 'seamless';
        iframe.className = iframeClassName;

        scope.iframeElement = iframe;

        scope.containerElement.appendChild( iframe );
    }

    function sendMessageToFrame( messageType, scope, parameters ) {
        var message = {
            app: 'payway',
            type: messageType,
            frameId: scope.frameId
        };

        extend( message, parameters );

        scope.iframeElement.contentWindow.postMessage(
            JSON.stringify( message ),
            payWayRestApiOrigin );
    }

    function validateOptions( options, createdCallback, paymentMethod ) {
        var createFrameMethodName;
        var defaultContainerName;
        if ( paymentMethod === 'creditCard' ) {
            createFrameMethodName = 'payway.createCreditCardFrame';
            defaultContainerName = 'payway-credit-card';
        } else {
            createFrameMethodName = 'payway.createBankAccountFrame';
            defaultContainerName = 'payway-bank-account';
        }

        var scope = {};
        scope.frameId = frameIdCounter;
        ++frameIdCounter;
        scope.paymentMethod = paymentMethod;

        var container = defaultContainerName;
        if ( !options ) {
            var error = 'You must provide options to ' + createFrameMethodName;
            log( error );
            sendErrorToContainer( container, error );
            return null;
        }

        if ( options.container ) {
            container = options.container;
        }

        var layoutError = false;
        var layoutProvided = false;
        if ( !options.hasOwnProperty( 'layout' ) ||
             typeof options.layout === 'null' ||
             typeof options.layout === 'undefined' ) {
            scope.layout = 'wide';
        } else if ( options.layout !== 'wide' &&
                    options.layout !== 'narrow' ) {
            layoutError = true;
            scope.layout = 'wide';
        } else {
            scope.layout = options.layout;
            layoutProvided = true;
        }

        if ( scope.layout === 'wide' ) {
            scope.width = 370;
            scope.height = 226;
        } else {
            scope.width = 278;
            scope.height = 306;
        }

        var widthError = false;
        var widthProvided = false;
        if ( !options.hasOwnProperty( 'width' ) ||
             typeof options.width === 'null' ||
             typeof options.width === 'undefined' ) {
            // Okay, take the default.
        } else if ( typeof options.width !== 'number' ) {
            widthError = true;
        } else {
            scope.width = options.width;
            widthProvided = true;
        }

        var heightError = false;
        var heightProvided = false;
        if ( !options.hasOwnProperty( 'height' ) ||
             typeof options.height === 'null' ||
             typeof options.height === 'undefined' ) {
            // Okay, take the default.
        } else if ( typeof options.height !== 'number' ) {
            heightError = true;
        } else {
            scope.height = options.height;
            heightProvided = true;
        }

        var createdCallbackError = false;
        if ( typeof createdCallback === 'null' ||
             typeof createdCallback === 'undefined' ) {
            scope.createdCallback = function(){};
        } else if ( typeof createdCallback !== 'function' ) {
            scope.createdCallback = function(){};
            createdCallbackError = true;
        } else {
            scope.createdCallback = createdCallback;
        }

        var containerError = false;
        scope.containerElement = document.getElementById( container );
        if ( !scope.containerElement ) {
            var error =
                'An element with id \'' + container + '\' could not be found in the document.'
                + '  You must create a div with id \'' + container + '\'';
            log( error );
            // No point attempting to send the error to the container here...
            onReady( scope, error );
            containerError = true;
        }

        if ( options.hasOwnProperty( 'tokenMode' ) &&
             options.tokenMode == 'callback' &&
            ( typeof createdCallback === 'null' ||
              typeof createdCallback === 'undefined')  ) {
           createFrame( scope, function(){
               sendMessageToFrame( 'tokenModeNoCallbackFunctionProvided', scope );
           } );
           return null;
        }

        if ( createdCallbackError && !containerError ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'createdCallbackMustBeAFunction', scope );
            } );
        }

        if ( createdCallbackError || containerError ) {
            return null;
        }

        if ( !options.hasOwnProperty( 'onValid' ) ||
             typeof options.onValid === 'null' ||
             typeof options.onValid === 'undefined' ) {
            scope.onValid = function(){};
        } else if ( typeof options.onValid !== 'function' ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'onValidMustBeAFunction', scope );
            } );
            return null;
        } else {
            scope.onValid = options.onValid;
        }

        if ( !options.hasOwnProperty( 'onInvalid' ) ||
             typeof options.onInvalid === 'null' ||
             typeof options.onInvalid === 'undefined' ) {
            scope.onInvalid = function(){};
        } else if ( typeof options.onInvalid !== 'function' ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'onInvalidMustBeAFunction', scope );
            } );
            return null;
        } else {
            scope.onInvalid = options.onInvalid;
        }

        if ( !options.hasOwnProperty( 'tokenMode' ) ||
             typeof options.tokenMode === 'null' ||
             typeof options.tokenMode === 'undefined' ) {
            scope.tokenMode = 'post';
        } else if ( options.tokenMode !== 'callback' &&
                    options.tokenMode !== 'post' ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'tokenModeNotValid', scope );
            } );
            return null;
        } else {
            scope.tokenMode = options.tokenMode;
        }

        if ( !options.hasOwnProperty( 'style' ) ||
             typeof options.style === 'null' ||
             typeof options.style === 'undefined' ) {
            scope.style = {};
        } else if ( typeof options.style !== 'object' ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'styleNotValid', scope );
            } );
            return null;
        } else {
            scope.style = options.style;
        }

        if ( layoutError ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'layoutNotValid', scope );
            } );
            return null;
        }

        if ( widthError ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'widthNotValid', scope );
            } );
            return null;
        }

        if ( heightError ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'heightNotValid', scope );
            } );
            return null;
        }

        var layoutAndDimensionsProvidedError =
            layoutProvided && ( widthProvided || heightProvided );

        if ( layoutAndDimensionsProvidedError ) {
            createFrame( scope, function(){
                sendMessageToFrame( 'layoutAndDimensionsProvidedError', scope );
            } );
            return null;
        }

        if ( scope.tokenMode === 'post' ) {
            scope.formElement = findFormElement( scope.containerElement );
            if ( !scope.formElement ) {
                createFrame( scope, function(){
                    sendMessageToFrame( 'containerMustBeInAForm', scope, { container: scope.containerElement.id } );
                } );
                return null;
            }

            if ( scope.formElement.paywayFrame ) {
                createFrame( scope, function(){
                    sendMessageToFrame( 'formAlreadyContainsPayWayFrame', scope );
                } );
                return null;
            }

            scope.formElement.paywayFrame = true;
        }

        if ( scope.paymentMethod === 'bankAccount'
                && options.hasOwnProperty( 'threeDS2' ) ) {
            createFrame( scope, function() {
                sendMessageToFrame( 'cannotUse3dsForBankAccounts', scope );
            } );
            return null;
        } else if ( scope.paymentMethod === 'creditCard' ) {
            scope.threeDS2 = !!options.threeDS2;
        }

        return scope;
    }

    function createCreditCardOrBankAccountFrame( options, createdCallback, paymentMethod ) {
        var scope = validateOptions( options, createdCallback, paymentMethod );
        if ( !scope ) {
            return;
        }

        scope.publishableApiKey = options.publishableApiKey;
        scope.tokenCallbacks = {};
        scope.cvnRequired = options.cvnRequired;

        var initFrame = function( iframeElement, scope ) {
            // Send a message to the iframe telling it to initialise.
            var parameters = {
                publishableApiKey: scope.publishableApiKey,
                cvnRequired: scope.cvnRequired,
                style: scope.style,
                layout: scope.layout,
                threeDS2: scope.threeDS2
            };
            sendMessageToFrame( 'getReady', scope, parameters );
        };
        var initFrameCallback = function( iframe ){
            initFrame( iframe, scope );
        };
        createFrame( scope, initFrameCallback );
    }

    function challengeFrameReady( options ) {
        var frame = {};
        frame.destroy = function() {
            if ( options.messageListener ) {
                removeEvent( window, 'message', options.messageListener );
            }

            if ( options.formElement ) {
                delete options.formElement.paywayChallengeFrame;
            }

            frame.destroy = function() {};

            if ( options.iframeElement && options.iframeElement.parentNode ) {
                options.iframeElement.parentNode.removeChild( options.iframeElement );
                delete options.iframeElement;
            }
        };

        options.createdChallengeCallback( options.err, frame );
    }

    function createChallengeFrame(options, createdChallengeCallback) {
        options = options || {};

        function showError(message) {
            log(message);
            sendErrorToContainer(options.container, message);
        }

        options.container = options.container || 'payway-challenge';
        options.containerElement = document.getElementById(options.container);
        if (!options.containerElement) {
            var containerErrorEl = document.createElement('div');
            containerErrorEl.id = 'payway-challenge-container-error';
            document.body.appendChild(containerErrorEl);
            sendErrorToContainer(
                'payway-challenge-container-error',
                'options.container has value ' + options.container
                    + ', but the document doesn\'t contain any elements with this ID'
            );
            return null;
        }

        if (!options.singleUseTokenId) {
            showError('You must provide a value for options.singleUseTokenId');
            return null;
        }

        var modes = ['callback', 'post'];
        options.challengeMode = options.challengeMode || 'post';
        var validMode = modes.indexOf(options.challengeMode) >= 0;
        if (!validMode) {
            showError('options.challengeMode has value ' + options.challengeMode
                + ', which isn\'t one of the valid values: '
                + modes.join(', '));
            return null;
        }

        if ( options.challengeMode === 'post' ) {
            options.formElement = findFormElement( options.containerElement );
            if ( !options.formElement ) {
                showError('You must place a div with id \'' + options.containerElement.id + '\' inside a form.');
                return null;
            }

            if ( options.formElement.paywayChallengeFrame ) {
                showError('The form already contains a challenge frame. To create more than one frame, put them in separate forms')
                return null;
            }

            options.formElement.paywayChallengeFrame = true;
        }

        var windowSizes = {
            '01': { height: '400px', width: '250px' },
            '02': { height: '400px', width: '390px' },
            '03': { height: '600px', width: '500px' },
            '04': { height: '400px', width: '600px' },
            '05': { height: '100%', width: '100%' }
        };

        options.challengeWindowSize = options.challengeWindowSize || '05';
        var validSize = Object.keys(windowSizes).indexOf(options.challengeWindowSize) >= 0;
        if (validSize) {
            options.height = windowSizes[options.challengeWindowSize].height;
            options.width = windowSizes[options.challengeWindowSize].width;
        }
        else {
            showError('options.challengeWindowSize has value '
                + options.challengeWindowSize
                + ', which isn\'t one of the valid values: '
                + Object.keys(windowSizes).join(', '));
            return null;
        }

        options.onSuccess = options.onSuccess || function() {};
        if (typeof options.onSuccess !==  'function') {
            showError('options.onSuccess isn\'t a valid function');
            return null;
        }

        options.onFailure = options.onFailure || function() {};
        if (typeof options.onFailure !==  'function') {
            showError('options.onFailure isn\'t a valid function');
            return null;
        }

        options.createdChallengeCallback = createdChallengeCallback || function() {};
        if (typeof options.createdChallengeCallback !==  'function') {
            showError('createdCallback isn\'t a valid function');
            return null;
        }

        options.frameId = frameIdCounter++;
        options.frameType = 'challenge';

        // Configure message listener
        options.messageListener = function(event){
            receiveMessage(event, options)
        };
        addEvent(window, 'message', options.messageListener, false);

        // Create iframe element
        var iframe = document.createElement('iframe');

        addEvent(iframe, 'load', function() { challengeFrameReady( options ) }, false);

        var frameId = 'payway-challenge-iframe' + options.frameId;
        iframe.id = frameId;
        iframe.name = frameId;
        iframe.src =
            payWayRestApiOrigin
                + '/rest/v1/single-use-tokens/'
                + encodeURIComponent(options.singleUseTokenId)
                + '/challenge-iframe.htm?challengeWindowSize='
                + encodeURIComponent(options.challengeWindowSize);
        iframe.sandbox.add('allow-forms', 'allow-same-origin', 'allow-scripts');
        iframe.style.border = '0';
        iframe.style.height = options.height;
        iframe.style.overflow = 'hidden';
        iframe.style.width = options.width;
        if (options.challengeWindowSize === '05') {
          iframe.style.position = 'absolute';
          iframe.style.zIndex = '1000';
          iframe.style.top = '0'
          iframe.style.left = '0'
          iframe.style.backgroundColor = '#FFFFFF';
        }
        iframe.seamless = 'seamless';
        iframe.className = 'payway-challenge-iframe';

        options.iframeElement = iframe;
        options.containerElement.appendChild(options.iframeElement);
    }

    function sendRequest(publishableApiKey, method, url, body, callback) {
        const request = new XMLHttpRequest();
        request.onreadystatechange = () => {
            if (request.readyState === XMLHttpRequest.DONE) {
                if (request.status >= 400 && request.status <= 599) {
                    if (request.response) {
                        const jsonResponse = JSON.parse(request.response);
                        if (jsonResponse.data) {
                            log(jsonResponse.data);
                        }
                    }
                }
                callback(request);
            }
        };
        request.open(method, payWayRestApiOrigin + url);

        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Authorization", `Basic ${btoa(publishableApiKey)}:`);
        request.send(body);
    }

    function getApplePayPaymentRequest(applePayQvalentMerchantId, applePaySupportedNetworks, clientName, value) {
        const merchantCapabilities = [
            'supports3DS',
            'supportsCredit',
            'supportsDebit'
        ];
        const applePayMethodData = {
            supportedMethods: 'https://apple.com/apple-pay',
            data: {
                version: 3,
                merchantIdentifier: applePayQvalentMerchantId,
                merchantCapabilities,
                supportedNetworks: applePaySupportedNetworks,
                countryCode: 'AU'
            }
        };
        const applePayTransactionDetails = {
            total: {
                amount: {
                    value,
                    currency: 'AUD'
                },
                label: `${clientName} (surcharge may be added)`
            }
        };
        return new PaymentRequest([applePayMethodData], applePayTransactionDetails);
    }

    function getGooglePayPaymentRequest(clientNumber, googlePaySupportedNetworks, googleMerchantId, clientName, googlePayEnvironment, value) {
        const tokenizationSpecification = {
            type: 'PAYMENT_GATEWAY',
            parameters: {
                gateway: 'qvalent',
                gatewayMerchantId: clientNumber
            }
        };
        const allowedPaymentMethods = {
            type: 'CARD',
            parameters: {
                allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                allowedCardNetworks: googlePaySupportedNetworks
            },
            tokenizationSpecification
        };
        const googlePayMethodData = {
            supportedMethods: 'https://google.com/pay',
            data: {
                environment: googlePayEnvironment,
                apiVersion: 2,
                apiVersionMinor: 0,
                merchantInfo: {
                    merchantId: googleMerchantId,
                    merchantName: clientName
                },
                allowedPaymentMethods: [allowedPaymentMethods]
            }
        };

        const transactionDetails = {
            total: {
                amount: {
                    value: value.toString(),
                    currency: 'AUD'
                },
                label: `${clientName} (surcharge may be added)`
            }
        };
        return new PaymentRequest([googlePayMethodData], transactionDetails);
    }

    function completePayment(request, options, walletType, paymentSheetCompletedCallback) {
        if (request.status >= 400) {
            errorCallback(request, paymentSheetCompletedCallback);
        } else {
            const response = JSON.parse(request.response);
            log(response.singleUseTokenId);
            const {buttonMode} = options;
            if (buttonMode === 'post') {
                const hiddenField = document.createElement( 'input' );
                hiddenField.type = 'hidden';
                hiddenField.name = 'singleUseTokenId';
                hiddenField.value = response.singleUseTokenId;
                options.formElement.appendChild( hiddenField );

                document.createElement('form').submit.call(options.formElement);
            } else {
                const data = {
                    'walletType': walletType,
                    'singleUseTokenId': response.singleUseTokenId
                };
                paymentSheetCompletedCallback(null, data);
            }
        }
    }

    function decryptApplePayToken(response, options, paymentSheetCompletedCallback) {
        const {publishableApiKey} = options;
        const formData = new FormData();
        formData.append('applePayToken', btoa(JSON.stringify(response.details.token)));
        sendRequest(
            publishableApiKey,
            "POST",
            "/rest/v1/wallet-pay/apple-pay",
            formData,
            request => completePayment(request, options, 'applePay', paymentSheetCompletedCallback)
        );
    }

    function unsealGooglePayToken(response, options, paymentSheetCompletedCallback) {
        const {publishableApiKey} = options;
        const formData = new FormData();
        formData.append('googlePayToken', btoa(response.details.paymentMethodData.tokenizationData.token));
        formData.append('accountDisplayNumber', response.details.paymentMethodData.info.cardDetails);
        sendRequest(
            publishableApiKey,
            "POST",
            "/rest/v1/wallet-pay/google-pay",
            formData,
            request => completePayment(request, options, 'googlePay', paymentSheetCompletedCallback)
        );
    }

    function applePayButtonClicked(paymentRequest, configuration, options, paymentSheetCompletedCallback) {
        const {publishableApiKey} = options;
        paymentRequest.onmerchantvalidation = event => {
            const formData = new FormData();
            formData.append('hostname', window.location.hostname);
            const merchantSessionPromise = new Promise(resolve => sendRequest(
                publishableApiKey,
                "POST",
                "/rest/v1/wallet-pay/apple-pay-session",
                formData,
                resolve
            )).then(request => {
                if (request.status >= 400) {
                    errorCallback(request, paymentSheetCompletedCallback);
                } else {
                    const response = JSON.parse(request.response);
                    return response.applePayPaymentSession;
                }
            }).catch(err => {
                log("Error fetching Apple Pay session");
                log(err);
                paymentSheetCompletedCallback({message: 'Error fetching Apple Pay session: ' + err});
            });
            event.complete(merchantSessionPromise);
        };
        paymentRequest
        .show()
        .then(response => {
            decryptApplePayToken(response, options, paymentSheetCompletedCallback);
            response.complete('success');
        })
        .catch(err => {
            log(err);
            paymentSheetCompletedCallback({message: err});
        });
    }

    function googlePayButtonClicked(paymentRequest, configuration, options, paymentSheetCompletedCallback) {
        paymentRequest
        .show()
        .then(response => {
            unsealGooglePayToken(response, options, paymentSheetCompletedCallback);
            response.complete('success');
        })
        .catch(err => {
            log(err);
            paymentSheetCompletedCallback({message: err});
        });
    }

    function showApplePayButton(paymentRequest, configuration, options, paymentSheetCompletedCallback) {
        const button = document.createElement('div');
        button.onclick = () => applePayButtonClicked(paymentRequest, configuration, options, paymentSheetCompletedCallback);
        options.containerElement.appendChild(button);
        button.classList.add('apple-pay-button-with-text', 'apple-pay-button-black-with-text');

        const style = document.createElement('style');
        document.head.appendChild(style);
        style.appendChild(document.createTextNode(`
@supports (-webkit-appearance: -apple-pay-button) {
  .apple-pay-button-with-text {
    cursor: pointer;
    display: inline-block;
    -webkit-appearance: -apple-pay-button;
    -apple-pay-button-type: buy;
    height: 40px;
    width: 160px;
    margin-top: 4px;
  }
  .apple-pay-button-with-text > * {
    display: none;
  }
  .apple-pay-button-black-with-text {
    -apple-pay-button-style: black;
  }
}

@supports not (-webkit-appearance: -apple-pay-button) {
  .apple-pay-button-with-text {
    cursor: pointer;
    --apple-pay-scale: 1; /* (height / 32) */
    display: inline-flex;
    justify-content: center;
    font-size: 12px;
    border-radius: 5px;
    padding: 8px;
    box-sizing: border-box;
    min-width: 160px;
    min-height: 40px;
    max-height: 64px;
    margin-top: 4px;
  }
  .apple-pay-button-black-with-text {
    background-color: black;
    color: white;
  }
  .apple-pay-button-with-text.apple-pay-button-black-with-text > .logo {
    background-image: -webkit-named-image(apple-pay-logo-white);
    background-color: black;
  }
  .apple-pay-button-with-text > .text {
    font-family: -apple-system;
    font-size: calc(1em * var(--apple-pay-scale));
    font-weight: 300;
    align-self: center;
    margin-right: calc(2px * var(--apple-pay-scale));
  }
  .apple-pay-button-with-text > .logo {
    width: calc(35px * var(--scale));
    height: 100%;
    background-size: 100% 60%;
    background-repeat: no-repeat;
    background-position: 0 50%;
    margin-left: calc(2px * var(--apple-pay-scale));
    border: none;
  }
}`));
    }

    function showGooglePayButton(paymentRequest, configuration, options, paymentSheetCompletedCallback) {
        const button = document.createElement('button');
        button.onclick = () => googlePayButtonClicked(paymentRequest,
            configuration, options, paymentSheetCompletedCallback);
        options.containerElement.appendChild(button);
        button.classList.add('gpay-button', 'black', 'plain', 'short', 'en');
        button.type = 'button';

        const style = document.createElement('style');
        document.head.appendChild(style);
        style.appendChild(document.createTextNode(`
.gpay-button {
  background-origin: content-box;
  background-position: center center;
  background-repeat: no-repeat;
  background-size: contain;
  border: 8px;
  border-radius: 4px;
  box-shadow: rgba(60, 64, 67, 0.3) 0px 1px 1px 0px, rgba(60, 64, 67, 0.15) 0px 1px 3px 1px;
  cursor: pointer;
  height: 40px;
  min-height: 40px;
  padding: 11px 24px;
  margin-top: 4px;
}

.gpay-button.black {
  background-color: #000;
  box-shadow: none;
  padding: 12px 24px 10px;
}

.gpay-button.short, .gpay-button.plain {
  min-width: 90px;
  width: 160px;
}

.gpay-button.black.short, .gpay-button.black.plain {
  background-image: url(https://www.gstatic.com/instantbuy/svg/dark_gpay.svg);
}

.gpay-button.black:active {
  background-color: #5f6368;
}

.gpay-button.black:hover {
  background-color: #3c4043;
}

.gpay-button-fill, .gpay-button-fill > .gpay-button.white, .gpay-button-fill > .gpay-button.black {
  width: 100%;
  height: inherit;
}

.gpay-button-fill > .gpay-button.black {
  padding: 11px 15%;
}

.gpay-button.long.en, .gpay-button.buy.en {
  min-width: 152px;
}

.gpay-button.donate.en {
  min-width: 177px;
}

.gpay-button.black.long.en, .gpay-button.black.buy.en {
  background-image: url(https://www.gstatic.com/instantbuy/svg/dark/en.svg);
}

.gpay-button.black.donate.en {
  background-image: url(https://www.gstatic.com/instantbuy/svg/dark/donate/en.svg);
}`));
    }

    function setupApplePay(response, options, paymentSheetCompletedCallback) {
        const {clientName, clientNumber, hasApplePay, applePayQvalentMerchantId,
            applePaySupportedNetworks} = response;
        if (!hasApplePay) {
            log(`${clientNumber} does not have Apple Pay enabled`);
            return;
        }
        const applePayBrowser = window.ApplePaySession !== undefined && window.ApplePaySession.canMakePayments();
        if (!applePayBrowser) {
            log('Apple Pay not supported on this browser');
            return;
        }
        const {principalAmount} = options;
        const paymentRequest = getApplePayPaymentRequest(
            applePayQvalentMerchantId, applePaySupportedNetworks, clientName, principalAmount.toString())
        paymentRequest.canMakePayment()
        .then(canPay => {
            if (canPay) {
                showApplePayButton(paymentRequest, response, options, paymentSheetCompletedCallback);
            } else {
                log('Can\'t pay with Apple Pay');
            }
        });
    }

    function setupGooglePay(response, options, paymentSheetCompletedCallback) {
        const {clientName, clientNumber, hasGooglePay, googlePaySupportedNetworks, googlePayEnvironment} = response;
        if (!hasGooglePay) {
            log(`${clientNumber} does not have Google Pay enabled`);
            return;
        }
        const googlePayBrowser = window.PaymentRequest !== undefined;
        if (!googlePayBrowser) {
            log('Google Pay not supported on this browser');
            return;
        }
        const {googleMerchantId} = options;
        if (!googleMerchantId) {
            log('Google Pay merchant Id not provided in options');
            return;
        }
        const {principalAmount} = options;
        const paymentRequest = getGooglePayPaymentRequest(
            clientNumber, googlePaySupportedNetworks, googleMerchantId, clientName, googlePayEnvironment, principalAmount.toString())
        paymentRequest.canMakePayment()
        .then(canPay => {
            if (canPay) {
                showGooglePayButton(paymentRequest, response, options, paymentSheetCompletedCallback);
            } else {
                log('Can\'t pay with Google Pay');
            }
        });
    }

    function errorCallback(request, paymentSheetCompletedCallback) {
        let message = null;
        if (request.response) {
            const jsonResponse = JSON.parse(request.response);
            if (jsonResponse.data) {
                message = jsonResponse.data[0].fieldName + ': '
                    + jsonResponse.data[0].message;
            }
        }

        const err = {
            message,
            status: request.status,
            statusText: request.statusText
        };
        paymentSheetCompletedCallback(err);
    }

    function walletPayCallback(request, options, paymentSheetCompletedCallback) {
        if (request.status >= 400) {
            errorCallback(request, paymentSheetCompletedCallback);
        } else {
            const response = JSON.parse(request.response);
            setupApplePay(response, options, paymentSheetCompletedCallback);
            setupGooglePay(response, options, paymentSheetCompletedCallback);
        }
    }

    function createPaymentRequestButton(options, paymentSheetCompletedCallback) {
        options = options || {};

        function showError(message) {
            log(message);
            sendErrorToContainer(options.container, message);
        }

        options.container = options.container || 'payway-payment-request-button';
        options.containerElement = document.getElementById(options.container);
        if (!options.containerElement) {
            var containerErrorEl = document.createElement('div');
            containerErrorEl.id = 'payway-payment-request-button-container-error';
            document.body.appendChild(containerErrorEl);
            sendErrorToContainer(
                'payway-payment-request-button-container-error',
                'options.container has value ' + options.container
                + ', but the document doesn\'t contain any elements with this ID'
            );
            return null;
        }

        if (!options.publishableApiKey) {
            showError('You must provide a value for options.publishableApiKey');
            return null;
        }

        options.buttonMode = options.buttonMode || 'post';
        if (options.buttonMode === 'post') {
            options.formElement = findFormElement(options.containerElement);
            if (!options.formElement) {
                showError('When options.buttonMode is \'post\', you must '
                    + 'place a div with id \'' + options.container + '\' '
                    + 'inside a form.');
                return null;
            }
        } else if (options.buttonMode === 'callback') {
            if ( typeof paymentSheetCompletedCallback !== 'function' ) {
                showError( 'When options.buttonMode is \'callback\', you must '
                    + 'provide a callback function as the second parameter to '
                    + '\'payway.createPaymentRequestButton\'' );
                return;
            }
        } else {
            showError('options.buttonMode must be \'post\' or \'callback\'');
            return null;
        }

        if (typeof options.principalAmount !== 'number') {
            showError('options.principalAmount must be a number');
            return null;
        }

        if (options.currency !== 'aud') {
            showError('options.currency must be \'aud\'');
            return null;
        }

        sendRequest(options.publishableApiKey, 'GET', '/rest/v1/wallet-pay', null,
            response => walletPayCallback(response, options, paymentSheetCompletedCallback));
    }

    return {
        createCreditCardFrame: function( options, createdCallback ) {
            createCreditCardOrBankAccountFrame( options, createdCallback, 'creditCard' );
        },
        createBankAccountFrame: function( options, createdCallback ) {
            createCreditCardOrBankAccountFrame( options, createdCallback, 'bankAccount' );
        },
        createChallengeFrame: createChallengeFrame,
        createPaymentRequestButton: createPaymentRequestButton
    };
}());

export default payway;