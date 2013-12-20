# WebRTC Demo

## File Overview
* `Procfile` is required to run the nodejs app on Heroku
* `package.json` contains all npm modules to run the app
* `app.js` contains all server side code
* `views` folder contains the html template for the app
* `public/css` folder contains all the css for the app.    
  Look for files with `.scss` extensions. `.css` files are generated from sass.
* `public/js` contains the front end code and interactions with OpenTok and FireBase SDK
  Look for files with `.coffee` extensions. `.js` files are generated from coffeescript.  

## How to run the app:
1. Clone [this repo]( https://github.com/opentok/OpenTokRTC )  
2. Get my API Key and Secret from [TokBox]( http://TokBox.com )  
3. Replace `OTKEY` and `OTSECRET` with your corresponding API Key and Secret in `app.js`  
4. Run `npm install` to install the necessary packages  
5. Start the server with `node app.js`  

