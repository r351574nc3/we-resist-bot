const express = require('express')
const bot = require('./helpers/bot')

var app = express()

// Main page
app.get('/', function (req, res) {
  res.render('index')
})

// Check on whether the bot is functioning
app.get('/healthcheck', function (req, res) {
    res.send("I'm ok")
})

// Actual Bot Execution
bot.run()
  
app.listen(3000, () => console.log('Example app listening on port 3000!'))