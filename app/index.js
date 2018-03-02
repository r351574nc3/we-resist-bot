const express = require('express')
const bodyParser = require('body-parser')
const bot = require('./helpers/bot')
const moment = require('moment')
const PORT = process.env.PORT || 5000
const Preferences = require('./controllers/preferences')
const Promise = require('bluebird')
const sc2 = Promise.promisifyAll(require ('sc2-sdk'))
const { db_url, sc2_secret } = require('./config')
const rp = require('request-promise');

var startup = moment()

var app = express()
app.set('view engine', 'ejs')
app.use(express.static('assets'))
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// Main page
app.get('/', function (req, res) {
  let api = sc2.Initialize({
    app: 'we-resist',
    callbackURL: 'https://we-resist-bot.herokuapp.com/',
    accessToken: req.query.access_token,
    scope: ['vote', 'comment', 'offline']
  })

  if (!req.query.access_token && !req.query.code) {
    // return res.redirect(api.getLoginURL());
    return res.redirect(`https://v2.steemconnect.com/oauth2/authorize?client_id=we-resist&response_type=code&redirect_uri=https%3A%2F%2Fwe-resist-bot.herokuapp.com%2F&scope=vote,comment,offline`)
  }

  return rp({
    method: "POST",
    uri: "https://steemconnect.com/api/oauth2/token",
    body: {
      response_type: "refresh",
      code: req.query.code,
      client_id: "we-resist",
      client_secret: sc2_secret,
      scope: "vote,comment,offline"
    },
    json: true
  })
  .then((results) => {
    let qs = "?access_token=" + results.access_token + "&refresh_token=" + results.refresh_token + "&username=" + results.username
    return res.redirect('/@' + results.username + '/preferences' + qs)
  })

})

app.get('/@:username/preferences', Preferences.get)

// Login page
app.get('/login', function (req, res) {
  res.render('pages/login', {
    hostname: 'we-resist-bot.herokuapp.com'
  })
})

// Logout page
app.get('/logout', function (req, res) {
  res.render('pages/logout')
})

app.put('/@:user/preferences', Preferences.put)

app.post('/@:user/preferences', Preferences.post)

app.delete('/@:user/preferences', Preferences.delete)

bot.run()

// Check on whether the bot is functioning
app.get('/healthcheck', function (req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify({ uptime: startup.diff(moment(), 'days') }))
})
  
app.listen(PORT, () => console.log(`Example app listening on port ${ PORT }!`))