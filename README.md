# WebRTC Demo

## File Overview
* `Procfile` is required to run the nodejs app on Heroku
* `package.json` contains all npm modules to run the app
* `app.js` contains all server side code  
* `config.js` contains configurations: TokBox credentials, p2p mesh support, Redis support, reserved rooms, etc.  
* `lib` folder contains all the code to handle configurations: p2p mesh support, Redis support, reserved rooms, etc.   
* `views` folder contains the html template for the app
* `public/css` folder contains all the css for the app.    
  Look for files with `.scss` extensions. `.css` files are generated from sass.
* `public/js` contains the front end code and interactions with OpenTok SDK.  

## How to run the app:
1. Clone [this repo]( https://github.com/opentok/OpenTokRTC )  
2. Get my API Key and Secret from [TokBox]( http://TokBox.com )  
3. Replace `OTKEY` and `OTSECRET` with your corresponding API Key and Secret in `app.js`  
4. Run `npm install` to install the necessary packages  
5. Start the server with `node app.js`  

## Deploying this app to your own host (Heroku):
1. Clone [this repo]( https://github.com/opentok/OpenTokRTC )  
2. Go into the cloned repo: `cd OpenTokRTC`  
1. Create a heroku app: `heroku create appName`  
2. Add your TokBox apiKey and secret credentials in `config.js` or set [Heroku's environment variables](https://devcenter.heroku.com/articles/config-vars)   
2. Push to remote heroku repository: `git push heroku master`  
3. Visit your app  
