const express = require('express')
const bodyParser = require('body-parser')
const bot = require('./helpers/bot')
const moment = require('moment')
const PORT = process.env.PORT || 5000
const Preferences = require('./controllers/preferences')
const Promise = require('bluebird')
const sc2 = Promise.promisifyAll(require ('sc2-sdk'))

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
    scope: ['vote', 'comment']
  })

  if (!req.query.access_token) {
    return res.redirect(api.getLoginURL())
  }

  api.me(function (err, me) {
    var qs = req.originalUrl.substring(req.originalUrl.indexOf("?"))
    res.redirect('/@' + req.query.username + '/preferences' + qs)
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

app.get('/teardown', function(req, res) {
  const models = require('../models')
  models.Preferences.drop().then((results) => {
    res.send({status: 'ok'})
  })
})

app.get('/setup', function(req, res) {
  const models = require('../models')
  models.Preferences.sync({ force: true }).then((results) => {
    res.send({status: 'ok'})
  })
})

app.put('/@:user/preferences', Preferences.put)

app.post('/@:user/preferences', Preferences.post)

// Check on whether the bot is functioning
app.get('/healthcheck', function (req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify({ uptime: startup.diff(moment(), 'days') }))
})

// Actual Bot Execution
bot.run()
  
app.listen(PORT, () => console.log(`Example app listening on port ${ PORT }!`))