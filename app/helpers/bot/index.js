'use strict'

const scheduler = require('node-schedule')


module.exports = {
    run
}

function run() {
    require('./task').execute()
}